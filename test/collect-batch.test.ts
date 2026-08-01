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
  classifyCallScraperError,
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
      readCostDecision: deps.readCostDecision,
      scraperReadinessGate: deps.scraperReadinessGate,
    }),
  };
}

function scraperSource(id: string) {
  return testSourceContract(id, { fetchMethod: "SCRAPER" });
}

function rssSource(id: string) {
  return testSourceContract(id, { fetchMethod: "RSS" });
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

// ============================ scraper error classification =======

describe("classifyCallScraperError", () => {
  function assertFailed(outcome: FetchOutcome, retryable: boolean) {
    expect(outcome.kind).not.toBe("success");
    if (outcome.kind !== "success") {
      expect(outcome.retryable).toBe(retryable);
    }
  }
  function assertBlocked(outcome: FetchOutcome) {
    expect(outcome.kind).toBe("blocked");
  }

  it("classifies scraper HTTP 503 as retryable", () => {
    const outcome = classifyCallScraperError(new Error("scraper service HTTP 503: Service Unavailable"));
    assertFailed(outcome, true);
    if (outcome.kind === "failed") expect(outcome.httpStatus).toBe(503);
  });

  it("classifies scraper HTTP 400 as non-retryable", () => {
    const outcome = classifyCallScraperError(new Error("scraper service HTTP 400: Bad Request"));
    assertFailed(outcome, false);
    if (outcome.kind === "failed") expect(outcome.httpStatus).toBe(400);
  });

  it("classifies scraper HTTP 403 as non-retryable", () => {
    const outcome = classifyCallScraperError(new Error("scraper service HTTP 403: Forbidden"));
    assertFailed(outcome, false);
  });

  it("classifies robots_denied as blocked (non-retryable)", () => {
    const outcome = classifyCallScraperError(new Error("robots_denied: Cloudflare challenge"));
    assertBlocked(outcome);
    if (outcome.kind === "blocked") expect(outcome.code).toBe("BOT_WALL");
  });

  it("classifies non-HTTP error as non-retryable (schema validation)", () => {
    const outcome = classifyCallScraperError(new Error("Unexpected token"));
    assertFailed(outcome, false);
    if (outcome.kind === "failed") expect(outcome.code).toContain("SCRAPER_ERROR");
  });

  // ---- cold-start transport error regression ----
  it("classifies TypeError transport error (fetch failed) as retryable", () => {
    const outcome = classifyCallScraperError(new TypeError("fetch failed"));
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.retryable).toBe(true);
      expect(outcome.code).toContain("SCRAPER_TRANSPORT");
    }
  });

  it("classifies TypeError transport error (terminated) as retryable", () => {
    const outcome = classifyCallScraperError(new TypeError("terminated"));
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.retryable).toBe(true);
      expect(outcome.code).toContain("SCRAPER_TRANSPORT");
    }
  });

  // ---- narrowed transport retry: non-transport TypeError ----
  it("classifies non-transport TypeError (validation) as non-retryable", () => {
    const outcome = classifyCallScraperError(new TypeError("Invalid URL"));
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.retryable).toBe(false);
      expect(outcome.code).toContain("SCRAPER_ERROR");
    }
  });

  // ---- AbortError / TimeoutError as transport retries ----
  it("classifies AbortError as retryable transport", () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    const outcome = classifyCallScraperError(abortErr);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.retryable).toBe(true);
      expect(outcome.code).toContain("SCRAPER_TRANSPORT");
    }
  });

  it("classifies TimeoutError as retryable transport", () => {
    const timeoutErr = new DOMException("The operation timed out", "TimeoutError");
    const outcome = classifyCallScraperError(timeoutErr);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.retryable).toBe(true);
      expect(outcome.code).toContain("SCRAPER_TRANSPORT");
    }
  });
});

// ============================ scraper retry via full pipeline =====

