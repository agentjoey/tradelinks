/**
 * Does a cross-border seller have to act on this?
 *
 * The promotion gate answers "is this source authoritative and current?" — it
 * cannot answer "does this matter to the reader". Those come apart badly in
 * production: the Shopify changelog is an official, current, primary-evidence
 * source that mostly announces optional features ("Cart sharing on Shopify
 * POS"), and the Federal Register is official and current while mostly
 * carrying antidumping cases on industrial goods (trailers, steel wire,
 * hydraulic cylinders) that no consumer-goods seller must act on.
 *
 * Neither is separable by keyword. "Van-Type Trailers from Mexico" lands
 * squarely in IMPORT_CUSTOMS by topic; "Add a bank account for every payout
 * currency" reads like a fees-and-payments change. The distinction is
 * editorial judgment, so it is asked as a judgment.
 *
 * The criterion is deliberately narrow — **mandatory or automatic**. A change
 * qualifies when the seller must do something, or when something happens to
 * them whether they want it or not. A new capability they may adopt is not a
 * change to act on, however useful. That single test is what separates a fee
 * increase from a new POS feature, and a children's-product safety rule from a
 * hydraulic-cylinder duty.
 */

import { z } from "zod";

import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

/** Below this the item is not promoted. Uncertainty is not a yes. */
export const RELEVANCE_CONFIDENCE_THRESHOLD = 0.7;

export interface RelevanceItem {
  id: string;
  title: string;
  /** Source-supplied summary or snippet; improves precision markedly. */
  snippet?: string;
  /** Contract source id (A02, B03, …) — context, never the decision. */
  sourceId: string;
}

const SYSTEM = `You decide what reaches a US-market intelligence feed read by
cross-border e-commerce sellers — merchants outside the United States who ship
CONSUMER GOODS to US buyers on Amazon US and Shopify US.

THE TEST — is the change mandatory or automatic for such a seller?
KEEP only if the seller must do something, or something happens to them whether
they want it or not:
  - fees, payout terms, commissions, or pricing they will be charged
  - listing, account-health or compliance rules they must satisfy
  - deadlines, deprecations or migrations they must complete
  - import duties, tariffs or customs procedures on CONSUMER GOODS
  - safety recalls, product standards or labeling duties on CONSUMER GOODS
  - privacy or consumer-protection obligations binding on sellers

DROP everything else, including things that sound important:
  - a new optional feature or capability, however useful ("now available",
    "you can now", "introducing", "support for") — opting in is a choice,
    not an obligation
  - developer, API, theme, storefront or admin-UI changes
  - marketing, partnership, funding or event announcements
  - trade actions on INDUSTRIAL or BULK goods a consumer-goods seller does not
    ship: steel, wire, machinery, vehicles, trailers, chemicals, construction
    materials, agricultural commodities
  - matters outside the United States
  - analytics, reporting or dashboard changes

Judge the change itself, not the prestige of its source. An official
government notice about hydraulic cylinders is still irrelevant here, and an
official platform post about a new POS feature is still optional.

Return ONLY JSON: {"results":[{"id","keep","reason","confidence"}]}
- reason: under 15 words, naming the deciding fact
- confidence: 0..1, your calibrated certainty. Below ${RELEVANCE_CONFIDENCE_THRESHOLD} the item is dropped, so
  use a low value when genuinely unsure rather than guessing either way.`;

export function buildSellerRelevancePrompt(items: RelevanceItem[]): LlmCompleteOpts {
  const list = items
    .map((it) => {
      const snippet = it.snippet ? ` | ${it.snippet.replace(/\s+/g, " ").slice(0, 240)}` : "";
      return `- id=${it.id} | source=${it.sourceId} | ${it.title}${snippet}`;
    })
    .join("\n");
  return {
    system: SYSTEM,
    user: `Items:\n${list}`,
    json: true,
    // ~40 tokens per verdict plus envelope; a 20-item batch fits comfortably.
    maxTokens: 1400,
    // Deterministic judging: the same item should not flip between runs.
    temperature: 0,
  };
}

export const SellerRelevanceSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      keep: z.boolean(),
      reason: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type SellerRelevanceResult = z.infer<typeof SellerRelevanceSchema>["results"];

export function parseSellerRelevance(text: string): SellerRelevanceResult {
  return SellerRelevanceSchema.parse(extractJson(text)).results;
}

export interface RelevanceVerdict {
  keep: boolean;
  reason: string;
  confidence: number;
}

/**
 * Fold model output into a verdict per requested id.
 *
 * Every unmapped case resolves to `keep: false`. That is the whole safety
 * property: an item the model did not judge, judged with low confidence, or
 * hallucinated an id for is not promoted. The pre-existing Stage-1 prefilter
 * defaults the other way (`?? { keep: true }`), which is right for a noise
 * filter over an internal queue and wrong for a gate on a public claim.
 */
export function foldRelevance(
  items: RelevanceItem[],
  results: SellerRelevanceResult,
  threshold: number = RELEVANCE_CONFIDENCE_THRESHOLD,
): Map<string, RelevanceVerdict> {
  const byId = new Map<string, SellerRelevanceResult[number]>();
  for (const r of results) {
    // First verdict wins; a duplicated id must not let a later "keep" override
    // an earlier drop.
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const out = new Map<string, RelevanceVerdict>();
  for (const item of items) {
    const r = byId.get(item.id);
    if (!r) {
      out.set(item.id, { keep: false, reason: "NO_VERDICT", confidence: 0 });
      continue;
    }
    if (!r.keep) {
      out.set(item.id, { keep: false, reason: r.reason, confidence: r.confidence });
      continue;
    }
    if (r.confidence < threshold) {
      out.set(item.id, {
        keep: false,
        reason: `LOW_CONFIDENCE(${r.confidence.toFixed(2)}): ${r.reason}`,
        confidence: r.confidence,
      });
      continue;
    }
    out.set(item.id, { keep: true, reason: r.reason, confidence: r.confidence });
  }
  return out;
}
