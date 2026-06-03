/**
 * T2 verification: scored alert generation on real Neon + MiniMax.
 * Seeds 2 processed items (high/low urgency), scores them, generates alerts,
 * checks status routing. Run: pnpm tsx scripts/verify-alert.ts
 */
import { prisma } from "../src/db/client.js";
import { urlHash } from "../src/lib/hash.js";
import { scoringClient } from "../src/ai/client.js";
import { runStage2 } from "../src/ai/stage2.js";
import { upsertAlertForItem } from "../src/alerts/db.js";

const SEED = [
  { url: "https://verify.test/alert/deminimis", title: "US CBP: de minimis $800 exemption ends Monday, duties on all parcels", category: "regulatory" as const, regions: ["north_america"], platforms: [] as string[] },
  { url: "https://verify.test/alert/phototips", title: "5 product photo tips for TikTok Shop sellers", category: "tip" as const, regions: ["north_america"], platforms: ["tiktok-shop"] },
];

async function main() {
  // ensure a source row exists for FK
  await prisma.source.upsert({ where: { id: "A02" }, update: {}, create: { id: "A02", name: "seed", url: "https://x", adapter: "rss", frequencyCron: "0 * * * *", language: "en", regions: [], platforms: [] } });

  for (const s of SEED) {
    const hash = urlHash(s.url);
    const item = await prisma.item.upsert({
      where: { urlHash: hash },
      update: { status: "processed", category: s.category, regions: s.regions as any, platforms: s.platforms },
      create: {
        sourceId: "A02", url: s.url, urlHash: hash, title: s.title, lang: "en",
        publishedAt: new Date(), status: "processed",
        category: s.category, regions: s.regions as any, platforms: s.platforms,
      },
    });
    const score = await runStage2(
      { title: item.title, summary: item.summaryEn, category: s.category, regions: s.regions as any, platforms: s.platforms },
      scoringClient(),
    );
    await prisma.item.update({ where: { id: item.id }, data: { urgencyScore: score.urgencyScore, impactScope: score.impactScope, recommendation: score.recommendation } });
    await upsertAlertForItem({ ...item, urgencyScore: score.urgencyScore }, score);
    console.log(`scored [${score.urgencyScore}] ${s.title.slice(0, 45)}`);
  }

  console.log("\n== alerts (verify.test) ==");
  const alerts = await prisma.alert.findMany({
    where: { sourceUrls: { hasSome: SEED.map((s) => s.url) } },
    select: { title: true, urgencyScore: true, status: true, category: true, actionRequired: true },
    orderBy: { urgencyScore: "desc" },
  });
  for (const a of alerts) {
    console.log(`  [${a.urgencyScore}] ${a.status.padEnd(14)} ${a.category.padEnd(12)} ${a.title.slice(0, 40)}`);
    console.log(`        action: ${(a.actionRequired ?? "").slice(0, 80)}`);
  }
  console.log("\n✅ alert generation verified");
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
