/**
 * Phase 1 weekly briefing qualification (Operations Task 3).
 *
 * Exports:
 *   createBriefingBatch(deps) → (args) => Promise<JobResult>
 *   qualifyWeeklyBriefing(args) — production, exactly 1 parameter
 *   loadOperationalAlert / setOperationalAlertStore — for tests
 *
 * P0 shadow-only: selects the PRECEDING completed Monday-Sunday UTC window
 * for Monday runs, qualifies current published versions allowed by
 * Verified/Monitored readiness, stores itemCount + ordered version IDs +
 * stable outputFingerprint in PipelineRun.metadata. A missing weekly run
 * or zero qualified entries for a Monday run emits BRIEFING_ABSENT and
 * BLOCKED. Conditional daily absence is SUCCEEDED_EMPTY. Replays are
 * idempotent — gated on finished run, not fingerprint.
 */

import { createHash } from "node:crypto";

import { beginRun } from "../collection/run.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";

const MAX_VERSIONS = 1000;
const QUALIFIED_READINESS = ["MONITORED", "VERIFIED"] as const;

// ---- operational alert injection ----

export interface OperationalAlertStore {
  record(key: { code: string; subjectId: string; bucket: string }): Promise<void>;
  load(key: { code: string; subjectId: string; bucket: string }): Promise<boolean>;
}

let alertStore: OperationalAlertStore | null = null;

export function setOperationalAlertStore(s: OperationalAlertStore): void {
  alertStore = s;
}

export async function loadOperationalAlert(key: { code: string; subjectId: string; bucket: string }): Promise<boolean> {
  return alertStore?.load(key) ?? false;
}

// ---- briefing deps ----

export interface BriefingBatchDeps {
  selectQualifiedVersions(opts: {
    windowStart: Date;
    windowEnd: Date;
    readinessLevels: readonly string[];
  }): Promise<Array<{ versionId: string }>>;
  beginRun(input: {
    scopeKey: string;
    scheduledFor: Date;
    runnerVersion: string;
  }): Promise<string>;
  finishRun(
    runId: string,
    summary: {
      status: string;
      itemCount: number;
      attempted: number;
      succeeded: number;
      failed: number;
      metadata: unknown;
      outputFingerprint: string;
    },
  ): Promise<void>;
  /** Read the existing PipelineRun summary to power idempotent replay.
   *  Returns null when no prior finished run exists. */
  existingSummary?(runId: string): Promise<{
    status: string;
    itemCount: number;
    attempted: number;
    succeeded: number;
    failed: number;
    versionIds: string[];
    outputFingerprint: string;
  } | null>;
  recordOperationalAlert(key: { code: string; subjectId: string; bucket: string }): Promise<void>;
}

// ---- window helpers ----

/**
 * Returns the Monday-Sunday UTC window to qualify versions from.
 *
 * For a Monday run (the weekly cron), selects the PRECEDING completed
 * Monday–Sunday window so the scheduler can qualify the just-finished
 * week. For any other day, the window is the Monday–Sunday that contains
 * scheduledFor.
 */
function getWeekWindow(date: Date): { start: Date; end: Date } {
  const utcDay = date.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysToMonday = utcDay === 0 ? 6 : utcDay - 1;

  const mondayOfWeek = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysToMonday,
      0,
      0,
      0,
      0,
    ),
  );

  // Monday run → previous completed Monday–Sunday window
  if (utcDay === 1) {
    const previousMonday = new Date(mondayOfWeek);
    previousMonday.setUTCDate(mondayOfWeek.getUTCDate() - 7);
    return { start: previousMonday, end: mondayOfWeek };
  }

  // Non-Monday run → current week
  const nextMonday = new Date(mondayOfWeek);
  nextMonday.setUTCDate(mondayOfWeek.getUTCDate() + 7);
  return { start: mondayOfWeek, end: nextMonday };
}

function isWeeklyRun(scheduledFor: Date): boolean {
  return scheduledFor.getUTCDay() === 1; // Monday UTC
}

function computeFingerprint(versionIds: string[]): string {
  return createHash("sha256").update(versionIds.join(",")).digest("hex");
}

