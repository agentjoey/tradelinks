/**
 * Backfill og:image for existing alerts (created before image support).
 * Run: pnpm tsx scripts/backfill-images.ts
 */
import { prisma } from "../src/db/client.js";
import { fetchOgImage } from "../src/lib/ogimage.js";

async function main() {
  const alerts = await prisma.alert.findMany({
    where: { imageUrl: null },
    select: { id: true, title: true, sourceUrls: true },
  });
  console.log(`backfilling ${alerts.length} alerts…`);
  let got = 0;
  for (const a of alerts) {
    const url = a.sourceUrls[0];
    if (!url) continue;
    const img = await fetchOgImage(url);
    if (img) {
      await prisma.alert.update({ where: { id: a.id }, data: { imageUrl: img } });
      got++;
      console.log(`  ✓ ${a.title.slice(0, 50)} → ${img.slice(0, 60)}`);
    } else {
      console.log(`  – ${a.title.slice(0, 50)} (no og:image)`);
    }
  }
  console.log(`\ndone: ${got}/${alerts.length} alerts got an image`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
