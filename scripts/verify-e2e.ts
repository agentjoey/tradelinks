/**
 * Bounded end-to-end verification on real infra (Neon + MiniMax).
 * Crawl → ingest(2 items) → AI Stage-1 → dedup → DB, then read back.
 * Bounded to 2 items so we don't process Shopify's 1500+ feed.
 * Run: pnpm tsx scripts/verify-e2e.ts
 */
import { prisma } from "../src/db/client.js";
import { RssAdapter } from "../src/adapters/rss.js";
import { urlHash } from "../src/lib/hash.js";
import { SOURCES_BY_ID } from "../src/config/sources.js";
import { pickClient, getUsageTotals } from "../src/ai/client.js";
import { runStage1 } from "../src/ai/stage1.js";
import { resolveDuplication } from "../src/dedup/resolve.js";
import { findSimilarItems, applyDuplicate, applyCluster } from "../src/dedup/db.js";

async function main() {
  const src = SOURCES_BY_ID.get("F04")!; // Tamebay (EU marketplace news), smaller feed
  console.log(`crawl ${src.id} ${src.name}…`);
  const res = await new RssAdapter(src.language).crawl({ sourceId: src.id, url: src.url, adapter: "rss" });
  console.log(`  ok=${res.ok} items=${res.items.length}`);

  const fresh = res.items.slice(0, 2);
  for (const raw of fresh) {
    const hash = urlHash(raw.url);
    const item =
      (await prisma.item.findUnique({ where: { urlHash: hash } })) ??
      (await prisma.item.create({
        data: {
          sourceId: src.id, url: raw.url, urlHash: hash, title: raw.title,
          lang: raw.lang ?? "en",
          publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
        },
      }));

    if (item.status !== "raw") {
      console.log(`\n[already processed] ${item.title.slice(0, 60)} → ${item.status}`);
      continue;
    }

    console.log(`\nprocessing: ${item.title.slice(0, 70)}`);
    const out = await runStage1(
      { id: item.id, title: item.title, lang: item.lang, fallbackRegions: src.regions },
      pickClient(item.lang),
    );

    if (!out.keep) {
      await prisma.item.update({ where: { id: item.id }, data: { status: "filtered" } });
      console.log(`  → filtered (${out.reason})`);
      continue;
    }
    await prisma.item.update({
      where: { id: item.id },
      data: {
        status: "processed", titleEn: out.titleEn, summaryEn: out.summaryEn,
        category: out.category, regions: out.regions, platforms: out.platforms,
      },
    });
    console.log(`  → processed | ${out.category} | ${JSON.stringify(out.regions)} | ${JSON.stringify(out.platforms)}`);

    // dedup
    const dedupTitle = out.titleEn ?? item.title;
    const cands = await findSimilarItems(dedupTitle, item.id);
    if (cands.length) {
      const r = await resolveDuplication(dedupTitle, cands, pickClient(item.lang));
      if (r.action === "duplicate") { await applyDuplicate(item.id); console.log(`  → duplicate of ${r.ofId}`); }
      else if (r.action === "cluster") { await applyCluster(item.id, r.withId, r.clusterId, item.url); console.log(`  → clustered with ${r.withId}`); }
      else console.log(`  → distinct (${cands.length} near candidates)`);
    } else {
      console.log(`  → distinct (no near candidates)`);
    }
  }

  console.log("\n== processed items in DB ==");
  const rows = await prisma.item.findMany({
    where: { status: "processed" },
    select: { titleEn: true, title: true, category: true, regions: true },
    take: 5, orderBy: { crawledAt: "desc" },
  });
  for (const r of rows) console.log(`  [${r.category}] ${(r.titleEn ?? r.title).slice(0, 60)} ${JSON.stringify(r.regions)}`);

  const u = getUsageTotals();
  console.log(`\nusage: ${u.calls} calls, ${u.promptTokens}+${u.completionTokens} tokens`);
  console.log("✅ e2e verification complete");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
