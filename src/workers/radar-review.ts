import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { sendOpsAlert } from "../push/send.js"; // → admin Telegram chat（wraps 私有 telegramSend）
import { getValidationHistories } from "../trends/product-snapshots.js";
import { trendScoreV1, crossRegionDivergence, renderRadarReview, type Mover } from "../trends/product-signal.js";
import type { Region } from "../config/sources.js";
import { logger } from "../lib/logger.js";

const TOP_N = 8;
const MIN_SCORE = 0.15;

/** 算今日 movers 并发一条 Telegram 复盘（admin chat）。可被 script 直接调用。 */
export async function runRadarReview(date = new Date().toISOString().slice(0, 10)): Promise<{ movers: number }> {
  const histories = await getValidationHistories(14);

  // 跨区：按 (category, asin) 收集各区当前 rank（取每个历史最后一个有排名的点）
  const byCatAsin = new Map<string, Map<Region, number | null>>();
  for (const h of histories) {
    const cur = [...h.points].reverse().find((p) => p.rank != null)?.rank ?? null;
    const key = `${h.category}|${h.asin}`;
    const reg = byCatAsin.get(key) ?? new Map<Region, number | null>();
    reg.set(h.region, cur);
    byCatAsin.set(key, reg);
  }

  const movers: Mover[] = [];
  for (const h of histories) {
    if (h.isCommodity) continue; // 对照样本不进复盘
    const isNewEntrant = h.points.length === 1; // 只见过一天 = 新进
    const cross = crossRegionDivergence(byCatAsin.get(`${h.category}|${h.asin}`) ?? new Map());
    const score = trendScoreV1({ history: h, isNewEntrant, cross });
    if (score < MIN_SCORE) continue;
    const ranked = h.points.filter((p) => p.rank != null);
    const currentRank = ranked.length ? ranked[ranked.length - 1]!.rank : null;
    const rd = ranked.length >= 2 ? ranked[0]!.rank! - ranked[ranked.length - 1]!.rank! : null;
    movers.push({
      asin: h.asin, title: h.title, region: h.region, category: h.category, score,
      rankDelta: rd, reviewDelta: null, isNewEntrant, currentRank, spreadingTo: cross.spreadingTo,
    });
  }

  movers.sort((a, b) => b.score - a.score);
  const top = movers.slice(0, TOP_N);
  const result = await sendOpsAlert(renderRadarReview(top, date));
  logger.info({ movers: top.length, telegram: result }, "radar review sent");
  return { movers: top.length };
}

export function registerRadarReviewWorker(boss: PgBoss) {
  return boss.work(QUEUES.radarReview, async () => {
    await runRadarReview();
  });
}