describe("collectBatch — scraper retry via injected fetchSource", () => {
  it("scraper HTTP 503: retried 3 times", async () => {
    const source = testSourceContract("sc-503");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => {
        counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
        return classifyCallScraperError(new Error("scraper service HTTP 503: boom"));
      },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(3);
    expect(r.failed).toBe(1);
  }, 10000);

  it("scraper HTTP 400: fetched exactly once", async () => {
    const source = testSourceContract("sc-400");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => {
        counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
        return classifyCallScraperError(new Error("scraper service HTTP 400: bad"));
      },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(1);
    expect(r.failed).toBe(1);
  }, 10000);

  it("scraper schema parse failure: fetched exactly once", async () => {
    const source = testSourceContract("sc-schema");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => {
        counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
        return classifyCallScraperError(new Error("Invalid json: expected items array"));
      },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(1);
    expect(r.failed).toBe(1);
  }, 10000);

  it("buildAdapter config invariant: fetched exactly once", async () => {
    const source = testSourceContract("cfg-invariant");
    const counts = new Map<string, number>();
    const { call } = makeCollector({
      getSources: () => [source],
      fetchSource: async (s) => {
        counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
        return { kind: "failed", code: "INVARIANT: Source X json=true but missing jsonShape", retryable: false };
      },
    });
    const r = await call("FAST", baseArgs());
    expect(counts.get(source.id)).toBe(1);
    expect(r.failed).toBe(1);
  }, 10000);
});

// ============================ cost suppression (BLOCKER 1 pin) =========

describe("collectBatch — cost suppression", () => {
  it("at HARD_CAP, EXPERIMENTAL is skipped and MONITORED/VERIFIED are fetched", async () => {
    const experimental = testSourceContract("exp-src", { readiness: "EXPERIMENTAL" });
    const monitored = testSourceContract("mon-src", { readiness: "MONITORED" });
    const verified = testSourceContract("ver-src", { readiness: "VERIFIED" });
    const fetched: string[] = [];
    let readCount = 0;
    const { call } = makeCollector({
      getSources: () => [experimental, monitored, verified],
      fetchSource: async (s) => { fetched.push(s.id); return successOutcome(s.id); },
      readCostDecision: async () => { readCount++; return { level: "HARD_CAP", suppress: ["experimental-demand", "model-enrichment"] }; },
    });
    await call("FAST", baseArgs());
    expect(fetched).toContain("mon-src");
    expect(fetched).toContain("ver-src");
    expect(fetched).not.toContain("exp-src");
    expect(readCount).toBe(1);
  });

  it("at NORMAL, nothing is skipped", async () => {
    const experimental = testSourceContract("exp-src2", { readiness: "EXPERIMENTAL" });
    const fetched: string[] = [];
    const { call } = makeCollector({
      getSources: () => [experimental],
      fetchSource: async (s) => { fetched.push(s.id); return successOutcome(s.id); },
      readCostDecision: async () => ({ level: "NORMAL", suppress: [] }),
    });
    await call("FAST", baseArgs());
    expect(fetched).toContain("exp-src2");
  });

  it("at REVIEW, nothing is skipped", async () => {
    const experimental = testSourceContract("exp-src3", { readiness: "EXPERIMENTAL" });
    const fetched: string[] = [];
    const { call } = makeCollector({
      getSources: () => [experimental],
      fetchSource: async (s) => { fetched.push(s.id); return successOutcome(s.id); },
      readCostDecision: async () => ({ level: "REVIEW", suppress: [] }),
    });
    await call("FAST", baseArgs());
    expect(fetched).toContain("exp-src3");
  });

  it("when readCostDecision returns null, nothing is skipped (fail open)", async () => {
    const experimental = testSourceContract("exp-src4", { readiness: "EXPERIMENTAL" });
    const fetched: string[] = [];
    const { call } = makeCollector({
      getSources: () => [experimental],
      fetchSource: async (s) => { fetched.push(s.id); return successOutcome(s.id); },
      readCostDecision: async () => null,
    });
    await call("FAST", baseArgs());
    expect(fetched).toContain("exp-src4");
  });

  it("reads cost decision exactly once per invocation", async () => {
    let readCount = 0;
    const sources = [
      testSourceContract("a"), testSourceContract("b"), testSourceContract("c"),
      testSourceContract("d"), testSourceContract("e"),
    ];
    const { call } = makeCollector({
      getSources: () => sources,
      fetchSource: async () => successOutcome("x"),
      readCostDecision: async () => { readCount++; return { level: "HARD_CAP", suppress: ["experimental-demand"] }; },
    });
    await call("FAST", baseArgs());
    expect(readCount).toBe(1);
  });
});

