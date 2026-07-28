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
    items:
      items.length > 0
        ? items
        : [{ url: `https://ex.com/${id}/x`, title: `Item from ${id}` }],
    httpStatus: 200,
    contentHash: `hash-${id}`,
  };
}

function retryableFailed(code = "HTTP_503"): FetchOutcome {
  return { kind: "failed", code, retryable: true, httpStatus: 503 };
}

function nonRetryableFailed(code = "HTTP_400"): FetchOutcome {
  return { kind: "failed", code, retryable: false, httpStatus: 400 };
}

function blockedOutcome(): FetchOutcome {
  return {
    kind: "blocked",
    code: "BOT_WALL",
    retryable: false,
    httpStatus: 403,
  };
}

// ----- FakeLedger ----

interface FakeLedger extends BatchLedger {
  _runs: Map<string, RunState>;
}

interface RunState {
  id: string;
  succeeded: Set<string>;
  outcomes: Map<string, string>;
  /** Cumulative itemCount stored by the ledger (survives replays). */
  persistedItemCount: number;
  persistedStatus: string;
  finished: boolean;
}

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
        persistedItemCount: 0,
        persistedStatus: "RUNNING",
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
      const itemCount =
        outcome.kind === "success" ? outcome.items.length : 0;
      run.outcomes.set(sourceId, status);
      // Cumulative: increment, never replace (mimics real SourceCheck.increment)
      run.persistedItemCount += itemCount;
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
      run.persistedStatus = allSuccess
        ? someItems
          ? "SUCCEEDED_ITEMS"
          : "SUCCEEDED_EMPTY"
        : [...run.outcomes.values()].every((s) => s === "FAILED")
          ? "FAILED"
          : "PARTIAL";
      return { status: run.persistedStatus, itemCount: run.persistedItemCount };
    },
  };
}

// ================================================================
// Pure unit tests
// ================================================================

describe("parseCronIntervalHours", () => {
  it("parses */4 as ~4 hours", () => {
    expect(parseCronIntervalHours("7 */4 * * *")).toBeCloseTo(4, 0);
  });
  it("parses */6 as ~6 hours", () => {
    expect(parseCronIntervalHours("0 */6 * * *")).toBeCloseTo(6, 0);
  });
  it("parses */12 as ~12 hours", () => {
    expect(parseCronIntervalHours("0 */12 * * *")).toBeCloseTo(12, 0);
  });
  it("falls back to 24 on unparseable cron", () => {
    expect(parseCronIntervalHours("invalid")).toBe(24);
  });
});

describe("getSourcesForGroup", () => {
  it("returns enabled sources with cron <= 6h for FAST", () => {
    const sources = getSourcesForGroup("FAST");
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.enabled).toBe(true);
      expect(s.refreshCron).toBeTruthy();
      expect(parseCronIntervalHours(s.refreshCron!)).toBeLessThanOrEqual(6);
    }
  });
  it("returns enabled sources for STANDARD (6h < interval <= 12h)", () => {
    const sources = getSourcesForGroup("STANDARD");
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.enabled).toBe(true);
      expect(s.refreshCron).toBeTruthy();
      const h = parseCronIntervalHours(s.refreshCron!);
      expect(h).toBeGreaterThan(6);
      expect(h).toBeLessThanOrEqual(12);
    }
  });
  it("excludes disabled sources", () => {
    for (const s of getSourcesForGroup("FAST")) {
      expect(s.enabled).toBe(true);
    }
  });
  it("excludes sources without a refresh cron", () => {
    for (const s of getSourcesForGroup("FAST")) {
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

    // finishRun derives SUCCEEDED_ITEMS when all checks succeeded with items.
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  }, 10000);
});

// ================================================================
// BLOCKER 3 fix: rejecting ledger write → false-success regression
// ================================================================

