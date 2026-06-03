import { getBoss, ensureQueues } from "../queue/queues.js";
import { registerCrawlerWorker } from "./crawler.js";
import { registerScrapeWorker } from "./scrape.js";
import { registerIngestWorker } from "./ingest.js";
import { registerProcessorWorker } from "./processor.js";
import { registerScoringWorker } from "./scoring.js";
import { registerScheduler } from "./scheduler.js";
import { logger } from "../lib/logger.js";

async function main() {
  logger.info("TradeLinks worker starting…");
  const boss = getBoss();
  boss.on("error", (err) => logger.error(err, "pg-boss error"));
  await boss.start();
  await ensureQueues(boss);

  await registerCrawlerWorker(boss);
  await registerScrapeWorker(boss);
  await registerIngestWorker(boss);
  await registerProcessorWorker(boss);
  await registerScoringWorker(boss);
  await registerScheduler(boss);
  logger.info("workers online: scheduler + crawl + scrape + ingest + process + score (pg-boss)");

  const shutdown = async () => {
    logger.info("shutting down workers…");
    await boss.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error(err, "worker crashed");
  process.exit(1);
});
