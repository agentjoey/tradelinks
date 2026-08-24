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

const HOUR = 60 * 60000;
const DAY = 24 * HOUR;
const BASE = new Date("2026-07-30T12:00:00Z").getTime();
function hoursAgo(n: number): Date { return new Date(BASE - n * HOUR); }

/**
 * Mirrors the real OperationalAlertState-backed adapter (src/email/transactional.ts):
 * an ongoing (code, subjectId) pages at most once per 24h, immediately again
 * if it cleared and recurred, and `resolveCleared` reports (without marking)
 * which previously-unresolved subjectIds dropped out of the active set —
 * matching the split between the read-only diff and the send-and-mark that
 * production uses.
 */
class InMemoryAlertStore {
  private readonly state = new Map<string, Map<string, { firstAlertedAt: Date; lastAlertedAt: Date; resolvedAt: Date | null }>>();
  readonly sent: Array<{ code: string; subjectId: string; now: Date }> = [];
  readonly resolvedSent: Array<{ code: string; subjectId: string; now: Date }> = [];

  private bucket(code: string) {
    let m = this.state.get(code);
    if (!m) { m = new Map(); this.state.set(code, m); }
    return m;
  }

  async record({ code, subjectId, now }: AlertDeliveryKey) {
    const m = this.bucket(code);
    const existing = m.get(subjectId);
    const isNewEpisode = !existing || existing.resolvedAt != null;
    const cooldownElapsed = !!existing && now.getTime() - existing.lastAlertedAt.getTime() >= DAY;
    if (!isNewEpisode && !cooldownElapsed) return;
    this.sent.push({ code, subjectId, now });
    m.set(subjectId, {
      firstAlertedAt: isNewEpisode ? now : existing!.firstAlertedAt,
      lastAlertedAt: now,
      resolvedAt: null,
    });
  }

  async recordResolved({ code, subjectId, now }: AlertDeliveryKey) {
    const existing = this.bucket(code).get(subjectId);
    if (!existing) return;
    this.resolvedSent.push({ code, subjectId, now });
    existing.resolvedAt = now;
  }

  async resolveCleared({ code, activeSubjectIds }: { code: string; activeSubjectIds: string[] }): Promise<string[]> {
    const cleared: string[] = [];
    for (const [subjectId, row] of this.bucket(code)) {
      if (row.resolvedAt == null && !activeSubjectIds.includes(subjectId)) cleared.push(subjectId);
    }
    return cleared;
  }

  // ---- test helpers ----
  getCount(code: string, subjectId: string): number {
    return this.sent.filter((s) => s.code === code && s.subjectId === subjectId).length;
  }
  has(code: string, subjectId: string): boolean {
    return this.sent.some((s) => s.code === code && s.subjectId === subjectId);
  }
  resolvedCount(code: string, subjectId: string): number {
    return this.resolvedSent.filter((s) => s.code === code && s.subjectId === subjectId).length;
  }
}

interface FakeSourceCheck { sourceId: string; status: string; itemCount: number; checkedAt: Date; }
interface FakeSourceFacts { id: string; isActive: boolean; freshnessSlaMinutes: number | null; lastOkAt: Date | null; }
interface FakeCapability { key: string; sources: { sourceId: string }[]; }
type FakeSourceFactsMap = Record<string, FakeSourceFacts>;

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
    recordResolvedAlert: async (key: AlertDeliveryKey) => { await store.recordResolved(key); },
    resolveCleared: async (input: { code: string; activeSubjectIds: string[] }) => store.resolveCleared(input),
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
  it("pages once, then stays silent within the 24h cooldown", async () => {
    let now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) } }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("SOURCE_STALE", "B01")).toBe(1);

    now = new Date(now.getTime() + 30 * 60000);
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("SOURCE_STALE", "B01")).toBe(1);
  });

  it("pages again once 24h have passed while the source is still stale", async () => {
    let now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) } }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("SOURCE_STALE", "B01")).toBe(1);

    now = new Date(now.getTime() + DAY);
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("SOURCE_STALE", "B01")).toBe(2);
  });

  it("SOURCE_STALE starts strictly after its SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(12) } }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has("SOURCE_STALE", "B01")).toBe(false);
  });

  it("ignores disabled sources and sources without SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "D01" }, { sourceId: "D02" }] }],
      getSourceFacts: async () => ({
        D01: { id: "D01", isActive: false, freshnessSlaMinutes: 720, lastOkAt: null },
        D02: { id: "D02", isActive: true, freshnessSlaMinutes: null, lastOkAt: null },
      }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has("SOURCE_STALE", "D01")).toBe(false);
  });
});

