/**
 * Contract tests for resumable collection batches (Operations Task 2).
 *
 * Tests call createCollectBatch(deps) — the factory — not the production
 * three-parameter collectBatch.  All deps are injectable for credential-free
 * execution.
 */

import { describe, expect, it } from "vitest";

import {
  createCollectBatch,
  getSourcesForGroup,
  parseCronIntervalHours,
  type BatchLedger,
  type CollectBatchDeps,
} from "../src/jobs/collect-batch.js";
import type { FetchOutcome } from "../src/domain/intelligence/source-contract.js";
import type { SourceContract } from "../src/domain/intelligence/source-contract.js";

// ----- helpers -----

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function scheduledSlot(): Date { return new Date("2026-07-29T08:00:00Z"); }
function baseArgs() { return { scheduledFor: scheduledSlot(), runnerVersion: "test", dryRun: false as const }; }

function testSourceContract(id: string, overrides: Partial<SourceContract> = {}): SourceContract {
  return {
    id, name: `Test ${id}`, url: `https://example.com/${id}`,
    market: "US", platforms: [], categories: ["ALL_PRODUCTS"],
    authorityLevel: "GOVERNMENT_OFFICIAL", readiness: "EXPERIMENTAL",
    access: "PUBLIC", license: "test", fetchMethod: "RSS",
    primaryEvidenceEligible: false, freshnessSlaMinutes: 480,
    refreshCron: "0 */4 * * *", degradationPolicy: "test",
    userPromise: "test", enabled: true, fixture: null, ...overrides,
  };
}

function successOutcome(id: string, items: Array<{ url: string; title: string }> = []): FetchOutcome {
  return {
    kind: "success",
    items: items.length > 0 ? items : [{ url: `https://ex.com/${id}/x`, title: `Item from ${id}` }],
    httpStatus: 200, contentHash: `hash-${id}`,
  };
}
function retryableFailed(code = "HTTP_503"): FetchOutcome {
  return { kind: "failed", code, retryable: true, httpStatus: 503 };
}
function nonRetryableFailed(code = "HTTP_400"): FetchOutcome {
  return { kind: "failed", code, retryable: false, httpStatus: 400 };
}
function blockedOutcome(): FetchOutcome {
  return { kind: "blocked", code: "BOT_WALL", retryable: false, httpStatus: 403 };
}

// ----- FakeLedger ----

interface RunState {
  id: string; succeeded: Set<string>; outcomes: Map<string, string>;
  persistedItemCount: number; persistedStatus: string; finished: boolean;
}

