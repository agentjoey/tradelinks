// Trends storage + query (Postgres). Snapshots are idempotent per day.
import { prisma } from "../db/client.js";
import type { Region } from "../config/sources.js";
import { BESTSELLER_SOURCE_IDS, SOURCES_BY_ID } from "../config/sources.js";
import type { TrendScore } from "./score.js";
import type { DiffusionSignal } from "./diffusion.js";

function today(): Date {
  return new Date(new Date().toISOString().slice(0, 10)); // UTC date
}

export async function upsertSnapshot(
  region: Region,
  keyword: string,
  score: TrendScore,
  date = today(),
): Promise<void> {
  await prisma.trendSnapshot.upsert({
    where: { date_region_keyword: { date, region: region as never, keyword } },
    update: { trendsScoreGoogle: score.level, signalStrength: score.signalStrength },
    create: {
      date,
      region: region as never,
      keyword,
      trendsScoreGoogle: score.level,
      signalStrength: score.signalStrength,
    },
  });
}

/** Replace today's diffusion signals (recomputed each run). */
export async function replaceSignals(signals: DiffusionSignal[]): Promise<void> {
  const since = new Date(Date.now() - 12 * 3600 * 1000);
  await prisma.trendSignal.deleteMany({ where: { firstSeenAt: { gte: since } } });
  for (const s of signals) {
    await prisma.trendSignal.create({
      data: {
        keyword: s.keyword,
        originRegion: s.originRegion as never,
        spreadingTo: s.spreadingTo as never[],
        confidence: s.confidence,
        signalBasis: s.signalBasis,
      },
    });
  }
}

export interface TrendsView {
  signals: {
    keyword: string;
    originRegion: string;
    spreadingTo: string[];
    confidence: number;
    signalBasis: string;
  }[];
  rising: { keyword: string; region: string; level: number; signalStrength: number }[];
}

/** Data for the /trends dashboard: latest diffusion signals + top rising rows. */
export async function getTrendsView(): Promise<TrendsView> {
  const signals = await prisma.trendSignal.findMany({
    orderBy: { confidence: "desc" },
    take: 20,
    select: { keyword: true, originRegion: true, spreadingTo: true, confidence: true, signalBasis: true },
  });

  const latestDate = (await prisma.trendSnapshot.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date;
  const rising = latestDate
    ? await prisma.trendSnapshot.findMany({
        where: { date: latestDate, signalStrength: { gte: 0.45 } },
        orderBy: { signalStrength: "desc" },
        take: 24,
        select: { keyword: true, region: true, trendsScoreGoogle: true, signalStrength: true },
      })
    : [];

  return {
    signals: signals.map((s) => ({ ...s, spreadingTo: s.spreadingTo as string[] })),
    rising: rising.map((r) => ({
      keyword: r.keyword,
      region: r.region as string,
      level: r.trendsScoreGoogle ?? 0,
      signalStrength: r.signalStrength ?? 0,
    })),
  };
}

export interface BestsellerRow {
  title: string;
  url: string;
  imageUrl: string | null;
  rank: number | null;
  region: string;
  category: string;
}

function parseRank(raw: unknown): number | null {
  const rc = raw as { rank?: unknown } | null;
  if (!rc || rc.rank == null) return null;
  const m = String(rc.rank).match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Amazon best-seller rows for the Trend Radar board — one row per product
 * (items are url-deduped to /dp/<ASIN>), tagged with region + category label +
 * rank + thumbnail. Returns the full current set (the client filters by region
 * and groups by category). Note: rank is first-seen (no live delta yet).
 */
export async function getBestsellers(maxPerRegionCategory = 30): Promise<BestsellerRow[]> {
  const items = await prisma.item.findMany({
    where: {
      sourceId: { in: [...BESTSELLER_SOURCE_IDS] },
      crawledAt: { gte: new Date(Date.now() - 7 * 864e5) },
    },
    orderBy: { crawledAt: "desc" },
    take: 800,
    select: { title: true, url: true, imageUrl: true, rawContent: true, sourceId: true, regions: true },
  });

  const buckets = new Map<string, BestsellerRow[]>(); // region|category → rows
  for (const it of items) {
    const src = SOURCES_BY_ID.get(it.sourceId);
    const category = src?.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? src?.name ?? it.sourceId;
    const region = (it.regions[0] as string) ?? (src?.regions[0] as string) ?? "north_america";
    const key = `${region}|${category}`;
    const arr = buckets.get(key) ?? buckets.set(key, []).get(key)!;
    arr.push({ title: it.title, url: it.url, imageUrl: it.imageUrl, rank: parseRank(it.rawContent), region, category });
  }

  const out: BestsellerRow[] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    out.push(...arr.slice(0, maxPerRegionCategory));
  }
  return out;
}