// ============================ isExperimentalSuppressed ==============

describe("isExperimentalSuppressed", () => {
  it("returns true for EXPERIMENTAL source at HARD_CAP with experimental-demand", async () => {
    const { isExperimentalSuppressed } = await import("../src/jobs/collect-batch.js");
    expect(isExperimentalSuppressed(
      { level: "HARD_CAP", suppress: ["experimental-demand", "model-enrichment"] },
      testSourceContract("x", { readiness: "EXPERIMENTAL" }),
    )).toBe(true);
  });

  it("returns false for MONITORED source at HARD_CAP", async () => {
    const { isExperimentalSuppressed } = await import("../src/jobs/collect-batch.js");
    expect(isExperimentalSuppressed(
      { level: "HARD_CAP", suppress: ["experimental-demand"] },
      testSourceContract("x", { readiness: "MONITORED" }),
    )).toBe(false);
  });

  it("returns false for EXPERIMENTAL source at REVIEW", async () => {
    const { isExperimentalSuppressed } = await import("../src/jobs/collect-batch.js");
    expect(isExperimentalSuppressed(
      { level: "REVIEW", suppress: [] },
      testSourceContract("x", { readiness: "EXPERIMENTAL" }),
    )).toBe(false);
  });

  it("returns false for null decision", async () => {
    const { isExperimentalSuppressed } = await import("../src/jobs/collect-batch.js");
    expect(isExperimentalSuppressed(null, testSourceContract("x", { readiness: "EXPERIMENTAL" }))).toBe(false);
  });
});

// ============================ scraper readiness gate ================