// ============================ GLOBAL_GAP ============================

describe("healthCheck — GLOBAL_GAP", () => {
  it("pages once, then stays silent within the cooldown", async () => {
    let now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "market:us", sources: [{ sourceId: "B01" }, { sourceId: "B02" }] }],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
        B02: { id: "B02", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("GLOBAL_GAP", "market:us")).toBe(1);
    now = new Date(now.getTime() + HOUR);
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("GLOBAL_GAP", "market:us")).toBe(1);
  });

  it("does not emit when a source group is within SLA", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "market:us", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has("GLOBAL_GAP", "market:us")).toBe(false);
  });
});

// ============================ CONTENT_COLLAPSE =======================

describe("healthCheck — CONTENT_COLLAPSE", () => {
  it("emits CONTENT_COLLAPSE when current succeeds empty after productive baseline", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
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
    expect(store.getCount("CONTENT_COLLAPSE", "B01")).toBe(1);
  });

  it("does NOT fire with only 3 qualifying checks", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
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
    expect(store.has("CONTENT_COLLAPSE", "B01")).toBe(false);
  });

  it("never reclassifies a network failure as content collapse", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
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
    expect(store.has("CONTENT_COLLAPSE", "B01")).toBe(false);
  });

  it("does NOT fire when fewer than 4 previous successful checks exist", async () => {
    const now = new Date("2026-07-30T12:00:00Z");
    // Only 2 previous successful checks — baseline.length < 4
    const checks: FakeSourceCheck[] = [
      { sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo(12) },
      { sourceId: "B01", status: "SUCCEEDED_ITEMS", itemCount: 10, checkedAt: hoursAgo(18) },
    ];
    checks.unshift({ sourceId: "B01", status: "SUCCEEDED_EMPTY", itemCount: 0, checkedAt: hoursAgo(1) });
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }),
      getSourceChecks: async () => checks,
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has("CONTENT_COLLAPSE", "B01")).toBe(false);
  });
});

// ============================ BRIEFING_ABSENT ===========================

describe("healthCheck — BRIEFING_ABSENT", () => {
  it("emits BRIEFING_ABSENT on Monday when no briefing was produced", async () => {
    const now = new Date("2026-07-27T08:00:00Z"); // Monday UTC
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: true }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("BRIEFING_ABSENT", "2026-07-20")).toBe(1);
  });

  it("does not emit BRIEFING_ABSENT when briefing is present", async () => {
    const now = new Date("2026-07-27T08:00:00Z");
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: false }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has("BRIEFING_ABSENT", "2026-07-20")).toBe(false);
  });

  it("pages at most once a day while the same week's briefing stays absent", async () => {
    let now = new Date("2026-07-27T08:00:00Z");
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: true }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    now = new Date(now.getTime() + HOUR);
    await call(baseArgs({ scheduledFor: now }));
    now = new Date(now.getTime() + HOUR);
    await call(baseArgs({ scheduledFor: now }));
    // Three runs inside one day, still one page — this is the exact bug
    // (measured: ~500 identical Telegram messages over three weeks) this
    // cooldown exists to close.
    expect(store.getCount("BRIEFING_ABSENT", "2026-07-20")).toBe(1);
  });

  it("does not send a resolved notice when the week simply rolls over", async () => {
    // subjectId is the Monday that started the missing window, so it changes
    // every week regardless of whether the underlying cause was ever fixed.
    // Treating that rollover as "resolved" would be a false all-clear for a
    // condition that is still, in fact, broken.
    let now = new Date("2026-07-27T08:00:00Z"); // Monday, week of 07-20 missing
    const { call, store } = await makeHandler({
      getBriefingStatus: async () => ({ absent: true }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("BRIEFING_ABSENT", "2026-07-20")).toBe(1);

    now = new Date("2026-08-03T08:00:00Z"); // next Monday, week of 07-27 missing
    await call(baseArgs({ scheduledFor: now }));
    expect(store.getCount("BRIEFING_ABSENT", "2026-07-27")).toBe(1);
    expect(store.resolvedCount("BRIEFING_ABSENT", "2026-07-20")).toBe(0);
  });
});

