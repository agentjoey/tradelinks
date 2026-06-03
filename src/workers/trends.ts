import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { env } from "../config/env.js";
import { callScraper } from "./scrape.js";
import { TREND_KEYWORDS, REGION_GEO } from "../config/keywords.js";
import { scoreSeries } from "../trends/score.js";
import { detectDiffusion, type RegionPoint } from "../trends/diffusion.js";
import { upsertSnapshot, replaceSignals } from "../trends/db.js";
import type { ScrapeJob } from "../queue/schemas.js";
import type { Region } from "../config/sources.js";
import { logger } from "../lib/logger.js";

/**
 * Daily trends run: pull Google Trends per region for the seed keywords,
 * store snapshots, then compute cross-region diffusion signals.
 * Reusable directly (scripts/verify-trends.ts) and via the scheduled worker.
 */
export async function runTrendsIngest(keywords = TREND_KEYWORDS, regions = REGION_GEO) {
  // keyword -> region -> score
  const byKeyword = new Map<string, RegionPoint[]>();

  for (const { region, geo } of regions) {
    const job: ScrapeJob = {
      sourceId: "D01",
      url: "https://trends.google.com/trends/",
      mode: "trends",
      trendsKeywords: keywords,
      geo,
    };
    let items;
    try {
      items = await callScraper(job, env.SCRAPER_SERVICE_URL);
    } catch (e) {
      logger.error({ region, err: String(e) }, "trends fetch failed");
      continue;
    }
    for (const it of items) {
      const rc = (it.rawContent ?? {}) as { keyword?: string; series?: number[] };
      if (!rc.keyword || !Array.isArray(rc.series)) continue;
      const score = scoreSeries(rc.series);
      await upsertSnapshot(region, rc.keyword, score);
      const arr = byKeyword.get(rc.keyword) ?? [];
      arr.push({ region: region as Region, ...score });
      byKeyword.set(rc.keyword, arr);
    }
    logger.info({ region, keywords: items.length }, "trends region ingested");
  }

  const signals = [];
  for (const [keyword, points] of byKeyword) {
    const sig = detectDiffusion(keyword, points);
    if (sig) signals.push(sig);
  }
  await replaceSignals(signals);
  logger.info({ keywords: byKeyword.size, signals: signals.length }, "trends diffusion done");
  return { keywords: byKeyword.size, signals: signals.length };
}

export function registerTrendsWorker(boss: PgBoss) {
  return boss.work(QUEUES.trends, async () => {
    await runTrendsIngest();
  });
}
