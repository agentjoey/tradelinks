/**
 * Seed diverse demo alerts for UI review (dev branch only).
 * Run: pnpm tsx scripts/seed-demo.ts   |   clean: pnpm tsx scripts/seed-demo.ts --clean
 */
import { prisma } from "../src/db/client.js";

type A = {
  title: string; summary: string; urgencyScore: number; category: any;
  regions: any[]; platforms: string[]; action: string; status: any; src: string;
};

const DEMO: A[] = [
  { title: "US CBP confirms de minimis $800 exemption ends Monday — duties on all parcels", summary: "Customs and Border Protection finalized the removal of the $800 de minimis threshold; all imported parcels will be assessed duties from next week.", urgencyScore: 5, category: "regulatory", regions: ["north_america"], platforms: ["temu", "shein"], action: "Recalculate landed cost now; evaluate duty-inclusive pricing and US warehousing.", status: "published", src: "https://demo.tradelinks/deminimis" },
  { title: "EU GPSR: marketplaces must list an EU Responsible Person before deadline", summary: "Under the General Product Safety Regulation, every non-food listing on EU marketplaces needs a named EU Responsible Person or it will be delisted.", urgencyScore: 4.5, category: "regulatory", regions: ["europe"], platforms: ["amazon", "ebay"], action: "Appoint and register an EU RP in Seller Central this week.", status: "pending_review", src: "https://demo.tradelinks/gpsr" },
  { title: "Indonesia tightens cross-border import permits for e-commerce", summary: "MoCI introduces stricter import licensing (NPWP) and a minimum price floor for several imported categories sold online.", urgencyScore: 4, category: "regulatory", regions: ["southeast_asia"], platforms: ["tiktok-shop", "shopee"], action: "Verify import licensing for affected SKUs before shipping to ID.", status: "pending_review", src: "https://demo.tradelinks/id-import" },
  { title: "Amazon raises FBA fulfillment fees across EU marketplaces for 2026", summary: "Per-unit FBA fees increase 4–8% in DE/FR/IT/ES; low-price FBA program thresholds also adjusted.", urgencyScore: 3.5, category: "platform_policy", regions: ["europe"], platforms: ["amazon"], action: "Re-run margin math on FBA SKUs; consider re-pricing thin-margin items.", status: "published", src: "https://demo.tradelinks/fba-eu" },
  { title: "Saudi SASO/SABER certification update for consumer electronics", summary: "New SABER conformity requirements for electronics imported into Saudi Arabia take effect; non-compliant shipments held at customs.", urgencyScore: 3.5, category: "regulatory", regions: ["middle_east"], platforms: ["noon", "amazon"], action: "Confirm SABER certificates for electronics SKUs bound for KSA.", status: "published", src: "https://demo.tradelinks/saber" },
  { title: "Shopee tightens counterfeit & IP policy across Southeast Asia", summary: "Shopee expands brand-protection enforcement; repeat IP violations now trigger faster account penalties.", urgencyScore: 3, category: "platform_policy", regions: ["southeast_asia"], platforms: ["shopee"], action: "Audit listings for trademarked terms/images before enforcement ramps.", status: "published", src: "https://demo.tradelinks/shopee-ip" },
  { title: "Asia–Europe ocean freight rates jump 22% week-over-week", summary: "Freightos index shows a sharp spike on Asia–North Europe lanes amid capacity tightening.", urgencyScore: 2.5, category: "logistics", regions: ["europe"], platforms: [], action: "Lock rates / book early for Q3 EU restock; watch Red Sea routing.", status: "published", src: "https://demo.tradelinks/freight-eu" },
  { title: "Mercado Libre expands fulfillment network in Mexico", summary: "New fulfillment centers cut delivery times in central Mexico; cross-border sellers gain faster Full program options.", urgencyScore: 2, category: "industry", regions: ["latin_america"], platforms: ["mercado-libre"], action: "Monitor — evaluate MELI Full for MX if expanding to LatAm.", status: "published", src: "https://demo.tradelinks/meli-mx" },
  { title: "Rising category: compact neck fans trending in US & UK", summary: "Search and best-seller signals show compact/neck fans climbing ahead of summer across NA and EU.", urgencyScore: 2, category: "trend", regions: ["north_america", "europe"], platforms: ["amazon", "tiktok-shop"], action: "Consider sourcing/listing summer cooling SKUs; watch SEA for diffusion.", status: "published", src: "https://demo.tradelinks/neck-fans" },
  { title: "5 product photo tips that lift TikTok Shop conversion", summary: "Creator-shared best practices for product imagery and first-frame hooks on TikTok Shop.", urgencyScore: 1, category: "tip", regions: ["north_america"], platforms: ["tiktok-shop"], action: "Monitor — apply at leisure to improve listing visuals.", status: "published", src: "https://demo.tradelinks/photo-tips" },
];

async function main() {
  if (process.argv.includes("--clean")) {
    const r = await prisma.alert.deleteMany({ where: { sourceUrls: { hasSome: DEMO.map((d) => d.src) } } });
    console.log("removed", r.count, "demo alerts");
    return;
  }
  let created = 0;
  for (const d of DEMO) {
    const existing = await prisma.alert.findFirst({ where: { sourceUrls: { has: d.src } } });
    if (existing) continue;
    await prisma.alert.create({
      data: {
        title: d.title, summary: d.summary, urgencyScore: d.urgencyScore,
        regions: d.regions, platforms: d.platforms, category: d.category,
        actionRequired: d.action, sourceUrls: [d.src], status: d.status,
        publishedAt: d.status === "published" ? new Date() : null,
      },
    });
    created++;
  }
  console.log(`seeded ${created} demo alerts (published + pending_review)`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
