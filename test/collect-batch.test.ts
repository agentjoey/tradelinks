/**
 * Contract tests for resumable collection batches (Operations Task 2).
 *
 * All tests use an injectable BatchLedger so they pass credential-free
 * (no DATABASE_URL needed for the worker/reviewer gate).
 */

import { describe, expect, it } from "vitest";

import {
  collectBatch,
  getSourcesForGroup,
  parseCronIntervalHours,
  type BatchLedger,
  type CollectionGroup,
} from "../src/jobs/collect-batch.js";
import type { FetchOutcome } from "../src/domain/intelligence/source-contract.js";
import type { SourceContract } from "../src/domain/intelligence/source-contract.js";

// ----- helpers -----

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function scheduledSlot(): Date {
  return new Date("2026-07-29T08:00:00Z");
}

function baseArgs() {
  return {
    scheduledFor: scheduledSlot(),
    runnerVersion: "test",
    dryRun: false as const,
  };
}

function testSourceContract(
  id: string,
  overrides: Partial<SourceContract> = {},
): SourceContract {
  return {
    id,
    name: `Test ${id}`,
    url: `https://example.com/${id}`,
    market: "US",
    platforms: [],
    categories: ["ALL_PRODUCTS"],
    authorityLevel: "GOVERNMENT_OFFICIAL",
    readiness: "EXPERIMENTAL",
    access: "PUBLIC",
    license: "test",
    fetchMethod: "RSS",
    primaryEvidenceEligible: false,
    freshnessSlaMinutes: 480,
    refreshCron: "0 */4 * * *",
    degradationPolicy: "test",
    userPromise: "test",
    enabled: true,
    fixture: null,
    ...overrides,
  };
}

function successOutcome(
  id: string,
  items: Array<{ url: string; title: string }> = [],
): FetchOutcome {
  return {
    kind: "success",
    items: items.length > 0
      ? items
      : [{ url: `https://ex.com/${id}/x`, title: `Item from ${id}` }],
    httpStatus: 200,
    contentHash: `hash-${id}`,
  };
}

interface FakeLedger extends BatchLedger {
  _runs: Map<string, RunState>;
}

interface RunState {
  id: string;
  succeeded: Set<string>;
  outcomes: Map<string, string>;
  finished: boolean;
}

/** An in-memory BatchLedger for credential-free tests.
 *  beginRun is idempotent per (scopeKey, scheduledFor) — same slot reuses
 *  the same run, matching the real PipelineRun upsert behaviour. */
function fakeLedger(): FakeLedger {
  const runs = new Map<string, RunState>();
  // slotKey = `${scopeKey}|${scheduledFor.toISOString()}`
  const slotToRunId = new Map<string, string>();
  let nextRunId = 1;

  function slotKey(input: { scopeKey: string; scheduledFor: Date }): string {
    return `${input.scopeKey}|${input.scheduledFor.toISOString()}`;
  }

  return {
    _runs: runs,
    async beginRun(input) {
      const key = slotKey(input);
      let runId = slotToRunId.get(key);
      if (runId) return runId;

      runId = `run-${nextRunId++}`;
      slotToRunId.set(key, runId);
      runs.set(runId, {
        id: runId,
        succeeded: new Set(),
        outcomes: new Map(),
        finished: false,
      });
      return runId;
    },
    async alreadySucceeded(runId) {
      return runs.get(runId)?.succeeded ?? new Set();
    },
    async recordOutcome(runId, sourceId, outcome) {
      const run = runs.get(runId);
      if (!run) throw new Error(`run ${runId} not found`);
      const status =
        outcome.kind === "success"
          ? outcome.items.length > 0
            ? "SUCCEEDED_ITEMS"
            : "SUCCEEDED_EMPTY"
          : "FAILED";
      const itemCount = outcome.kind === "success" ? outcome.items.length : 0;
      run.outcomes.set(sourceId, status);
      if (status === "SUCCEEDED_ITEMS" || status === "SUCCEEDED_EMPTY") {
        run.succeeded.add(sourceId);
      }
      return { status, itemCount };
    },
    async finishRun(runId) {
      const run = runs.get(runId);
      if (!run) throw new Error(`run ${runId} not found`);
      run.finished = true;
      const allSuccess = [...run.outcomes.values()].every(
        (s) => s === "SUCCEEDED_ITEMS" || s === "SUCCEEDED_EMPTY",
      );
      const someItems = [...run.outcomes.values()].some(
        (s) => s === "SUCCEEDED_ITEMS",
      );
      return {
        status: allSuccess
          ? someItems
            ? "SUCCEEDED_ITEMS"
            : "SUCCEEDED_EMPTY"
          : "PARTIAL",
        itemCount: 0,
      };
    },
  };
}

