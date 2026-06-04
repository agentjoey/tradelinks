import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { prisma } from "../db/client.js";
import { getSourceHealth, TIER_BADGE, type HealthTier } from "../monitoring/health.js";
import { sendOpsAlert } from "../push/send.js";
import { logger } from "../lib/logger.js";

const BAD: ReadonlySet<HealthTier> = new Set<HealthTier>(["silent", "unhealthy"]);

function utcDate(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

/**
 * Daily: snapshot every source's health, then alert on regressions — a source
 * crossing INTO silent/unhealthy since its previous snapshot. On the very first
 * run (no history) we only seed the baseline, to avoid alerting every currently
 * unhealthy source at once.
 */
export async function runHealthSnapshot(): Promise<{ snapshotted: number; alerted: number }> {
  const health = await getSourceHealth();
  const today = utcDate();

  // last known tier per source, from snapshots strictly before today
  const prior = await prisma.sourceHealthSnapshot.findMany({
    where: { date: { lt: today } },
    orderBy: { date: "desc" },
  });
  const lastTier = new Map<string, HealthTier>();
  for (const s of prior) if (!lastTier.has(s.sourceId)) lastTier.set(s.sourceId, s.tier as HealthTier);
  const hasHistory = prior.length > 0;

  const newlyBad: typeof health = [];
  for (const h of health) {
    if (h.tier === "disabled") continue;
    await prisma.sourceHealthSnapshot.upsert({
      where: { date_sourceId: { date: today, sourceId: h.id } },
      update: { score: h.score, tier: h.tier, items24h: h.items24h, fails: h.consecutiveFailures },
      create: { date: today, sourceId: h.id, score: h.score, tier: h.tier, items24h: h.items24h, fails: h.consecutiveFailures },
    });
    const prev = lastTier.get(h.id) ?? "healthy";
    if (BAD.has(h.tier) && !BAD.has(prev)) newlyBad.push(h);
  }

  let alerted = 0;
  if (hasHistory && newlyBad.length > 0) {
    const lines = newlyBad
      .map((h) => `• <b>${h.name}</b> → ${TIER_BADGE[h.tier]} (${h.score}/100) — ${h.reasons[0] ?? ""}`)
      .join("\n");
    await sendOpsAlert(`⚠️ <b>Source health alert</b>\n${newlyBad.length} source(s) degraded:\n${lines}\n\nReview: /admin/sources`);
    alerted = newlyBad.length;
  }

  logger.info({ snapshotted: health.length, alerted, hasHistory }, "source health snapshot");
  return { snapshotted: health.length, alerted };
}

export function registerHealthWorker(boss: PgBoss) {
  return boss.work(QUEUES.health, async () => {
    await runHealthSnapshot();
  });
}
