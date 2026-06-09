// BL-042 Phase 1 — product_snapshots 写入 + 验证集历史查询。
import { prisma } from "../db/client.js";
import type { Region } from "../config/sources.js";
import { VALIDATION_SOURCE_IDS } from "../config/sources.js";
import type { ProductHistory } from "./product-signal.js";

function today(): Date {
  return new Date(new Date().toISOString().slice(0, 10)); // UTC date
}

export interface SnapshotWrite {
  asin: string;
  region: Region;
  category: string;
  rank: number | null;
  reviewCount: number | null;
  rating: number | null;
  price: number | null;
  title: string;
  imageUrl: string | null;
  isCommodity: boolean;
  sourceId: string;
}

/** 幂等写当日快照（同 date+asin+region 覆盖 rank/title/image/review/rating/price）。 */
export async function upsertProductSnapshot(s: SnapshotWrite, date = today()): Promise<void> {
  await prisma.productSnapshot.upsert({
    where: { date_asin_region: { date, asin: s.asin, region: s.region as never } },
    update: { rank: s.rank, title: s.title, imageUrl: s.imageUrl, isCommodity: s.isCommodity, reviewCount: s.reviewCount, rating: s.rating, price: s.price },
    create: {
      date,
      asin: s.asin,
      region: s.region as never,
      category: s.category,
      rank: s.rank,
      reviewCount: s.reviewCount,
      rating: s.rating,
      price: s.price,
      title: s.title,
      imageUrl: s.imageUrl,
      isCommodity: s.isCommodity,
      sourceId: s.sourceId,
    },
  });
}

/** 取验证集近 N 天快照，按 asin+region 聚成 ProductHistory（points 升序）。 */
export async function getValidationHistories(lookbackDays = 14): Promise<ProductHistory[]> {
  const since = new Date(Date.now() - lookbackDays * 864e5);
  const rows = await prisma.productSnapshot.findMany({
    where: { sourceId: { in: [...VALIDATION_SOURCE_IDS] }, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { asin: true, region: true, category: true, title: true, isCommodity: true, rank: true, reviewCount: true, date: true },
  });
  const map = new Map<string, ProductHistory>();
  for (const r of rows) {
    const key = `${r.asin}|${r.region}`;
    let h = map.get(key);
    if (!h) {
      h = { asin: r.asin, region: r.region as Region, category: r.category, title: r.title, isCommodity: r.isCommodity, points: [] };
      map.set(key, h);
    }
    h.title = r.title; // 用最新标题
    h.points.push({ date: r.date.toISOString().slice(0, 10), rank: r.rank, reviewCount: r.reviewCount });
  }
  return [...map.values()];
}
