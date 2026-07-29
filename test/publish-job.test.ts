/**
 * Contract tests for publish-batch job (Operations Task 3 — Publishing).
 *
 * Tests call createPublishBatch(deps) — the factory — not the production
 * publishBatch.  All deps are injectable for credential-free execution.
 *
 * Persists a PUBLISH PipelineRun through beginRun/finishRun deps matching
 * the accepted Tasks 1–2 persisted PipelineRun contract.  Same-slot replay
 * is idempotent.
 */

import { describe, expect, it } from "vitest";

import type { JobArgs } from "../src/jobs/types.js";
import {
  createPublishBatch,
  type PublishBatchDeps,
} from "../src/jobs/publish-batch.js";

function baseArgs(overrides?: Partial<JobArgs>): JobArgs {
  return {
    scheduledFor: new Date("2026-07-29T08:00:00Z"),
    runnerVersion: "test",
    dryRun: false,
    ...overrides,
  };
}

interface FakeDraft {
  id: string;
  reviewedBy: string | null;
}

function fakeDraft(
  id: string,
  reviewedBy: string | null = "reviewer-1",
): FakeDraft {
  return { id, reviewedBy };
}

interface RunRec {
  id: string;
  status: string;
  itemCount: number;
  attempted: number;
  succeeded: number;
  failed: number;
  finished: boolean;
}

function makePublisher(deps: Partial<PublishBatchDeps> = {}) {
  const published: string[] = [];
  const invalidatedTags: string[] = [];
  let nextRunId = 1;
  const runStore = new Map<string, RunRec>();

  return {
    published,
    invalidatedTags,
    runStore,
    call: createPublishBatch({
      loadReviewedDrafts:
        deps.loadReviewedDrafts ?? (async (_limit) => []),
      publishDraft:
        deps.publishDraft ??
        (async (draftId) => {
          published.push(draftId);
        }),
      invalidateTag:
        deps.invalidateTag ??
        (async (tag) => {
          invalidatedTags.push(tag);
        }),
      beginRun:
        deps.beginRun ??
        (async () => {
          const id = `run-${nextRunId++}`;
          runStore.set(id, {
            id,
            status: "RUNNING",
            itemCount: 0,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            finished: false,
          });
          return id;
        }),
      finishRun:
        deps.finishRun ??
        (async (runId, summary) => {
          const r = runStore.get(runId);
          if (r) {
            r.status = summary.status;
            r.itemCount = summary.itemCount;
            r.attempted = summary.attempted;
            r.succeeded = summary.succeeded;
            r.failed = summary.failed;
            r.finished = true;
          }
        }),
      existingSummary:
        deps.existingSummary ??
        (async (runId) => {
          const r = runStore.get(runId);
          if (!r || !r.finished) return null;
          return {
            status: r.status,
            itemCount: r.itemCount,
            attempted: r.attempted,
            succeeded: r.succeeded,
            failed: r.failed,
          };
        }),
    }),
  };
}

// ============================ empty =============================

describe("publishBatch — empty", () => {
  it("succeeds empty when no reviewed draft is publishable", async () => {
    const { call } = makePublisher();
    const result = await call(baseArgs());
    expect(result).toMatchObject({ status: "SUCCEEDED_EMPTY", exitCode: 0 });
  });
});

// ============================ PipelineRun persistence ===========

