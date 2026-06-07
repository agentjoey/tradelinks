// src/ai/prompts/translate-content.ts
// Translate a published alert's fields into a target language. Structure-preserving,
// glossary-bound. Mirrors the shape of src/ai/prompts/translate.ts.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

export interface AlertFields {
  title: string;
  summary: string;
  actionRequired: string | null;
}

export function buildAlertTranslatePrompt(
  fields: AlertFields,
  lang: string,
  glossary: string,
): LlmCompleteOpts {
  const system =
    `You are a professional cross-border e-commerce translator. Translate the given ` +
    `alert fields into language code "${lang}" (Simplified Chinese for zh). Keep it ` +
    `accurate, natural and concise — no translationese, no added commentary. Preserve ` +
    `proper nouns, brand names and numbers. ` +
    `Respond ONLY with JSON {"title": string, "summary": string, "actionRequired": string|null}. ` +
    `If the source actionRequired is "(none)", return null.`;
  const glossaryPart = glossary ? `\n\n${glossary}` : "";
  const user =
    `Title: ${fields.title}\n` +
    `Summary: ${fields.summary}\n` +
    `ActionRequired: ${fields.actionRequired ?? "(none)"}` +
    glossaryPart;
  return { system, user, json: true, maxTokens: 700 };
}

export const AlertTranslationSchema = z.object({
  title: z.string(),
  summary: z.string(),
  actionRequired: z.string().nullable(),
});
export type AlertTranslation = z.infer<typeof AlertTranslationSchema>;

export function parseAlertTranslation(text: string): AlertTranslation {
  return AlertTranslationSchema.parse(extractJson(text));
}
