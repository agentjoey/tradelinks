/**
 * One-off integration verification against the Neon dev branch.
 * Proves: T1 schema applied, pg_trgm works (T5), real RSS crawl → DB insert (T3),
 * findSimilarItems trigram query (T5). Does NOT require AI keys or pg-boss.
 *
 * Run: pnpm tsx scripts/verify-db.ts
 */
import { prisma } from "../src/db/client.js";
import { RssAdapter } from "../src/adapters/rss.js";
import { urlHash } from "../src/lib/hash.js";
import { SOURCES_BY_ID } from "../src/config/sources.js";
import { findSimilarItems } from "../src/dedup/db.js";

async function main() {
  console.log("== 1. tables present ==");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  console.log(tables.map((t) => t.tablename).join(", "));

  console.log("\n== 2. pg_trgm extension + similarity() ==");
  const sim = await prisma.$queryRaw<{ s: number }[]>`
    SELECT similarity('Amazon raises FBA fees 2026','Amazon FBA fee increase 2026') AS s`;
  console.log("similarity(Amazon FBA...) =", Number(sim[0]!.s).toFixed(3));

  console.log("\n== 3. seed sources (upsert all configured) ==");
  for (const s of SOURCES_BY_ID.values()) {
    await prisma.source.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id, name: s.name, url: s.url, adapter: s.adapter,
        frequencyCron: s.frequencyCron, language: s.language,
        regions: s.regions, platforms: s.platforms, categoryHint: s.categoryHint ?? null,
      },
    });
  }
  console.log("sources in DB:", await prisma.source.count());

  console.log("\n== 4. real RSS crawl (A02 Shopify) → insert up to 5 items ==");
  const src = SOURCES_BY_ID.get("A02")!;
  const res = await new RssAdapter(src.language).crawl({ sourceId: "A02", url: src.url, adapter: "rss" });
  console.log("crawl ok:", res.ok, "items:", res.items.length);
  let inserted = 0;
  for (const raw of res.items.slice(0, 5)) {
    const hash = urlHash(raw.url);
    if (await prisma.item.findUnique({ where: { urlHash: hash } })) continue;
    await prisma.item.create({
      data: {
        sourceId: "A02", url: raw.url, urlHash: hash, title: raw.title,
        lang: raw.lang ?? "en",
        publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
      },
    });
    inserted++;
  }
  console.log("inserted:", inserted, "| total items in DB:", await prisma.item.count());

  console.log("\n== 5. trigram findSimilarItems (insert a near-dup, query) ==");
  const baseTitle = "Amazon raises FBA fees for 2026 sellers";
  const dupTitle = "Amazon raises FBA fee for 2026 sellers worldwide";
  for (const t of [baseTitle, dupTitle]) {
    const h = urlHash("https://verify.test/" + encodeURIComponent(t));
    if (!(await prisma.item.findUnique({ where: { urlHash: h } }))) {
      await prisma.item.create({
        data: { sourceId: "A02", url: "https://verify.test/" + encodeURIComponent(t), urlHash: h, title: t, lang: "en", publishedAt: new Date() },
      });
    }
  }
  const baseItem = await prisma.item.findFirst({ where: { title: baseTitle } });
  const similar = await findSimilarItems(dupTitle, baseItem?.id ?? "none");
  console.log("similar candidates for near-dup:", similar.map((c) => ({ title: c.title.slice(0, 40), score: c.score.toFixed(3) })));

  console.log("\n✅ DB verification complete");
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
