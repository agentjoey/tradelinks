// The Movers (BL-044) persistence. Upsert one insight card per (date, asin, region).
import { prisma } from "../db/client.js";
import type { Region } from "../config/sources.js";
import type { Mover } from "../trends/product-signal.js";
import type { InsightCard } from "../ai/prompts/mover-insight.js";

export interface MoverInsightWrite {
  date: string; // YYYY-MM-DD
  mover: Mover;
  card: InsightCard;
  model: string | null;
}

/** Upsert a mover insight card. Idempotent on (date, asin, region) so re-runs refresh in place. */
export async function upsertMoverInsight(w: MoverInsightWrite): Promise<void> {
  const { date, mover, card, model } = w;
  const data = {
    category: mover.category,
    rank: mover.currentRank,
    rankDelta: mover.rankDelta,
    reviewDelta: mover.reviewDelta,
    isNewEntrant: mover.isNewEntrant,
    score: mover.score,
    spreadingTo: mover.spreadingTo as Region[],
    title: mover.title,
    whatItIs: card.whatItIs,
    whyNow: card.whyNow,
    trajectory: card.trajectory,
    soWhat: card.soWhat,
    model,
  };
  await prisma.moverInsight.upsert({
    where: { date_asin_region: { date: new Date(date), asin: mover.asin, region: mover.region as Region } },
    create: { date: new Date(date), asin: mover.asin, region: mover.region as Region, ...data },
    update: data,
  });
}
