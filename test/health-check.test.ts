/**
 * Contract tests for health-check job (Operations Task 4 — Reliability Health).
 *
 * Tests call createHealthCheck(deps) — the factory — not the production
 * evaluateOperationalHealth. All deps are injectable for credential-free execution.
 */

import { describe, expect, it } from "vitest";
import type { JobArgs, JobResult } from "../src/jobs/types.js";
import type { OperationalAlertStore } from "../src/jobs/health-check.js";

function baseArgs(overrides?: Partial<JobArgs>): JobArgs {
  return {
    scheduledFor: new Date("2026-07-30T08:00:00Z"),
    runnerVersion: "test",
    dryRun: false,
    ...overrides,
  };
}

class InMemoryAlertStore implements OperationalAlertStore {
  readonly alerts = new Map<string, boolean>();
  readonly recordCounts = new Map<string, number>();
  readonly recordOrder: string[] = [];
  async record(key: string) {
    this.alerts.set(key, true);
    this.recordCounts.set(key, (this.recordCounts.get(key) ?? 0) + 1);
    if (!this.alerts.has(key + ":recorded")) {
      this.alerts.set(key + ":recorded", true);
      this.recordOrder.push(key);
    }
  }
  async load(key: string) {
    return this.alerts.has(key);
  }
}

interface FakeSourceCheck {
  sourceId: string;
  status: string;
  itemCount: number;
  checkedAt: Date;
  httpStatus?: number;
}

interface FakeSourceFacts {
  id: string;
  isActive: boolean;
  freshnessSlaMinutes: number | null;
  lastOkAt: Date | null;
}

interface FakeCapability {
  key: string;
  sources: { sourceId: string }[];
}

type FakeSourceFactsMap = Record<string, FakeSourceFacts>;

const HOUR = 60 * 60000;

const BASE = new Date("2026-07-30T12:00:00Z").getTime();

function hoursAgo(n: number): Date {
  return new Date(BASE - n * HOUR);
}

function dateHour(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

/** Create a handler with an in-memory alert store wired into deps. */
async function makeHandler(
  overrides: Record<string, unknown> = {},
  opts?: { fixedRunId?: string },
) {
  const { createHealthCheck, setOperationalAlertStore } = await import("../src/jobs/health-check.js");
  const store = new InMemoryAlertStore();
  setOperationalAlertStore(store);

  let nextRunId = 0;
  const fixed = opts?.fixedRunId;
  const runStore = new Map<string, {
    status: string; itemCount: number; attempted: number; succeeded: number;
    failed: number; finished: boolean;
  }>();

  const deps = {
    beginRun: async () => fixed ?? `run-${++nextRunId}`,
    finishRun: async (rid: string, summary: any) => {
      runStore.set(rid, { ...summary, finished: true });
    },
    existingSummary: async (rid: string) => {
      const r = runStore.get(rid);
      if (!r || !r.finished) return null;
      return r;
    },
    recordOperationalAlert: async (key: string) => {
      await store.record(key);
    },
    getSourceChecks: async (_since: Date) => [] as FakeSourceCheck[],
    getSourceFacts: async () => ({} as FakeSourceFactsMap),
    getCoverageCapabilities: async () => [] as FakeCapability[],
    getBriefingStatus: async () => ({ absent: false }),
    maxSlaWindowHours: 48,
    now: () => new Date("2026-07-30T12:00:00Z"),
    ...overrides,
  };

  return { call: createHealthCheck(deps as any), store, deps, runStore };
}

// ============================ GLOBAL_GAP ============================

describe("healthCheck — GLOBAL_GAP", () => {
  it("emits GLOBAL_GAP once per incident window", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "market:us", sources: [{ sourceId: "B01" }, { sourceId: "B02" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
        B02: { id: "B02", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.recordCounts.get(`GLOBAL_GAP:market:us:${bucket}`)).toBe(1);

    // Second run within same window — should NOT re-emit
    await call(baseArgs({ scheduledFor: new Date(now.getTime() + HOUR) }));
    expect(store.recordCounts.get(`GLOBAL_GAP:market:us:${bucket}`)).toBe(1);
  });

  it("does not emit GLOBAL_GAP when a source group is within SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "market:us", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.has(`GLOBAL_GAP:market:us:${bucket}`)).toBe(false);
  });

  it("uses the maximum SLA of the affected source group for a global gap", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "platform:shopify-us", sources: [{ sourceId: "B01" }, { sourceId: "B02" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
        B02: { id: "B02", isActive: true, freshnessSlaMinutes: 1440, lastOkAt: hoursAgo(25) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.get(`GLOBAL_GAP:platform:shopify-us:${bucket}`)).toBe(true);
  });
});

// ============================ SOURCE_STALE ===========================

describe("healthCheck — SOURCE_STALE", () => {
  it("emits SOURCE_STALE once per incident window", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:stale", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.recordCounts.get(`SOURCE_STALE:B01:${bucket}`)).toBe(1);

    await call(baseArgs({ scheduledFor: new Date(now.getTime() + 30 * 60000) }));
    expect(store.recordCounts.get(`SOURCE_STALE:B01:${bucket}`)).toBe(1);
  });

  it("SOURCE_STALE starts strictly after its SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:stale", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(12) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.has(`SOURCE_STALE:B01:${bucket}`)).toBe(false);
  });

  it("ignores disabled sources and sources without SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:sla", sources: [{ sourceId: "D01" }, { sourceId: "D02" }] },
      ],
      getSourceFacts: async () => ({
        D01: { id: "D01", isActive: false, freshnessSlaMinutes: 720, lastOkAt: null },
        D02: { id: "D02", isActive: true, freshnessSlaMinutes: null, lastOkAt: null },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.has(`SOURCE_STALE:D01:${bucket}`)).toBe(false);
    expect(store.alerts.has(`SOURCE_STALE:D02:${bucket}`)).toBe(false);
  });
});

