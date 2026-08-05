/**
 * Phase 1 cost guardrail (Operations Task 4).
 *
 * Exports:
 *   evaluateCostGuardrail(input) → CostDecision   (pure, credential-free)
 *   createCostReport(deps) → (args) => Promise<JobResult>
 *   costReport(args) — production, exactly 1 parameter
 *   readLatestCostDecision / readModelEnrichmentSuppressed — durable readers
 *
 * Thresholds (spec: "above $40" → REVIEW, "above $50" → HARD_CAP):
 *   ≤ $40  NORMAL     — no suppression
 *   > $40  REVIEW     — operator review needed
 *   > $50  HARD_CAP   — suppress experimental-demand, model-enrichment
 */

import type { JobArgs, JobResult, JobStatus } from "./types.js";
import type { CostDecision } from "../monitoring/cost.js";
import { registerJob } from "./registry.js";
import { dateHourBucket } from "../monitoring/cost.js";

export { evaluateCostGuardrail } from "../monitoring/cost.js";

// ---- durable cost decision readers (consumed by collect-batch, model jobs) ----

/**
 * Read the latest accepted cost decision from the most recent completed
 * cost-report PipelineRun. Returns null when no decision exists.
 * Consumed by collect-batch.ts to decide suppression.
 * PipelineRun metadata is the ONLY source of truth — no process-local cache.
 */
export async function readLatestCostDecision(
  _prisma?: { pipelineRun: { findFirst: (args: any) => Promise<{ metadata: unknown } | null> } },
): Promise<CostDecision | null> {
  const db = _prisma ?? (await import("../db/client.js")).prisma;
  const run = await db.pipelineRun.findFirst({
    where: { jobType: "HEALTH", scopeKey: "cost-report", finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { metadata: true },
  }) as { metadata: unknown } | null;
  if (!run?.metadata) return null;
  const meta = run.metadata as {
    level?: string; suppress?: string[]; projectedTotalUsd?: number;
    message?: string;
  } | null;
  if (!meta?.level) return null;
  return {
    level: meta.level as CostDecision["level"],
    suppress: meta.suppress ?? [],
    message: meta.message ?? "",
    projectedTotalUsd: meta.projectedTotalUsd ?? 0,
  };
}

/**
 * Durable reader for Task 5: returns true when model enrichment is
 * suppressed by the latest HARD_CAP decision.
 */
export async function readModelEnrichmentSuppressed(
  _prisma?: { pipelineRun: { findFirst: (args: any) => Promise<{ metadata: unknown } | null> } },
): Promise<boolean> {
  const d = await readLatestCostDecision(_prisma as any);
  return d != null && d.suppress.includes("model-enrichment");
}

// ---- cost report deps ----

export interface CostReportDeps {
  beginRun(input: { scopeKey: string; scheduledFor: Date; runnerVersion: string }): Promise<string>;
  finishRun(runId: string, summary: {
    status: string; itemCount: number; attempted: number;
    succeeded: number; failed: number; metadata: unknown; outputFingerprint: string;
  }): Promise<void>;
  existingSummary?(runId: string): Promise<{
    status: string; itemCount: number; attempted: number;
    succeeded: number; failed: number; finished: boolean;
  } | null>;
  getProjectedCost(): Promise<{ total: number; breakdown: Record<string, number> }>;
  recordOperationalAlert(key: { code: string; subjectId: string; bucket: string }): Promise<void>;
}

// ---- factory ----

export function createCostReport(
  deps: CostReportDeps,
): (args: JobArgs) => Promise<JobResult> {
  return async (args: JobArgs): Promise<JobResult> => {
    const scopeKey = "cost-report";
    const runId = await deps.beginRun({ scopeKey, scheduledFor: args.scheduledFor, runnerVersion: args.runnerVersion });

    if (deps.existingSummary) {
      const prior = await deps.existingSummary(runId);
      if (prior) {
        const priorStatus = prior.status as JobStatus;
        return { runId, status: priorStatus, attempted: prior.attempted, succeeded: prior.succeeded,
                 failed: prior.failed, itemCount: prior.itemCount,
                 exitCode: priorStatus === "BLOCKED" ? 2 : 0 };
      }
    }

    const { total: projectedTotalUsd, breakdown } = await deps.getProjectedCost();
    const { evaluateCostGuardrail } = await import("../monitoring/cost.js");
    const decision = evaluateCostGuardrail({ projectedTotalUsd });

    if (decision.level === "HARD_CAP") {
      const bucket = dateHourBucket(args.scheduledFor);
      await deps.recordOperationalAlert({ code: "HARD_CAP", subjectId: "cost", bucket });
    }

    await deps.finishRun(runId, {
      status: "SUCCEEDED_ITEMS",
      itemCount: 1, attempted: 1, succeeded: 1, failed: 0,
      metadata: {
        level: decision.level,
        projectedTotalUsd,
        breakdown,
        suppress: decision.suppress,
        message: decision.message,
      },
      outputFingerprint: String(projectedTotalUsd),
    });

    return { runId, status: "SUCCEEDED_ITEMS" as const,
             attempted: 1, succeeded: 1, failed: 0, itemCount: 1, exitCode: 0 };
  };
}

// ---- production deps ----

const REAL_DEPS: CostReportDeps = {
  async beginRun(input) {
    const { beginRun: br } = await import("../collection/run.js");
    const run = await br({ jobType: "HEALTH", scopeKey: input.scopeKey, scheduledFor: input.scheduledFor, runnerVersion: input.runnerVersion });
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
        metadata: { ...((summary.metadata) as Record<string, unknown>), attempted: summary.attempted, succeeded: summary.succeeded, failed: summary.failed },
        finishedAt: new Date(),
      },
    });
  },
  async existingSummary(runId) {
    const { prisma: db } = await import("../db/client.js");
    const run = await db.pipelineRun.findUnique({
      where: { id: runId },
      select: { finishedAt: true, status: true, itemCount: true, metadata: true },
    });
    if (!run || !run.finishedAt) return null;
    const meta = run.metadata as { attempted?: number; succeeded?: number; failed?: number } | null;
    return { status: run.status, itemCount: run.itemCount, attempted: meta?.attempted ?? 0, succeeded: meta?.succeeded ?? 0, failed: meta?.failed ?? 0, finished: true };
  },
  async getProjectedCost() {
    const { getProjectedCost: fetchCost } = await import("../monitoring/cost.js");
    return fetchCost();
  },
  async recordOperationalAlert(key: { code: string; subjectId: string; bucket: string }) {
    const { createDeliveryAdapter } = await import("../email/transactional.js");
    const adapter = createDeliveryAdapter();
    await adapter.record(key);
  },
};

export const costReport = createCostReport(REAL_DEPS);

registerJob({
  name: "cost-report", maxAttempts: 1, run: costReport,
  dryRun: async (_args: JobArgs): Promise<JobResult> => ({
    runId: crypto.randomUUID(),
    status: "SUCCEEDED_EMPTY", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 0,
  }),
});
