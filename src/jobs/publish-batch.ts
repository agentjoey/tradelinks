/**
 * Phase 1 bounded canonical publishing batch (Operations Task 3).
 *
 * Exports:
 *   createPublishBatch(deps) → (args) => Promise<JobResult>
 *   publishBatch(args) — production, exactly 1 parameter
 *
 * The factory is for credential-free tests; the one-param function is the
 * registered job handler.
 */

import { revalidateTag } from "next/cache";

import { publishCanonicalDraft } from "../canonicalize/publish.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";

const MAX_DRAFTS = 100;

export interface PublishBatchDeps {
  /** Load up to `limit` reviewed drafts ordered deterministically.
   *  A "reviewed" draft has `reviewedBy` set and is in DRAFT or IN_REVIEW
   *  editorial status. */
  loadReviewedDrafts(limit: number): Promise<Array<{ id: string; reviewedBy: string | null }>>;
  /** Publish a single draft. The dep wraps the immutable publication API
   *  so tests can inject a stub without a DB. */
  publishDraft(draftId: string, reviewerId: string): Promise<void>;
  /** Invalidate a Next.js cache tag. */
  invalidateTag(tag: string): Promise<void>;
}

export function createPublishBatch(
  deps: PublishBatchDeps,
): (_args: JobArgs) => Promise<JobResult> {
  return async (_args: JobArgs): Promise<JobResult> => {
    const drafts = await deps.loadReviewedDrafts(MAX_DRAFTS);

    if (drafts.length === 0) {
      return {
        runId: crypto.randomUUID(),
        status: "SUCCEEDED_EMPTY",
        attempted: 0,
        succeeded: 0,
        failed: 0,
        itemCount: 0,
        exitCode: 0,
      };
    }

    let succeeded = 0;
    let failed = 0;

    for (const draft of drafts) {
      if (!draft.reviewedBy) {
        failed++;
        continue;
      }
      try {
        await deps.publishDraft(draft.id, draft.reviewedBy);
        succeeded++;
      } catch {
        failed++;
      }
    }

    if (succeeded > 0) {
      await deps.invalidateTag("changes");
      await deps.invalidateTag("coverage");
    }

    const status: JobStatus =
      failed === 0
        ? "SUCCEEDED_ITEMS"
        : succeeded > 0
          ? "PARTIAL"
          : "FAILED";

    return {
      runId: crypto.randomUUID(),
      status,
      attempted: drafts.length,
      succeeded,
      failed,
      itemCount: succeeded,
      exitCode: failed > 0 ? 1 : 0,
    };
  };
}

// ---- production deps ----

const REAL_DEPS: PublishBatchDeps = {
  async loadReviewedDrafts(limit: number) {
    const { prisma: db } = await import("../db/client.js");
    const versions = await db.canonicalChangeVersion.findMany({
      where: {
        editorialStatus: { in: ["DRAFT", "IN_REVIEW"] },
        reviewedBy: { not: null },
      },
      take: limit,
      orderBy: { createdAt: "asc" },
      select: { id: true, reviewedBy: true },
    });
    return versions;
  },
  async publishDraft(draftId: string, reviewerId: string) {
    await publishCanonicalDraft(draftId, reviewerId);
  },
  async invalidateTag(tag: string) {
    revalidateTag(tag);
  },
};

/** Production one-parameter entry point — exactly the spec shape. */
export const publishBatch = createPublishBatch(REAL_DEPS);

// ---- job registration ----

registerJob({
  name: "publish",
  maxAttempts: 1,
  run: publishBatch,
  dryRun: async (_args: JobArgs): Promise<JobResult> => {
    const drafts = await REAL_DEPS.loadReviewedDrafts(MAX_DRAFTS);
    return {
      runId: crypto.randomUUID(),
      status: "SUCCEEDED_EMPTY",
      attempted: drafts.length,
      succeeded: 0,
      failed: 0,
      itemCount: 0,
      exitCode: 0,
    };
  },
});
