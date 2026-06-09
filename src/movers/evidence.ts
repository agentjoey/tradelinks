// BL-042 P2b — 从快照 ProductHistory 抽出喂 LLM 的结构化证据。DB-free 纯函数。
import { rankDelta, reviewDelta, type ProductHistory } from "../trends/product-signal.js";
import type { Region } from "../config/sources.js";

export interface MoverEvidence {
  asin: string;
  title: string;
  region: Region;
  category: string;
  rankTrajectory: number[]; // 时间序的 rank（仅有值的）
  currentRank: number | null;
  rankDelta: number | null; // 正 = 爬升
  reviewDelta: number | null; // 评论增量（销量代理）
  reviewCount: number | null; // 最新
  rating: number | null; // 最新
  price: number | null; // 最新
  isNewEntrant: boolean;
  daysTracked: number;
  spreadingTo: Region[];
}

export function buildMoverEvidence(h: ProductHistory, opts: { spreadingTo: Region[] }): MoverEvidence {
  const ranked = h.points.filter((p) => p.rank != null);
  const last = h.points[h.points.length - 1];
  return {
    asin: h.asin,
    title: h.title,
    region: h.region,
    category: h.category,
    rankTrajectory: ranked.map((p) => p.rank as number),
    currentRank: ranked.length ? (ranked[ranked.length - 1]!.rank as number) : null,
    rankDelta: rankDelta(h),
    reviewDelta: reviewDelta(h),
    reviewCount: last?.reviewCount ?? null,
    rating: last?.rating ?? null,
    price: last?.price ?? null,
    isNewEntrant: h.points.length === 1,
    daysTracked: new Set(h.points.map((p) => p.date)).size,
    spreadingTo: opts.spreadingTo,
  };
}