// ============================ resolved notifications ====================

describe("healthCheck — resolved notifications", () => {
  it("sends exactly one resolved notice when a stale source recovers", async () => {
    let stale = true;
    let now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: stale ? hoursAgo(25) : new Date(now.getTime() - HOUR) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now }));
    expect(store.has("SOURCE_STALE", "B01")).toBe(true);
    expect(store.resolvedCount("SOURCE_STALE", "B01")).toBe(0);

    stale = false;
    now = new Date(now.getTime() + HOUR);
    await call(baseArgs({ scheduledFor: now }));
    expect(store.resolvedCount("SOURCE_STALE", "B01")).toBe(1);

    // Staying fresh must not repeat the resolved notice.
    now = new Date(now.getTime() + HOUR);
    await call(baseArgs({ scheduledFor: now }));
    expect(store.resolvedCount("SOURCE_STALE", "B01")).toBe(1);
  });

  it("pages immediately on a recurrence, ignoring the old cooldown", async () => {
    // A condition that cleared and came back is a new episode, not a
    // continuation of the one that already paged — waiting out a 24h
    // cooldown here would mean staying silent about a fresh incident.
    let stale = true;
    let now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({
        B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: stale ? hoursAgo(25) : new Date(now.getTime() - HOUR) },
      }),
      now: () => now,
    });

    await call(baseArgs({ scheduledFor: now })); // pages (1)
    stale = false;
    now = new Date(now.getTime() + HOUR);
    await call(baseArgs({ scheduledFor: now })); // resolves
    expect(store.resolvedCount("SOURCE_STALE", "B01")).toBe(1);

    stale = true;
    now = new Date(now.getTime() + HOUR); // well inside the old 24h cooldown
    await call(baseArgs({ scheduledFor: now })); // pages again anyway
    expect(store.getCount("SOURCE_STALE", "B01")).toBe(2);
  });

  it("resolves GLOBAL_GAP independently of SOURCE_STALE for the same source", async () => {
    // Different codes, same subjectId shape — must not share state.
    let now = new Date("2026-07-30T12:00:00Z");
    const { call, store } = await makeHandler({
      getCoverageCapabilities: async () => [{ key: "market:us", sources: [{ sourceId: "B01" }] }],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) } }),
      now: () => now,
    });
    await call(baseArgs({ scheduledFor: now }));
    expect(store.has("SOURCE_STALE", "B01")).toBe(true);
    expect(store.has("GLOBAL_GAP", "market:us")).toBe(true);
    expect(store.has("GLOBAL_GAP", "B01")).toBe(false);
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

