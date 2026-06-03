import { startCrawlerWorker } from "./crawler.js";
import { startIngestWorker } from "./ingest.js";
import { registerSchedules } from "./scheduler.js";
import { logger } from "../lib/logger.js";

async function main() {
  logger.info("TradeLinks worker starting…");
  const crawler = startCrawlerWorker();
  const ingest = startIngestWorker();
  await registerSchedules();
  logger.info("workers online: crawl-queue + ingest-queue");

  const shutdown = async () => {
    logger.info("shutting down workers…");
    await Promise.all([crawler.close(), ingest.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error(err, "worker crashed");
  process.exit(1);
});
