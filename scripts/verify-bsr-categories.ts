/**
 * Verify Amazon best-seller category slugs work per regional domain (before
 * adding them to sources.ts). Needs a local scraper at :8000.
 * Run: pnpm tsx scripts/verify-bsr-categories.ts
 */
import "dotenv/config";
import { callScraper } from "../src/workers/scrape.js";
import type { ScrapeJob } from "../src/queue/schemas.js";

const BASE = "http://127.0.0.1:8000";
const SEL = { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text" };
const DOMAINS: [string, string][] = [["EU", "amazon.co.uk"], ["ME", "amazon.ae"], ["ANZ", "amazon.com.au"]];
const CATS: [string, string][] = [
  ["home-garden", "Home & Garden"],
  ["kitchen", "Kitchen"],
  ["toys-and-games", "Toys & Games"],
  ["beauty", "Beauty"],
  ["sporting-goods", "Sports & Outdoors"],
];

async function main() {
  for (const [region, domain] of DOMAINS) {
    for (const [slug, label] of CATS) {
      const url = `https://www.${domain}/gp/bestsellers/${slug}/`;
      const job: ScrapeJob = { sourceId: "verify", url, mode: "stealth", selectors: SEL };
      try {
        const items = await callScraper(job, BASE);
        console.log(`${region} ${label.padEnd(20)} ${slug.padEnd(16)} items=${items.length} ${items.length > 0 ? "OK" : "EMPTY"}`);
      } catch (e) {
        console.log(`${region} ${label.padEnd(20)} ${slug.padEnd(16)} FAIL ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