describe("publishBatch — PipelineRun persistence", () => {
  it("persists a PUBLISH PipelineRun and returns the persisted runId", async () => {
    const drafts = [fakeDraft("d-1")];
    const { call, runStore } = makePublisher({
      loadReviewedDrafts: async (limit) => drafts.slice(0, limit),
    });
    const result = await call(baseArgs());
    expect(runStore.has(result.runId)).toBe(true);
    const rec = runStore.get(result.runId)!;
    expect(rec.finished).toBe(true);
    expect(rec.status).toBe("SUCCEEDED_ITEMS");
    expect(rec.itemCount).toBe(1);
  }, 10000);

  it("same-slot replay preserves persisted cumulative result and does not re-publish", async () => {
    const drafts = [fakeDraft("d-1"), fakeDraft("d-2"), fakeDraft("d-3")];
    const returned = new Set<string>();

    // Model production: first call sees 3 publishable drafts, publishes them.
    // Second call (same slot) sees zero loadable drafts (already published).
    const persistedRunId = "run-persisted";
    const { call, runStore, published } = makePublisher({
      loadReviewedDrafts: async (limit) => {
        const remaining = drafts.filter((d) => !returned.has(d.id));
        return remaining.slice(0, limit);
      },
      publishDraft: async (draftId) => {
        published.push(draftId);
        returned.add(draftId);
      },
      beginRun: async () => {
        if (!runStore.has(persistedRunId)) {
          runStore.set(persistedRunId, {
            id: persistedRunId,
            status: "RUNNING",
            itemCount: 0,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            finished: false,
          });
        }
        return persistedRunId;
      },
    });

    const r1 = await call(baseArgs());
    expect(r1.status).toBe("SUCCEEDED_ITEMS");
    expect(r1.itemCount).toBe(3);
    expect(r1.attempted).toBe(3);
    expect(r1.succeeded).toBe(3);
    expect(r1.failed).toBe(0);
    expect(r1.exitCode).toBe(0);
    expect(published.length).toBe(3);

    // Second call: drafts already published, loadReviewedDrafts returns []
    const publishedBefore = published.length;
    const r2 = await call(baseArgs());

    // publishDraft must NOT be called again
    expect(published.length).toBe(publishedBefore);

    // Result must preserve the original cumulative persisted result
    expect(r1.runId).toBe(persistedRunId);
    expect(r2.runId).toBe(persistedRunId);
    expect(r2.status).toBe("SUCCEEDED_ITEMS");
    expect(r2.itemCount).toBe(3);
    expect(r2.succeeded).toBe(3);
    expect(r2.failed).toBe(0);
    expect(r2.exitCode).toBe(0);

    // Run record must retain SUCCEEDED_ITEMS/itemCount 3 (NOT overwritten)
    const rec = runStore.get(r2.runId)!;
    expect(rec.finished).toBe(true);
    expect(rec.status).toBe("SUCCEEDED_ITEMS");
    expect(rec.itemCount).toBe(3);
  }, 10000);
});

// ============================ bounded publishing ================

describe("publishBatch — bounded publishing", () => {
  it("publishes all reviewed drafts up to 100", async () => {
    const drafts = Array.from({ length: 5 }, (_, i) =>
      fakeDraft(`draft-${i + 1}`),
    );
    const { call, published } = makePublisher({
      loadReviewedDrafts: async (limit) => drafts.slice(0, limit),
    });
    const result = await call(baseArgs());
    expect(published.length).toBe(5);
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.itemCount).toBe(5);
    expect(result.attempted).toBe(5);
    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.exitCode).toBe(0);
  }, 10000);
});

// ============================ 100 cap ===========================

describe("publishBatch — 100 cap", () => {
  it("bounded to 100 reviewed drafts even when dep over-returns", async () => {
    const allDrafts = Array.from({ length: 150 }, (_, i) =>
      fakeDraft(`draft-${i + 1}`),
    );
    const { call, published } = makePublisher({
      // Dep deliberately returns more than 100 — the handler must cap.
      loadReviewedDrafts: async () => allDrafts,
    });
    const result = await call(baseArgs());
    expect(published.length).toBe(100);
    expect(result.attempted).toBe(100);
    expect(result.succeeded).toBe(100);
    expect(result.exitCode).toBe(0);
  }, 10000);
});

// ============================ individual failure ================

describe("publishBatch — individual failure", () => {
  it("continues batch on individual draft failure", async () => {
    const drafts = [fakeDraft("ok-1"), fakeDraft("bad"), fakeDraft("ok-2")];
    const published: string[] = [];
    const { call } = makePublisher({
      loadReviewedDrafts: async () => drafts,
      publishDraft: async (draftId) => {
        if (draftId === "bad") throw new Error("publication invariant");
        published.push(draftId);
      },
    });
    const result = await call(baseArgs());
    expect(result.status).toBe("PARTIAL");
    expect(published).toEqual(["ok-1", "ok-2"]);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.attempted).toBe(3);
    expect(result.exitCode).toBe(1);
  }, 10000);
});

