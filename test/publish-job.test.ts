/**
 * Contract tests for publish-batch job (Operations Task 3 — Publishing).
 *
 * Tests call createPublishBatch(deps) — the factory — not the production
 * publishBatch.  All deps are injectable for credential-free execution.
 */

import { describe, expect, it } from "vitest";

import type { JobArgs } from "../src/jobs/types.js";
import { createPublishBatch, type PublishBatchDeps } from "../src/jobs/publish-batch.js";

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

function fakeDraft(id: string, reviewedBy: string | null = "reviewer-1"): FakeDraft {
  return { id, reviewedBy };
}

function makePublisher(deps: Partial<PublishBatchDeps> = {}) {
  const published: string[] = [];
  const invalidatedTags: string[] = [];

  return {
    published,
    invalidatedTags,
    call: createPublishBatch({
      loadReviewedDrafts: deps.loadReviewedDrafts ?? (async (_limit) => []),
      publishDraft: deps.publishDraft ?? (async (draftId) => {
        published.push(draftId);
      }),
      invalidateTag: deps.invalidateTag ?? (async (tag) => {
        invalidatedTags.push(tag);
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
  it("bounded to 100 reviewed drafts", async () => {
    const allDrafts = Array.from({ length: 150 }, (_, i) =>
      fakeDraft(`draft-${i + 1}`),
    );
    const { call, published } = makePublisher({
      loadReviewedDrafts: async (limit) => allDrafts.slice(0, limit),
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
    const drafts = [
      fakeDraft("ok-1"),
      fakeDraft("bad"),
      fakeDraft("ok-2"),
    ];
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
  it("skips drafts with null reviewedBy", async () => {
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
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.attempted).toBe(3);
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
    expect(result.exitCode).toBe(1);
  }, 10000);
});
