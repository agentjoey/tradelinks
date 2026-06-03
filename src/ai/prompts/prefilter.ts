// v1 — 2026-06-03 — Stage 1.1 pre-filter (drop noise)
// See docs/specs/ai-pipeline.md. Batched to save tokens.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

export interface PrefilterItem {
  id: string;
  title: string;
  snippet?: string;
}

const SYSTEM = `You are a filter for a cross-border e-commerce intelligence platform.
Decide whether each item is worth keeping. KEEP items about: platform policy
changes, regulations/customs/tax/compliance, logistics/freight, product or
category trends, or notable industry developments relevant to cross-border
sellers. DROP: pure advertisements/promos with no information, off-topic items
(not commerce/regulation/logistics/trends), and obvious low-value chatter.
Respond ONLY with a JSON object {"results":[{"id","keep","reason"}]}.`;

export function buildPrefilterPrompt(items: PrefilterItem[]): LlmCompleteOpts {
  const list = items
    .map((it) => `- id=${it.id} | ${it.title}${it.snippet ? ` | ${it.snippet.slice(0, 200)}` : ""}`)
    .join("\n");
  return {
    system: SYSTEM,
    user: `Items:\n${list}`,
    json: true,
    maxTokens: 1024,
  };
}

export const PrefilterResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      keep: z.boolean(),
      reason: z.string(),
    }),
  ),
});
export type PrefilterResult = z.infer<typeof PrefilterResultSchema>["results"];

export function parsePrefilter(text: string): PrefilterResult {
  return PrefilterResultSchema.parse(extractJson(text)).results;
}
