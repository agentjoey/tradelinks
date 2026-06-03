import { Worker } from "bullmq";
import { connection, scrapeQueue, ingestQueue, defaultJobOpts } from "../queue/queues.js";
import { CrawlJobSchema, type IngestJob, type ScrapeJob } from "../queue/schemas.js";
import { SOURCES_BY_ID } from "../config/sources.js";
import { buildAdapter } from "../adapters/index.js";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";

const FAIL_THRESHOLD = 5;

/**
 * crawl-queue consumer. For rss/fetch sources runs the TS adapter; on a
 * detected bot-wall (blocked) routes to scrape-queue (Python). For scrapling
 * sources routes straight to scrape-queue. See crawler-contract.md.
 */
export function startCrawlerWorker() {
  return new Worker(
    "crawl-queue",
    async (job) => {
      const { sourceId, url } = CrawlJobSchema.parse(job.data);
      const source = SOURCES_BY_ID.get(sourceId);
      if (!source) throw new Error(`Unknown source ${sourceId}`);

      const log = logger.child({ sourceId, url });

      // scrapling / json sources → hand off to Python service
      const adapter = buildAdapter(source);
      if (!adapter) {
        await routeToScrape(source.id, url, source.scrapeMode ?? "stealth");
        log.info("routed to scrape-queue (scrapling/json source)");
        return { routed: "scrape-queue" };
      }

      const result = await adapter.crawl({ sourceId, url, adapter: source.adapter });

      if (result.blocked) {
        await routeToScrape(source.id, url, "stealth");
        log.warn("blocked → routed to scrape-queue (stealth)");
        return { routed: "scrape-queue", reason: "blocked" };
      }

      if (!result.ok) {
        await bumpFailure(sourceId);
        throw new Error(result.error ?? "crawl failed");
      }

      await markOk(sourceId);
      if (result.items.length > 0) {
        const ingest: IngestJob = { sourceId, items: result.items };
        await ingestQueue.add("ingest", ingest, defaultJobOpts);
      }
      log.info({ count: result.items.length }, "crawled");
      return { items: result.items.length };
    },
    { connection, concurrency: 4 },
  );
}

async function routeToScrape(sourceId: string, url: string, mode: ScrapeJob["mode"]) {
  const payload: ScrapeJob = { sourceId, url, mode };
  await scrapeQueue.add("scrape", payload, defaultJobOpts);
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
