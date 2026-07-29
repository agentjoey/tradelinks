/**
 * Source health scoring. Pure `scoreSource()` (DB-free, unit-tested) + a
 * `getSourceHealth()` DB query that powers the /admin/sources dashboard and the
 * daily snapshot/alert worker.
 *
 * Score (0–100) = reachability(40) + cadence(20) + productivity(20) + quality(20).
 * The productivity term is the "silent-zero" detector that would have flagged
 * the F01/A01 feeds that returned 200 OK but 0 items for days.
 */
import parser from "cron-parser";
import { prisma } from "../db/client.js";
import { SOURCES_BY_ID, BESTSELLER_SOURCE_IDS } from "../config/sources.js";
import {
  isSourceOverdue,
  recomputeAllCapabilityReadiness,
} from "../canonicalize/coverage.js";
import type { ReadinessLevel } from "../domain/intelligence/taxonomy.js";
export { evaluateOperationalHealth } from "../jobs/health-check.js";

export type HealthTier = "healthy" | "degraded" | "unhealthy" | "silent" | "disabled";

export interface SourceMetrics {
  id: string;
  name: string;
  adapter: string;
  category: string | null;
  enabled: boolean;
  isBestseller: boolean;
  frequencyCron: string;
  expectedIntervalMin: number;
  consecutiveFailures: number;
  lastOkAt: Date | null;
  lastCrawledAt: Date | null;
  lastItemAt: Date | null;
  items24h: number;
  items7d: number;
  scored7d: number;
  avgUrgency: number | null;
}

export interface SourceHealth extends SourceMetrics {
  sub: { reach: number; cadence: number; productivity: number; quality: number };
  score: number;
  tier: HealthTier;
  reasons: string[];
}

/** Typical gap between two consecutive cron firings, in minutes. */
export function expectedIntervalMin(cron: string): number {
  try {
    const it = parser.parseExpression(cron, { currentDate: new Date() });
    const a = it.next().toDate().getTime();
    const b = it.next().toDate().getTime();
    return Math.max(1, Math.round((b - a) / 60000));
  } catch {
    return 720; // 12h fallback
  }
}

/** Pure scoring — no DB, no clock except the injected `now`. */
export function scoreSource(m: SourceMetrics, now = Date.now()): SourceHealth {
  const reasons: string[] = [];
  if (!m.enabled) {
    return { ...m, sub: { reach: 0, cadence: 0, productivity: 0, quality: 0 }, score: 0, tier: "disabled", reasons: ["disabled in config"] };
  }

  const interval = m.expectedIntervalMin;
  const minsSince = (d: Date | null) => (d ? (now - d.getTime()) / 60000 : Infinity);

  // reachability /40 — failures + recency of last success
  let reach = 40;
  if (m.consecutiveFailures >= 3 || !m.lastOkAt) {
    reach = 0;
    reasons.push(m.lastOkAt ? `${m.consecutiveFailures} consecutive failures` : "never succeeded");
  } else {
    if (m.consecutiveFailures > 0) {
      reach -= Math.min(m.consecutiveFailures, 2) * 10;
      reasons.push(`${m.consecutiveFailures} recent failure(s)`);
    }
    const okRatio = minsSince(m.lastOkAt) / interval;
    if (okRatio > 3) {
      reach *= 0.3;
      reasons.push("last success >3 cycles ago");
    } else if (okRatio > 1.5) {
      reach *= 0.7;
    }
  }

  // cadence /20 — crawling on schedule?
  const crawlRatio = minsSince(m.lastCrawledAt) / interval;
  let cadence = !m.lastCrawledAt ? 0 : crawlRatio <= 1.2 ? 20 : crawlRatio <= 2 ? 12 : crawlRatio <= 4 ? 6 : 0;
  if (!m.lastCrawledAt) reasons.push("never crawled");
  else if (cadence < 20) reasons.push("behind crawl schedule");

  // productivity /20 — actually producing items? (silent-zero detector)
  const cycles7d = (7 * 24 * 60) / interval;
  let productivity: number;
  let silent = false;
  if (m.items7d > 0) {
    productivity = 20;
  } else if (cycles7d >= 2) {
    productivity = 0;
    silent = true;
    reasons.push("0 items in 7d despite crawling — silent");
  } else {
    productivity = 14;
    reasons.push("low-frequency source — insufficient data");
  }

  // quality /20 — signal vs noise. Bestseller sources bypass AI, so judge them
  // on producing the board, not on scoring.
  let quality: number;
  if (m.isBestseller) {
    quality = m.items7d > 0 ? 20 : 0;
  } else if (m.items7d === 0) {
    quality = 0;
  } else {
    const passRate = m.scored7d / m.items7d;
    quality = Math.round(20 * Math.min(1, passRate / 0.6));
    if (passRate < 0.3) reasons.push("most items filtered by AI (low signal)");
  }

  const score = Math.round(reach + cadence + productivity + quality);
  let tier: HealthTier;
  if (silent) tier = "silent";
  else if (score >= 85) tier = "healthy";
  else if (score >= 60) tier = "degraded";
  else tier = "unhealthy";

  return { ...m, sub: { reach: Math.round(reach), cadence, productivity, quality }, score, tier, reasons };
}