function fakeLedger(): BatchLedger {
  const runs = new Map<string, RunState>();
  const slotToRunId = new Map<string, string>();
  let nextRunId = 1;
  function slotKey(input: { scopeKey: string; scheduledFor: Date }) {
    return `${input.scopeKey}|${input.scheduledFor.toISOString()}`;
  }
  return {
    async beginRun(input) {
      const key = slotKey(input);
      let rid = slotToRunId.get(key);
      if (rid) return rid;
      rid = `run-${nextRunId++}`;
      slotToRunId.set(key, rid);
      runs.set(rid, { id: rid, succeeded: new Set(), outcomes: new Map(), persistedItemCount: 0, persistedStatus: "RUNNING", finished: false });
      return rid;
    },
    async alreadySucceeded(runId) { return runs.get(runId)?.succeeded ?? new Set(); },
    async recordOutcome(runId, sourceId, outcome) {
      const run = runs.get(runId)!;
      const status = outcome.kind === "success" ? (outcome.items.length > 0 ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY") : "FAILED";
      const ic = outcome.kind === "success" ? outcome.items.length : 0;
      run.outcomes.set(sourceId, status);
      run.persistedItemCount += ic;
      if (status === "SUCCEEDED_ITEMS" || status === "SUCCEEDED_EMPTY") run.succeeded.add(sourceId);
      return { status, itemCount: ic };
    },
    async finishRun(runId) {
      const run = runs.get(runId)!;
      run.finished = true;
      const vals = [...run.outcomes.values()];
      const allSuccess = vals.every(s => s === "SUCCEEDED_ITEMS" || s === "SUCCEEDED_EMPTY");
      const someItems = vals.some(s => s === "SUCCEEDED_ITEMS");
      run.persistedStatus = allSuccess ? (someItems ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY") : (vals.every(s => s === "FAILED") ? "FAILED" : "PARTIAL");
      const succeededCount = vals.filter(s => s === "SUCCEEDED_ITEMS" || s === "SUCCEEDED_EMPTY").length;
      const failedCount = vals.filter(s => s === "FAILED" || s === "BLOCKED").length;
      return { status: run.persistedStatus, itemCount: run.persistedItemCount, attempted: vals.length, succeeded: succeededCount, failed: failedCount };
    },
  };
}

function makeCollector(deps: Partial<CollectBatchDeps> = {}) {
  const ledger = fakeLedger();
  return {
    ledger,
    call: createCollectBatch({
      getSources: deps.getSources ?? (() => []),
      fetchSource: deps.fetchSource ?? (async () => successOutcome("x")),
      ledger: deps.ledger ?? ledger,
    }),
  };
}

// ============================= pure =============================

describe("parseCronIntervalHours", () => {
  it("*/4 ≈ 4h", () => expect(parseCronIntervalHours("7 */4 * * *")).toBeCloseTo(4, 0));
  it("*/6 ≈ 6h", () => expect(parseCronIntervalHours("0 */6 * * *")).toBeCloseTo(6, 0));
  it("*/12 ≈ 12h", () => expect(parseCronIntervalHours("0 */12 * * *")).toBeCloseTo(12, 0));
  it("unparseable → 24", () => expect(parseCronIntervalHours("invalid")).toBe(24));
});

describe("getSourcesForGroup", () => {
  it("FAST returns enabled ≤6h", () => {
    for (const s of getSourcesForGroup("FAST")) { expect(s.enabled).toBe(true); expect(parseCronIntervalHours(s.refreshCron!)).toBeLessThanOrEqual(6); }
  });
  it("STANDARD returns 6h < interval ≤ 12h", () => {
    for (const s of getSourcesForGroup("STANDARD")) { expect(s.enabled).toBe(true); const h = parseCronIntervalHours(s.refreshCron!); expect(h).toBeGreaterThan(6); expect(h).toBeLessThanOrEqual(12); }
  });
  it("excludes disabled", () => { for (const s of getSourcesForGroup("FAST")) expect(s.enabled).toBe(true); });
  it("excludes no-cron", () => { for (const s of getSourcesForGroup("FAST")) expect(s.refreshCron).toBeTruthy(); });
});

// ============================ false success =====================

describe("collectBatch — false success", () => {
  it("does not mark a source successful before fetch completes", async () => {
    const sourceA = testSourceContract("a"), sourceB = testSourceContract("b");
    const deferA = deferred<FetchOutcome>();
    let aStarted = false;
    const { ledger, call } = makeCollector({
      getSources: () => [sourceA, sourceB],
      fetchSource: async (s) => {
        if (s.id === sourceA.id) { aStarted = true; return deferA.promise; }
        return successOutcome(s.id);
      },
    });

    // beginRun is slot-idempotent — calling it first gives us the same
    // runId the factory will reuse, so we can query alreadySucceeded
    // before the batch finishes.
    const slot = scheduledSlot();
    const runId = await ledger.beginRun({
      jobType: "COLLECT", scopeKey: "collect-fast",
      scheduledFor: slot, runnerVersion: "test",
    });

    const bp = call("FAST", { scheduledFor: slot, runnerVersion: "test", dryRun: false });
    await new Promise(r => setTimeout(r, 200));
    expect(aStarted).toBe(true);
    // Before sourceA resolves, its check must NOT be in the succeeded set.
    expect((await ledger.alreadySucceeded(runId)).has(sourceA.id)).toBe(false);

    deferA.resolve(successOutcome(sourceA.id));
    const r = await bp;
    expect(r.status).toBe("SUCCEEDED_ITEMS");
    expect(r.attempted).toBe(2);
    expect(r.succeeded).toBe(2);
    expect(r.failed).toBe(0);

    // After resolution: sourceA IS in the succeeded set.
    expect((await ledger.alreadySucceeded(runId)).has(sourceA.id)).toBe(true);
  }, 10000);
});

// ============================ BLOCKER 2: rejecting ledger =======

describe("collectBatch — rejecting ledger write", () => {
  it("surfaces unreported failures when recordOutcome rejects without persisting", async () => {
    const source = testSourceContract("test-reject");
    const ledger = fakeLedger();
    // Throw WITHOUT pre-recording — the real DB_LEDGER failure mode.
    ledger.recordOutcome = async () => { throw new Error("transaction timeout"); };

    const call = createCollectBatch({
      getSources: () => [source],
      fetchSource: async () => successOutcome(source.id),
      ledger,
    });
    const result = await call("FAST", baseArgs());

    // The source was reached, but the check was never persisted.
    // The reconciliation surfaces it as a failure.
    expect(result.failed).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(result.attempted).toBeGreaterThanOrEqual(1);
  }, 10000);
});

// ============================ persistent replay (BLOCKER B) ======

describe("collectBatch — persisted replay", () => {
  it("replay preserves prior run status and cumulative counts", async () => {
    const source = testSourceContract("replay-persist");
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async () => successOutcome(source.id),
    });

    const first = await call("FAST", baseArgs());
    expect(first.status).toBe("SUCCEEDED_ITEMS");
    expect(first.itemCount).toBeGreaterThanOrEqual(1);
    expect(first.attempted).toBe(1);

    const second = await call("FAST", baseArgs());
    expect(second.status).toBe("SUCCEEDED_ITEMS");
    expect(second.itemCount).toBe(first.itemCount);
    expect(second.attempted).toBe(1); // cumulative from persisted run
    expect(second.succeeded).toBe(1);
    expect(second.failed).toBe(0);
    expect(second.exitCode).toBe(0);
  }, 10000);

  it("re-fetches sources that failed permanently on a prior slot invocation", async () => {
    const sourceOk = testSourceContract("replay-ok");
    const sourceFlaky = testSourceContract("replay-flaky");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    // sourceFlaky always returns retryable failure → exhausts all 3 attempts.
    let flakyExhausts = true;

    const call = createCollectBatch({
      getSources: () => [sourceOk, sourceFlaky],
      fetchSource: async (s) => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        if (s.id === sourceFlaky.id && flakyExhausts) {
          return { kind: "failed", code: "HTTP_503", retryable: true, httpStatus: 503 };
        }
        return successOutcome(s.id);
      },
      ledger,
    });

    // Run 1: sourceOk succeeds (1 fetch). sourceFlaky exhausts 3 retries → FAILED.
    await call("FAST", baseArgs());
    expect(fetchCounts.get(sourceOk.id)).toBe(1);
    expect(fetchCounts.get(sourceFlaky.id)).toBe(3); // all attempts exhausted

    // Run 2 (same slot): sourceOk already successful → skipped.
    // sourceFlaky was FAILED (not in succeeded set) → MUST be re-fetched.
    flakyExhausts = false;
    const second = await call("FAST", baseArgs());
    expect(fetchCounts.get(sourceOk.id)).toBe(1);   // unchanged — skipped
    expect(fetchCounts.get(sourceFlaky.id)).toBe(4); // +1 — re-fetched
    expect(second.failed).toBe(0);
  }, 10000);
});

