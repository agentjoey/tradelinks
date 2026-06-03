/**
 * Bounded REAL ingest through the full pipeline (no worker/queue): crawl a few
 * RSS sources → Stage-1 (deepseek-v4-flash) → dedup → Stage-2 (MiniMax) → alerts.
 * Run: pnpm tsx scripts/ingest-real.ts [perSource]
 */
import { prisma } from "../src/db/client.js";
import { RssAdapter } from "../src/adapters/rss.js";
import { SOURCES_BY_ID } from "../src/config/sources.js";
import { urlHash } from "../src/lib/hash.js";
import { pickClient, scoringClient } from "../src/ai/client.js";
import { runStage1 } from "../src/ai/stage1.js";
import { runStage2 } from "../src/ai/stage2.js";
import { resolveDuplication } from "../src/dedup/resolve.js";
import { findSimilarItems, applyDuplicate, applyCluster } from "../src/dedup/db.js";
import { upsertAlertForItem } from "../src/alerts/db.js";
import type { Category, Region } from "../src/config/sources.js";

const SOURCE_IDS = ["B01", "B02", "B16", "F02", "F03", "F04", "F09"]; // regulatory + industry RSS
const PER_SOURCE = Number(process.argv[2] ?? 4);

async function ensureSource(id: string) {
  const s = SOURCES_BY_ID.get(id)!;
  await prisma.source.upsert({
    where: { id },
    update: {},
    create: {
      id, name: s.name, url: s.url, adapter: s.adapter, frequencyCron: s.frequencyCron,
      language: s.language, regions: s.regions as never[], platforms: s.platforms,
      categoryHint: (s.categoryHint ?? null) as never,
    },
  });
}

async function main() {
  let crawled = 0, ingested = 0, kept = 0, alerts = 0;

  for (const id of SOURCE_IDS) {
    const s = SOURCES_BY_ID.get(id);
    if (!s || s.adapter !== "rss") continue;
    await ensureSource(id);
    const res = await new RssAdapter(s.language).crawl({ sourceId: id, url: s.url, adapter: "rss" });
    if (!res.ok) { console.log(`  ${id} ${s.name}: crawl failed (${res.error})`); continue; }
    crawled += res.items.length;
    const fresh = res.items.slice(0, PER_SOURCE);
    console.log(`\n▶ ${id} ${s.name}: ${res.items.length} items, processing ${fresh.length}`);

    for (const raw of fresh) {
      const hash = urlHash(raw.url);
      if (await prisma.item.findUnique({ where: { urlHash: hash } })) continue;
      const item = await prisma.item.create({
        data: {
          sourceId: id, url: raw.url, urlHash: hash, title: raw.title, lang: s.language,
          publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
          rawContent: (raw.rawContent ?? undefined) as object | undefined,
        },
      });
      ingested++;

      const snippet = typeof (raw.rawContent as Record<string, unknown>)?.contentSnippet === "string"
        ? ((raw.rawContent as Record<string, unknown>).contentSnippet as string) : undefined;
      const out = await runStage1(
        { id: item.id, title: item.title, lang: item.lang, snippet, content: snippet, fallbackRegions: s.regions },
        pickClient(item.lang),
      );

      if (!out.keep) {
        await prisma.item.update({ where: { id: item.id }, data: { status: "filtered" } });
        console.log(`  ✗ drop: ${item.title.slice(0, 60)}`);
        continue;
      }
      await prisma.item.update({
        where: { id: item.id },
        data: { status: "processed", titleEn: out.titleEn, summaryEn: out.summaryEn, category: out.category, regions: out.regions, platforms: out.platforms },
      });
      kept++;

      // dedup
      const dt = out.titleEn ?? item.title;
      const cands = await findSimilarItems(dt, item.id);
      if (cands.length) {
        const r = await resolveDuplication(dt, cands, pickClient(item.lang));
        if (r.action === "duplicate") { await applyDuplicate(item.id); console.log(`  ⊘ dup: ${dt.slice(0, 50)}`); continue; }
        if (r.action === "cluster") await applyCluster(item.id, r.withId, r.clusterId, item.url);
      }

      // score → alert
      const reread = await prisma.item.findUnique({ where: { id: item.id } });
      const score = await runStage2(
        { title: out.titleEn ?? item.title, summary: out.summaryEn, category: out.category as Category, regions: out.regions as Region[], platforms: out.platforms },
        scoringClient(),
      );
      await prisma.item.update({ where: { id: item.id }, data: { urgencyScore: score.urgencyScore, impactScope: score.impactScope, recommendation: score.recommendation } });
      await upsertAlertForItem(reread!, score);
      alerts++;
      console.log(`  ✓ [${score.urgencyScore}] ${out.category} ${JSON.stringify(out.regions)} — ${(out.titleEn ?? item.title).slice(0, 55)}`);
    }
  }

  const pub = await prisma.alert.count({ where: { status: "published" } });
  const pend = await prisma.alert.count({ where: { status: "pending_review" } });
  console.log(`\n=== done: crawled ${crawled}, ingested ${ingested}, kept ${kept}, alerts→${alerts} ===`);
  console.log(`alerts in DB: ${pub} published / ${pend} pending_review`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
