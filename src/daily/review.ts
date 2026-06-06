// Daily Note REVIEWER stage (BL-027). A second model (deepseek) fact-checks the
// editor's draft against the ORIGINAL grounded source set and strips any claim
// not supported by it — the bench showed every editor model injects outside
// facts (e.g. a "20–30% duty" or "€22 old threshold" that was never in the
// inputs). The reviewer only removes/neutralizes ungrounded assertions; it does
// not add new facts. Provenance (citations, source ids, editor model, tags) is
// carried from the draft unchanged — never sourced from the reviewer.
import { z } from "zod";
import type { LlmClient } from "../ai/client.js";
import { extractJson } from "../ai/json.js";
import { slugify, type ComposedNote, type DailyNoteInput } from "./compose.js";

export interface ReviewedNote extends ComposedNote {
  reviewModel: string;
  removedClaims: string[]; // claims stripped as unsupported by the source set
  revised: boolean; // true if the reviewer changed text or removed any claim
}

const SYSTEM = `You are the managing editor / fact-checker for ${"TradeLinks"}, a cross-border
e-commerce outlet. You are given a SOURCE SET (the only ground truth) and a DRAFT written by an
editor. You have TWO jobs:

JOB 1 — TRUTH: Remove or neutralize any statement that asserts a specific fact (a number, percentage,
date, threshold, company, statistic, or named event) NOT supported by the SOURCE SET. Never soften a
grounded fact. List each removed claim in removed_claims.

JOB 2 — VOICE (de-AI the prose): Rewrite anything that reads like generic AI writing into the
concrete, confident voice of a human analyst. Cut clichés and filler tics ("In conclusion",
"Moreover", "Furthermore", "It's important to note", "game-changer", "navigate the landscape",
"a testament to"), empty intensifiers used without a number, hedging, and tidy 3-part listicles.
Vary sentence rhythm. Keep it specific. Do NOT add any new facts while doing this — rephrase, don't
embellish. Preserve the draft's language (${"same language as the draft"}) and overall structure.

Respond ONLY with JSON:
{"title","dek","body_markdown","key_takeaways":[..],"meta_description","removed_claims":[..]}
where removed_claims lists each ungrounded claim you removed (empty array if none).`;

const ReviewSchema = z.object({
  title: z.string(),
  dek: z.string().default(""),
  body_markdown: z.string(),
  key_takeaways: z.array(z.string()).default([]),
  meta_description: z.string().default(""),
  removed_claims: z.array(z.string()).default([]),
});

function sourceFacts(input: DailyNoteInput): string {
  const lines: string[] = [`Date: ${input.date}`];
  for (const a of input.alerts) {
    lines.push(`- ALERT [${a.category}/${a.regions.join("/") || "global"}] ${a.title}` + (a.summary ? ` — ${a.summary}` : "") + (a.actionRequired ? ` (action: ${a.actionRequired})` : ""));
  }
  for (const s of input.signals) lines.push(`- SIGNAL "${s.keyword}" ${s.originRegion} → ${s.spreadingTo.join("/")} (conf ${s.confidence.toFixed(2)})`);
  for (const r of input.radar) lines.push(`- RADAR [${r.kind}] ${r.title}${r.likes != null ? ` (${r.likes} likes)` : ""}`);
  return lines.join("\n");
}

function draftBlock(note: ComposedNote): string {
  return [
    `TITLE: ${note.title}`,
    `DEK: ${note.dek}`,
    `BODY:\n${note.bodyMarkdown}`,
    `KEY TAKEAWAYS:\n${note.keyTakeaways.map((t) => `- ${t}`).join("\n")}`,
    `META: ${note.metaDescription}`,
  ].join("\n\n");
}

/** Fact-check + clean one draft. Returns a ReviewedNote ready for human approval. */
export async function reviewNote(note: ComposedNote, input: DailyNoteInput, client: LlmClient): Promise<ReviewedNote> {
  const res = await client.complete({
    system: SYSTEM,
    user: `SOURCE SET (ground truth):\n${sourceFacts(input)}\n\n--- DRAFT TO REVIEW ---\n${draftBlock(note)}`,
    json: true,
    maxTokens: 4000,
    temperature: 0,
  });
  const r = ReviewSchema.parse(extractJson(res.text));

  const changed =
    r.removed_claims.length > 0 ||
    r.title !== note.title ||
    r.body_markdown !== note.bodyMarkdown ||
    r.dek !== note.dek ||
    r.meta_description !== note.metaDescription ||
    r.key_takeaways.join("") !== note.keyTakeaways.join("");

  return {
    // editor-side provenance carried through unchanged
    date: note.date,
    lang: note.lang,
    kind: note.kind,
    tags: note.tags,
    citations: note.citations,
    sourceAlertIds: note.sourceAlertIds,
    model: note.model,
    // reviewer-cleaned content
    title: r.title,
    dek: r.dek,
    bodyMarkdown: r.body_markdown,
    keyTakeaways: r.key_takeaways,
    metaDescription: r.meta_description,
    slug: slugify(note.date, r.title, note.lang),
    // review audit trail
    reviewModel: res.model,
    removedClaims: r.removed_claims,
    revised: changed,
  };
}
