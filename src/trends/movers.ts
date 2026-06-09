// BL-043/BL-044 — 共享的 top-movers 计算 + 英文 "why"，供 newsletter（及后续 The
// Movers / radar-review 收敛）复用,避免多处各算一套。
import { getValidationHistories } from "./product-snapshots.js";
import {
  trendScoreV1,
  crossRegionDivergence,
  isTrueNewEntrant,
  qualifiesAsMover,
  type Mover,
} from "./product-signal.js";
import type { Region } from "../config/sources.js";

/** 算当前 top movers(真信号门 + 评分排序),取前 limit 个。 */
export async function computeTopMovers(limit: number): Promise<Mover[]> {
  const histories = await getValidationHistories(14);

  const byCatAsin = new Map<string, Map<Region, number | null>>();
  for (const h of histories) {
    const cur = [...h.points].reverse().find((p) => p.rank != null)?.rank ?? null;
    const key = `${h.category}|${h.asin}`;
    const reg = byCatAsin.get(key) ?? new Map<Region, number | null>();
    reg.set(h.region, cur);
    byCatAsin.set(key, reg);
  }

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
    if (!qualifiesAsMover(h, sourceDayCount, sourceLatestDate, cross)) continue;
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
  return movers.slice(0, limit);
}

/** 英文一行 "why"(给 newsletter / The Movers 用;radar-review 的中文版另在 renderRadarReview)。 */
export function moverWhyEn(m: Mover): string {
  const parts: string[] = [];
  if (m.rankDelta != null) parts.push(`rank ${m.rankDelta >= 0 ? "+" : ""}${m.rankDelta}`);
  if (m.currentRank != null) parts.push(`now #${m.currentRank}`);
  if (m.isNewEntrant) parts.push("new entrant");
  if (m.reviewDelta != null) parts.push(`reviews +${m.reviewDelta}`);
  if (m.spreadingTo.length) parts.push(`spreading to ${m.spreadingTo.join("/")}`);
  return parts.join(" · ");
}