const TIER_RANK: Record<HealthTier, number> = { silent: 0, unhealthy: 1, degraded: 2, healthy: 3, disabled: 4 };

/** Attention order for coverage capabilities: problems first, like the source tiers. */
const READINESS_RANK: Record<ReadinessLevel, number> = {
  STALE: 0, EXPERIMENTAL: 1, MONITORED: 2, VERIFIED: 3, UNAVAILABLE: 4,
};

/** Compute live health for every source. Worst (silent/unhealthy) first. */
export async function getSourceHealth(now = Date.now()): Promise<SourceHealth[]> {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
    select s.id, s.name, s.adapter, s."categoryHint" as category, s."isActive" as enabled,
           s."frequencyCron" as cron, s."consecutiveFailures" as fails,
           s."lastOkAt", s."lastCrawledAt",
           max(i."crawledAt") as last_item_at,
           count(i.id) filter (where i."crawledAt" > now() - interval '24 hours')::int as items_24h,
           count(i.id) filter (where i."crawledAt" > now() - interval '7 days')::int as items_7d,
           count(i.id) filter (where i."urgencyScore" is not null and i."crawledAt" > now() - interval '7 days')::int as scored_7d,
           avg(i."urgencyScore") filter (where i."crawledAt" > now() - interval '7 days') as avg_urgency
    from sources s
    left join items i on i."sourceId" = s.id
    group by s.id
  `);

  return rows
    .map((r) => {
      const cron = String(r.cron ?? "0 */12 * * *");
      const m: SourceMetrics = {
        id: String(r.id),
        name: String(r.name),
        adapter: String(r.adapter),
        category: (r.category as string | null) ?? null,
        enabled: Boolean(r.enabled),
        isBestseller: BESTSELLER_SOURCE_IDS.has(String(r.id)),
        frequencyCron: cron,
        expectedIntervalMin: expectedIntervalMin(cron),
        consecutiveFailures: Number(r.fails ?? 0),
        lastOkAt: r.lastOkAt ? new Date(r.lastOkAt as string) : null,
        lastCrawledAt: r.lastCrawledAt ? new Date(r.lastCrawledAt as string) : null,
        lastItemAt: r.last_item_at ? new Date(r.last_item_at as string) : null,
        items24h: Number(r.items_24h ?? 0),
        items7d: Number(r.items_7d ?? 0),
        scored7d: Number(r.scored_7d ?? 0),
        avgUrgency: r.avg_urgency != null ? Number(r.avg_urgency) : null,
      };
      // fall back to config note/name if a source row is somehow missing
      if (!SOURCES_BY_ID.has(m.id)) m.name = `${m.name} (unconfigured)`;
      return scoreSource(m, now);
    })
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.score - b.score);
}

export const TIER_BADGE: Record<HealthTier, string> = {
  healthy: "🟢 Healthy",
  degraded: "🟡 Degraded",
  unhealthy: "🔴 Unhealthy",
  silent: "💀 Silent",
  disabled: "⏸ Disabled",
};

// ---------------------------------------------------------------------------
// Phase 1 coverage readiness
// ---------------------------------------------------------------------------

/**
 * Drive the Phase 1 readiness transitions: recompute every stored coverage
 * capability at the injected clock. Source health snapshots alone cannot do
 * this — staleness is defined per capability by its required sources' SLAs.
 * Automated recompute can only lower a capability to STALE, never promote.
 */
export async function refreshCapabilityReadiness(
  now = new Date(),
): Promise<Array<{ id: string; key: string; readiness: ReadinessLevel }>> {
  return recomputeAllCapabilityReadiness(now);
}

export interface CapabilityView {
  id: string;
  key: string;
  readiness: ReadinessLevel;
  summary: string;
  knownGaps: string[];
  sources: Array<{
    id: string;
    name: string;
    enabled: boolean;
    slaMinutes: number | null;
    lastOkAt: Date | null;
    overdue: boolean;
  }>;
}

export interface SourceContractView {
  readiness: string | null;
  slaMinutes: number | null;
  userPromise: string | null;
  degradationPolicy: string | null;
  capabilityKeys: string[];
}

export interface CoverageOverview {
  capabilities: CapabilityView[];
  /** Phase 1 contract + linked-capability view per source id. */
  bySource: Map<string, SourceContractView>;
}

/**
 * Coverage capabilities and per-source contract facts for the admin sources
 * surface. `overdue` is derived with the same rule as the readiness
 * transitions, so the dashboard never overstates coverage relative to what
 * `refreshCapabilityReadiness` would store.
 */
export async function getCoverageOverview(now = new Date()): Promise<CoverageOverview> {
  const [capabilities, contracts] = await Promise.all([
    prisma.coverageCapability.findMany({
      orderBy: { key: "asc" },
      include: { sources: { include: { source: true } } },
    }),
    prisma.source.findMany({
      where: { userPromise: { not: null } },
      select: {
        id: true,
        readiness: true,
        freshnessSlaMinutes: true,
        userPromise: true,
        degradationPolicy: true,
      },
    }),
  ]);

  const bySource = new Map<string, SourceContractView>();
  for (const c of contracts) {
    bySource.set(c.id, {
      readiness: c.readiness,
      slaMinutes: c.freshnessSlaMinutes,
      userPromise: c.userPromise,
      degradationPolicy: c.degradationPolicy,
      capabilityKeys: [],
    });
  }

  const views: CapabilityView[] = capabilities.map((cap) => ({
    id: cap.id,
    key: cap.key,
    readiness: cap.readiness,
    summary: cap.summary,
    knownGaps: cap.knownGaps,
    sources: cap.sources.map((link) => {
      const s = link.source;
      const overdue = isSourceOverdue(s, now);
      const view = bySource.get(s.id);
      if (view) view.capabilityKeys.push(cap.key);
      else bySource.set(s.id, { readiness: s.readiness, slaMinutes: s.freshnessSlaMinutes, userPromise: s.userPromise, degradationPolicy: s.degradationPolicy, capabilityKeys: [cap.key] });
      return { id: s.id, name: s.name, enabled: s.isActive, slaMinutes: s.freshnessSlaMinutes, lastOkAt: s.lastOkAt, overdue };
    }),
  }));
  views.sort((a, b) => READINESS_RANK[a.readiness] - READINESS_RANK[b.readiness] || a.key.localeCompare(b.key));

  return { capabilities: views, bySource };
}