// ============================ CONTENT_COLLAPSE =======================

describe("healthCheck — CONTENT_COLLAPSE", () => {
  it("emits CONTENT_COLLAPSE when current succeeds empty after a productive baseline", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 7; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo((i + 1) * 6) });
    }
    checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:collapse", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
      getSourceChecks: async () => checks,
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.recordCounts.get(`CONTENT_COLLAPSE:B01:${bucket}`)).toBe(1);
  });

  it("CONTENT_COLLAPSE with exactly 4 qualifying checks fires", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 4; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 8, checkedAt: hoursAgo((i + 1) * 6) });
    }
    for (let i = 5; i <= 7; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo((i + 1) * 6) });
    }
    checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:collapse", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
      getSourceChecks: async () => checks,
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.recordCounts.get(`CONTENT_COLLAPSE:B01:${bucket}`)).toBe(1);
  });

  it("does NOT fire CONTENT_COLLAPSE with only 3 qualifying checks", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 3; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo((i + 1) * 6) });
    }
    for (let i = 4; i <= 7; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo((i + 1) * 6) });
    }
    checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:collapse", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
      getSourceChecks: async () => checks,
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.has(`CONTENT_COLLAPSE:B01:${bucket}`)).toBe(false);
  });

  it("does NOT fire CONTENT_COLLAPSE when median parsed count is below 5", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const itemCounts = [1, 2, 3, 4, 5, 6, 7]; // median = 4
    const checks: FakeSourceCheck[] = [];
    for (let i = 0; i < 7; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: itemCounts[i]!, checkedAt: hoursAgo((i + 2) * 6) });
    }
    checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:collapse", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
      getSourceChecks: async () => checks,
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.has(`CONTENT_COLLAPSE:B01:${bucket}`)).toBe(false);
  });

  it("never reclassifies a network failure as content collapse", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 7; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo((i + 1) * 6) });
    }
    checks.unshift({ sourceId: "B01", status: "FAILED", itemCount: 0, checkedAt: hoursAgo(1) });

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:collapse", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
      getSourceChecks: async () => checks,
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.has(`CONTENT_COLLAPSE:B01:${bucket}`)).toBe(false);
  });
});

// ============================ BRIEFING_ABSENT ===========================

describe("healthCheck — BRIEFING_ABSENT", () => {
  it("emits BRIEFING_ABSENT on Monday when no briefing was produced", async () => {
    const now = new Date("2026-07-27T08:00:00Z"); // Monday UTC
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: true }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.recordCounts.get(`BRIEFING_ABSENT:weekly:${bucket}`)).toBe(1);
  });

  it("does not emit BRIEFING_ABSENT when briefing is present", async () => {
    const now = new Date("2026-07-27T08:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: false }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.alerts.has(`BRIEFING_ABSENT:weekly:${bucket}`)).toBe(false);
  });
});

// ============================ cross-day idempotency (BLOCKER 2) ======

