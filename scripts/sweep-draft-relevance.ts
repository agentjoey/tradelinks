/**
 * Apply the seller-relevance gate to drafts that predate it.
 *
 * The 122 drafts in the review queue were promoted before the gate existed, so
 * they carry the noise the gate was built to stop. This re-judges them with
 * the same prompt, same model and same fail-closed fold as the live pipeline,
 * and removes the ones judged irrelevant.
 *
 *   pnpm tsx scripts/sweep-draft-relevance.ts            # dry run (default)
 *   pnpm tsx scripts/sweep-draft-relevance.ts --apply
 *
 * Safety properties, in order of importance:
 *   - dry-run is the default; --apply is the only way to write
 *   - a published, current or reviewed version is never touched, whatever the
 *     model says — this only ever removes unreviewed drafts
 *   - an absent verdict keeps the draft: the classifier being unavailable is
 *     not evidence that a change is irrelevant
 *   - the source cluster is marked REJECTED in the same transaction, so a
 *     removed draft is not simply re-promoted on the next slot
 */

import { env } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";
import { minimaxJudge } from "../src/ai/client.js";
import {
  buildSellerRelevancePrompt,
  foldRelevance,
  parseSellerRelevance,
  isSettledDrop,
  type RelevanceItem,
} from "../src/ai/prompts/seller-relevance.js";

const BATCH = 20;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (!env.MINIMAX_API_KEY) {
    console.error("MINIMAX_API_KEY is not set — refusing to sweep without a judge.");
    process.exit(2);
  }

  // Unreviewed drafts only. The where-clause is the real guard: even a wrong
  // verdict cannot reach a published change, because published changes are
  // not in this set.
  const drafts = await prisma.canonicalChangeVersion.findMany({
    where: {
      editorialStatus: "DRAFT",
      isCurrent: false,
      reviewedAt: null,
    },
    select: {
      id: true,
      title: true,
      summary: true,
      canonicalChangeId: true,
      canonicalChange: { select: { id: true, slug: true, clusterId: true } },
      evidence: { select: { sourceId: true }, take: 1 },
    },
  });

  if (drafts.length === 0) {
    console.log("No unreviewed drafts to sweep.");
    await prisma.$disconnect();
    return;
  }

  const items: RelevanceItem[] = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    snippet: d.summary !== d.title ? d.summary : undefined,
    sourceId: d.evidence[0]?.sourceId ?? "unknown",
  }));

  const verdicts = new Map<string, { keep: boolean; reason: string; confidence: number }>();
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    process.stderr.write(`judging ${i + 1}-${i + chunk.length} of ${items.length}\r`);
    try {
      const res = await minimaxJudge.complete(buildSellerRelevancePrompt(chunk));
      for (const [id, v] of foldRelevance(chunk, parseSellerRelevance(res.text))) {
        verdicts.set(id, v);
      }
    } catch (err) {
      console.error(`\nbatch ${i} failed (${String(err).slice(0, 80)}) — its drafts are kept`);
    }
  }
  process.stderr.write("\n");

  const byId = new Map(drafts.map((d) => [d.id, d]));
  // Deletion requires a confident drop. An absent verdict (classifier
  // unavailable) or an uncertain one (the model did not know) leaves the draft
  // alone — a human can still reject it, and that is the reversible path.
  const toRemove = drafts.filter((d) => {
    const v = verdicts.get(d.id);
    return v != null && isSettledDrop(v);
  });
  const kept = drafts.filter((d) => verdicts.get(d.id)?.keep);
  const unjudged = drafts.filter((d) => {
    const v = verdicts.get(d.id);
    return v == null || (!v.keep && !isSettledDrop(v));
  });

  console.log(`\n=== KEEP (${kept.length}) ===`);
  for (const d of kept) {
    const v = verdicts.get(d.id)!;
    console.log(`  [${v.confidence.toFixed(2)}] ${d.title.slice(0, 70)}\n         └─ ${v.reason}`);
  }
  if (unjudged.length > 0) {
    console.log(`\n=== UNCERTAIN — kept by default (${unjudged.length}) ===`);
    for (const d of unjudged) console.log(`  ${d.title.slice(0, 70)}`);
  }
  console.log(`\n=== REMOVE (${toRemove.length}) ===`);
  for (const d of toRemove) {
    const v = verdicts.get(d.id)!;
    console.log(`  [${v.confidence.toFixed(2)}] ${d.title.slice(0, 70)}\n         └─ ${v.reason}`);
  }

  console.log(
    `\n${drafts.length} drafts · keep ${kept.length} · remove ${toRemove.length}` +
      ` · unjudged ${unjudged.length}`,
  );

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to remove.");
    await prisma.$disconnect();
    return;
  }

  let removed = 0;
  for (const d of toRemove) {
    const reason = verdicts.get(d.id)!.reason;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.evidenceRecord.deleteMany({ where: { changeVersionId: d.id } });
        await tx.canonicalChangeVersion.delete({ where: { id: d.id } });
        // Only drop the change when this was its last version.
        const left = await tx.canonicalChangeVersion.count({
          where: { canonicalChangeId: d.canonicalChangeId },
        });
        if (left === 0) {
          await tx.canonicalChange.delete({ where: { id: d.canonicalChangeId } });
          // Settle the cluster in the same transaction, or the next slot
          // simply re-promotes what we just removed.
          await tx.evidenceCluster.update({
            where: { id: d.canonicalChange.clusterId },
            data: { status: "REJECTED" },
          });
        }
      }, { maxWait: 30000, timeout: 60000 });
      removed++;
    } catch (err) {
      console.error(`  failed: ${d.canonicalChange.slug} — ${String(err).slice(0, 90)}`);
    }
  }
  console.log(`\nRemoved ${removed} of ${toRemove.length}. ${kept.length + unjudged.length} drafts remain.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(String(err));
  await prisma.$disconnect();
  process.exit(1);
});
