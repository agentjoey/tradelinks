/**
 * Daily-Note production pipeline demo (BL-027): EDITOR (gemini flash Flex) →
 * REVIEWER (deepseek fact-check). Writes the FINAL reviewed article plus the list
 * of claims the reviewer stripped, EN + ZH, so the human approver can eyeball both
 * the output and the fact-check audit trail.
 *
 * Run: pnpm tsx scripts/daily-note-pipeline.ts
 * Output: ./bench-out/daily-note/PIPELINE-<lang>.md
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { editorClient, reviewerClient } from "../src/ai/client.js";
import { composeDailyNote, type DailyNoteInput, type DailyNoteKind } from "../src/daily/compose.js";
import { reviewNote } from "../src/daily/review.js";
import { datasets, kindFor } from "./daily-demo-data.js";

const OUT = "bench-out/daily-note";

const DATASET = process.argv[2] ?? "policy";
const baseInput = datasets[DATASET];
if (!baseInput) {
  console.error(`unknown dataset "${DATASET}" — use: policy | product`);
  process.exit(1);
}
const KIND: DailyNoteKind = kindFor[DATASET] ?? "brief";

async function run(lang: "en" | "zh") {
  const input: DailyNoteInput = { ...baseInput, lang };

  const tE = Date.now();
  const draft = await composeDailyNote(input, editorClient(), KIND);
  const eMs = Date.now() - tE;

  const tR = Date.now();
  const final = await reviewNote(draft, input, reviewerClient());
  const rMs = Date.now() - tR;

  const md = `# ${final.title}\n\n*${final.dek}*\n\n${final.bodyMarkdown}\n\n## Key takeaways\n${final.keyTakeaways.map((t) => `- ${t}`).join("\n")}\n\n**Meta:** ${final.metaDescription}\n\n**Tags:** ${final.tags.join(", ")}\n\n**Citations:**\n${final.citations.map((c) => `- [${c.title}](${c.url})`).join("\n")}\n\n---\n\n### 🔍 Reviewer audit (NOT published — internal)\n- Editor model: ${final.model} (${eMs}ms)\n- Reviewer model: ${final.reviewModel} (${rMs}ms)\n- Revised: ${final.revised}\n- Claims removed as ungrounded (${final.removedClaims.length}):\n${final.removedClaims.length ? final.removedClaims.map((c) => `  - ${c}`).join("\n") : "  - (none)"}\n`;

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/PIPELINE-${DATASET}-${lang}.md`, md);
  console.log(`✓ [${lang}] editor ${eMs}ms → reviewer ${rMs}ms · removed ${final.removedClaims.length} claim(s) · "${final.title}"`);
  if (final.removedClaims.length) for (const c of final.removedClaims) console.log(`    ✂︎ ${c}`);
}

async function main() {
  console.log(`dataset = ${DATASET} · kind = ${KIND}`);
  for (const lang of ["en", "zh"] as const) await run(lang);
  console.log(`\nFinal reviewed articles + audit: ./${OUT}/PIPELINE-${DATASET}-en.md , PIPELINE-${DATASET}-zh.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
