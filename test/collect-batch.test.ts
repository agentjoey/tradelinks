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

function retryableFailed(): FetchOutcome {
  return { kind: "failed", code: "HTTP_503", retryable: true, httpStatus: 503 };
}

function nonRetryableFailed(): FetchOutcome {
  return {
    kind: "failed",
    code: "HTTP_400",
    retryable: false,
    httpStatus: 400,
  };
}

function blockedOutcome(): FetchOutcome {
  return { kind: "blocked", code: "BOT_WALL", retryable: false, httpStatus: 403 };
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
      (s) =>
        s.refreshCron &&
        parseCronIntervalHours(s.refreshCron) <= 12 &&
        parseCronIntervalHours(s.refreshCron) > 6,
    );
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
// False-success test
// ================================================================

describe("collectBatch — false success", () => {
  it("does not mark a source successful before the fetch completes", async () => {
    const sourceA = testSourceContract("test-false-success-a");
    const sourceB = testSourceContract("test-false-success-b");

    const deferA = deferred<FetchOutcome>();
    let aFetchStarted = false;

    const ledger = fakeLedger();

    const deps = {
      getSources: (_group: CollectionGroup) => [sourceA, sourceB],
      fetchSource: async (s: SourceContract): Promise<FetchOutcome> => {
        if (s.id === sourceA.id) {
          aFetchStarted = true;
          return deferA.promise;
        }
        return successOutcome(s.id);
      },
      ledger,
    };

    const batchPromise = collectBatch("FAST", baseArgs(), deps);

    await new Promise((r) => setTimeout(r, 200));
    expect(aFetchStarted).toBe(true);

    const succeededBefore = await ledger.alreadySucceeded(
      ledger._runs.keys().next().value ?? "",
    );
    expect(succeededBefore.has(sourceA.id)).toBe(false);

    deferA.resolve(successOutcome(sourceA.id));

    const result = await batchPromise;
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);

    const succeededAfter = await ledger.alreadySucceeded(
      ledger._runs.keys().next().value ?? "",
    );
    expect(succeededAfter.has(sourceA.id)).toBe(true);
    expect(succeededAfter.has(sourceB.id)).toBe(true);
  }, 10000);
});

// ================================================================
// Same-slot replay tests
// ================================================================

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
        if (s.id === sourceFlaky.id && (fetchCounts.get(s.id) ?? 0) === 1) {
          return retryableFailed();
        }
        return successOutcome(s.id);
      },
      ledger,
    });

    const first = await collectBatch("FAST", baseArgs(), deps());
    expect(first.status).toBe("SUCCEEDED_ITEMS");

    // sourceFlaky: 1st call returned retryable, 2nd call succeeded = 2 calls
    expect(fetchCounts.get(sourceFlaky.id)).toBe(2);
    expect(first.succeeded).toBe(2);

    const flakyBeforeReplay = fetchCounts.get(sourceFlaky.id)!;
    const second = await collectBatch("FAST", baseArgs(), deps());

    expect(fetchCounts.get(sourceOk.id)).toBe(1);
    expect(fetchCounts.get(sourceFlaky.id)).toBe(flakyBeforeReplay);

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
          return retryableFailed();
        }
        return successOutcome(s.id);
      },
      ledger,
    });

    // First run: sourceA succeeds, sourceB exhausts (3 attempts all retryable).
    const first = await collectBatch("FAST", baseArgs(), makeDeps());
    expect(first.status).toBe("PARTIAL");
    expect(fetchCounts.get(sourceA.id)).toBe(1);
    expect(fetchCounts.get(sourceB.id)).toBe(3);

    // Second run: sourceA already successful → skipped.
    // sourceB was FAILED (not in succeeded set) → retried.
    bExhausts = false;
    const second = await collectBatch("FAST", baseArgs(), makeDeps());
    expect(fetchCounts.get(sourceA.id)).toBe(1);
    expect(fetchCounts.get(sourceB.id)).toBe(4);
    expect(second.status).toBe("SUCCEEDED_ITEMS");
  }, 10000);
});

// ================================================================
// STRUCTURED OUTCOME retry tests (primary contract — BLOCKER 2 fix)
// ================================================================

describe("collectBatch — structured retry", () => {
  it("retries exactly 3 times on retryable failure then records FAILED", async () => {
    const source = testSourceContract("test-structured-retryable");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async (s) => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        return retryableFailed();
      },
      ledger,
    });

    expect(fetchCounts.get(source.id)).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.exitCode).toBe(1);
  }, 10000);

  it("fetches non-retryable failure exactly once (INVARIANT_FAILURE)", async () => {
    const source = testSourceContract("test-structured-nonretryable");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async (s) => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        return nonRetryableFailed();
      },
      ledger,
    });

    expect(fetchCounts.get(source.id)).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  }, 10000);

  it("fetches blocked outcome exactly once", async () => {
    const source = testSourceContract("test-structured-blocked");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async (s) => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        return blockedOutcome();
      },
      ledger,
    });

    expect(fetchCounts.get(source.id)).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  }, 10000);

  it("retryable-then-success on attempt 2 records SUCCEEDED with count 1", async () => {
    const source = testSourceContract("test-structured-recover");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async (s) => {
        const count = (fetchCounts.get(s.id) ?? 0) + 1;
        fetchCounts.set(s.id, count);
        if (count < 2) return retryableFailed();
        return successOutcome(s.id);
      },
      ledger,
    });

    expect(fetchCounts.get(source.id)).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  }, 10000);
});

// ================================================================
// DEFENSIVE FALLBACK — thrown errors (kept as secondary contract)
// ================================================================

describe("collectBatch — thrown-error fallback", () => {
  it("stops after one attempt on robots_denied throw", async () => {
    const source = testSourceContract("test-throw-deny");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async (s: SourceContract) => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        throw new Error("robots_denied: Cloudflare challenge");
      },
      ledger,
    });

    expect(fetchCounts.get(source.id)).toBe(1);
    expect(result.failed).toBe(1);
  }, 10000);

  it("retries on thrown transport error (defensive fallback)", async () => {
    const source = testSourceContract("test-throw-transport");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async (s: SourceContract) => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        throw new Error("fetch failed: socket hang up");
      },
      ledger,
    });

    expect(fetchCounts.get(source.id)).toBe(3);
    expect(result.failed).toBe(1);
  }, 10000);
});
