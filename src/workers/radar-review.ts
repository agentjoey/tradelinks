import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { sendOpsAlert } from "../push/send.js"; // → admin Telegram chat（wraps 私有 telegramSend）
import { getValidationHistories } from "../trends/product-snapshots.js";
import { trendScoreV1, crossRegionDivergence, isTrueNewEntrant, qualifiesAsMover, renderRadarReview, type Mover } from "../trends/product-signal.js";
import type { Region } from "../config/sources.js";
import { logger } from "../lib/logger.js";

const TOP_N = 8;

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

  // 每个源（region|category）覆盖的日期集合 → 判定"真·新进"与是否有基线
  const daysBySource = new Map<string, Set<string>>();
  for (const h of histories) {
    const key = `${h.region}|${h.category}`;
    const set = daysBySource.get(key) ?? new Set<string>();
    for (const p of h.points) set.add(p.date);
    daysBySource.set(key, set);
  }

  const movers: Mover[] = [];
  for (const h of histories) {
    const days = daysBySource.get(`${h.region}|${h.category}`)!;
    const sourceDayCount = days.size;
    const sourceLatestDate = [...days].sort().at(-1)!;
    const cross = crossRegionDivergence(byCatAsin.get(`${h.category}|${h.asin}`) ?? new Map());
    if (!qualifiesAsMover(h, sourceDayCount, sourceLatestDate, cross)) continue; // 无真信号 → 排除（含 Day-1 噪音）
    const isNewEntrant = isTrueNewEntrant(h, sourceDayCount, sourceLatestDate);
    const score = trendScoreV1({ history: h, isNewEntrant, cross });
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
