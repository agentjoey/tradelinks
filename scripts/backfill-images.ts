/**
 * Backfill / re-evaluate alert images: null out generic banners, fetch real
 * og:image where missing. Run: pnpm tsx scripts/backfill-images.ts
 */
import { prisma } from "../src/db/client.js";
import { fetchOgImage, isGenericBanner } from "../src/lib/ogimage.js";

async function main() {
  const alerts = await prisma.alert.findMany({
    select: { id: true, title: true, sourceUrls: true, imageUrl: true },
  });
  console.log(`re-evaluating ${alerts.length} alerts…`);
  let cleared = 0, filled = 0;
  for (const a of alerts) {
    // drop generic banners already stored
    if (a.imageUrl && isGenericBanner(a.imageUrl)) {
      await prisma.alert.update({ where: { id: a.id }, data: { imageUrl: null } });
      cleared++;
      console.log(`  ✗ banner cleared: ${a.title.slice(0, 45)}`);
      continue;
    }
    if (a.imageUrl) continue; // keep good image
    const url = a.sourceUrls[0];
    if (!url) continue;
    const img = await fetchOgImage(url); // already skips banners
    if (img) {
      await prisma.alert.update({ where: { id: a.id }, data: { imageUrl: img } });
      filled++;
      console.log(`  ✓ image: ${a.title.slice(0, 40)} → ${img.slice(0, 55)}`);
    }
  }
  const withImg = await prisma.alert.count({ where: { imageUrl: { not: null } } });
  console.log(`\ncleared ${cleared} banners, filled ${filled}; ${withImg} alerts now have a real image`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
