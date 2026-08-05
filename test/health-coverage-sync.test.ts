/**
 * Coverage seeding and readiness recomputation need an owner in the finite-job
 * topology.
 *
 * Both used to run from `src/workers/index.ts` — the persistent pg-boss worker.
 * The Railway cron cutover replaced that worker with eight finite jobs and none
 * of them adopted either call, so production readiness froze at whatever the
 * last worker run wrote. Sources could all die without a single capability
 * turning STALE, and a regraded source could never take effect. On a product
 * whose entire claim is an honest readiness grade, that is the most damaging
 * possible silent failure.
 *
 * `health-check` is the natural home: it runs hourly and already exists to
 * notice when reality and the stated grade diverge.
 */

import { describe, expect, it } from "vitest";

import { createHealthCheck } from "../src/jobs/health-check.js";
import type { HealthCheckDeps } from "../src/jobs/health-check.js";
import type { JobArgs } from "../src/jobs/types.js";

function args(): JobArgs {
  return { scheduledFor: new Date("2026-08-05T09:35:00Z"), runnerVersion: "test", dryRun: false };
}

interface Recorded {
  status: string;
  metadata: Record<string, unknown>;
  failed: number;
}

function makeHealth(over: Partial<HealthCheckDeps> = {}) {
  const finished: Recorded[] = [];
  const order: string[] = [];
  const deps: HealthCheckDeps = {
    async beginRun() { return "run-1"; },
    async finishRun(_id, s) {
      finished.push({
        status: s.status,
        metadata: (s.metadata ?? {}) as Record<string, unknown>,
        failed: s.failed,
      });
    },
    async recordOperationalAlert() {},
    async getSourceChecks() { return []; },
    async getSourceFacts() { return {}; },
    async getCoverageCapabilities() { order.push("detect"); return []; },
    async getBriefingStatus() { return { absent: false }; },
    maxSlaWindowHours: 24,
    now: () => new Date("2026-08-05T09:35:00Z"),
    ...over,
  };
  return { run: createHealthCheck(deps), finished, order };
}

describe("health-check coverage sync", () => {
  it("runs without a sync dep, so existing callers are unaffected", async () => {
    const { run, finished } = makeHealth();
    const result = await run(args());
    expect(result.exitCode).toBe(0);
    expect(finished[0]!.status).toBe("SUCCEEDED_EMPTY");
  });

  it("syncs coverage before detecting, so detection reads fresh grades", async () => {
    const order: string[] = [];
    const { run } = makeHealth({
      async syncCoverage() { order.push("sync"); },
      async getCoverageCapabilities() { order.push("detect"); return []; },
    });
    await run(args());
    expect(order).toEqual(["sync", "detect"]);
  });

  it("records that the sync ran", async () => {
    const { run, finished } = makeHealth({ async syncCoverage() {} });
    await run(args());
    expect(finished[0]!.metadata.coverageSync).toBe("OK");
  });

  it("still detects failures when the sync throws — detection is the priority", async () => {
    let detected = false;
    const { run } = makeHealth({
      async syncCoverage() { throw new Error("neon unreachable"); },
      async getCoverageCapabilities() { detected = true; return []; },
    });
    await run(args());
    expect(detected).toBe(true);
  });

  it("reports a failed sync rather than swallowing it", async () => {
    // A silent sync failure is exactly how readiness froze in the first place.
    const { run, finished } = makeHealth({
      async syncCoverage() { throw new Error("neon unreachable"); },
    });
    const result = await run(args());
    expect(finished[0]!.status).toBe("PARTIAL");
    expect(finished[0]!.failed).toBe(1);
    expect(String(finished[0]!.metadata.coverageSync)).toContain("neon unreachable");
    // Exit code stays 0: a health run that could not re-grade is degraded, not
    // a reason for Railway to mark the hourly service crashed.
    expect(result.exitCode).toBe(0);
  });

  it("keeps reporting detections when the sync succeeds", async () => {
    const { run, finished } = makeHealth({
      async syncCoverage() {},
      async getCoverageCapabilities() {
        return [{ key: "market:us", sources: [{ sourceId: "S1" }] }];
      },
      async getSourceFacts() {
        return { S1: { id: "S1", isActive: true, freshnessSlaMinutes: 60, lastOkAt: null } };
      },
    });
    const result = await run(args());
    expect(result.itemCount).toBeGreaterThan(0);
    expect(finished[0]!.status).toBe("SUCCEEDED_ITEMS");
  });
});
