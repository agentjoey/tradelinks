// v1 — 2026-06-03 — Stage 1.2 translate + summarize to English
// See docs/specs/ai-pipeline.md.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

export interface TranslateInput {
  title: string;
  lang: string;
  content?: string;
}

const SYSTEM = `You normalize cross-border e-commerce news to English.
Given a title (and optional content) in some language, produce:
- titleEn: an English title. If the source is already English, return null.
- summaryEn: a neutral 2-3 sentence English summary of the key facts.
Respond ONLY with JSON {"titleEn": string|null, "summaryEn": string}.`;

export function buildTranslatePrompt(input: TranslateInput): LlmCompleteOpts {
  const content = input.content ? `\nContent: ${input.content.slice(0, 1500)}` : "";
  return {
    system: SYSTEM,
    user: `Source language: ${input.lang}\nTitle: ${input.title}${content}`,
    json: true,
    maxTokens: 400,
  };
}

export const TranslateResultSchema = z.object({
  titleEn: z.string().nullable(),
  summaryEn: z.string(),
});
export type TranslateResult = z.infer<typeof TranslateResultSchema>;

export function parseTranslate(text: string): TranslateResult {
  return TranslateResultSchema.parse(extractJson(text));
}