function dateHourBucket(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

// ---- factory ----

export function createBriefingBatch(
  deps: BriefingBatchDeps,
): (args: JobArgs) => Promise<JobResult> {
  return async (args: JobArgs): Promise<JobResult> => {
    const scopeKey = "weekly-briefing";
    const runId = await deps.beginRun({
      scopeKey,
      scheduledFor: args.scheduledFor,
      runnerVersion: args.runnerVersion,
    });

    // Replay: if a prior finished run exists, return its result verbatim.
    // Gate on the run being finished (same as canonicalize-batch), not on
    // a truthy fingerprint — a BLOCKED absent week has an empty fingerprint.
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
          exitCode: priorStatus === "BLOCKED" ? 2 : 0,
        };
      }
    }

    const window = getWeekWindow(args.scheduledFor);

    const versions = await deps.selectQualifiedVersions({
      windowStart: window.start,
      windowEnd: window.end,
      readinessLevels: QUALIFIED_READINESS,
    });

    const weeklyRun = isWeeklyRun(args.scheduledFor);

    if (versions.length === 0 && weeklyRun) {
      const bucket = dateHourBucket(args.scheduledFor);
      await deps.recordOperationalAlert({
        code: "BRIEFING_ABSENT",
        subjectId: window.start.toISOString().slice(0, 10), // Monday date as weekly window id
        bucket,
      });

      await deps.finishRun(runId, {
        status: "BLOCKED",
        itemCount: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        metadata: {
          versionIds: [],
          windowStart: window.start.toISOString(),
          windowEnd: window.end.toISOString(),
        },
        outputFingerprint: "",
      });

      return {
        runId,
        status: "BLOCKED",
        attempted: 0,
        succeeded: 0,
        failed: 0,
        itemCount: 0,
        exitCode: 2,
      };
    }

    if (versions.length === 0) {
      // Non-weekly empty: SUCCEEDED_EMPTY
      await deps.finishRun(runId, {
        status: "SUCCEEDED_EMPTY",
        itemCount: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        metadata: {
          versionIds: [],
          windowStart: window.start.toISOString(),
          windowEnd: window.end.toISOString(),
        },
        outputFingerprint: "",
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

    // Qualify: sort version IDs deterministically, compute stable fingerprint.
    // Defensively slice to MAX_VERSIONS even when the dependency over-returns.
    const versionIds = versions.slice(0, MAX_VERSIONS).map((v) => v.versionId).sort();
    const fingerprint = computeFingerprint(versionIds);
    const count = versionIds.length;

    await deps.finishRun(runId, {
      status: "SUCCEEDED_ITEMS",
      itemCount: count,
      attempted: count,
      succeeded: count,
      failed: 0,
      metadata: {
        versionIds,
        windowStart: window.start.toISOString(),
        windowEnd: window.end.toISOString(),
      },
      outputFingerprint: fingerprint,
    });

    return {
      runId,
      status: "SUCCEEDED_ITEMS" as const,
      attempted: count,
      succeeded: count,
      failed: 0,
      itemCount: count,
      exitCode: 0,
    };
  };
}

// ---- production deps ----

const REAL_DEPS: BriefingBatchDeps = {
  async selectQualifiedVersions(opts) {
    const { prisma: db } = await import("../db/client.js");
    const versions = await db.canonicalChangeVersion.findMany({
      where: {
        isCurrent: true,
        editorialStatus: "PUBLISHED",
        readiness: { in: [...opts.readinessLevels] as any },
        reviewedAt: {
          gte: opts.windowStart,
          lt: opts.windowEnd,
        },
      },
      take: MAX_VERSIONS,
      orderBy: { id: "asc" },
      select: { id: true },
    });
    return versions.map((v) => ({ versionId: v.id }));
  },
  async beginRun(input) {
    const run = await beginRun({
      jobType: "BRIEFING",
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
        outputFingerprint: summary.outputFingerprint || null,
        metadata: {
          ...((summary.metadata) as Record<string, unknown>),
          attempted: summary.attempted,
          succeeded: summary.succeeded,
          failed: summary.failed,
        },
        finishedAt: new Date(),
      },
    });
  },
  async existingSummary(runId) {
    const { prisma: db } = await import("../db/client.js");
    const run = await db.pipelineRun.findUnique({
      where: { id: runId },
      select: {
        finishedAt: true,
        status: true,
        itemCount: true,
        outputFingerprint: true,
        metadata: true,
      },
    });
    // Gate on finished run only — a BLOCKED absent week has an empty
    // outputFingerprint but is still a finished, replayable run.
    if (!run || !run.finishedAt) return null;
    const meta = run.metadata as {
      versionIds?: string[];
      attempted?: number;
      succeeded?: number;
      failed?: number;
    } | null;
    return {
      status: run.status,
      itemCount: run.itemCount,
      attempted: meta?.attempted ?? 0,
      succeeded: meta?.succeeded ?? 0,
      failed: meta?.failed ?? 0,
      versionIds: meta?.versionIds ?? [],
      outputFingerprint: run.outputFingerprint ?? "",
    };
  },
  async recordOperationalAlert(key: { code: string; subjectId: string; bucket: string }) {
    const { createDeliveryAdapter } = await import("../email/transactional.js");
    const adapter = createDeliveryAdapter();
    await adapter.record(key);
  },
};

/** Production one-parameter entry point — exactly the spec shape. */
export const qualifyWeeklyBriefing = createBriefingBatch(REAL_DEPS);

// ---- job registration ----

registerJob({
  name: "public-briefing",
  maxAttempts: 1,
  run: qualifyWeeklyBriefing,
  dryRun: async (_args: JobArgs): Promise<JobResult> => {
    return {
      runId: crypto.randomUUID(),
      status: "SUCCEEDED_EMPTY",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      itemCount: 0,
      exitCode: 0,
    };
  },
});
