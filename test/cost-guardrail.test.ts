/**
 * Contract tests for cost-guardrail (Operations Task 4).
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { JobArgs } from "../src/jobs/types.js";

function baseArgs(overrides?: Partial<JobArgs>): JobArgs {
  return { scheduledFor: new Date("2026-07-30T08:00:00Z"), runnerVersion: "test", dryRun: false, ...overrides };
}

// ============================ evaluateCostGuardrail ====================

describe("evaluateCostGuardrail — pure function", () => {
  let evaluateCostGuardrail: (input: { projectedTotalUsd: number }) => { level: string; suppress: string[]; message: string };

  beforeAll(async () => {
    const mod = await import("../src/monitoring/cost.js");
    evaluateCostGuardrail = mod.evaluateCostGuardrail;
  });

  it("returns NORMAL at $40", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 40 });
    expect(d.level).toBe("NORMAL");
    expect(d.suppress).toEqual([]);
  });

  it("returns REVIEW above $40", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 40.01 });
    expect(d.level).toBe("REVIEW");
  });

  it("returns HARD_CAP above $50", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 50.01 });
    expect(d.level).toBe("HARD_CAP");
    expect(d.suppress).toContain("experimental-demand");
    expect(d.suppress).toContain("model-enrichment");
  });

  it("returns REVIEW at $50 (above $40, not above $50)", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 50 });
    expect(d.level).toBe("REVIEW");
  });

  it("never suppresses official collection at HARD_CAP", () => {
    const d = evaluateCostGuardrail({ projectedTotalUsd: 60 });
    expect(d.suppress).not.toContain("collect-fast");
    expect(d.suppress).not.toContain("collect-standard");
    expect(d.suppress).not.toContain("official-collection");
  });
});

// ============================ costReport job ===========================

describe("costReport job handler", () => {
  let createCostReport: (deps: any) => (args: JobArgs) => Promise<any>;

  beforeAll(async () => {
    const mod = await import("../src/jobs/cost-report.js");
    createCostReport = mod.createCostReport;
  });

  it("reports NORMAL when cost is below $40", async () => {
    const handler = createCostReport({
      beginRun: async () => "run-1",
      finishRun: async () => {},
      getProjectedCost: async () => ({ total: 35, breakdown: { neon: 35 } }),
      recordOperationalAlert: async () => {},
    });
    const result = await handler(baseArgs());
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.exitCode).toBe(0);
  });

  it("emits HARD_CAP alert at $50+", async () => {
    const alerts: Array<{ code: string; subjectId: string; now: Date }> = [];
    const handler = createCostReport({
      beginRun: async () => "run-2",
      finishRun: async () => {},
      getProjectedCost: async () => ({ total: 55, breakdown: { vercel: 30, ai: 25 } }),
      recordOperationalAlert: async (key: { code: string; subjectId: string; now: Date }) => { alerts.push(key); },
    });
    const result = await handler(baseArgs());
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.code).toBe("HARD_CAP");
    expect(alerts[0]!.subjectId).toBe("cost");
  });

  it("finishRun stores the cost breakdown in metadata", async () => {
    let captured: any = null;
    const handler = createCostReport({
      beginRun: async () => "run-3",
      finishRun: async (_rid: string, summary: any) => { captured = summary; },
      getProjectedCost: async () => ({ total: 55, breakdown: { vercel: 30, ai: 25 } }),
      recordOperationalAlert: async () => {},
    });
    await handler(baseArgs());
    const meta = captured.metadata as any;
    expect(meta.level).toBe("HARD_CAP");
    expect(meta.breakdown).toEqual({ vercel: 30, ai: 25 });
  });

  it("replay returns prior result verbatim", async () => {
    const runs = new Map<string, { status: string; itemCount: number; finished: boolean }>();
    const handler = createCostReport({
      beginRun: async () => "run-5",
      finishRun: async (rid: string, summary: any) => { runs.set(rid, { ...summary, finished: true }); },
      existingSummary: async (rid: string) => { const r = runs.get(rid); return (r && r.finished) ? r : null; },
      getProjectedCost: async () => ({ total: 35, breakdown: {} }),
      recordOperationalAlert: async () => {},
    });
    const first = await handler(baseArgs());
    expect(first.status).toBe("SUCCEEDED_ITEMS");
    const second = await handler(baseArgs());
    expect(second.status).toBe(first.status);
  });
});

// ============================ cost input fails closed =================

describe("cost input — fails closed", () => {
  it("getProjectedCost throws when env var is missing", async () => {
    const mod = await import("../src/monitoring/cost.js");
    delete process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON;
    await expect(mod.getProjectedCost()).rejects.toThrow("not set");
  });

  it("getProjectedCost throws when env var is malformed JSON", async () => {
    const mod = await import("../src/monitoring/cost.js");
    process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON = "not-json";
    await expect(mod.getProjectedCost()).rejects.toThrow("not valid JSON");
    delete process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON;
  });

  it("getProjectedCost throws when a value is negative", async () => {
    const mod = await import("../src/monitoring/cost.js");
    process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON = JSON.stringify({ neon: -5 });
    await expect(mod.getProjectedCost()).rejects.toThrow("non-negative");
    delete process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON;
  });

  it("getProjectedCost returns breakdown and total for valid input", async () => {
    const mod = await import("../src/monitoring/cost.js");
    process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON = JSON.stringify({ neon: 20, vercel: 10, ai: 30 });
    const result = await mod.getProjectedCost();
    expect(result.total).toBe(60);
    expect(result.breakdown).toEqual({ neon: 20, vercel: 10, ai: 30 });
    delete process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON;
  });
});
