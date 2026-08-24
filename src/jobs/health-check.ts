/**
 * Phase 1 reliability health detection (Operations Task 4).
 *
 * Exports:
 *   createHealthCheck(deps) → (args) => Promise<JobResult>
 *   evaluateOperationalHealth(now) → HealthReport
 *   detectFailures(deps, now) → Detection[]
 *
 * Detects four failure classes:
 *   GLOBAL_GAP       — no source in a capability within its group max SLA
 *   SOURCE_STALE     — source past its SLA (strictly after)
 *   CONTENT_COLLAPSE — productive baseline went silent (NOT network failure)
 *   BRIEFING_ABSENT  — weekly briefing missing
 *
 * Delivery is separated from detection: detectFailures returns ALL currently-
 * detected failures. Delivery uses an OperationalAlertState-backed adapter
 * (createDeliveryAdapter) keyed by {code, subjectId}: an ongoing condition
 * pages at most once per 24h, and clearing sends exactly one resolved notice
 * for SOURCE_STALE, CONTENT_COLLAPSE and GLOBAL_GAP (see the note on
 * BRIEFING_ABSENT below for why it is excluded from resolution tracking).
 */

import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";

// ---- delivery adapter injection (structured) ----

export interface AlertDeliveryKey {
  code: string;
  subjectId: string;
  now: Date;
}

// ---- types ----

export interface SourceCheckSummary {
  sourceId: string;
  status: string;
  itemCount: number;
  checkedAt: Date;
  httpStatus?: number;
}

export interface SourceFacts {
  id: string;
  isActive: boolean;
  freshnessSlaMinutes: number | null;
  lastOkAt: Date | null;
}

export interface CapabilitySourceRef { sourceId: string; }
export interface CapabilitySummary { key: string; sources: CapabilitySourceRef[]; }

// ---- health-check deps ----

export interface HealthCheckDeps {
  beginRun(input: { scopeKey: string; scheduledFor: Date; runnerVersion: string }): Promise<string>;
  finishRun(runId: string, summary: {
    status: string; itemCount: number; attempted: number;
    succeeded: number; failed: number; metadata: unknown; outputFingerprint: string;
  }): Promise<void>;
  existingSummary?(runId: string): Promise<{
    status: string; itemCount: number; attempted: number;
    succeeded: number; failed: number; finished: boolean;
  } | null>;
  recordOperationalAlert(key: AlertDeliveryKey): Promise<void>;
  /**
   * Send exactly one "cleared" notice when a previously-alerting
   * (code, subjectId) drops out of the currently-detected set. Optional so
   * detection-only callers (evaluateOperationalHealth, most tests) are
   * unaffected; wired for real delivery in REAL_DEPS.
   */
  recordResolvedAlert?(key: AlertDeliveryKey): Promise<void>;
  /**
   * Given everything this code currently detects as active, return the
   * subjectIds that were previously unresolved and are not in that set —
   * i.e. what just cleared — and mark them resolved. Only meaningful for a
   * code whose subjectId identifies a persistent thing (a source, a
   * capability); see the BRIEFING_ABSENT note in detectFailures for why it
   * does not use this.
   */
  resolveCleared?(input: { code: string; activeSubjectIds: string[] }): Promise<string[]>;
  getSourceChecks(since: Date): Promise<SourceCheckSummary[]>;
  getSourceFacts(sourceIds: string[]): Promise<Record<string, SourceFacts>>;
  getCoverageCapabilities(): Promise<CapabilitySummary[]>;
  getBriefingStatus(now: Date): Promise<{ absent: boolean }>;
  /**
   * Re-seed the source/capability contracts and recompute readiness.
   *
   * These ran from the persistent pg-boss worker until the Railway cron
   * cutover, after which no finite job owned them and production readiness
   * froze — sources could all miss their SLA without a single capability
   * turning STALE. Hourly health detection is the right home: it exists to
   * notice when reality and the stated grade diverge, and it must therefore
   * be the thing that keeps the grade current.
   *
   * Optional so existing callers and detection-only tests are unaffected.
   */
  syncCoverage?(): Promise<void>;
  maxSlaWindowHours: number;
  now(): Date;
}

// ---- detection helpers ----

export interface Detection {
  code: string;
  subjectId: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const lo = sorted[mid - 1]; const hi = sorted[mid];
    if (lo != null && hi != null) return (lo + hi) / 2;
    return 0;
  }
  return sorted[mid] ?? 0;
}

