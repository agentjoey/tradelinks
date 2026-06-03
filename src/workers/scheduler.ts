import { crawlQueue } from "../queue/queues.js";
import { SOURCES } from "../config/sources.js";
import type { CrawlJob } from "../queue/schemas.js";
import { logger } from "../lib/logger.js";

/**
 * Register repeatable crawl jobs for every active source on its cron schedule.
 * Per-source jobId keeps BullMQ from duplicating repeatables across restarts.
 */
export async function registerSchedules() {
  for (const source of SOURCES) {
    const payload: CrawlJob = {
      sourceId: source.id,
      url: source.url,
      adapter: source.adapter,
    };
    await crawlQueue.add("crawl", payload, {
      repeat: { pattern: source.frequencyCron },
      jobId: `cron:${source.id}`,
    });
  }
  logger.info({ count: SOURCES.length }, "schedules registered");
}
