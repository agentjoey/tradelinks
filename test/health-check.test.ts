/**
 * Contract tests for health-check job (Operations Task 4 — Reliability Health).
 */

import { describe, expect, it } from "vitest";
import type { JobArgs, JobResult } from "../src/jobs/types.js";
import type { AlertDeliveryKey } from "../src/jobs/health-check.js";

function baseArgs(overrides?: Partial<JobArgs>): JobArgs {
  return {
    scheduledFor: new Date("2026-07-30T08:00:00Z"),
    runnerVersion: "test",
    dryRun: false,
    ...overrides,
  };
}

function toKey(k: AlertDeliveryKey): string {
  return `${k.code}:${k.subjectId}:${k.bucket}`;
}

class InMemoryAlertStore {
  readonly alerts = new Map<string, boolean>();
  readonly recordCounts = new Map<string, number>();
  async record(key: AlertDeliveryKey) {
    const k = toKey(key);
    if (this.alerts.has(k)) return; // dedup like adapter's finishedAt check
    this.alerts.set(k, true);
    this.recordCounts.set(k, (this.recordCounts.get(k) ?? 0) + 1);
  }
  async load(key: AlertDeliveryKey) {
    return this.alerts.has(toKey(key));
  }
  getCount(key: AlertDeliveryKey): number {
    return this.recordCounts.get(toKey(key)) ?? 0;
  }
  has(key: AlertDeliveryKey): boolean {
    return this.alerts.has(toKey(key));
  }
}

interface FakeSourceCheck { sourceId: string; status: string; itemCount: number; checkedAt: Date; }
interface FakeSourceFacts { id: string; isActive: boolean; freshnessSlaMinutes: number | null; lastOkAt: Date | null; }
interface FakeCapability { key: string; sources: { sourceId: string }[]; }
type FakeSourceFactsMap = Record<string, FakeSourceFacts>;

const HOUR = 60 * 60000;
const BASE = new Date("2026-07-30T12:00:00Z").getTime();
function hoursAgo(n: number): Date { return new Date(BASE - n * HOUR); }

function dateHour(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

async function makeHandler(overrides: Record<string, unknown> = {}, opts?: { fixedRunId?: string }) {
  const { createHealthCheck } = await import("../src/jobs/health-check.js");
  const store = new InMemoryAlertStore();

  let nextRunId = 0;
  const fixed = opts?.fixedRunId;
  const runStore = new Map<string, { status: string; itemCount: number; attempted: number; succeeded: number; failed: number; finished: boolean }>();

  const deps = {
    beginRun: async () => fixed ?? `run-${++nextRunId}`,
    finishRun: async (rid: string, summary: any) => { runStore.set(rid, { ...summary, finished: true }); },
    existingSummary: async (rid: string) => { const r = runStore.get(rid); return (r && r.finished) ? r : null; },
    recordOperationalAlert: async (key: AlertDeliveryKey) => { await store.record(key); },
    getSourceChecks: async (_since: Date) => [] as FakeSourceCheck[],
    getSourceFacts: async () => ({} as FakeSourceFactsMap),
    getCoverageCapabilities: async () => [] as FakeCapability[],
    getBriefingStatus: async (_now: Date) => ({ absent: false }),
    maxSlaWindowHours: 48,
    now: () => new Date("2026-07-30T12:00:00Z"),
    ...overrides,
  };

  return { call: createHealthCheck(deps as any), store, deps, runStore };
}

// ============================ SOURCE_STALE ===========================

describe("healthCheck — SOURCE_STALE", () => {
  it("emits SOURCE_STALE once per incident window", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const key: AlertDeliveryKey = { code: "SOURCE_STALE", subjectId: "B01", bucket };

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) } }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount(key)).toBe(1);

    await call(baseArgs({ scheduledFor: new Date(now.getTime() + 30 * 60000) }));
    expect(store.getCount(key)).toBe(1);
  });

  it("SOURCE_STALE starts strictly after its SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const key: AlertDeliveryKey = { code: "SOURCE_STALE", subjectId: "B01", bucket };
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(12) } }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has(key)).toBe(false);
  });

  it("ignores disabled sources and sources without SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "D01" }, { sourceId: "D02" }] }],
      getSourceFacts: async () => ({
        D01: { id: "D01", isActive: false, freshnessSlaMinutes: 720, lastOkAt: null },
        D02: { id: "D02", isActive: true, freshnessSlaMinutes: null, lastOkAt: null },
      }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has({ code: "SOURCE_STALE", subjectId: "D01", bucket })).toBe(false);
  });
});

// ============================ GLOBAL_GAP ============================

