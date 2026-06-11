// BL-043/BL-044 — 共享的 top-movers 计算 + evidence + 英文 "why"。
// rankMovers 是纯函数(吃 histories);computeTopMovers / radar-review 都复用它。
import { getValidationHistories } from "./product-snapshots.js";
import {
  trendScoreV1,
  crossRegionDivergence,
  isTrueNewEntrant,
  qualifiesAsMover,
  type Mover,
  type ProductHistory,
} from "./product-signal.js";
import { buildMoverEvidence, type MoverEvidence } from "../movers/evidence.js";
import type { Region } from "../config/sources.js";

export interface MoverWithEvidence {
  mover: Mover;
  evidence: MoverEvidence;
}

/** 纯函数:从 histories 算出 movers + evidence(真信号门 + 评分),按分降序。不切片。 */
export function rankMovers(histories: ProductHistory[]): MoverWithEvidence[] {
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

  const out: MoverWithEvidence[] = [];
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
    const mover: Mover = {
      asin: h.asin, title: h.title, region: h.region, category: h.category, score,
      rankDelta: rd, reviewDelta: null, isNewEntrant, currentRank, spreadingTo: cross.spreadingTo,
    };
    const evidence = buildMoverEvidence(h, { spreadingTo: cross.spreadingTo });
    out.push({ mover, evidence });
  }

  out.sort((a, b) => b.mover.score - a.mover.score);
  return out;
}

/** 算当前 top movers,取前 limit 个(供 newsletter 复用)。 */
export async function computeTopMovers(limit: number): Promise<Mover[]> {
  const histories = await getValidationHistories(14);
  return rankMovers(histories).map((x) => x.mover).slice(0, limit);
}

/** 英文一行 "why"(给 newsletter / The Movers 用)。 */
export function moverWhyEn(m: Mover): string {
  const parts: string[] = [];
  if (m.rankDelta != null) parts.push(`rank ${m.rankDelta >= 0 ? "+" : ""}${m.rankDelta}`);
  if (m.currentRank != null) parts.push(`now #${m.currentRank}`);
  if (m.isNewEntrant) parts.push("new entrant");
  if (m.reviewDelta != null) parts.push(`reviews +${m.reviewDelta}`);
  if (m.spreadingTo.length) parts.push(`spreading to ${m.spreadingTo.join("/")}`);
  return parts.join(" · ");
}
