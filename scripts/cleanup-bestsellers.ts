/**
 * One-off cleanup after moving Amazon best-sellers off the Wire.
 * Run: pnpm tsx scripts/cleanup-bestsellers.ts
 *
 *  1. Deletes Wire alerts that originated from Amazon best-seller products
 *     (sourceUrls pointing at an Amazon /dp/ product page).
 *  2. Re-tags existing best-seller items as terminal `processed` + region/
 *     platform/category, so they feed the Radar board and never re-enter AI.
 */
import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { BESTSELLER_SOURCE_IDS, SOURCES_BY_ID } from "../src/config/sources.js";

async function main() {
  // 1. delete bestseller-origin alerts (Amazon product pages)
  const alerts = await prisma.alert.findMany({ select: { id: true, title: true, sourceUrls: true } });
  const bad = alerts.filter((a) => a.sourceUrls.some((u) => /amazon\.[a-z.]+\/.*\/dp\/|\/dp\//i.test(u)));
  if (bad.length) {
    await prisma.alert.deleteMany({ where: { id: { in: bad.map((a) => a.id) } } });
  }
  console.log(`alerts deleted: ${bad.length}`);
  for (const a of bad.slice(0, 15)) console.log(`  - ${a.title}`);

  // 2. re-tag existing bestseller items
  const ids = [...BESTSELLER_SOURCE_IDS];
  const items = await prisma.item.findMany({ where: { sourceId: { in: ids } }, select: { id: true, sourceId: true } });
  let retagged = 0;
  for (const it of items) {
    const src = SOURCES_BY_ID.get(it.sourceId);
    await prisma.item.update({
      where: { id: it.id },
      data: {
        status: "processed",
        regions: (src?.regions ?? []) as never[],
        platforms: src?.platforms ?? [],
        category: (src?.categoryHint ?? "trend") as never,
      },
    });
    retagged++;
  }
  console.log(`bestseller items re-tagged: ${retagged}`);

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("cleanup failed:", e);
  process.exit(1);
});
