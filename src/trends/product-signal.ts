// BL-042 Phase 1 — 爆品信号纯函数（DB-free，TDD）。
import type { Region } from "../config/sources.js";

export function extractAsin(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/i);
  return m ? m[1]!.toUpperCase() : null;
}

// 大宗/常青商品关键词：命中即"打标不删"（仍存排名当对照，不进精分析）。
const COMMODITY_RE =
  /\b(cable|cord|charger|battery|batteries|surge protector|power strip|zip ties?|extension cord|adapter|mount|screen protector|hdmi|usb|wire|outlet)\b/i;

export function isCommodity(title: string): boolean {
  return COMMODITY_RE.test(title);
}

export interface SnapshotPoint {
  date: string; // YYYY-MM-DD，升序
  rank: number | null;
  reviewCount: number | null;
}

export interface ProductHistory {
  asin: string;
  region: Region;
  category: string;
  title: string;
  isCommodity: boolean;
  points: SnapshotPoint[]; // 按 date 升序
}

/** 排名提升 = 最早 − 最新（正 = 爬升）。需 ≥2 个有排名的点。 */
export function rankDelta(h: ProductHistory): number | null {
  const ranked = h.points.filter((p) => p.rank != null);
  if (ranked.length < 2) return null;
  const first = ranked[0]!.rank!;
  const last = ranked[ranked.length - 1]!.rank!;
  return first - last;
}

/** 评论增量 = 最新 − 最早（Phase 1 无数据 → null）。 */
export function reviewDelta(h: ProductHistory): number | null {
  const withR = h.points.filter((p) => p.reviewCount != null);
  if (withR.length < 2) return null;
  return withR[withR.length - 1]!.reviewCount! - withR[0]!.reviewCount!;
}

/**
 * 常青惩罚 ∈ [0,1]：commodity 直接 1；否则"高排名 × 低波动" → 高惩罚。
 * 需 ≥2 点才能判波动；点不足时按平均排名给保守惩罚。
 */
export function evergreenPenalty(h: ProductHistory): number {
  if (h.isCommodity) return 1;
  const ranks = h.points.map((p) => p.rank).filter((r): r is number => r != null);
  if (ranks.length === 0) return 0.5;
  const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const highRank = Math.max(0, 1 - avg / 50); // top-1 → ~1，rank-50+ → 0
  if (ranks.length < 2) return 0.5 * highRank;
  const spread = Math.max(...ranks) - Math.min(...ranks);
  const flat = Math.max(0, 1 - spread / 20); // 波动≥20 名 → 0，几乎不动 → 1
  return Number((highRank * flat).toFixed(3));
}

export interface CrossRegion {
  score: number; // 0..1
  spreadingTo: Region[]; // 该品强势但缺席/弱势的区
}

/**
 * 跨区差异（S1）：传入 同一 ASIN 在各区的当前 rank（null = 不在榜）。
 * 某区强势(rank 小)、另区缺席 → 扩散预测（spreadingTo）。
 */
export function crossRegionDivergence(byRegion: Map<Region, number | null>): CrossRegion {
  const entries = [...byRegion.entries()];
  const present = entries.filter(([, r]) => r != null) as [Region, number][];
  if (present.length === 0) return { score: 0, spreadingTo: [] };
  const best = Math.min(...present.map(([, r]) => r));
  const strong = best <= 20; // 在某区进了前 20 才算"火"
  const spreadingTo = entries.filter(([, r]) => r == null).map(([reg]) => reg);
  if (!strong || spreadingTo.length === 0) {
    // 都在榜：差异 = 排名分散度（小）
    const ranks = present.map(([, r]) => r);
    const spread = Math.max(...ranks) - Math.min(...ranks);
    return { score: Math.min(0.19, spread / 200), spreadingTo: [] };
  }
  const strength = 1 - best / 20; // best=1 → ~1
  return { score: Number((0.4 + 0.6 * strength).toFixed(3)), spreadingTo };
}
