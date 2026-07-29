/**
 * Phase 1 bounded canonical publishing batch (Operations Task 3).
 *
 * Exports:
 *   createPublishBatch(deps) → (args) => Promise<JobResult>
 *   publishBatch(args) — production, exactly 1 parameter
 *
 * The factory is for credential-free tests; the one-param function is the
 * registered job handler.  Persists a PUBLISH PipelineRun through
 * beginRun/finishRun deps (injectable, credential-free) matching the
 * accepted Tasks 1–2 persisted PipelineRun contract.  Same-slot replay is
 * idempotent: when no new drafts remain (prior run already published them),
 * the persisted cumulative result is returned verbatim and the run record
 * is never overwritten.
 */

import { revalidateTag } from "next/cache";

import { publishCanonicalDraft } from "../canonicalize/publish.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";
import { beginRun } from "../collection/run.js";

const MAX_DRAFTS = 100;

export interface PublishBatchDeps {
  /** Load up to `limit` reviewed drafts ordered deterministically.
   *  A "reviewed" draft has `reviewedBy` set and is in DRAFT or IN_REVIEW
   *  editorial status. */
  loadReviewedDrafts(limit: number): Promise<
    Array<{ id: string; reviewedBy: string | null }>
  >;
  /** Publish a single draft. The dep wraps the immutable publication API
   *  so tests can inject a stub without a DB. */
  publishDraft(draftId: string, reviewerId: string): Promise<void>;
  /** Invalidate a Next.js cache tag. Best-effort: the job may run outside
   *  a Next.js request scope (Railway/CLI) where revalidateTag throws. */
  invalidateTag(tag: string): Promise<void>;
  /** Begin (or reuse) the PipelineRun for this scheduled slot. */
  beginRun(input: {
    scopeKey: string;
    scheduledFor: Date;
    runnerVersion: string;
  }): Promise<string>;
  /** Finish the run, persisting status and full counts to
   *  PipelineRun.metadata.publishSummary so replay can read them
   *  verbatim. */
  finishRun(
    runId: string,
    summary: { status: string; itemCount: number; attempted: number; succeeded: number; failed: number },
  ): Promise<void>;
  /** Read the existing PipelineRun summary to power idempotent replay.
   *  Returns null when no prior finished run exists. */
  existingSummary?(runId: string): Promise<{
    status: string;
    itemCount: number;
    attempted: number;
    succeeded: number;
    failed: number;
  } | null>;
}