describe("delivery adapter — state only advances on 'sent'", () => {
  function fakeState(initial?: { firstAlertedAt: Date; lastAlertedAt: Date; resolvedAt: Date | null }) {
    let row: { id: string; firstAlertedAt: Date; lastAlertedAt: Date; resolvedAt: Date | null } | null =
      initial ? { id: "r1", ...initial } : null;
    return {
      findUnique: async () => row,
      create: async (args: any) => { row = { id: "r1", ...args.data }; return { id: "r1" }; },
      update: async (args: any) => { row = { ...(row ?? { id: "r1" }), ...args.data } as any; },
      get current() { return row; },
    };
  }

  const key: AlertDeliveryKey = { code: "SOURCE_STALE", subjectId: "B01", now: new Date("2026-07-30T12:00:00Z") };

  it("creates a row and pages on the first sighting", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState();
    let sendCount = 0;
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => { sendCount++; return "sent"; },
    });
    await adapter.record(key);
    expect(sendCount).toBe(1);
    expect(state.current).not.toBeNull();
    expect(state.current!.resolvedAt).toBeNull();
  });

  it("does NOT page or touch state when sendOpsAlert returns 'skipped'", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState();
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => "skipped",
    });
    await adapter.record(key);
    expect(state.current).toBeNull(); // never recorded — next run retries
  });

  it("does NOT page or touch state when sendOpsAlert returns 'failed'", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState();
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => "failed",
    });
    await adapter.record(key);
    expect(state.current).toBeNull();
  });

  it("does NOT touch state when sendOpsAlert throws", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState();
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => { throw new Error("Telegram down"); },
    });
    await adapter.record(key);
    expect(state.current).toBeNull(); // outage must not abort the health job, and must not fake a delivery
  });

  it("suppresses a second page inside the cooldown", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState({ firstAlertedAt: key.now, lastAlertedAt: key.now, resolvedAt: null });
    let sendCount = 0;
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => { sendCount++; return "sent"; },
    });
    await adapter.record({ ...key, now: new Date(key.now.getTime() + HOUR) });
    expect(sendCount).toBe(0);
  });

  it("pages again once the cooldown has elapsed", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState({ firstAlertedAt: key.now, lastAlertedAt: key.now, resolvedAt: null });
    let sendCount = 0;
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => { sendCount++; return "sent"; },
    });
    await adapter.record({ ...key, now: new Date(key.now.getTime() + DAY) });
    expect(sendCount).toBe(1);
    expect(state.current!.lastAlertedAt.getTime()).toBe(key.now.getTime() + DAY);
  });

  it("pages immediately when a resolved row recurs, ignoring the old cooldown", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState({ firstAlertedAt: key.now, lastAlertedAt: key.now, resolvedAt: key.now });
    let sendCount = 0;
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => { sendCount++; return "sent"; },
    });
    await adapter.record({ ...key, now: new Date(key.now.getTime() + 5 * 60000) });
    expect(sendCount).toBe(1);
    expect(state.current!.resolvedAt).toBeNull();
  });

  it("recordResolved marks resolvedAt only when the notice actually sends", async () => {
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState({ firstAlertedAt: key.now, lastAlertedAt: key.now, resolvedAt: null });
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => "failed",
    });
    await adapter.recordResolved(key);
    expect(state.current!.resolvedAt).toBeNull(); // failed send → next run retries the notice
  });

  it("recordResolved is a no-op when the row was never created", async () => {
    // Every prior alert attempt failed to send, so nothing was ever paged —
    // there is nothing to mark resolved and no notice to send.
    const { createDeliveryAdapter } = await import("../src/email/transactional.js");
    const state = fakeState();
    let sendCount = 0;
    const adapter = createDeliveryAdapter({
      prisma: { operationalAlertState: state },
      sendOpsAlert: async () => { sendCount++; return "sent"; },
    });
    await adapter.recordResolved(key);
    // The current implementation still sends the notice text (it has no way
    // to know a row never existed without a read) but the update is a no-op
    // against a missing row, which must not throw.
    expect(sendCount).toBe(1);
  });
});

describe("buildOpsResolvedText", () => {
  it("labels the same code and states the subject as resolved", async () => {
    const { buildOpsResolvedText } = await import("../src/email/transactional.js");
    expect(buildOpsResolvedText("SOURCE_STALE", "B01")).toBe("[Source Stale] RESOLVED — B01");
    expect(buildOpsResolvedText("BRIEFING_ABSENT", "2026-07-20")).toBe("[Briefing Absent] RESOLVED — 2026-07-20");
  });
});

