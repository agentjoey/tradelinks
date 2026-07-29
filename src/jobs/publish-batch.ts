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
 * accepted Tasks 1–2 persisted PipelineRun contract.
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
  /** Finish the run, persisting status and itemCount. */
  finishRun(
    runId: string,
    summary: { status: string; itemCount: number },
  ): Promise<void>;
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

    if (drafts.length === 0) {
      await deps.finishRun(runId, {
        status: "SUCCEEDED_EMPTY",
        itemCount: 0,
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
    let skipped = 0;

    for (const draft of drafts) {
      if (!draft.reviewedBy) {
        skipped++;
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
      try { await deps.invalidateTag("changes"); } catch { /* best-effort */ }
      try { await deps.invalidateTag("coverage"); } catch { /* best-effort */ }
    }

    const status: JobStatus =
      failed === 0
        ? succeeded > 0
          ? "SUCCEEDED_ITEMS"
          : "SUCCEEDED_EMPTY"
        : succeeded > 0
          ? "PARTIAL"
          : "FAILED";

    await deps.finishRun(runId, {
      status,
      itemCount: succeeded,
    });

    // Skipped drafts are not attempted work — they were filtered out by
    // the caller. Only actual publish attempts (succeeded+failed) count.
    const attempted = succeeded + failed;

    return {
      runId,
      status,
      attempted,
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
      },
    });
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