function isSourceStale(facts: SourceFacts, now: Date): boolean {
  if (!facts.isActive || facts.freshnessSlaMinutes == null) return false;
  if (facts.lastOkAt == null) return true;
  return now.getTime() - facts.lastOkAt.getTime() > facts.freshnessSlaMinutes * 60000;
}

function isCheckSuccessful(status: string): boolean {
  return status === "SUCCEEDED_ITEMS" || status === "SUCCEEDED_EMPTY";
}

/**
 * Detect content collapse for a single source.
 * Requires ≥4 of previous 7 successful checks with median itemCount ≥5
 * and the current check is SUCCEEDED_EMPTY.
 * Network failures are never classified as content collapse.
 *
 * KNOWN LIMITATION: the lookback window is bounded by maxSlaWindowHours
 * (default 48h). Sources with cadence >12h (SLOW collection group) can
 * accumulate at most ~2 successful checks in that window and can never
 * reach the required 4. Collapse is structurally undetectable for daily
 * and slower sources with the default window.
 */
function detectContentCollapse(sourceId: string, checks: SourceCheckSummary[]): boolean {
  const sourceChecks = checks
    .filter((c) => c.sourceId === sourceId)
    .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime());
  if (sourceChecks.length === 0) return false;
  const latest = sourceChecks[0];
  if (!latest) return false;
  if (latest.status !== "SUCCEEDED_EMPTY") return false;
  const previousSuccessful = sourceChecks.slice(1).filter((c) => isCheckSuccessful(c.status));
  const baseline = previousSuccessful.slice(0, 7);
  if (baseline.length < 4) return false;
  const counts = baseline.map((c) => c.itemCount);
  return median(counts) >= 5;
}

// ---- factory ----

export interface HealthReport {
  detections: Array<{ code: string; subjectId: string }>;
  healthy: boolean;
  checkedAt: string;
}

export function createHealthCheck(
  deps: HealthCheckDeps,
): (args: JobArgs) => Promise<JobResult> {
  return async (args: JobArgs): Promise<JobResult> => {
    const scopeKey = "health-check";
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
          runId, status: priorStatus,
          attempted: prior.attempted, succeeded: prior.succeeded,
          failed: prior.failed, itemCount: prior.itemCount,
          exitCode: priorStatus === "BLOCKED" ? 2 : 0,
        };
      }
    }

    const now = deps.now();

    // Re-grade before detecting, so detection reads current readiness rather
    // than whatever was last written. A sync failure degrades the run but must
    // never cost us the detection pass — that is the part that pages a human.
    let coverageSync: string | null = null;
    if (deps.syncCoverage) {
      try {
        await deps.syncCoverage();
        coverageSync = "OK";
      } catch (err) {
        coverageSync = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    const syncFailed = coverageSync != null && coverageSync !== "OK";

    const detections = await detectFailures(deps, now, { deliver: true });

    const status: JobStatus = syncFailed
      ? "PARTIAL"
      : detections.length > 0
        ? "SUCCEEDED_ITEMS"
        : "SUCCEEDED_EMPTY";
    const failed = syncFailed ? 1 : 0;

    await deps.finishRun(runId, {
      status,
      itemCount: detections.length,
      attempted: detections.length + failed, succeeded: detections.length, failed,
      metadata: {
        detections: detections.map((d) => ({ code: d.code, subjectId: d.subjectId })),
        checkedAt: now.toISOString(),
        ...(coverageSync != null ? { coverageSync } : {}),
      },
      outputFingerprint: detections.map((d) => `${d.code}:${d.subjectId}`).join(";") || "",
    });

    return {
      runId, status,
      attempted: detections.length + failed, succeeded: detections.length,
      failed, itemCount: detections.length,
      // A degraded re-grade is not a crashed service: exit 0 keeps the hourly
      // job green while the PARTIAL status and metadata carry the truth.
      exitCode: 0,
    };
  };
}

const HOUR = 60 * 60000;

/**
 * Core detection logic — returns ALL currently-detected failures.
 * Delivery dedup is handled internally by createDeliveryAdapter via
 * finishedAt checks on PipelineRun rows — no external guard needed.
 *
 * Pass {deliver: true} to invoke the delivery adapter inline (used by
 * the job handler). Default is {deliver: false} — pure detection only,
 * with no side effects (used by evaluateOperationalHealth).
 */
