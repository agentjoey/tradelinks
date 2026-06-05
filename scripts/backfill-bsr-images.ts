/**
 * One-off: backfill product images (+ refresh rank) for existing Amazon
 * bestseller items by re-scraping each source via a LOCAL scraper service.
 * Run: start `uvicorn main:app --port 8000` in scraper-py, then
 *      pnpm tsx scripts/backfill-bsr-images.ts
 *
 * Existing items are url-deduped, so a normal worker re-crawl now UPSERTs images
 * (ingest.ts). This script applies that immediately instead of waiting 12h.
 */
import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { SOURCES, BESTSELLER_SOURCE_IDS } from "../src/config/sources.js";
import { callScraper } from "../src/workers/scrape.js";
import { normalizeUrl } from "../src/lib/hash.js";
import type { ScrapeJob } from "../src/queue/schemas.js";

const BASE = "http://127.0.0.1:8000";

async function main() {
  const sources = SOURCES.filter((s) => BESTSELLER_SOURCE_IDS.has(s.id) && s.enabled !== false);
  let totalUpdated = 0;
  for (const s of sources) {
    const job: ScrapeJob = { sourceId: s.id, url: s.url, mode: "stealth" };
    if (s.scrapeSelectors) {
      job.selectors = Object.fromEntries(
        Object.entries(s.scrapeSelectors).filter(([, v]) => v != null) as [string, string][],
      );
    }
    try {
      const items = await callScraper(job, BASE);
      let withImg = 0;
      let updated = 0;
      for (const it of items) {
        const image = (it.rawContent as { image?: string } | null)?.image;
        if (!image) continue;
        withImg++;
        const url = normalizeUrl(it.url);
        const r = await prisma.item.updateMany({
          where: { url },
          data: { imageUrl: image, rawContent: (it.rawContent ?? undefined) as object | undefined },
        });
        updated += r.count;
      }
      totalUpdated += updated;
      console.log(`${s.id} ${s.name}: scraped ${items.length}, withImg ${withImg}, updated ${updated}`);
    } catch (e) {
      console.log(`${s.id} ${s.name}: FAILED ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\ntotal items updated with images: ${totalUpdated}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