// ================================================================
// Pure unit tests — no deps needed
// ================================================================

describe("parseCronIntervalHours", () => {
  it("parses */4 as ~4 hours", () => {
    const hours = parseCronIntervalHours("7 */4 * * *");
    expect(hours).toBeCloseTo(4, 0);
  });

  it("parses */6 as ~6 hours", () => {
    const hours = parseCronIntervalHours("0 */6 * * *");
    expect(hours).toBeCloseTo(6, 0);
  });

  it("parses */12 as ~12 hours", () => {
    const hours = parseCronIntervalHours("0 */12 * * *");
    expect(hours).toBeCloseTo(12, 0);
  });

  it("falls back to 24 on unparseable cron", () => {
    expect(parseCronIntervalHours("invalid")).toBe(24);
  });
});

describe("getSourcesForGroup", () => {
  it("returns enabled sources with cron <= group max hours", () => {
    const sources = getSourcesForGroup("FAST");
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.enabled).toBe(true);
      expect(s.refreshCron).toBeTruthy();
      expect(parseCronIntervalHours(s.refreshCron!)).toBeLessThanOrEqual(6);
    }
  });

  it("returns enabled sources for STANDARD", () => {
    const sources = getSourcesForGroup("STANDARD");
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.enabled).toBe(true);
      expect(s.refreshCron).toBeTruthy();
      expect(parseCronIntervalHours(s.refreshCron!)).toBeLessThanOrEqual(12);
    }
  });

  it("includes sources whose interval is exactly at the boundary", () => {
    const sources = getSourcesForGroup("STANDARD");
    const every12h = sources.filter(
      (s) => s.refreshCron && parseCronIntervalHours(s.refreshCron) <= 12 && parseCronIntervalHours(s.refreshCron) > 6,
    );
    // At least one source should fall in the 7-12h range.
    expect(every12h.length).toBeGreaterThan(0);
  });

  it("excludes disabled sources", () => {
    const sources = getSourcesForGroup("FAST");
    for (const s of sources) {
      expect(s.enabled).toBe(true);
    }
  });

  it("excludes sources without a refresh cron", () => {
    const sources = getSourcesForGroup("FAST");
    for (const s of sources) {
      expect(s.refreshCron).toBeTruthy();
    }
  });
});

// ================================================================
// Orchestration tests — injectable fake ledger
// ================================================================

describe("collectBatch — false success", () => {
  it("does not mark a source successful before the fetch completes", async () => {
    const sourceA = testSourceContract("test-false-success-a");
    const sourceB = testSourceContract("test-false-success-b");

    const deferA = deferred<FetchOutcome>();
    let aFetchStarted = false;

    const fetchCounts = new Map<string, number>();

    const ledger = fakeLedger();
    const beginSpy: string[] = [];
    const originalBegin = ledger.beginRun.bind(ledger);
    ledger.beginRun = async (input) => {
      beginSpy.push(input.scopeKey);
      return originalBegin(input);
    };

    const deps = {
      getSources: (_group: CollectionGroup) => [sourceA, sourceB],
      fetchSource: async (s: SourceContract): Promise<FetchOutcome> => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        if (s.id === sourceA.id) {
          aFetchStarted = true;
          return deferA.promise;
        }
        return successOutcome(s.id);
      },
      ledger,
    };

    const batchPromise = collectBatch("FAST", baseArgs(), deps);

    // Give the batch a tick to start fetching sourceA.
    await new Promise((r) => setTimeout(r, 200));
    expect(aFetchStarted).toBe(true);

    // Before sourceA resolves: it should NOT be in the succeeded set.
    const succeededBefore = await ledger.alreadySucceeded(
      ledger._runs.keys().next().value ?? "",
    );
    expect(succeededBefore.has(sourceA.id)).toBe(false);

    // Resolve sourceA.
    deferA.resolve(successOutcome(sourceA.id));

    const result = await batchPromise;
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);

    // After resolution: sourceA IS in the succeeded set.
    const succeededAfter = await ledger.alreadySucceeded(
      ledger._runs.keys().next().value ?? "",
    );
    expect(succeededAfter.has(sourceA.id)).toBe(true);
    expect(succeededAfter.has(sourceB.id)).toBe(true);
  }, 10000);
});