// ============================ cache invalidation ================

describe("publishBatch — cache invalidation", () => {
  it("invalidates changes and coverage only after affected publication", async () => {
    const drafts = [fakeDraft("d-1")];
    const { call, invalidatedTags } = makePublisher({
      loadReviewedDrafts: async () => drafts,
    });
    const result = await call(baseArgs());
    expect(result.succeeded).toBe(1);
    expect(invalidatedTags).toContain("changes");
    expect(invalidatedTags).toContain("coverage");
  }, 10000);

  it("does not invalidate when no drafts published", async () => {
    const { call, invalidatedTags } = makePublisher();
    const result = await call(baseArgs());
    expect(result.status).toBe("SUCCEEDED_EMPTY");
    expect(invalidatedTags.length).toBe(0);
  }, 10000);

  it("invalidates only changes and coverage, no other tags", async () => {
    const drafts = [fakeDraft("d-1")];
    const { call, invalidatedTags } = makePublisher({
      loadReviewedDrafts: async () => drafts,
    });
    await call(baseArgs());
    expect(invalidatedTags).toEqual(["changes", "coverage"]);
  }, 10000);
});

// ============================ skip drafts lacking reviewedBy ====

describe("publishBatch — skip non-reviewed", () => {
  it("skips drafts with null reviewedBy without counting as failed", async () => {
    const drafts = [
      fakeDraft("d-1", "alice"),
      fakeDraft("d-2", null),
      fakeDraft("d-3", "bob"),
    ];
    const published: string[] = [];
    const { call } = makePublisher({
      loadReviewedDrafts: async () => drafts,
      publishDraft: async (draftId) => {
        published.push(draftId);
      },
    });
    const result = await call(baseArgs());
    expect(published).toEqual(["d-1", "d-3"]);
    // Attempted = only actual publish attempts, not skipped
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.exitCode).toBe(0);
  }, 10000);
});

// ============================ retry after partial ===============