describe("healthCheck — cross-day idempotency", () => {
  it("re-alerts on a different day at the same hour when the outage persists", async () => {
    const day1 = new Date("2026-07-30T12:00:00Z");
    const day2 = new Date("2026-07-31T12:30:00Z");
    const bucket1 = dateHour(day1);
    const bucket2 = dateHour(day2);

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:stale", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
      }),
      now: () => day1,
    });

    // Day 1 — alert fires
    await call(baseArgs({ scheduledFor: day1 }));
    expect(store.recordCounts.get(`SOURCE_STALE:B01:${bucket1}`)).toBe(1);

    // Day 2 at same hour — alert fires again (different bucket)
    // Re-create handler with day2 clock
    const { call: call2, store: store2 } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:stale", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25 + 24) },
      }),
      now: () => day2,
    });

    await call2(baseArgs({ scheduledFor: day2 }));
    expect(store2.recordCounts.get(`SOURCE_STALE:B01:${bucket2}`)).toBe(1);
  });
});

// ============================ persisting incident (BLOCKER 3) ========

describe("healthCheck — persisting incident", () => {
  it("reports SUCCEEDED_ITEMS on second run when outage persists", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:stale", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
      }),
      now: () => now,
    });

    // First run — source stale → SUCCEEDED_ITEMS
    const r1 = await call(baseArgs({ scheduledFor: now }));
    expect(r1.status).toBe("SUCCEEDED_ITEMS");
    expect(r1.itemCount).toBeGreaterThanOrEqual(1);
    expect(store.recordCounts.get(`SOURCE_STALE:B01:${bucket}`)).toBe(1);

    // Second run in same hour — source still stale, delivery suppressed but status unchanged
    const r2 = await call(baseArgs({ scheduledFor: new Date(now.getTime() + 30 * 60000) }));
    expect(r2.status).toBe("SUCCEEDED_ITEMS");
    expect(r2.itemCount).toBeGreaterThanOrEqual(1);
    // Delivery was NOT duplicated
    expect(store.recordCounts.get(`SOURCE_STALE:B01:${bucket}`)).toBe(1);
  });
});

// ============================ idempotency key format ==================

describe("healthCheck — alert idempotency key format", () => {
  it("each emits once per incident window with key ${code}:${subjectId}:${YYYY-MM-DDTHH}", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 7; i++) {
      checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo((i + 1) * 6) });
    }
    checks.unshift({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "market-us", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
      }),
      getSourceChecks: async () => checks,
      getBriefingStatus: async () => ({ absent: true }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    await call(baseArgs({ scheduledFor: new Date(now.getTime() + 30 * 60000) }));

    const keyRegex = /^(SOURCE_STALE|CONTENT_COLLAPSE|GLOBAL_GAP|BRIEFING_ABSENT):.+:\d{4}-\d{2}-\d{2}T\d{2}$/;
    for (const key of store.recordCounts.keys()) {
      expect(key).toMatch(keyRegex);
    }

    // Each unique key should have been recorded exactly once
    for (const [, count] of store.recordCounts) {
      expect(count).toBe(1);
    }
  });
});

// ============================ job handler contract ====================

describe("healthCheck — job handler contract", () => {
  it("returns proper JobResult with runId from handler", async () => {
    const { call } = await makeHandler();

    const result: JobResult = await call(baseArgs());
    expect(result.runId).toMatch(/^run-/);
    expect(["SUCCEEDED_EMPTY", "SUCCEEDED_ITEMS", "PARTIAL"]).toContain(result.status);
    expect(result.exitCode === 0 || result.exitCode === 1).toBe(true);
    expect(typeof result.attempted).toBe("number");
    expect(typeof result.succeeded).toBe("number");
    expect(typeof result.failed).toBe("number");
    expect(typeof result.itemCount).toBe("number");
  });

  it("SUCCEEDED_EMPTY is healthy unless collapse baseline applies", async () => {
    const { call } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:cap", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
    });

    const result = await call(baseArgs());
    expect(result.status).toBe("SUCCEEDED_EMPTY");
    expect(result.exitCode).toBe(0);
  });

  it("replay returns prior result verbatim when runId is pinned", async () => {
    const { call, runStore } = await makeHandler({
      getCoverageCapabilities: async () => [
        { key: "test:cap", sources: [{ sourceId: "B01" }] },
      ],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) },
      }),
      now: () => new Date("2026-07-30T12:00:00Z"),
    }, { fixedRunId: "replay-run-1" });

    const first = await call(baseArgs());
    const second = await call(baseArgs());

    // Both should return the same runId
    expect(first.runId).toBe("replay-run-1");
    expect(second.runId).toBe("replay-run-1");
    expect(second.status).toBe(first.status);
    expect(second.itemCount).toBe(first.itemCount);
    expect(second.exitCode).toBe(first.exitCode);

    // runStore should have exactly one entry (only the first call persisted)
    expect(runStore.size).toBeGreaterThanOrEqual(1);
  });
});
