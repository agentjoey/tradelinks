import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import {
  ScrapeJobSchema,
  ScrapeResponseSchema,
  type IngestJob,
  type RawItem,
  type ScrapeJob,
} from "../queue/schemas.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Call the Python Scraper service (HTTP bridge, crawler-contract.md §4).
 * Pure of the queue so it can be unit-tested by mocking fetch.
 */
export async function callScraper(job: ScrapeJob, baseUrl: string): Promise<RawItem[]> {
  const res = await fetch(`${baseUrl}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(120_000), // stealth/browser can be slow
  });
  if (!res.ok) {
    throw new Error(`scraper service HTTP ${res.status}: ${await res.text()}`);
  }
  const parsed = ScrapeResponseSchema.parse(await res.json());
  return parsed.items;
}

/**
 * scrape-queue worker. Bridges pg-boss → Python HTTP scraper → ingest-queue.
 *
 * batchSize:1 (default teamSize 1) → exactly one scrape job in flight at a time.
 * The Python scraper launches a Chromium per request and only has headroom for
 * one; pulling a batch and firing them back-to-back overran the container
 * (driver crashes / fork EAGAIN). One-at-a-time here + a browser lock there =
 * end-to-end serialized, so failures stop cascading.
 */
export async function registerScrapeWorker(boss: PgBoss) {
  await boss.work(QUEUES.scrape, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const data = ScrapeJobSchema.parse(job.data);
      const items = await callScraper(data, env.SCRAPER_SERVICE_URL); // throw → pg-boss retry
      if (items.length > 0) {
        const ingest: IngestJob = { sourceId: data.sourceId, items };
        await boss.send(QUEUES.ingest, ingest, sendOpts);
      }
      logger.info({ sourceId: data.sourceId, mode: data.mode, count: items.length }, "scraped");
    }
  });
}