describe("healthCheck — GLOBAL_GAP", () => {
  it("emits GLOBAL_GAP once per incident window", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const key: AlertDeliveryKey = { code: "GLOBAL_GAP", subjectId: "market:us", bucket };

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "market:us", sources: [{ sourceId: "B01" }, { sourceId: "B02" }] }],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
        B02: { id: "B02", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount(key)).toBe(1);
    await call(baseArgs({ scheduledFor: new Date(now.getTime() + HOUR) }));
    expect(store.getCount(key)).toBe(1);
  });

  it("does not emit when a source group is within SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "market:us", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has({ code: "GLOBAL_GAP", subjectId: "market:us", bucket })).toBe(false);
  });
});

// ============================ CONTENT_COLLAPSE =======================

describe("healthCheck — CONTENT_COLLAPSE", () => {
  it("emits CONTENT_COLLAPSE when current succeeds empty after productive baseline", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const key: AlertDeliveryKey = { code: "CONTENT_COLLAPSE", subjectId: "B01", bucket };
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 7; i++) checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo((i + 1) * 6) });
    checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });

    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      getSourceChecks: async () => checks,
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount(key)).toBe(1);
  });

  it("does NOT fire with only 3 qualifying checks", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 3; i++) checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo((i + 1) * 6) });
    for (let i = 4; i <= 7; i++) checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo((i + 1) * 6) });
    checks.push({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      getSourceChecks: async () => checks,
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has({ code: "CONTENT_COLLAPSE", subjectId: "B01", bucket })).toBe(false);
  });

  it("never reclassifies a network failure as content collapse", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    const checks: FakeSourceCheck[] = [];
    for (let i = 1; i <= 7; i++) checks.push({ sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo((i + 1) * 6) });
    checks.unshift({ sourceId: "B01", status: "FAILED", itemCount: 0, checkedAt: hoursAgo(1) });
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      getSourceChecks: async () => checks,
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has({ code: "CONTENT_COLLAPSE", subjectId: "B01", bucket })).toBe(false);
  });

  it("does NOT fire when fewer than 4 previous successful checks exist", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const bucket = dateHour(now);
    // Only 2 previous successful checks — baseline.length < 4
    const checks: FakeSourceCheck[] = [
      { sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo(12) },
      { sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo(18) },
    ];
    // Current empty
    checks.unshift({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      getSourceChecks: async () => checks,
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has({ code: "CONTENT_COLLAPSE", subjectId: "B01", bucket })).toBe(false);
  });
});

// ============================ BRIEFING_ABSENT ===========================

describe("healthCheck — BRIEFING_ABSENT", () => {
  it("emits BRIEFING_ABSENT on Monday when no briefing was produced", async () => {
    const now = new Date("2026-07-27T08:00:00Z"); // Monday UTC
    const bucket = dateHour(now);
    const key: AlertDeliveryKey = { code: "BRIEFING_ABSENT", subjectId: "2026-07-20", bucket };
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: true }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount(key)).toBe(1);
  });

  it("does not emit BRIEFING_ABSENT when briefing is present", async () => {
    const now = new Date("2026-07-27T08:00:00Z");
    const bucket = dateHour(now);
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: false }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has({ code: "BRIEFING_ABSENT", subjectId: "2026-07-20", bucket })).toBe(false);
  });
});

// ============================ cross-day (BLOCKER 2 pin) ==============

describe("healthCheck — cross-day idempotency", () => {
  it("re-alerts on a different day at the same hour", async () => {
    const day1 = new Date("2026-07-30T12:00:00Z");
    const day2 = new Date("2026-07-31T12:30:00Z");
    const { call: call1, store: s1 } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) } }),
      now: () => day1,
    });
    await call1(baseArgs({ scheduledFor: day1 }));
    expect(s1.getCount({ code: "SOURCE_STALE", subjectId: "B01", bucket: dateHour(day1) })).toBe(1);

    const { call: call2, store: s2 } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25 + 24) } }),
      now: () => day2,
    });
    await call2(baseArgs({ scheduledFor: day2 }));
    expect(s2.getCount({ code: "SOURCE_STALE", subjectId: "B01", bucket: dateHour(day2) })).toBe(1);
  });
});

// ============================ persisting incident (BLOCKER 3 pin) ===

