/**
 * Real (small) trends ingest: proves Python pytrends → snapshots → diffusion → DB.
 * Needs the Python scraper service running on SCRAPER_SERVICE_URL.
 * Run: pnpm tsx scripts/verify-trends.ts
 */
import { runTrendsIngest } from "../src/workers/trends.js";
import { getTrendsView } from "../src/trends/db.js";
import { prisma } from "../src/db/client.js";

async function main() {
  const keywords = ["portable blender", "neck fan", "air fryer", "mini projector"];
  const regions = [
    { region: "north_america" as const, geo: "US" },
    { region: "europe" as const, geo: "GB" },
    { region: "southeast_asia" as const, geo: "ID" },
  ];
  console.log("ingesting", keywords.length, "keywords ×", regions.length, "regions (real Google Trends)…");
  const res = await runTrendsIngest(keywords, regions);
  console.log("ingest:", res);

  const view = await getTrendsView();
  console.log("\nsignals:", view.signals.length);
  for (const s of view.signals) console.log(`  ${s.keyword}: ${s.originRegion} → ${s.spreadingTo.join(",")} (${Math.round(s.confidence * 100)}%)`);
  console.log("\nrising (top 8):");
  for (const r of view.rising.slice(0, 8)) console.log(`  [${r.region}] ${r.keyword} level=${r.level} ss=${r.signalStrength}`);
  console.log("\n✅ trends pipeline verified");
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