describe("collectBatch — scraper readiness gate", () => {
  it("calls readiness gate exactly once when SCRAPER sources exist", async () => {
    const gateCalls: number[] = [];
    const { call } = makeCollector({
      getSources: () => [scraperSource("s1"), scraperSource("s2"), rssSource("r1")],
      fetchSource: async () => successOutcome("x"),
      scraperReadinessGate: async () => { gateCalls.push(Date.now()); },
    });
    await call("FAST", baseArgs());
    expect(gateCalls.length).toBe(1);
  }, 10000);

  it("skips readiness gate when no SCRAPER sources exist", async () => {
    let called = false;
    const { call } = makeCollector({
      getSources: () => [rssSource("r1"), rssSource("r2")],
      fetchSource: async () => successOutcome("x"),
      scraperReadinessGate: async () => { called = true; },
    });
    await call("FAST", baseArgs());
    expect(called).toBe(false);
  }, 10000);

  it("fails all SCRAPER sources with SCRAPER_READINESS_TIMEOUT when gate rejects", async () => {
    const sources = [scraperSource("s1"), scraperSource("s2")];
    const fetched: string[] = [];
    const recordedOutcomes: Map<string, FetchOutcome> = new Map();
    const ledger = fakeLedger();
    const orig = ledger.recordOutcome.bind(ledger);
    ledger.recordOutcome = async (rid, sid, o) => {
      recordedOutcomes.set(sid, o);
      return orig(rid, sid, o);
    };
    const call = createCollectBatch({
      getSources: () => sources,
      fetchSource: async (s) => { fetched.push(s.id); return successOutcome(s.id); },
      ledger,
      scraperReadinessGate: async () => { throw new Error("SCRAPER_READINESS_TIMEOUT"); },
    });
    const r = await call("FAST", baseArgs());
    expect(fetched.length).toBe(0);
    expect(r.failed).toBe(2);
    expect(r.exitCode).toBe(1);
    for (const s of sources) {
      const o = recordedOutcomes.get(s.id);
      expect(o).toBeDefined();
      if (o && o.kind === "failed") {
        expect(o.code).toBe("SCRAPER_READINESS_TIMEOUT");
        expect(o.retryable).toBe(true);
      }
    }
  }, 10000);

  it("non-SCRAPER sources are fetched normally when readiness gate rejects", async () => {
    const scraper = scraperSource("s1");
    const rss = rssSource("r1");
    const fetched: string[] = [];
    const call = createCollectBatch({
      getSources: () => [scraper, rss],
      fetchSource: async (s) => { fetched.push(s.id); return successOutcome(s.id); },
      ledger: fakeLedger(),
      scraperReadinessGate: async () => { throw new Error("SCRAPER_READINESS_TIMEOUT"); },
    });
    await call("FAST", baseArgs());
    expect(fetched).toContain("r1");
    expect(fetched).not.toContain("s1");
  }, 10000);

  it("readiness gate is called before any source is fetched", async () => {
    const fetchOrder: string[] = [];
    const { call } = makeCollector({
      getSources: () => [scraperSource("s1"), scraperSource("s2")],
      fetchSource: async (s) => { fetchOrder.push(`fetch-${s.id}`); return successOutcome(s.id); },
      scraperReadinessGate: async () => {
        fetchOrder.push("gate");
        // Simulate cold-start delay
        await new Promise(r => setTimeout(r, 50));
      },
    });
    await call("FAST", baseArgs());
    expect(fetchOrder[0]).toBe("gate");
    expect(fetchOrder.filter(x => x === "gate").length).toBe(1);
  }, 10000);

  it("tolerates missing readiness gate (fail-open for non-SCRAPER deployments)", async () => {
    const fetched: string[] = [];
    const call = createCollectBatch({
      getSources: () => [scraperSource("s1"), rssSource("r1")],
      fetchSource: async (s) => { fetched.push(s.id); return successOutcome(s.id); },
      ledger: fakeLedger(),
      // no scraperReadinessGate — must not throw
    });
    const r = await call("FAST", baseArgs());
    expect(r.succeeded).toBe(2);
  }, 10000);
});

// ============================ readModelEnrichmentSuppressed ==========

describe("readModelEnrichmentSuppressed", () => {
  it("returns true when HARD_CAP suppresses model-enrichment", async () => {
    const { readModelEnrichmentSuppressed: rd } = await import("../src/jobs/cost-report.js");
    const fakeDb = {
      pipelineRun: {
        findFirst: async () => ({
          metadata: { level: "HARD_CAP", suppress: ["experimental-demand", "model-enrichment"], projectedTotalUsd: 55, message: "" },
        }),
      },
    };
    expect(await rd(fakeDb as any)).toBe(true);
  });

  it("returns false when model-enrichment is not suppressed", async () => {
    const { readModelEnrichmentSuppressed: rd } = await import("../src/jobs/cost-report.js");
    const fakeDb = {
      pipelineRun: {
        findFirst: async () => ({
          metadata: { level: "HARD_CAP", suppress: ["experimental-demand"], projectedTotalUsd: 55, message: "" },
        }),
      },
    };
    expect(await rd(fakeDb as any)).toBe(false);
  });

  it("returns false when no decision exists", async () => {
    const { readModelEnrichmentSuppressed: rd } = await import("../src/jobs/cost-report.js");
    const fakeDb = { pipelineRun: { findFirst: async () => null } };
    expect(await rd(fakeDb as any)).toBe(false);
  });
});
