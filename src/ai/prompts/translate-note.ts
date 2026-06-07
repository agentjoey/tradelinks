// src/ai/prompts/translate-note.ts
// Translate a full Daily Note into a target language, preserving markdown structure.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

export interface NoteSource {
  title: string;
  dek: string;
  bodyMarkdown: string;
  keyTakeaways: string[];
  metaDescription: string;
}

export function buildNoteTranslatePrompt(
  src: NoteSource,
  lang: string,
  glossary: string,
): LlmCompleteOpts {
  const system =
    `You are a professional cross-border e-commerce editor translating an article into ` +
    `language code "${lang}" (Simplified Chinese for zh). Produce natural, idiomatic prose — ` +
    `no translationese, no added or removed facts. PRESERVE the markdown structure exactly ` +
    `(headings, lists, links, emphasis); translate only the human-readable text. Keep proper ` +
    `nouns, brand names, URLs and numbers intact. ` +
    `Respond ONLY with JSON {"title": string, "dek": string, "body_markdown": string, ` +
    `"key_takeaways": string[], "meta_description": string}.`;
  const glossaryPart = glossary ? `\n\n${glossary}` : "";
  const user =
    `Title: ${src.title}\n` +
    `Dek: ${src.dek}\n` +
    `KeyTakeaways:\n${src.keyTakeaways.map((k) => `- ${k}`).join("\n")}\n` +
    `MetaDescription: ${src.metaDescription}\n\n` +
    `BodyMarkdown:\n${src.bodyMarkdown}` +
    glossaryPart;
  return { system, user, json: true, maxTokens: 4000 };
}

const NoteTranslationSchema = z.object({
  title: z.string(),
  dek: z.string().default(""),
  body_markdown: z.string(),
  key_takeaways: z.array(z.string()).default([]),
  meta_description: z.string().default(""),
});

export interface NoteTranslation {
  title: string;
  dek: string;
  bodyMarkdown: string;
  keyTakeaways: string[];
  metaDescription: string;
}

export function parseNoteTranslation(text: string): NoteTranslation {
  const p = NoteTranslationSchema.parse(extractJson(text));
  return {
    title: p.title,
    dek: p.dek,
    bodyMarkdown: p.body_markdown,
    keyTakeaways: p.key_takeaways,
    metaDescription: p.meta_description,
  };
}
