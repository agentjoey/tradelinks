/**
 * Phase 1 weekly briefing qualification (Operations Task 3).
 *
 * Exports:
 *   createBriefingBatch(deps) → (args) => Promise<JobResult>
 *   qualifyWeeklyBriefing(args) — production, exactly 1 parameter
 *   loadOperationalAlert / setOperationalAlertStore — for tests
 *
 * P0 shadow-only: selects Monday-Sunday UTC window, qualifies current
 * published versions allowed by Verified/Monitored readiness, stores
 * itemCount + ordered version IDs + stable outputFingerprint in
 * PipelineRun.metadata. A missing weekly run or zero qualified entries
 * emits BRIEFING_ABSENT and BLOCKED. Conditional daily absence is
 * SUCCEEDED_EMPTY. Replays are idempotent.
 */

import { createHash } from "node:crypto";

import { beginRun } from "../collection/run.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";

const MAX_VERSIONS = 1000;
const QUALIFIED_READINESS = ["MONITORED", "VERIFIED"] as const;

// ---- operational alert injection ----

export interface OperationalAlertStore {
  record(key: string): Promise<void>;
  load(key: string): Promise<boolean>;
}

let alertStore: OperationalAlertStore | null = null;

export function setOperationalAlertStore(s: OperationalAlertStore): void {
  alertStore = s;
}

export async function loadOperationalAlert(key: string): Promise<boolean> {
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
      metadata: unknown;
      outputFingerprint: string;
    },
  ): Promise<void>;
  /** Read the existing PipelineRun summary to power idempotent replay.
   *  Returns null when no prior finished run exists. */
  existingSummary?(runId: string): Promise<{
    status: string;
    itemCount: number;
    versionIds: string[];
    outputFingerprint: string;
  } | null>;
  /** Record an operational alert (e.g. BRIEFING_ABSENT). */
  recordOperationalAlert(key: string): Promise<void>;
}

// ---- window helpers ----

function getWeekWindow(date: Date): { start: Date; end: Date } {
  const utcDay = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = utcDay === 0 ? 6 : utcDay - 1;

  const monday = new Date(
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

  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  return { start: monday, end: nextMonday };
}

function isWeeklyRun(scheduledFor: Date): boolean {
  return scheduledFor.getUTCDay() === 1; // Monday UTC
}

function computeFingerprint(versionIds: string[]): string {
  return createHash("sha256").update(versionIds.join(",")).digest("hex");
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

    // Check replay first: if a prior run already has a stable fingerprint, return it.
    if (deps.existingSummary) {
      const prior = await deps.existingSummary(runId);
      if (prior && prior.outputFingerprint) {
        const priorStatus = prior.status as JobStatus;
        return {
          runId,
          status: priorStatus,
          attempted: prior.versionIds.length,
          succeeded: priorStatus === "SUCCEEDED_ITEMS" ? prior.itemCount : 0,
          failed: priorStatus === "BLOCKED" || priorStatus === "FAILED" ? prior.versionIds.length : 0,
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
      await deps.recordOperationalAlert("BRIEFING_ABSENT");

      await deps.finishRun(runId, {
        status: "BLOCKED",
        itemCount: 0,
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
    const versionIds = versions
      .map((v) => v.versionId)
      .sort();
    const fingerprint = computeFingerprint(versionIds);

    // Bound to MAX_VERSIONS just in case — shadow-only, no page rendered.
    const bounded = versionIds.slice(0, MAX_VERSIONS);
    const boundedFingerprint = bounded.length < versionIds.length
      ? computeFingerprint(bounded)
      : fingerprint;

    await deps.finishRun(runId, {
      status: "SUCCEEDED_ITEMS",
      itemCount: bounded.length,
      metadata: {
        versionIds: bounded,
        windowStart: window.start.toISOString(),
        windowEnd: window.end.toISOString(),
      },
      outputFingerprint: boundedFingerprint,
    });

    return {
      runId,
      status: "SUCCEEDED_ITEMS" as const,
      attempted: bounded.length,
      succeeded: bounded.length,
      failed: 0,
      itemCount: bounded.length,
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
        metadata: summary.metadata as any,
        finishedAt: new Date(),
      },
    });
  },
  async existingSummary(runId) {
    const { prisma: db } = await import("../db/client.js");
    const run = await db.pipelineRun.findUnique({
      where: { id: runId },
      select: { finishedAt: true, status: true, itemCount: true, outputFingerprint: true, metadata: true },
    });
    if (!run || !run.finishedAt || !run.outputFingerprint) return null;
    const meta = run.metadata as { versionIds?: string[] } | null;
    return {
      status: run.status,
      itemCount: run.itemCount,
      versionIds: meta?.versionIds ?? [],
      outputFingerprint: run.outputFingerprint,
    };
  },
  async recordOperationalAlert(key: string) {
    if (alertStore) {
      await alertStore.record(key);
    }
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
