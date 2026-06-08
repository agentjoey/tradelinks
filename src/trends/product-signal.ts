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