/**
 * After a detection loop for one code has run, page anything newly-due and
 * mark anything that cleared. Shared by the three codes whose subjectId
 * names a persistent thing (a source, a capability) — see the BRIEFING_ABSENT
 * comment in detectFailures for the one code that does not use this.
 */
async function deliverWithResolution(
  deps: HealthCheckDeps,
  now: Date,
  code: string,
  activeSubjectIds: string[],
): Promise<void> {
  for (const subjectId of activeSubjectIds) {
    await deps.recordOperationalAlert({ code, subjectId, now });
  }
  if (!deps.resolveCleared || !deps.recordResolvedAlert) return;
  const cleared = await deps.resolveCleared({ code, activeSubjectIds });
  for (const subjectId of cleared) {
    await deps.recordResolvedAlert({ code, subjectId, now });
  }
}

export async function detectFailures(
  deps: HealthCheckDeps,
  now: Date,
  opts?: { deliver?: boolean },
): Promise<Detection[]> {
  const deliver = opts?.deliver ?? false;
  const detections: Detection[] = [];

  const capabilities = await deps.getCoverageCapabilities();
  const allSourceIds = new Set<string>();
  for (const cap of capabilities) {
    for (const link of cap.sources) allSourceIds.add(link.sourceId);
  }

  const sourceFacts = await deps.getSourceFacts([...allSourceIds]);

  // ---- 1. SOURCE_STALE ----
  const staleSourceIds: string[] = [];
  for (const sourceId of allSourceIds) {
    const facts = sourceFacts[sourceId];
    if (!facts) continue;
    if (isSourceStale(facts, now)) {
      staleSourceIds.push(sourceId);
      detections.push({ code: "SOURCE_STALE", subjectId: sourceId });
    }
  }
  if (deliver) await deliverWithResolution(deps, now, "SOURCE_STALE", staleSourceIds);

  // ---- 2. CONTENT_COLLAPSE ----
  const lookbackWindow = new Date(now.getTime() - deps.maxSlaWindowHours * HOUR);
  const checks = await deps.getSourceChecks(lookbackWindow);
  const collapsedSourceIds: string[] = [];
  for (const sourceId of allSourceIds) {
    if (detectContentCollapse(sourceId, checks)) {
      collapsedSourceIds.push(sourceId);
      detections.push({ code: "CONTENT_COLLAPSE", subjectId: sourceId });
    }
  }
  if (deliver) await deliverWithResolution(deps, now, "CONTENT_COLLAPSE", collapsedSourceIds);

  // ---- 3. GLOBAL_GAP ----
  const gappedCapabilityKeys: string[] = [];
  for (const cap of capabilities) {
    const activeSources = cap.sources
      .map((s) => sourceFacts[s.sourceId])
      .filter((f): f is NonNullable<typeof f> => f != null && f.isActive && f.freshnessSlaMinutes != null);
    if (activeSources.length === 0) continue;
    const maxSlaMinutes = Math.max(...activeSources.map((s) => s.freshnessSlaMinutes as number));
    if (activeSources.every((s) => {
      if (s.lastOkAt == null) return true;
      return now.getTime() - s.lastOkAt.getTime() > maxSlaMinutes * 60000;
    })) {
      gappedCapabilityKeys.push(cap.key);
      detections.push({ code: "GLOBAL_GAP", subjectId: cap.key });
    }
  }
  if (deliver) await deliverWithResolution(deps, now, "GLOBAL_GAP", gappedCapabilityKeys);

  // ---- 4. BRIEFING_ABSENT ----
  // No resolution tracking here, deliberately. subjectId is the Monday that
  // started the missing weekly window, so it rolls forward every week
  // whether or not the underlying cause was fixed — the week rolling over is
  // not resolution, and treating it as one would send a false "cleared"
  // notice every Monday for as long as the condition actually persists.
  const briefingStatus = await deps.getBriefingStatus(now);
  if (briefingStatus.absent) {
    const mondayOfWeek = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(),
      now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
    ));
    const previousMonday = new Date(mondayOfWeek);
    previousMonday.setUTCDate(mondayOfWeek.getUTCDate() - 7);
    const subjectId = previousMonday.toISOString().slice(0, 10);
    detections.push({ code: "BRIEFING_ABSENT", subjectId });
    if (deliver) await deps.recordOperationalAlert({ code: "BRIEFING_ABSENT", subjectId, now });
  }

  return detections;
}

// ---- production deps ----

