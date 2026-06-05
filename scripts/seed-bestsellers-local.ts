/**
 * One-off: populate bestseller items for given source IDs NOW via a local
 * scraper (mirrors the worker ingest bestseller branch: upsert by urlHash,
 * status=processed, region/platform/category + image). Avoids waiting for the
 * 12h cron after adding new sources.
 * Run: start uvicorn at :8000, then
 *      pnpm tsx scripts/seed-bestsellers-local.ts D40 D41 D42 D50 D51 D60 D61 D62
 */
import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { SOURCES_BY_ID } from "../src/config/sources.js";
import { callScraper } from "../src/workers/scrape.js";
import { urlHash, normalizeUrl } from "../src/lib/hash.js";
import type { ScrapeJob } from "../src/queue/schemas.js";

const BASE = "http://127.0.0.1:8000";

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error("pass source IDs, e.g. D40 D41 …");
  for (const id of ids) {
    const s = SOURCES_BY_ID.get(id);
    if (!s) { console.log(`${id}: unknown`); continue; }
    const job: ScrapeJob = { sourceId: id, url: s.url, mode: "stealth" };
    if (s.scrapeSelectors) {
      job.selectors = Object.fromEntries(
        Object.entries(s.scrapeSelectors).filter(([, v]) => v != null) as [string, string][],
      );
    }
    try {
      const items = await callScraper(job, BASE);
      let n = 0;
      for (const it of items) {
        const url = normalizeUrl(it.url);
        const hash = urlHash(it.url);
        const image = (it.rawContent as { image?: string } | null)?.image ?? null;
        await prisma.item.upsert({
          where: { urlHash: hash },
          update: { title: it.title, rawContent: (it.rawContent ?? undefined) as object | undefined, ...(image ? { imageUrl: image } : {}), crawledAt: new Date() },
          create: {
            sourceId: id, url, urlHash: hash, title: it.title, lang: "en",
            publishedAt: new Date(), rawContent: (it.rawContent ?? undefined) as object | undefined,
            status: "processed", regions: s.regions as never[], platforms: s.platforms,
            category: (s.categoryHint ?? "trend") as never, imageUrl: image,
          },
        });
        n++;
      }
      console.log(`${id} ${s.name}: upserted ${n}`);
    } catch (e) {
      console.log(`${id} ${s.name}: FAILED ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
