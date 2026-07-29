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
  /** Finish the run, persisting status, full counts, and the
   *  identity-keyed attempted/failed sets to
   *  PipelineRun.metadata.publishSummary so replay can reconcile by
   *  draft identity instead of aggregate arithmetic. */
  finishRun(
    runId: string,
    summary: { status: string; itemCount: number; attempted: number; succeeded: number; failed: number; attemptedIds: string[]; failedIds: string[] },
  ): Promise<void>;
  /** Read the existing PipelineRun summary to power idempotent replay.
   *  Returns null when no prior finished run exists. */
  existingSummary?(runId: string): Promise<{
    status: string;
    itemCount: number;
    attempted: number;
    succeeded: number;
    failed: number;
    attemptedIds: string[];
    failedIds: string[];
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
        attemptedIds: [],
        failedIds: [],
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

    const attemptedThisRun: string[] = [];
    const failedThisRun: string[] = [];
    const succeededThisRun: string[] = [];

    for (const draft of reviewedDrafts) {
      if (!draft.reviewedBy) continue;
      attemptedThisRun.push(draft.id);
      try {
        await deps.publishDraft(draft.id, draft.reviewedBy);
        succeededThisRun.push(draft.id);
      } catch {
        failedThisRun.push(draft.id);
      }
    }

    const succeeded = succeededThisRun.length;
    const failed = failedThisRun.length;

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

    // Reconcile by draft identity — never by aggregate arithmetic.
    // On replay: (a) previously-failed drafts that now succeed are
    // removed from the failed set ("recovered"); (b) newly-failed
    // drafts are added; (c) attempted is the union of all seen IDs.
    let persistedStatus: JobStatus = status;
    let persistedItemCount = succeeded;
    let persistedSucceeded = succeeded;
    let persistedFailed = failed;
    let persistedAttempted = attempted;
    let persistedAttemptedIds = [...attemptedThisRun];
    let persistedFailedIds = [...failedThisRun];

    if (deps.existingSummary) {
      const prior = await deps.existingSummary(runId);
      if (prior) {
        if (attemptedThisRun.length === 0) {
          // No new work — preserve prior summary verbatim.
          persistedStatus = prior.status as JobStatus;
          persistedItemCount = prior.itemCount;
          persistedSucceeded = prior.succeeded;
          persistedFailed = prior.failed;
          persistedAttempted = prior.attempted;
          persistedAttemptedIds = prior.attemptedIds ?? [];
          persistedFailedIds = prior.failedIds ?? [];
        } else {
          const priorAttemptedSet = new Set(prior.attemptedIds ?? []);
          const priorFailedSet = new Set(prior.failedIds ?? []);
          const currentSucceededSet = new Set(succeededThisRun);
          const currentFailedSet = new Set(failedThisRun);
          const currentAttemptedSet = new Set(attemptedThisRun);

          // recovered = priorFailedIds ∩ succeededThisRun
          const recovered = new Set<string>();
          for (const id of priorFailedSet) {
            if (currentSucceededSet.has(id)) recovered.add(id);
          }

          // persistedFailedIds = (priorFailedIds − recovered) ∪ currentFailedSet
          const nextFailedSet = new Set<string>();
          for (const id of priorFailedSet) {
            if (!recovered.has(id)) nextFailedSet.add(id);
          }
          for (const id of currentFailedSet) nextFailedSet.add(id);

          // persistedAttemptedIds = priorAttemptedIds ∪ currentAttemptedSet
          const nextAttemptedSet = new Set(priorAttemptedSet);
          for (const id of currentAttemptedSet) nextAttemptedSet.add(id);

          persistedAttemptedIds = [...nextAttemptedSet];
          persistedFailedIds = [...nextFailedSet];
          persistedAttempted = nextAttemptedSet.size;
          persistedFailed = nextFailedSet.size;
          persistedSucceeded = persistedAttempted - persistedFailed;
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
      attemptedIds: persistedAttemptedIds,
      failedIds: persistedFailedIds,
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
    // Read existing metadata so we merge publishSummary into it rather
    // than replacing sibling keys added by other consumers.
    const existing = await db.pipelineRun.findUnique({
      where: { id: runId },
      select: { metadata: true },
    });
    const existingMeta =
      (existing?.metadata as Record<string, unknown> | null) ?? {};
    await db.pipelineRun.update({
      where: { id: runId },
      data: {
        status: summary.status as import("@prisma/client").RunStatus,
        itemCount: summary.itemCount,
        finishedAt: new Date(),
        metadata: {
          ...existingMeta,
          publishSummary: {
            status: summary.status,
            itemCount: summary.itemCount,
            attempted: summary.attempted,
            succeeded: summary.succeeded,
            failed: summary.failed,
            attemptedIds: summary.attemptedIds,
            failedIds: summary.failedIds,
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
      attemptedIds?: string[]; failedIds?: string[];
    } } | null;
    if (!meta?.publishSummary) return null;
    return {
      status: meta.publishSummary.status,
      itemCount: meta.publishSummary.itemCount,
      attempted: meta.publishSummary.attempted,
      succeeded: meta.publishSummary.succeeded,
      failed: meta.publishSummary.failed,
      attemptedIds: meta.publishSummary.attemptedIds ?? [],
      failedIds: meta.publishSummary.failedIds ?? [],
    };
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