describe("healthCheck — persisting incident", () => {
  it("reports SUCCEEDED_ITEMS on second run when outage persists", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const { call } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) } }),
      now: () => now,
    });
    const r1 = await call(baseArgs({ scheduledFor: now }));
    expect(r1.status).toBe("SUCCEEDED_ITEMS");
    expect(r1.itemCount).toBeGreaterThanOrEqual(1);

    const r2 = await call(baseArgs({ scheduledFor: new Date(now.getTime() + 30 * 60000) }));
    expect(r2.status).toBe("SUCCEEDED_ITEMS");
    expect(r2.itemCount).toBeGreaterThanOrEqual(1);
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
  });

  it("healthy source returns SUCCEEDED_EMPTY", async () => {
    const { call } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
    });
    const result = await call(baseArgs());
    expect(result.status).toBe("SUCCEEDED_EMPTY");
    expect(result.exitCode).toBe(0);
  });

  it("replay when runId is pinned returns prior result", async () => {
    const { call } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      now: () => new Date("2026-07-30T12:00:00Z"),
    }, { fixedRunId: "replay-run-1" });

    const first = await call(baseArgs());
    const second = await call(baseArgs());
    expect(first.runId).toBe("replay-run-1");
    expect(second.runId).toBe("replay-run-1");
    expect(second.status).toBe(first.status);
  });
});

// ============================ delivery adapter (NB1) ===================

describe("delivery adapter — finishedAt only on 'sent'", () => {
  const key = { code: "SOURCE_STALE", subjectId: "B01", bucket: "2026-07-30T12" };

  it("sets finishedAt on created row when sendOpsAlert returns 'sent'", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const createdRows: any[] = [];
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => null,
          create: async (args: any) => { createdRows.push(args.data); return { id: "r1" }; },
          update: async () => {},
        },
      },
      sendOpsAlert: async () => "sent",
    });
    await adapter.record(key);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].finishedAt).not.toBeNull();
  });

  it("does NOT set finishedAt when sendOpsAlert returns 'skipped'", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const createdRows: any[] = [];
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => null,
          create: async (args: any) => { createdRows.push(args.data); return { id: "r2" }; },
          update: async () => {},
        },
      },
      sendOpsAlert: async () => "skipped",
    });
    await adapter.record(key);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].finishedAt).toBeUndefined();
  });

  it("does NOT set finishedAt when sendOpsAlert returns 'failed'", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const createdRows: any[] = [];
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => null,
          create: async (args: any) => { createdRows.push(args.data); return { id: "r3" }; },
          update: async () => {},
        },
      },
      sendOpsAlert: async () => "failed",
    });
    await adapter.record(key);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].finishedAt).toBeUndefined();
  });

  it("skips sending when a finished row already exists", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    let sendCallCount = 0;
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => ({ id: "r-exists", finishedAt: new Date("2026-07-30T12:00:00Z") }),
          create: async () => { throw new Error("should not create"); },
          update: async () => {},
        },
      },
      sendOpsAlert: async () => { sendCallCount++; return "sent"; },
    });
    await adapter.record(key);
    expect(sendCallCount).toBe(0);
  });

  it("retries sending when a row exists but is unfinished", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    let sendCallCount = 0;
    const updates: any[] = [];
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => ({ id: "r-unfinished", finishedAt: null }),
          create: async () => { throw new Error("should not create"); },
          update: async (args: any) => { updates.push(args.data); },
        },
      },
      sendOpsAlert: async () => { sendCallCount++; return "sent"; },
    });
    await adapter.record(key);
    expect(sendCallCount).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].finishedAt).not.toBeNull();
  });

  it("load returns true when finished row exists, false otherwise", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    let findResult: { id: string; finishedAt: Date | null } | null = null;
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => findResult,
          create: async () => ({ id: "x" }),
          update: async () => {},
        },
      },
    });

    findResult = { id: "r-finished", finishedAt: new Date() };
    expect(await adapter.load(key)).toBe(true);

    findResult = { id: "r-unfinished", finishedAt: null };
    expect(await adapter.load(key)).toBe(false);

    findResult = null;
    expect(await adapter.load(key)).toBe(false);
  });

  it("leaves row unfinished when sendOpsAlert throws (create path)", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const createdRows: any[] = [];
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => null,
          create: async (args: any) => { createdRows.push(args.data); return { id: "r-throw" }; },
          update: async () => {},
        },
      },
      sendOpsAlert: async () => { throw new Error("Telegram down"); },
    });
    await adapter.record(key);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].finishedAt).toBeUndefined();
    expect(createdRows[0].status).toBe("FAILED");
  });

  it("leaves row unfinished when sendOpsAlert throws (existing-unfinished path)", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    let updateCalled = false;
    const adapter = createDeliveryAdapter({
      prisma: {
        pipelineRun: {
          findUnique: async () => ({ id: "r-unfinished", finishedAt: null }),
          create: async () => { throw new Error("should not create"); },
          update: async () => { updateCalled = true; },
        },
      },
      sendOpsAlert: async () => { throw new Error("Telegram down"); },
    });
    await adapter.record(key);
    expect(updateCalled).toBe(false); // update only on "sent", throw skips send
  });
});
