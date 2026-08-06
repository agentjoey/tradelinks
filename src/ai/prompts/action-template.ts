/**
 * What a change means for the reader — the product's first-party content.
 *
 * `CanonicalChangeVersion` has carried `generalActionTemplate` plus its
 * `actionTemplateReviewedAt` / `ReviewedBy` pair since the Foundation. The slot
 * was designed and gated (`ACTION_TEMPLATE_REQUIRES_REVIEW` blocks publication
 * of an unreviewed template; the detail page renders one only alongside
 * reviewed primary-official evidence) and then left permanently null, because
 * promotion refuses to write prose it cannot ground.
 *
 * This fills it, under the same rule that governs the rest of the pipeline:
 * **restate and reason, never introduce**. Everything in a template must be
 * derivable from the source text supplied with the request. The model's own
 * recollection of Amazon or Shopify policy is exactly the failure mode to
 * exclude — it is plausible, unattributable, and wrong often enough to destroy
 * the product's only real asset.
 *
 * The guard is computable rather than stylistic: the model must quote the
 * phrase from the supplied text that carries its conclusion, and
 * `verifyGrounding` checks that the quote is actually present. A template whose
 * basis cannot be found in the source is discarded — no scoring, no benefit of
 * the doubt.
 */

import { z } from "zod";

import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";
import { confidenceField } from "../confidence.js";
import { BANNED_PHRASES } from "../writing/core.js";

/** Below this the template is not offered for review at all. */
export const TEMPLATE_CONFIDENCE_THRESHOLD = 0.7;

/** Longest source excerpt sent per item. Enough for a full changelog post. */
export const MAX_SOURCE_CHARS = 2600;

export interface TemplateInput {
  id: string;
  title: string;
  sourceId: string;
  publishedAt: string;
  /** The publisher's own text. Without it there is nothing to interpret. */
  sourceText: string;
}

const SYSTEM = `You write the "what this means for you" note on a US-market
intelligence entry, read by cross-border e-commerce sellers — merchants outside
the United States shipping CONSUMER GOODS to US buyers on Amazon US and
Shopify US.

ABSOLUTE RULE — use ONLY the supplied source text. You may restate it, explain
its mechanism, and draw out what it forces the seller to do. You may NOT add
facts from your own knowledge: no dates, thresholds, fees, rates or policy
details that are not in the text in front of you. If the text is too thin to
support a concrete note, set applies=false. A refusal is a correct answer and
costs nothing; an invented detail destroys the entry's credibility.

Set applies=false when the change does not actually require anything of such a
seller — an optional feature, a trade action on industrial goods they do not
ship, or a matter outside the US.

When applies=true, write for someone deciding whether to act today:
- whoIsAffected: which sellers, specifically. Not "all sellers" unless the
  source says so.
- whatChanges: the mechanism — what is now different and how it takes effect.
- whatToDo: the concrete next step. If the source names a deadline, say it.
- sourceBasis: the exact phrase from the source text that carries your
  conclusion, copied VERBATIM, 8 to 30 words. It is checked against the source
  automatically; a paraphrase fails the check and the note is discarded.

Each field is 1–2 sentences. Plain declaratives. No preamble, no summary
sentence, no legal advice. Banned: ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}.

Return ONLY JSON:
{"results":[{"id","applies","whoIsAffected","whatChanges","whatToDo","sourceBasis","confidence"}]}
For applies=false use empty strings for the four text fields.`;

export function buildActionTemplatePrompt(items: TemplateInput[]): LlmCompleteOpts {
  const blocks = items
    .map(
      (it) =>
        `### id=${it.id}\nsource: ${it.sourceId} · published ${it.publishedAt}\ntitle: ${it.title}\n` +
        `source text:\n${it.sourceText.slice(0, MAX_SOURCE_CHARS)}`,
    )
    .join("\n\n");
  return {
    system: SYSTEM,
    user: blocks,
    json: true,
    maxTokens: 400 * items.length + 600,
    temperature: 0.2,
  };
}

export const ActionTemplateSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      applies: z.boolean(),
      whoIsAffected: z.string(),
      whatChanges: z.string(),
      whatToDo: z.string(),
      sourceBasis: z.string(),
      confidence: confidenceField,
    }),
  ),
});
export type ActionTemplateResult = z.infer<typeof ActionTemplateSchema>["results"];

export function parseActionTemplates(text: string): ActionTemplateResult {
  return ActionTemplateSchema.parse(extractJson(text)).results;
}

/** Collapse whitespace and quote glyphs so a faithful quote is not failed on typography. */
function normalize(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Is the claimed basis really in the source?
 *
 * A substring check after normalising whitespace and smart punctuation. Not a
 * similarity score: a quote either appears or it does not, and anything softer
 * would let a confident paraphrase through — which is precisely the failure
 * this exists to catch.
 */
export function verifyGrounding(sourceText: string, sourceBasis: string): boolean {
  const basis = normalize(sourceBasis);
  if (basis.length < 20) return false; // too short to carry a conclusion
  return normalize(sourceText).includes(basis);
}

export interface TemplateDraft {
  id: string;
  body: string;
  confidence: number;
  sourceBasis: string;
}

export type TemplateRejection =
  | "NO_VERDICT"
  | "DOES_NOT_APPLY"
  | "LOW_CONFIDENCE"
  | "UNGROUNDED"
  | "EMPTY";

/**
 * Fold model output into templates, discarding everything unproven.
 *
 * Like the relevance gate, every uncertain path resolves to "no template". A
 * missing template costs a reader nothing — the entry still carries its
 * evidence and summary. A wrong one is the product asserting something false
 * about what a seller must do.
 */
export function foldActionTemplates(
  items: TemplateInput[],
  results: ActionTemplateResult,
  threshold: number = TEMPLATE_CONFIDENCE_THRESHOLD,
): Map<string, TemplateDraft | { rejected: TemplateRejection }> {
  const byId = new Map<string, ActionTemplateResult[number]>();
  for (const r of results) if (!byId.has(r.id)) byId.set(r.id, r);

  const out = new Map<string, TemplateDraft | { rejected: TemplateRejection }>();
  for (const item of items) {
    const r = byId.get(item.id);
    if (!r) { out.set(item.id, { rejected: "NO_VERDICT" }); continue; }
    if (!r.applies) { out.set(item.id, { rejected: "DOES_NOT_APPLY" }); continue; }
    if (r.confidence < threshold) { out.set(item.id, { rejected: "LOW_CONFIDENCE" }); continue; }
    if (!verifyGrounding(item.sourceText, r.sourceBasis)) {
      out.set(item.id, { rejected: "UNGROUNDED" });
      continue;
    }
    const body = [r.whoIsAffected, r.whatChanges, r.whatToDo]
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .join(" ");
    if (body === "") { out.set(item.id, { rejected: "EMPTY" }); continue; }
    out.set(item.id, { id: item.id, body, confidence: r.confidence, sourceBasis: r.sourceBasis });
  }
  return out;
}
