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
  rating?: number | null; // P2a 富集（可选）
  price?: number | null; // P2a 富集（可选）
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

export interface TrendScoreInput {
  history: ProductHistory;
  isNewEntrant: boolean;
  cross: CrossRegion;
}

/**
 * Trend Score v1（Phase 1 可用的信号；review 速度 Phase 2 加权）：
 * velocity(rank_delta) + novelty(new_entrant + cross-region) − evergreen_penalty。
 * 输出 ∈ 约 [0,1]，clamp。
 */
export function trendScoreV1(inp: TrendScoreInput): number {
  const rd = rankDelta(inp.history) ?? 0;
  const velocity = Math.max(0, Math.min(1, rd / 25)); // +25 名 → 满分
  const novelty = (inp.isNewEntrant ? 0.4 : 0) + inp.cross.score * 0.6;
  // 新进只有 1 个点，无从判"低波动"，不施常青惩罚（commodity 仍 1）。
  const penalty = inp.history.isCommodity ? 1 : inp.isNewEntrant ? 0 : evergreenPenalty(inp.history);
  const raw = velocity * 0.6 + novelty * 0.4 - penalty * 0.5;
  return Number(Math.max(0, Math.min(1, raw)).toFixed(3));
}

/**
 * 真·新进：源（region+category）已有 ≥2 天历史，且该品只出现在最新一天
 * （= 昨天不在、今天在）。源只有 1 天时无基线，无法判定 → false（避免"开始追踪
 * 某区"被误当成"该品刚火"）。掉榜品（单点落在更早一天）也为 false。
 */
export function isTrueNewEntrant(h: ProductHistory, sourceDayCount: number, sourceLatestDate: string): boolean {
  if (sourceDayCount < 2 || h.points.length !== 1) return false;
  return h.points[h.points.length - 1]!.date === sourceLatestDate;
}

/**
 * mover 资格门：必须有真信号才进复盘 ——
 *   ① 排名爬升（rankDelta>0，需 ≥2 个点）
 *   ② 真·新进（见 isTrueNewEntrant）
 *   ③ 跨区扩散（强势且有缺席区）
 * 单天源里"只出现一次"的无信号品被排除（Day-1 噪音）。commodity 永远排除。
 */
export function qualifiesAsMover(
  h: ProductHistory,
  sourceDayCount: number,
  sourceLatestDate: string,
  cross: CrossRegion,
): boolean {
  if (h.isCommodity) return false;
  const rd = rankDelta(h);
  if (rd != null && rd > 0) return true;
  if (isTrueNewEntrant(h, sourceDayCount, sourceLatestDate)) return true;
  if (cross.spreadingTo.length > 0 && cross.score >= 0.4) return true;
  return false;
}

export interface Mover {
  asin: string;
  title: string;
  region: Region;
  category: string;
  score: number;
  rankDelta: number | null;
  reviewDelta: number | null;
  isNewEntrant: boolean;
  currentRank: number | null;
  spreadingTo: Region[];
}

/** 纯文本渲染每日复盘（sendOpsAlert 用，HTML parse_mode 关闭 → 纯文本安全）。 */
export function renderRadarReview(movers: Mover[], date: string): string {
  const head = `📈 爆品复盘 ${date}（Beauty+Toys 验证）`;
  if (movers.length === 0) return `${head}\n\n今日无显著在动的品（多为新进/常青已过滤）。`;
  const lines = movers.map((m, i) => {
    const why: string[] = [];
    if (m.rankDelta != null) why.push(`排名 ${m.rankDelta >= 0 ? "+" : ""}${m.rankDelta}`);
    if (m.currentRank != null) why.push(`现#${m.currentRank}`);
    if (m.isNewEntrant) why.push("新进榜");
    if (m.reviewDelta != null) why.push(`评论 +${m.reviewDelta}`);
    if (m.spreadingTo.length) why.push(`或扩散→${m.spreadingTo.join("/")}`);
    return `${i + 1}. [${m.region}·${m.category}] ${m.title}\n   分 ${m.score} · ${why.join(" · ")}`;
  });
  return `${head}\n\n${lines.join("\n\n")}`;
}