export function createPublishBatch(
  deps: PublishBatchDeps,
): (_args: JobArgs) => Promise<JobResult> {
  return async (args: JobArgs): Promise<JobResult> => {
    const scopeKey = "publish";
    const runId = await deps.beginRun({
      scopeKey,
      scheduledFor: args.scheduledFor,
      runnerVersion: args.runnerVersion,
    });

    const drafts = await deps.loadReviewedDrafts(MAX_DRAFTS);
    const reviewedDrafts = drafts.slice(0, MAX_DRAFTS);

    if (reviewedDrafts.length === 0) {
      // Replay: if a prior finished run exists, return its cumulative
      // result verbatim. The real production path reaches here when a
      // prior run published all drafts, so loadReviewedDrafts returns []
      // because those versions are now editorialStatus PUBLISHED and no
      // longer match DRAFT/IN_REVIEW.
      if (deps.existingSummary) {
        const prior = await deps.existingSummary(runId);
        if (prior) {
          const priorStatus = prior.status as JobStatus;
          return {
            runId,
            status: priorStatus,
            attempted: prior.attempted,
            succeeded: prior.succeeded,
            failed: prior.failed,
            itemCount: prior.itemCount,
            exitCode:
              priorStatus === "FAILED" || priorStatus === "PARTIAL" ? 1 : 0,
          };
        }
      }

      await deps.finishRun(runId, {
        status: "SUCCEEDED_EMPTY",
        itemCount: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
      });
      return {
        runId,
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

    for (const draft of reviewedDrafts) {
      if (!draft.reviewedBy) continue;
      try {
        await deps.publishDraft(draft.id, draft.reviewedBy);
        succeeded++;
      } catch {
        failed++;
      }
    }

    if (succeeded > 0) {
      try {
        await deps.invalidateTag("changes");
      } catch {
        /* best-effort */
      }
      try {
        await deps.invalidateTag("coverage");
      } catch {
        /* best-effort */
      }
    }

    const attempted = succeeded + failed;
    let status: JobStatus;
    if (failed === 0) {
      status = succeeded > 0 ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY";
    } else {
      status = succeeded > 0 ? "PARTIAL" : "FAILED";
    }

    // On replay: accumulate the real prior counts from metadata so no
    // count is ever reconstructed from status+itemCount. A retry where
    // previously-failed items now succeed shifts those from the prior
    // failed bucket into succeeded.
    let persistedStatus: JobStatus = status;
    let persistedItemCount = succeeded;
    let persistedSucceeded = succeeded;
    let persistedFailed = failed;
    let persistedAttempted = attempted;
    if (deps.existingSummary) {
      const prior = await deps.existingSummary(runId);
      if (prior) {
        if (succeeded + failed === 0) {
          // No new work — preserve prior summary verbatim.
          persistedStatus = prior.status as JobStatus;
          persistedItemCount = prior.itemCount;
          persistedSucceeded = prior.succeeded;
          persistedFailed = prior.failed;
          persistedAttempted = prior.attempted;
        } else {
          // New work produced — accumulate onto prior, handling the
          // case where previously-failed items now succeed on retry.
          persistedSucceeded = prior.succeeded + succeeded;
          persistedFailed =
            Math.max(0, prior.failed + failed - succeeded);
          // Unique items: prior.attempted already counts prior.failed;
          // current.attempted retries some of those — only count the
          // portion that exceeds prior.failed as net-new.
          const retried =
            Math.min(attempted, prior.failed);
          persistedAttempted = prior.attempted + attempted - retried;

          // Persist itemCount as the cumulative succeeded count so a
          // downstream consumer (health-cost) sees the real publication
          // yield, not just this invocation's delta.
          persistedItemCount = persistedSucceeded;

          if (persistedFailed === 0) {
            persistedStatus =
              persistedSucceeded > 0 ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY";
          } else {
            persistedStatus =
              persistedSucceeded > 0 ? "PARTIAL" : "FAILED";
          }
        }
      }
    }

    await deps.finishRun(runId, {
      status: persistedStatus,
      itemCount: persistedItemCount,
      attempted: persistedAttempted,
      succeeded: persistedSucceeded,
      failed: persistedFailed,
    });

    return {
      runId,
      status: persistedStatus,
      attempted: persistedAttempted,
      succeeded: persistedSucceeded,
      failed: persistedFailed,
      itemCount: persistedItemCount,
      exitCode: persistedFailed > 0 ? 1 : 0,
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
    try {
      revalidateTag(tag);
    } catch {
      // Worker context (Railway/CLI) — outside Next.js request scope,
      // revalidateTag throws. The publish already succeeded; cache
      // invalidation is a best-effort side effect.
    }
  },
  async beginRun(input) {
    const run = await beginRun({
      jobType: "PUBLISH",
      scopeKey: input.scopeKey,
      scheduledFor: input.scheduledFor,
      runnerVersion: input.runnerVersion,
    });
    return run.id;
  },
  async finishRun(runId, summary) {
    const { prisma: db } = await import("../db/client.js");
    await db.pipelineRun.update({
      where: { id: runId },
      data: {
        status: summary.status as import("@prisma/client").RunStatus,
        itemCount: summary.itemCount,
        finishedAt: new Date(),
        metadata: {
          publishSummary: {
            status: summary.status,
            itemCount: summary.itemCount,
            attempted: summary.attempted,
            succeeded: summary.succeeded,
            failed: summary.failed,
          },
        },
      },
    });
  },
  async existingSummary(runId) {
    const { prisma: db } = await import("../db/client.js");
    const run = await db.pipelineRun.findUnique({
      where: { id: runId },
      select: { finishedAt: true, metadata: true },
    });
    if (!run || !run.finishedAt) return null;
    const meta = run.metadata as { publishSummary?: {
      status: string; itemCount: number;
      attempted: number; succeeded: number; failed: number;
    } } | null;
    if (!meta?.publishSummary) return null;
    return meta.publishSummary;
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