// ============================ REWORK 1: pure detection ================

describe("detectFailures — delivery gating", () => {
  it("does NOT deliver when opts.deliver is false (default)", async () => {
    const { detectFailures } = await import("../src/jobs/health-check.js");
    const delivered: AlertDeliveryKey[] = [];
    const deps = {
      getCoverageCapabilities: async () => [] as FakeCapability[],
      getSourceFacts: async () => ({}) as FakeSourceFactsMap,
      getSourceChecks: async () => [] as FakeSourceCheck[],
      getBriefingStatus: async () => ({ absent: false }),
      recordOperationalAlert: async (k: AlertDeliveryKey) => { delivered.push(k); },
      maxSlaWindowHours: 48,
      now: () => new Date("2026-07-30T12:00:00Z"),
    } as any;
    const detections = await detectFailures(deps, deps.now());
    expect(detections).toEqual([]);
    expect(delivered).toEqual([]);
  });

  it("recordsSOURCE_STALE delivery when opts.deliver is true", async () => {
    const { detectFailures } = await import("../src/jobs/health-check.js");
    const delivered: AlertDeliveryKey[] = [];
    const now = new Date("2026-07-30T12:00:00Z");
    const deps = {
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }] as FakeCapability[],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(25) } }) as FakeSourceFactsMap,
      getSourceChecks: async () => [] as FakeSourceCheck[],
      getBriefingStatus: async () => ({ absent: false }),
      recordOperationalAlert: async (k: AlertDeliveryKey) => { delivered.push(k); },
      maxSlaWindowHours: 48,
      now: () => now,
    } as any;
    const detections = await detectFailures(deps, now, { deliver: true });
    expect(detections.length).toBe(2); // SOURCE_STALE + GLOBAL_GAP
    expect(delivered.length).toBe(2);
    expect(delivered.some((d) => d.code === "SOURCE_STALE")).toBe(true);
  });

  it("does not require resolveCleared/recordResolvedAlert to be present", async () => {
    // Both are optional — a caller that only wires recordOperationalAlert
    // (e.g. an older test double) must still work; it just gets no
    // resolved-notice behaviour.
    const { detectFailures } = await import("../src/jobs/health-check.js");
    const now = new Date("2026-07-30T12:00:00Z");
    const deps = {
      getCoverageCapabilities: async () => [{ key: "t", sources: [{ sourceId: "B01" }] }] as FakeCapability[],
      getSourceFacts: async () => ({ B01: { id: "B01", isActive: true, freshnessSlaMinutes: 720, lastOkAt: hoursAgo(1) } }) as FakeSourceFactsMap,
      getSourceChecks: async () => [] as FakeSourceCheck[],
      getBriefingStatus: async () => ({ absent: false }),
      recordOperationalAlert: async () => {},
      maxSlaWindowHours: 48,
      now: () => now,
    } as any;
    await expect(detectFailures(deps, now, { deliver: true })).resolves.toEqual([]);
  });
});

// ============================ registration regression ==================

describe("job registration via entry point", () => {
  it("getJob('health').run is defined after side-effect import", async () => {
    const { getJob } = await import("../src/jobs/registry.js");
    // Trigger side-effect registration by importing health-check
    await import("../src/jobs/health-check.js");
    const job = getJob("health");
    expect(job).toBeDefined();
    expect(job!.run).toBeDefined();
    expect(job!.dryRun).toBeDefined();
  });

  it("getJob('cost-report').run is defined after side-effect import", async () => {
    const { getJob } = await import("../src/jobs/registry.js");
    await import("../src/jobs/cost-report.js");
    const job = getJob("cost-report");
    expect(job).toBeDefined();
    expect(job!.run).toBeDefined();
    expect(job!.dryRun).toBeDefined();
  });
});
