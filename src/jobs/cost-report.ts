/**
 * Phase 1 cost guardrail (Operations Task 4).
 *
 * Exports:
 *   evaluateCostGuardrail(input) → CostDecision   (pure, credential-free)
 *   createCostReport(deps) → (args) => Promise<JobResult>
 *   costReport(args) — production, exactly 1 parameter
 *   setSuppressedJobs / getSuppressedJobs — dispatcher consumption
 *
 * Thresholds (spec says "above $40" and "above $50"):
 *   ≤ $40  NORMAL     — no suppression
 *   > $40  REVIEW     — operator review needed
 *   > $50  HARD_CAP   — suppress experimental-demand, model-enrichment;
 *                        official collection is never suppressed.
 */

import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";

export type CostLevel = "NORMAL" | "REVIEW" | "HARD_CAP";

export interface CostInputs {
  projectedTotalUsd: number;
}

export interface CostDecision {
  level: CostLevel;
  suppress: string[];
  message: string;
}

// ---- suppressed jobs (dispatcher consumption) ----

let suppressedJobs: string[] = [];

export function setSuppressedJobs(jobs: string[]): void {
  suppressedJobs = jobs;
}

export function getSuppressedJobs(): readonly string[] {
  return suppressedJobs;
}

// ---- cost report deps ----

export interface CostReportDeps {
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
  existingSummary?(runId: string): Promise<{
    status: string;
    itemCount: number;
    attempted: number;
    succeeded: number;
    failed: number;
    finished: boolean;
  } | null>;
  getProjectedCost(): Promise<number>;
  recordOperationalAlert(key: string): Promise<void>;
}

// ---- pure guardrail ----

/**
 * Evaluate cost guardrail thresholds. Official-source collection is never
 * suppressed — only experimental demand and model enrichment are affected
 * at HARD_CAP. Boundary: "above $40" → REVIEW, "above $50" → HARD_CAP.
 */
export function evaluateCostGuardrail(input: CostInputs): CostDecision {
  const projected = input.projectedTotalUsd;

  if (projected > 50) {
    return {
      level: "HARD_CAP",
      suppress: ["experimental-demand", "model-enrichment"],
      message:
        `Projected monthly cost $${projected.toFixed(2)} exceeds hard cap. ` +
        `Experimental demand and model enrichment suppressed. ` +
        `Official collection and health checks remain enabled.`,
    };
  }

  if (projected > 40) {
    return {
      level: "REVIEW",
      suppress: [],
      message:
        `Projected monthly cost $${projected.toFixed(2)} requires review. ` +
        `No jobs suppressed yet — operator should assess cost drivers.`,
    };
  }

  return {
    level: "NORMAL",
    suppress: [],
    message: `Projected monthly cost $${projected.toFixed(2)} is within budget.`,
  };
}

// ---- factory ----

export function createCostReport(
  deps: CostReportDeps,
): (args: JobArgs) => Promise<JobResult> {
  return async (args: JobArgs): Promise<JobResult> => {
    const scopeKey = "cost-report";
    const runId = await deps.beginRun({
      scopeKey,
      scheduledFor: args.scheduledFor,
      runnerVersion: args.runnerVersion,
    });

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

    const projectedTotalUsd = await deps.getProjectedCost();
    const decision = evaluateCostGuardrail({ projectedTotalUsd });

    if (decision.level === "HARD_CAP") {
      await deps.recordOperationalAlert("HARD_CAP");
    }

    await deps.finishRun(runId, {
      status: "SUCCEEDED_ITEMS",
      itemCount: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      metadata: {
        level: decision.level,
        projectedTotalUsd,
        suppress: decision.suppress,
        message: decision.message,
      },
      outputFingerprint: String(projectedTotalUsd),
    });

    return {
      runId,
      status: "SUCCEEDED_ITEMS" as const,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      itemCount: 1,
      exitCode: 0,
    };
  };
}

// ---- production deps ----

const REAL_DEPS: CostReportDeps = {
  async beginRun(input) {
    const { beginRun: br } = await import("../collection/run.js");
    const run = await br({
      jobType: "HEALTH",
      scopeKey: input.scopeKey,
      scheduledFor: input.scheduledFor,
      runnerVersion: input.runnerVersion,
    });
    return run.id;
  },
  async finishRun(runId, summary) {
    const { prisma: db } = await import("../db/client.js");
    const meta = summary.metadata as { level?: string; suppress?: string[] } | null;
    if (meta?.level === "HARD_CAP" && meta.suppress) {
      setSuppressedJobs([...meta.suppress]);
    }
    await db.pipelineRun.update({
      where: { id: runId },
      data: {
        status: summary.status as import("@prisma/client").RunStatus,
        itemCount: summary.itemCount,
        outputFingerprint: summary.outputFingerprint || null,
        metadata: {
          ...((meta) as Record<string, unknown>),
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
        metadata: true,
      },
    });
    if (!run || !run.finishedAt) return null;
    const meta = run.metadata as {
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
      finished: true,
    };
  },
  async getProjectedCost() {
    try {
      const { getProjectedCost: fetchCost } = await import("../monitoring/cost.js");
      return await fetchCost();
    } catch {
      return 0;
    }
  },
  async recordOperationalAlert(key: string) {
    try {
      const { recordOpsAlert } = await import("../email/transactional.js");
      await recordOpsAlert(key);
    } catch {
      // delivery failure non-fatal
    }
  },
};

/** Production one-parameter entry point — exactly the spec shape. */
export const costReport = createCostReport(REAL_DEPS);

// ---- job registration ----

registerJob({
  name: "cost-report",
  maxAttempts: 1,
  run: costReport,
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
