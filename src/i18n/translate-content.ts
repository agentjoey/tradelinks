// src/i18n/translate-content.ts
import { createHash } from "node:crypto";
import type { LlmClient } from "../ai/client.js";
import {
  buildAlertTranslatePrompt,
  parseAlertTranslation,
  type AlertFields,
  type AlertTranslation,
} from "../ai/prompts/translate-content.js";
import { glossaryBlock } from "./glossary.js";

/** Stable sha256 of the source fields (sorted keys → order-independent). */
export function sourceHashOf(fields: AlertFields): string {
  const canonical = JSON.stringify({
    title: fields.title,
    summary: fields.summary,
    actionRequired: fields.actionRequired,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Translate one alert's fields with the given client. Throws on parse failure. */
export async function translateAlertFields(
  client: LlmClient,
  fields: AlertFields,
  lang: string,
): Promise<AlertTranslation> {
  const opts = buildAlertTranslatePrompt(fields, lang, glossaryBlock(lang));
  const res = await client.complete(opts);
  return parseAlertTranslation(res.text);
}
