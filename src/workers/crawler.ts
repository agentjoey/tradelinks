import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { CrawlJobSchema, type IngestJob, type ScrapeJob } from "../queue/schemas.js";
import { SOURCES_BY_ID } from "../config/sources.js";
import { buildAdapter } from "../adapters/index.js";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";

const FAIL_THRESHOLD = 5;

/**
 * crawl-queue worker. For rss/fetch sources runs the TS adapter; on a detected
 * bot-wall (blocked) routes to scrape-queue (Python). scrapling/json sources
 * route straight to scrape-queue. See crawler-contract.md / ADR-004.
 */
export async function registerCrawlerWorker(boss: PgBoss) {
  await boss.work(QUEUES.crawl, async (jobs) => {
    for (const job of jobs) {
      const { sourceId, url } = CrawlJobSchema.parse(job.data);
      const source = SOURCES_BY_ID.get(sourceId);
      if (!source) throw new Error(`Unknown source ${sourceId}`);
      const log = logger.child({ sourceId, url });

      const adapter = buildAdapter(source);
      if (!adapter) {
        await routeToScrape(boss, source.id, url, source.scrapeMode ?? "stealth", source.scrapeSelectors);
        await markOk(source.id); // mark dispatched so the scheduler doesn't re-fire every tick
        log.info("routed to scrape-queue (scrapling/json source)");
        continue;
      }

      const result = await adapter.crawl({ sourceId, url, adapter: source.adapter });

      if (result.blocked) {
        await routeToScrape(boss, source.id, url, "stealth", source.scrapeSelectors);
        log.warn("blocked → routed to scrape-queue (stealth)");
        continue;
      }
      if (!result.ok) {
        await bumpFailure(sourceId);
        throw new Error(result.error ?? "crawl failed"); // pg-boss retries
      }

      await markOk(sourceId);
      if (result.items.length > 0) {
        const ingest: IngestJob = { sourceId, items: result.items };
        await boss.send(QUEUES.ingest, ingest, sendOpts);
      }
      log.info({ count: result.items.length }, "crawled");
    }
  });
}

async function routeToScrape(
  boss: PgBoss,
  sourceId: string,
  url: string,
  mode: ScrapeJob["mode"],
  selectors?: Record<string, string | undefined>,
) {
  const payload: ScrapeJob = { sourceId, url, mode };
  if (selectors) {
    // drop undefined optional selectors (e.g. rank) so the record is string-only
    payload.selectors = Object.fromEntries(
      Object.entries(selectors).filter(([, v]) => v != null) as [string, string][],
    );
  }
  await boss.send(QUEUES.scrape, payload, sendOpts);
}

async function markOk(sourceId: string) {
  await prisma.source
    .update({
      where: { id: sourceId },
      data: { consecutiveFailures: 0, lastOkAt: new Date(), lastCrawledAt: new Date() },
    })
    .catch(() => undefined);
}

async function bumpFailure(sourceId: string) {
  const src = await prisma.source
    .update({
      where: { id: sourceId },
      data: { consecutiveFailures: { increment: 1 }, lastCrawledAt: new Date() },
    })
    .catch(() => null);
  if (src && src.consecutiveFailures >= FAIL_THRESHOLD) {
    await prisma.source.update({ where: { id: sourceId }, data: { isActive: false } });
    logger.error({ sourceId }, "source disabled after repeated failures");
  }
}
