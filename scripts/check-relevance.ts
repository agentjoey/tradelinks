/**
 * Dry-run the seller-relevance gate over real data and print every verdict.
 *
 * The gate's fail-closed behaviour is unit-tested; its *judgment* is not
 * testable without the model. This script is how that judgment gets measured
 * before it is trusted: it reads live rows, asks the classifier, and prints
 * what it would have decided. It writes nothing.
 *
 *   pnpm tsx scripts/check-relevance.ts            # the current draft queue
 *   pnpm tsx scripts/check-relevance.ts --items    # recent items, pre-promotion
 *   pnpm tsx scripts/check-relevance.ts --limit 40
 *
 * Read the DROP list as carefully as the KEEP list. A gate that drops
 * something a seller must act on is a worse failure than one that keeps
 * noise, and only a human comparing these two columns can tell.
 */

import { env } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";
import { deepseekFlash } from "../src/ai/client.js";
import {
  RELEVANCE_CONFIDENCE_THRESHOLD,
  buildSellerRelevancePrompt,
  foldRelevance,
  parseSellerRelevance,
  type RelevanceItem,
} from "../src/ai/prompts/seller-relevance.js";

const BATCH = 20;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadDrafts(limit: number): Promise<RelevanceItem[]> {
  const rows = await prisma.canonicalChangeVersion.findMany({
    where: { editorialStatus: { in: ["DRAFT", "IN_REVIEW"] } },
    orderBy: { sourcePublishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      summary: true,
      evidence: { select: { sourceId: true }, take: 1 },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.summary !== r.title ? r.summary : undefined,
    sourceId: r.evidence[0]?.sourceId ?? "unknown",
  }));
}

async function loadItems(limit: number): Promise<RelevanceItem[]> {
  const rows = await prisma.item.findMany({
    where: { sourceId: { in: ["A02", "B03", "AMZ-ANNOUNCEMENTS"] } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, title: true, titleEn: true, summaryEn: true, sourceId: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.titleEn ?? r.title,
    snippet: r.summaryEn ?? undefined,
    sourceId: r.sourceId,
  }));
}

async function main(): Promise<void> {
  if (!env.DEEPSEEK_API_KEY) {
    console.error(
      "DEEPSEEK_API_KEY is not set. The gate fails closed without it: promotion\n" +
        "is skipped entirely rather than falling back to promoting everything.",
    );
    process.exit(2);
  }

  const limit = Number(arg("--limit") ?? 200);
  const items = process.argv.includes("--items")
    ? await loadItems(limit)
    : await loadDrafts(limit);

  if (items.length === 0) {
    console.log("Nothing to judge.");
    await prisma.$disconnect();
    return;
  }

  const verdicts = new Map<string, { keep: boolean; reason: string; confidence: number }>();
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    process.stderr.write(`judging ${i + 1}-${i + chunk.length} of ${items.length}\r`);
    const res = await deepseekFlash.complete(buildSellerRelevancePrompt(chunk));
    for (const [id, v] of foldRelevance(chunk, parseSellerRelevance(res.text))) {
      verdicts.set(id, v);
    }
  }
  process.stderr.write("\n");

  const byId = new Map(items.map((i) => [i.id, i]));
  const kept = [...verdicts.entries()].filter(([, v]) => v.keep);
  const dropped = [...verdicts.entries()].filter(([, v]) => !v.keep);

  const line = (id: string, v: { reason: string; confidence: number }) => {
    const it = byId.get(id)!;
    return `  [${v.confidence.toFixed(2)}] ${it.sourceId.padEnd(18)} ${it.title.slice(0, 66)}\n` +
      `         └─ ${v.reason}`;
  };

  console.log(`\n=== KEEP (${kept.length}) ===`);
  for (const [id, v] of kept) console.log(line(id, v));
  console.log(`\n=== DROP (${dropped.length}) ===`);
  for (const [id, v] of dropped) console.log(line(id, v));

  const pct = ((kept.length / items.length) * 100).toFixed(1);
  console.log(
    `\njudged ${items.length} · kept ${kept.length} (${pct}%) · dropped ${dropped.length}` +
      ` · threshold ${RELEVANCE_CONFIDENCE_THRESHOLD}`,
  );
  console.log("Nothing was written. Read the DROP list before trusting this gate.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(String(err));
  await prisma.$disconnect();
  process.exit(1);
});