describe("collectBatch — same-slot replay", () => {
  it("skips sources already successful in the same scheduled slot", async () => {
    const sourceOk = testSourceContract("test-replay-ok");
    const sourceFlaky = testSourceContract("test-replay-flaky");

    const fetchCounts = new Map<string, number>();

    const ledger = fakeLedger();

    const deps = (): Parameters<typeof collectBatch>[2] => ({
      getSources: (_group: CollectionGroup) => [sourceOk, sourceFlaky],
      fetchSource: async (s: SourceContract): Promise<FetchOutcome> => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        if (s.id === sourceFlaky.id) {
          const count = fetchCounts.get(s.id) ?? 0;
          if (count === 1) throw new Error("HTTP 503");
        }
        return successOutcome(s.id);
      },
      ledger,
    });

    // First run.
    const first = await collectBatch("FAST", baseArgs(), deps());
    expect(first.status).toBe("SUCCEEDED_ITEMS");

    // sourceFlaky failed once then retried: at least 2 calls (fail on attempt 1, succeed on 2)
    expect(fetchCounts.get(sourceFlaky.id)).toBeGreaterThanOrEqual(2);
    expect(first.succeeded).toBe(2);

    // Second run (same slot): sourceOk already successful → skipped.
    // sourceFlaky also successful now → skipped.
    const flakyBeforeReplay = fetchCounts.get(sourceFlaky.id)!;
    const second = await collectBatch("FAST", baseArgs(), deps());

    // Both sources were already successful — neither should have been fetched again.
    expect(fetchCounts.get(sourceOk.id)).toBe(1);
    expect(fetchCounts.get(sourceFlaky.id)).toBe(flakyBeforeReplay);

    // Result should indicate no new work.
    expect(second.attempted).toBe(0);
    expect(second.status).toBe("SUCCEEDED_EMPTY");
  }, 10000);

  it("retries previously-failed sources when the first run left them FAILED", async () => {
    const sourceA = testSourceContract("test-retry-failed-a");
    const sourceB = testSourceContract("test-retry-failed-b");

    const fetchCounts = new Map<string, number>();
    let bExhausts = true;

    const ledger = fakeLedger();

    const makeDeps = (): Parameters<typeof collectBatch>[2] => ({
      getSources: (_group: CollectionGroup) => [sourceA, sourceB],
      fetchSource: async (s: SourceContract): Promise<FetchOutcome> => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        if (s.id === sourceB.id && bExhausts) {
          throw new Error("HTTP 502");
        }
        return successOutcome(s.id);
      },
      ledger,
    });

    // First run: sourceA succeeds, sourceB exhausts (3 attempts).
    const first = await collectBatch("FAST", baseArgs(), makeDeps());
    expect(first.status).toBe("PARTIAL");
    expect(fetchCounts.get(sourceA.id)).toBe(1);
    // sourceB: 3 attempts exhausted
    expect(fetchCounts.get(sourceB.id)).toBe(3);

    // Second run: sourceA already successful → skipped.
    // sourceB was FAILED (not in succeeded set) → retried.
    bExhausts = false;
    const second = await collectBatch("FAST", baseArgs(), makeDeps());
    expect(fetchCounts.get(sourceA.id)).toBe(1); // unchanged — skipped
    expect(fetchCounts.get(sourceB.id)).toBe(4); // +1 — retried
    expect(second.status).toBe("SUCCEEDED_ITEMS");
  }, 10000);
});

describe("collectBatch — non-retryable errors", () => {
  it("stops after one attempt on an invariant error (robots_denied)", async () => {
    const source = testSourceContract("test-non-retryable");
    const fetchCounts = new Map<string, number>();

    const ledger = fakeLedger();
    const result = await collectBatch(
      "FAST",
      baseArgs(),
      {
        getSources: () => [source],
        fetchSource: async (s: SourceContract) => {
          fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
          throw new Error("robots_denied: Cloudflare challenge");
        },
        ledger,
      },
    );

    expect(fetchCounts.get(source.id)).toBe(1); // not retried
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
  }, 10000);
});
