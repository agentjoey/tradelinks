/**
 * Run a single source crawl synchronously (no queue), for local debugging.
 * Usage: pnpm worker:run-once --source=F01
 * If DB is unavailable it still prints the parsed items (dry run).
 */
import { SOURCES_BY_ID } from "../config/sources.js";
import { buildAdapter } from "../adapters/index.js";
import { logger } from "../lib/logger.js";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--source="));
  const sourceId = arg?.split("=")[1];
  if (!sourceId) {
    console.error("Usage: pnpm worker:run-once --source=<ID>");
    process.exit(1);
  }
  const source = SOURCES_BY_ID.get(sourceId);
  if (!source) {
    console.error(`Unknown source: ${sourceId}`);
    process.exit(1);
  }

  const adapter = buildAdapter(source);
  if (!adapter) {
    console.log(
      `Source ${sourceId} is adapter=${source.adapter}${source.json ? " (json)" : ""} → handled by Python scraper service, not runnable here.`,
    );
    return;
  }

  logger.info({ sourceId, url: source.url }, "run-once crawl");
  const result = await adapter.crawl({
    sourceId,
    url: source.url,
    adapter: source.adapter,
  });
  console.log(JSON.stringify({ ok: result.ok, blocked: result.blocked, count: result.items.length, sample: result.items.slice(0, 3) }, null, 2));
}

main().catch((err) => {
  logger.error(err, "run-once failed");
  process.exit(1);
});