describe("publishBatch — retry after PARTIAL", () => {
  it("retry where previously failing draft succeeds reports cumulative success", async () => {
    // run 1: 3 reviewed drafts, d3 throws -> PARTIAL (succeeded 2, failed 1)
    // run 2: d3 now succeeds; d1/d2 already published so only d3 loads
    // expected: cumulative SUCCEEDED_ITEMS, attempted 3, succeeded 3, failed 0, itemCount 3
    const failedOnce = new Set<string>();
    const persistedRunId = "run-persisted";
    const { call, runStore } = makePublisher({
      beginRun: async () => {
        if (!runStore.has(persistedRunId)) {
          runStore.set(persistedRunId, {
            id: persistedRunId,
            status: "RUNNING",
            itemCount: 0,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            finished: false,
          });
        }
        return persistedRunId;
      },
      loadReviewedDrafts: async () => {
        if (failedOnce.has("d3")) {
          // run 2: d1/d2 already published, only d3 remains
          return [fakeDraft("d3")];
        }
        return [fakeDraft("d1"), fakeDraft("d2"), fakeDraft("d3")];
      },
      publishDraft: async (draftId) => {
        if (draftId === "d3" && !failedOnce.has("d3")) {
          failedOnce.add("d3");
          throw new Error("publication invariant");
        }
      },
    });

    // run 1
    const r1 = await call(baseArgs());
    expect(r1.status).toBe("PARTIAL");
    expect(r1.attempted).toBe(3);
    expect(r1.succeeded).toBe(2);
    expect(r1.failed).toBe(1);
    expect(r1.itemCount).toBe(2);
    expect(r1.exitCode).toBe(1);

    const recAfterRun1 = runStore.get(persistedRunId)!;
    expect(recAfterRun1.attempted).toBe(3);
    expect(recAfterRun1.succeeded).toBe(2);
    expect(recAfterRun1.failed).toBe(1);
    expect(recAfterRun1.status).toBe("PARTIAL");

    // run 2 (retry, d3 now succeeds)
    const r2 = await call(baseArgs());
    expect(r2.status).toBe("SUCCEEDED_ITEMS");
    expect(r2.attempted).toBe(3);
    expect(r2.succeeded).toBe(3);
    expect(r2.failed).toBe(0);
    expect(r2.itemCount).toBe(3);
    expect(r2.exitCode).toBe(0);

    const recAfterRun2 = runStore.get(persistedRunId)!;
    expect(recAfterRun2.attempted).toBe(3);
    expect(recAfterRun2.succeeded).toBe(3);
    expect(recAfterRun2.failed).toBe(0);
    expect(recAfterRun2.status).toBe("SUCCEEDED_ITEMS");
  }, 10000);

  it("zero-work replay after PARTIAL run returns prior counts unchanged", async () => {
    // run 1: PARTIAL (succeeded 2, failed 1)
    // run 2: zero loadable drafts (all in final state) -> returns prior counts
    let hasRun = false;
    const persistedRunId = "run-persisted-z";
    const { call, runStore } = makePublisher({
      beginRun: async () => {
        if (!runStore.has(persistedRunId)) {
          runStore.set(persistedRunId, {
            id: persistedRunId,
            status: "RUNNING",
            itemCount: 0,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            finished: false,
          });
        }
        return persistedRunId;
      },
      loadReviewedDrafts: async () => {
        if (!hasRun) {
          hasRun = true;
          return [fakeDraft("d1"), fakeDraft("d2"), fakeDraft("d3")];
        }
        return [];
      },
      publishDraft: async (draftId) => {
        if (draftId === "d3") throw new Error("publication invariant");
      },
    });

    // run 1: PARTIAL
    const r1 = await call(baseArgs());
    expect(r1.status).toBe("PARTIAL");
    expect(r1.succeeded).toBe(2);
    expect(r1.failed).toBe(1);
    expect(r1.attempted).toBe(3);

    // run 2: zero new work — must return prior unchanged
    const r2 = await call(baseArgs());
    expect(r2.status).toBe("PARTIAL");
    expect(r2.attempted).toBe(3);
    expect(r2.succeeded).toBe(2);
    expect(r2.failed).toBe(1);
    expect(r2.exitCode).toBe(1);

    // Run store must NOT be overwritten with zeros
    const rec = runStore.get(persistedRunId)!;
    expect(rec.attempted).toBe(3);
    expect(rec.succeeded).toBe(2);
    expect(rec.failed).toBe(1);
    expect(rec.status).toBe("PARTIAL");
  }, 10000);
});

// ============================ all fail ==========================

describe("publishBatch — all fail", () => {
  it("returns FAILED when every draft fails", async () => {
    const drafts = [fakeDraft("bad-1"), fakeDraft("bad-2")];
    const { call } = makePublisher({
      loadReviewedDrafts: async () => drafts,
      publishDraft: async () => {
        throw new Error("publication invariant");
      },
    });
    const result = await call(baseArgs());
    expect(result.status).toBe("FAILED");
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.attempted).toBe(2);
    expect(result.exitCode).toBe(1);
  }, 10000);
});

// ============================ invalidateTag guards ==============

describe("publishBatch — invalidateTag guard", () => {
  it("does not fail when invalidateTag throws (Railway/CLI context)", async () => {
    const drafts = [fakeDraft("d-1")];
    const { call } = makePublisher({
      loadReviewedDrafts: async () => drafts,
      invalidateTag: async () => {
        throw new Error(
          "Invariant: headers() expects to have requestAsyncStorage",
        );
      },
    });
    // Should not throw — invalidateTag failure is isolated
    const result = await call(baseArgs());
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.succeeded).toBe(1);
    expect(result.exitCode).toBe(0);
  }, 10000);
});