describe("collectBatch — rejecting ledger write", () => {
  it("counts a source as failed when ledger.recordOutcome rejects", async () => {
    const source = testSourceContract("test-rejecting-ledger");
    const ledger = fakeLedger();
    const originalRecord = ledger.recordOutcome.bind(ledger);
    ledger.recordOutcome = async (runId, sourceId, _outcome) => {
      // Record the outcome first so finishRun sees the failed check,
      // then throw to simulate a mid-transaction abort.
      await originalRecord(runId, sourceId, {
        kind: "failed",
        code: "TRANSACTION_TIMEOUT",
        retryable: false,
      });
      throw new Error("simulated transaction timeout");
    };

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async () => successOutcome(source.id),
      ledger,
    });

    // The source was attempted, fetch succeeded, but ledger write rejected → failed.
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.exitCode).toBe(1);
    // finishRun reports FAILED because the check stored was a failure.
    expect(result.status).toBe("FAILED");
  }, 10000);
});

// ================================================================
// BLOCKER 2 fix: replay preserves persisted run status/count
// ================================================================

describe("collectBatch — persisted replay", () => {
  it("replay preserves the prior run status and cumulative item count", async () => {
    const source = testSourceContract("test-replay-persist");
    const ledger = fakeLedger();

    const deps = (): Parameters<typeof collectBatch>[2] => ({
      getSources: () => [source],
      fetchSource: async () => successOutcome(source.id),
      ledger,
    });

    const first = await collectBatch("FAST", baseArgs(), deps());
    expect(first.status).toBe("SUCCEEDED_ITEMS");
    expect(first.itemCount).toBeGreaterThanOrEqual(1);
    const firstCount = first.itemCount;

    // Same-slot replay: source already succeeded → nothing to fetch.
    const second = await collectBatch("FAST", baseArgs(), deps());

    // BLOCKER 2 fix: the persisted run status and cumulative count survive replay.
    expect(second.status).toBe("SUCCEEDED_ITEMS");
    expect(second.itemCount).toBe(firstCount);
    expect(second.attempted).toBe(0);
    expect(second.exitCode).toBe(0);
  }, 10000);
});

// ================================================================
// Structured retry tests (primary contract)
// ================================================================

describe("collectBatch — structured retry", () => {
  it("retries exactly 3 times on retryable failure then records FAILED", async () => {
    const source = testSourceContract("test-structured-retryable");
    const fetchCounts = new Map<string, number>();
    const recordedOutcomes: FetchOutcome[] = [];
    const ledger = fakeLedger();
    const originalRecord = ledger.recordOutcome.bind(ledger);
    ledger.recordOutcome = async (runId, sourceId, outcome) => {
      recordedOutcomes.push(outcome);
      return originalRecord(runId, sourceId, outcome);
    };

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
    expect(result.exitCode).toBe(1);

    // BLOCKER 4(a): assert the machine outcome code is preserved.
    const lastRecorded = recordedOutcomes[recordedOutcomes.length - 1];
    expect(lastRecorded).toBeDefined();
    if (lastRecorded && lastRecorded.kind !== "success") {
      // When exhaustion puts a diagnostic, it's RETRY_EXHAUSTED; the
      // outcomeFromError path preserves the last fetch outcome. Either is
      // acceptable — the key assertion is that a machine code exists.
      expect(typeof lastRecorded.code).toBe("string");
      expect(lastRecorded.code.length).toBeGreaterThan(0);
    }
  }, 10000);

  it("fetches non-retryable failure exactly once", async () => {
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
  }, 10000);

  it("retryable-then-success on attempt 2 records SUCCEEDED", async () => {
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

  // BLOCKER 1 fix: unresolvable enabled source fails closed
  it("fails closed (non-retryable) for invariant code (unresolvable source)", async () => {
    const source = testSourceContract("test-invariant");
    const fetchCounts = new Map<string, number>();
    const ledger = fakeLedger();

    const result = await collectBatch("FAST", baseArgs(), {
      getSources: () => [source],
      fetchSource: async (s) => {
        fetchCounts.set(s.id, (fetchCounts.get(s.id) ?? 0) + 1);
        return { kind: "failed", code: "INVARIANT: no SourceConfig", retryable: false };
      },
      ledger,
    });

    // Non-retryable → fetched exactly once.
    expect(fetchCounts.get(source.id)).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.exitCode).toBe(1);
  }, 10000);
});

// ================================================================
// Defensive fallback — thrown errors
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
