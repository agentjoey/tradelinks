/**
 * Contract tests for cost-guardrail (Operations Task 4 — Cost Report).
 *
 * Tests call the pure evaluateCostGuardrail function and the cost-report
 * job handler (createCostReport) with injectable deps.
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { JobArgs } from "../src/jobs/types.js";

function baseArgs(overrides?: Partial<JobArgs>): JobArgs {
  return {
    scheduledFor: new Date("2026-07-30T08:00:00Z"),
    runnerVersion: "test",
    dryRun: false,
    ...overrides,
  };
}

// ============================ evaluateCostGuardrail ====================

describe("evaluateCostGuardrail — pure function", () => {
  let evaluateCostGuardrail: (input: { projectedTotalUsd: number }) => { level: string; suppress: string[]; message: string };

  beforeAll(async () => {
    const mod = await import("../src/jobs/cost-report.js");
    evaluateCostGuardrail = mod.evaluateCostGuardrail;
  });

  it("returns NORMAL below $40", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 39.99 });
    expect(d.level).toBe("NORMAL");
    expect(d.suppress).toEqual([]);
  });

  it("returns REVIEW at exactly $40", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 40 });
    expect(d.level).toBe("REVIEW");
    expect(d.suppress).toEqual([]);
  });

  it("returns REVIEW between $40 and $50", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 45 });
    expect(d.level).toBe("REVIEW");
  });

  it("returns HARD_CAP at exactly $50", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 50 });
    expect(d.level).toBe("HARD_CAP");
    expect(d.suppress).toContain("experimental-demand");
    expect(d.suppress).toContain("model-enrichment");
  });

  it("suppresses experimental-demand and model-enrichment above the monthly cap", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 51 });
    expect(d).toMatchObject({
      level: "HARD_CAP",
      suppress: ["experimental-demand", "model-enrichment"],
    });
  });

  it("never suppresses official collection at HARD_CAP", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 60 });
    expect(d.suppress).not.toContain("collect-fast");
    expect(d.suppress).not.toContain("collect-standard");
    expect(d.suppress).not.toContain("collect-slow");
    expect(d.suppress).not.toContain("official-collection");
  });

  it("returns a human-readable message", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 55 });
    expect(d.message).toBeTruthy();
    expect(typeof d.message).toBe("string");
  });
});

// ============================ costReport job ===========================

describe("costReport job handler", () => {
  let createCostReport: (deps: any) => (args: JobArgs) => Promise<any>;

  beforeAll(async () => {
    const mod = await import("../src/jobs/cost-report.js");
    createCostReport = mod.createCostReport;
  });

  it("reports NORMAL with exitCode 0 when projected cost is below $40", async () => {
    let started = false;
    let finished = false;
    const handler = createCostReport({
      beginRun: async () => { started = true; return "run-1"; },
      finishRun: async (_rid: string, summary: any) => {
        finished = true;
        expect(summary.status).toBe("SUCCEEDED_ITEMS");
      },
      getProjectedCost: async () => 35,
    });
    const result = await handler(baseArgs());
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.exitCode).toBe(0);
    expect(started).toBe(true);
    expect(finished).toBe(true);
  });

  it("reports REVIEW with exitCode 0 when projected cost is at review threshold", async () => {
    const handler = createCostReport({
      beginRun: async () => "run-2",
      finishRun: async () => {},
      getProjectedCost: async () => 42,
      recordOperationalAlert: async (_key: string) => {},
    });
    const result = await handler(baseArgs());
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.exitCode).toBe(0);
    expect(result.itemCount).toBe(1);
  });

  it("emits an operational alert and records HARD_CAP at $50+", async () => {
    const alerts: string[] = [];
    const handler = createCostReport({
      beginRun: async () => "run-3",
      finishRun: async () => {},
      getProjectedCost: async () => 55,
      recordOperationalAlert: async (key: string) => { alerts.push(key); },
    });
    const result = await handler(baseArgs());
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(alerts).toContain("HARD_CAP");
  });

  it("finishRun stores the cost decision in metadata", async () => {
    let captured: any = null;
    const handler = createCostReport({
      beginRun: async () => "run-4",
      finishRun: async (_rid: string, summary: any) => { captured = summary; },
      getProjectedCost: async () => 55,
      recordOperationalAlert: async () => {},
    });
    await handler(baseArgs());
    const meta = captured.metadata as any;
    expect(meta.level).toBe("HARD_CAP");
    expect(meta.projectedTotalUsd).toBe(55);
    expect(meta.suppress).toEqual(["experimental-demand", "model-enrichment"]);
  });

  it("replay returns prior result verbatim", async () => {
    const runs = new Map<string, { status: string; itemCount: number; attempted: number; succeeded: number; failed: number; finished: boolean }>();
    const handler = createCostReport({
      beginRun: async () => "run-5",
      finishRun: async (rid: string, summary: any) => {
        runs.set(rid, { ...summary, finished: true });
      },
      existingSummary: async (rid: string) => {
        const r = runs.get(rid);
        if (!r || !r.finished) return null;
        return r;
      },
      getProjectedCost: async () => 35,
    });
    const first = await handler(baseArgs());
    expect(first.status).toBe("SUCCEEDED_ITEMS");

    const second = await handler(baseArgs());
    expect(second.status).toBe(first.status);
    expect(second.itemCount).toBe(first.itemCount);
  });
});
