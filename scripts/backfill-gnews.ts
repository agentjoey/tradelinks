// One-off backfill (BL-040 ③): rewrite already-published alerts whose source is a
// Google News redirect to the real publisher URL + a real og:image (replacing the
// generic Google News logo). Safe & idempotent: alerts that fail to resolve are
// left untouched. Usage: pnpm exec tsx scripts/backfill-gnews.ts
import { prisma } from "../src/db/client.js";
import { isGoogleNewsUrl, resolveGoogleNewsUrl } from "../src/lib/gnews.js";
import { fetchOgImage } from "../src/lib/ogimage.js";

async function main() {
  const alerts = await prisma.alert.findMany({
    where: { status: "published" },
    select: { id: true, sourceUrls: true, imageUrl: true, title: true },
  });
  const gn = alerts.filter((a) => isGoogleNewsUrl(a.sourceUrls[0] ?? ""));
  console.log(`published alerts: ${alerts.length} | google-news source: ${gn.length}`);

  let fixed = 0, withImg = 0, failed = 0;
  for (const a of gn) {
    const gnUrl = a.sourceUrls[0]!;
    const real = await resolveGoogleNewsUrl(gnUrl);
    if (!real) { failed++; console.log(`  ✗ resolve fail: ${a.title.slice(0, 50)}`); continue; }
    const img = await fetchOgImage(real); // real article og:image (or null)
    await prisma.alert.update({
      where: { id: a.id },
      data: { sourceUrls: [real, ...a.sourceUrls.slice(1)], imageUrl: img },
    });
    fixed++; if (img) withImg++;
    console.log(`  ✓ ${a.title.slice(0, 45)} → ${new URL(real).hostname}  img:${!!img}`);
  }
  console.log(`\ndone: fixed ${fixed}/${gn.length} (real image on ${withImg}), failed ${failed}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