// ============================ structured retry ==================

describe("collectBatch — structured retry", () => {
  it("retries exactly 3 times on retryable failure then FAILED", async () => {
    const source = testSourceContract("retry-3");
    const counts = new Map<string, number>();
    const recordedOutcomes: FetchOutcome[] = [];
    const ledger = fakeLedger();
    const orig = ledger.recordOutcome.bind(ledger);
    ledger.recordOutcome = async (rid, sid, o) => { recordedOutcomes.push(o); return orig(rid, sid, o); };
    const call = createCollectBatch({
      getSources: () => [source],
      fetchSource: async (s) => { counts.set(s.id, (counts.get(s.id) ?? 0) + 1); return retryableFailed(); },
      ledger,
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(3);
    expect(r.failed).toBe(1);
    expect(r.exitCode).toBe(1);
    // BLOCKER 3 fix: assert the exact machine code survives.
    const last = recordedOutcomes[recordedOutcomes.length - 1];
    expect(last).toBeDefined();
    expect(last!.kind !== "success").toBe(true);
    if (last && last.kind !== "success") {
      expect(last.code).toBe("HTTP_503");
    }
  }, 10000);

  it("fetches non-retryable failure exactly once", async () => {
    const source = testSourceContract("nr-fail");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => { counts.set(s.id, (counts.get(s.id) ?? 0) + 1); return nonRetryableFailed(); },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(1);
    expect(r.failed).toBe(1);
  }, 10000);

  it("fetches blocked outcome exactly once", async () => {
    const source = testSourceContract("blocked");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => { counts.set(s.id, (counts.get(s.id) ?? 0) + 1); return blockedOutcome(); },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(1);
    expect(r.failed).toBe(1);
  }, 10000);

  it("retryable-then-success on attempt 2 records SUCCEEDED", async () => {
    const source = testSourceContract("recover");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => {
        const c = (counts.get(s.id) ?? 0) + 1; counts.set(s.id, c);
        if (c < 2) return retryableFailed(); return successOutcome(s.id);
      },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(2);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);
  }, 10000);

  it("fails closed (non-retryable) for invariant code", async () => {
    const source = testSourceContract("invariant");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => { counts.set(s.id, (counts.get(s.id) ?? 0) + 1); return { kind: "failed", code: "INVARIANT: no SourceConfig", retryable: false }; },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.exitCode).toBe(1);
  }, 10000);
});

// ============================ thrown-error fallback =============

describe("collectBatch — thrown-error fallback", () => {
  it("stops after one attempt on robots_denied", async () => {
    const source = testSourceContract("throw-deny");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => { counts.set(s.id, (counts.get(s.id) ?? 0) + 1); throw new Error("robots_denied"); },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(1);
    expect(r.failed).toBe(1);
  }, 10000);

  it("retries on thrown transport error", async () => {
    const source = testSourceContract("throw-transport");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => { counts.set(s.id, (counts.get(s.id) ?? 0) + 1); throw new Error("socket hang up"); },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(3);
    expect(r.failed).toBe(1);
  }, 10000);
});