const REAL_DEPS: HealthCheckDeps = {
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
      select: { finishedAt: true, status: true, itemCount: true, metadata: true },
    });
    if (!run || !run.finishedAt) return null;
    const meta = run.metadata as { attempted?: number; succeeded?: number; failed?: number } | null;
    return {
      status: run.status, itemCount: run.itemCount,
      attempted: meta?.attempted ?? 0, succeeded: meta?.succeeded ?? 0,
      failed: meta?.failed ?? 0, finished: true,
    };
  },
  async recordOperationalAlert(key: AlertDeliveryKey) {
    const { createDeliveryAdapter } = await import("../email/transactional.js");
    const adapter = createDeliveryAdapter();
    await adapter.record(key);
  },
  async recordResolvedAlert(key: AlertDeliveryKey) {
    const { createDeliveryAdapter } = await import("../email/transactional.js");
    const adapter = createDeliveryAdapter();
    await adapter.recordResolved(key);
  },
  async resolveCleared({ code, activeSubjectIds }) {
    const { prisma: db } = await import("../db/client.js");
    const stillUnresolved = await db.operationalAlertState.findMany({
      where: { code, resolvedAt: null },
      select: { subjectId: true },
    });
    return stillUnresolved
      .map((r) => r.subjectId)
      .filter((subjectId) => !activeSubjectIds.includes(subjectId));
  },
  async getSourceChecks(since: Date) {
    const { prisma: db } = await import("../db/client.js");
    const rows = await db.sourceCheck.findMany({
      where: { checkedAt: { gte: since } },
      orderBy: { checkedAt: "desc" },
      select: { sourceId: true, status: true, itemCount: true, checkedAt: true, httpStatus: true },
    });
    return rows as SourceCheckSummary[];
  },
  async getSourceFacts(sourceIds: string[]) {
    const { prisma: db } = await import("../db/client.js");
    const sources = await db.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, isActive: true, freshnessSlaMinutes: true, lastOkAt: true },
    });
    const map: Record<string, SourceFacts> = {};
    for (const s of sources) {
      map[s.id] = { id: s.id, isActive: s.isActive, freshnessSlaMinutes: s.freshnessSlaMinutes, lastOkAt: s.lastOkAt };
    }
    return map;
  },
  async getCoverageCapabilities() {
    const { prisma: db } = await import("../db/client.js");
    const caps = await db.coverageCapability.findMany({
      include: { sources: { select: { sourceId: true } } },
    });
    return caps.map((c) => ({ key: c.key, sources: c.sources.map((link) => ({ sourceId: link.sourceId })) }));
  },
  async getBriefingStatus(now: Date) {
    const { prisma: db } = await import("../db/client.js");
    const mondayOfWeek = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7), 0, 0, 0, 0),
    );
    const previousMonday = new Date(mondayOfWeek);
    previousMonday.setUTCDate(mondayOfWeek.getUTCDate() - 7);
    const run = await db.pipelineRun.findFirst({
      where: {
        jobType: "BRIEFING",
        scheduledFor: { gte: previousMonday, lt: mondayOfWeek },
        status: { not: "BLOCKED" },
        finishedAt: { not: null },
      },
    });
    const isMonday = now.getUTCDay() === 1;
    return { absent: run == null && isMonday };
  },
  async syncCoverage() {
    // Seed first so every contracted source and capability row exists (and so
    // a regraded seed ceiling reaches a never-reviewed row), then recompute
    // readiness from actual source freshness. Order matters: recomputing
    // before seeding would grade rows that do not exist yet.
    const { seedSources } = await import("../workers/seed-sources.js");
    const { refreshCapabilityReadiness } = await import("../monitoring/health.js");
    await seedSources();
    await refreshCapabilityReadiness();
  },
  maxSlaWindowHours: 48,
  now: () => new Date(),
};

export async function evaluateOperationalHealth(now: Date): Promise<HealthReport> {
  const detections = await detectFailures(REAL_DEPS, now);
  return {
    detections: detections.map((d) => ({ code: d.code, subjectId: d.subjectId })),
    healthy: detections.length === 0,
    checkedAt: now.toISOString(),
  };
}

const runHealthCheck = createHealthCheck(REAL_DEPS);

registerJob({
  name: "health",
  maxAttempts: 1,
  run: runHealthCheck,
  dryRun: async (_args: JobArgs): Promise<JobResult> => ({
    runId: crypto.randomUUID(),
    status: "SUCCEEDED_EMPTY", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 0,
  }),
});
