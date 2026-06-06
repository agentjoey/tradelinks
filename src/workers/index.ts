import { getBoss, ensureQueues } from "../queue/queues.js";
import { registerCrawlerWorker } from "./crawler.js";
import { registerScrapeWorker } from "./scrape.js";
import { registerIngestWorker } from "./ingest.js";
import { registerProcessorWorker } from "./processor.js";
import { registerScoringWorker } from "./scoring.js";
import { registerTrendsWorker } from "./trends.js";
import { registerHealthWorker } from "./health.js";
import { registerXWorker } from "./x.js";
import { registerDailyNoteWorker } from "./daily-note.js";
import { registerChannelPushWorker } from "./channel-push.js";
import { registerScheduler } from "./scheduler.js";
import { seedSources } from "./seed-sources.js";
import { QUEUES } from "../queue/queues.js";
import { logger } from "../lib/logger.js";

async function main() {
  logger.info("TradeLinks worker starting…");
  await seedSources(); // ensure source rows exist (markOk + scheduler depend on them)
  const boss = getBoss();
  boss.on("error", (err) => logger.error(err, "pg-boss error"));
  await boss.start();
  await ensureQueues(boss);

  await registerCrawlerWorker(boss);
  await registerScrapeWorker(boss);
  await registerIngestWorker(boss);
  await registerProcessorWorker(boss);
  await registerScoringWorker(boss);
  await registerTrendsWorker(boss);
  await registerHealthWorker(boss);
  await registerXWorker(boss);
  await registerDailyNoteWorker(boss);
  await registerChannelPushWorker(boss);
  await registerScheduler(boss);
  // daily trends ingest + diffusion at 02:00 UTC
  await boss.schedule(QUEUES.trends, "0 2 * * *");
  // daily source-health snapshot + regression alert at 02:30 UTC
  await boss.schedule(QUEUES.health, "30 2 * * *");
  // daily X viral-products ingest at 03:00 UTC (no-op until X_ENABLED + token set)
  await boss.schedule(QUEUES.x, "0 3 * * *");
  // daily editorial note(s) at 03:30 UTC (after trends/health/x settle yesterday)
  await boss.schedule(QUEUES.dailyNote, "30 3 * * *");
  // curated Telegram channel push: 3×/day (02:00/10:00/16:00 UTC) to spread across timezones
  await boss.schedule(QUEUES.channelPush, "0 2,10,16 * * *");
  logger.info("workers online: scheduler + crawl + scrape + ingest + process + score + trends + health + x + daily-note + channel-push (pg-boss)");

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
