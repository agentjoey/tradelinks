/**
 * Dry-run the "what this means for you" writer over real drafts.
 *
 * Writes nothing. This is how the product's first-party voice gets judged
 * before any of it is stored: does the note add something a reader could act
 * on, or is it the source sentence rearranged? Only a human reading the output
 * against the source can answer that, so the script prints both.
 *
 *   pnpm tsx scripts/check-action-templates.ts
 *   pnpm tsx scripts/check-action-templates.ts --limit 5
 *
 * Note the REJECTED list too. A high rejection rate is not a bug — it is the
 * grounding check refusing material too thin to interpret honestly.
 */

import { env } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";
import { minimaxJudge } from "../src/ai/client.js";
import {
  MAX_SOURCE_CHARS,
  buildActionTemplatePrompt,
  foldActionTemplates,
  parseActionTemplates,
  type TemplateInput,
} from "../src/ai/prompts/action-template.js";

// Batch size is a quality lever here, not just a cost one — see the run
// comparison in the report. Overridable so the trade-off stays measurable.
const BATCH = Number(process.env.TEMPLATE_BATCH ?? 4);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The publisher's own words, from the item the draft was anchored on. */
function sourceTextOf(raw: unknown, fallback: string): string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof r.contentSnippet === "string" && r.contentSnippet) ||
    (typeof r.abstract === "string" && r.abstract) ||
    (typeof r.content === "string" && r.content) ||
    "";
  const text = String(candidate)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 40 ? text : fallback;
}

async function main(): Promise<void> {
  if (!env.MINIMAX_API_KEY) {
    console.error("MINIMAX_API_KEY is not set.");
    process.exit(2);
  }
  const limit = Number(arg("--limit") ?? 50);

  const drafts = await prisma.canonicalChangeVersion.findMany({
    where: { editorialStatus: "DRAFT", reviewedAt: null },
    orderBy: { sourcePublishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      summary: true,
      sourcePublishedAt: true,
      evidence: { select: { sourceId: true, sourceItemId: true }, take: 1 },
    },
  });
  if (drafts.length === 0) {
    console.log("No drafts.");
    await prisma.$disconnect();
    return;
  }

  // The draft carries only title and summary; the publisher's body lives on the
  // item. Without it there is nothing to interpret — see the report at the end.
  const itemIds = drafts.map((d) => d.evidence[0]?.sourceItemId).filter((v): v is string => !!v);
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, rawContent: true },
  });
  const rawById = new Map(items.map((i) => [i.id, i.rawContent]));

  const inputs: TemplateInput[] = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    sourceId: d.evidence[0]?.sourceId ?? "unknown",
    publishedAt: d.sourcePublishedAt.toISOString().slice(0, 10),
    sourceText: sourceTextOf(
      rawById.get(d.evidence[0]?.sourceItemId ?? ""),
      d.summary !== d.title ? d.summary : d.title,
    ),
  }));

  const thin = inputs.filter((i) => i.sourceText.length < 200).length;

  const results = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    const chunk = inputs.slice(i, i + BATCH);
    process.stderr.write(`writing ${i + 1}-${i + chunk.length} of ${inputs.length}\r`);
    try {
      const res = await minimaxJudge.complete(buildActionTemplatePrompt(chunk));
      results.push(...parseActionTemplates(res.text));
    } catch (err) {
      console.error(`\nbatch ${i} failed: ${String(err).slice(0, 100)}`);
    }
  }
  process.stderr.write("\n");

  const folded = foldActionTemplates(inputs, results);
  const byId = new Map(inputs.map((i) => [i.id, i]));

  let written = 0;
  const rejects: Record<string, number> = {};
  for (const [id, out] of folded) {
    const input = byId.get(id)!;
    if ("rejected" in out) {
      rejects[out.rejected] = (rejects[out.rejected] ?? 0) + 1;
      continue;
    }
    written++;
    console.log(`\n${"─".repeat(78)}`);
    console.log(`${input.sourceId} · ${input.publishedAt} · confidence ${out.confidence.toFixed(2)}`);
    console.log(`TITLE   ${input.title.slice(0, 92)}`);
    console.log(`SOURCE  ${input.sourceText.slice(0, 300)}${input.sourceText.length > 300 ? "…" : ""}`);
    console.log(`\nTEMPLATE\n  ${out.body}`);
    console.log(`\nBASIS (verified present in source)\n  "${out.sourceBasis}"`);
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log(`${inputs.length} drafts · ${written} templates · ${inputs.length - written} rejected`);
  for (const [k, v] of Object.entries(rejects).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
  if (thin > 0) {
    console.log(
      `\n⚠ ${thin} of ${inputs.length} drafts had under 200 characters of source text.` +
        `\n  Promotion carries summaryEn ?? title, and summaryEn is almost always null,` +
        `\n  so the publisher's body (up to ${MAX_SOURCE_CHARS} chars, present on the item) never` +
        `\n  reaches the draft. Interpreting a bare headline is the hallucination case.`,
    );
  }
  console.log("\nNothing was written.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(String(err));
  await prisma.$disconnect();
  process.exit(1);
});
