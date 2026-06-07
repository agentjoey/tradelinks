// src/daily/translate.ts
// Daily Note localization (BL-041 P2): translate a published English note into a
// target language, then run the existing reviewer to de-AI/localize, and persist
// it as its own (date, lang, kind) row with a language-specific slug.
import type { LlmClient } from "../ai/client.js";
import { buildNoteTranslatePrompt, parseNoteTranslation } from "../ai/prompts/translate-note.js";
import { glossaryBlock } from "../i18n/glossary.js";
import { slugify, type ComposedNote } from "./compose.js";
import { reviewNote } from "./review.js";
import { gatherInputs, getEnNote, persistNote } from "./db.js";
import { logger } from "../lib/logger.js";

export interface DailyTranslateResult {
  date: string;
  lang: string;
  translated: { kind: string; slug: string }[];
  skipped: string[];
}

const KINDS = ["brief", "roundup"] as const;

/** Translate one published English note (date, kind) into `lang` → ComposedNote. */
export async function translateNote(
  client: LlmClient,
  lang: string,
  enNote: NonNullable<Awaited<ReturnType<typeof getEnNote>>>,
): Promise<ComposedNote> {
  const opts = buildNoteTranslatePrompt(
    {
      title: enNote.title,
      dek: enNote.dek,
      bodyMarkdown: enNote.bodyMarkdown,
      keyTakeaways: enNote.keyTakeaways,
      metaDescription: enNote.metaDescription,
    },
    lang,
    glossaryBlock(lang),
  );
  const res = await client.complete(opts);
  const tr = parseNoteTranslation(res.text);
  return {
    date: enNote.date,
    lang,
    kind: enNote.kind as ComposedNote["kind"],
    slug: slugify(enNote.date, tr.title, lang),
    title: tr.title,
    dek: tr.dek,
    bodyMarkdown: tr.bodyMarkdown,
    keyTakeaways: tr.keyTakeaways,
    metaDescription: tr.metaDescription,
    tags: enNote.tags, // tags kept as-is (minor; not user-facing prose)
    citations: enNote.citations,
    sourceAlertIds: enNote.sourceAlertIds,
    model: `${client.name} (translate)`,
  };
}

/**
 * For each kind with a published English note on `date`, translate → review →
 * persist a `lang` note. `translateClient` does the translation; `reviewClient`
 * de-AIs/localizes (the existing reviewer). Idempotent via persistNote upsert.
 */
export async function runDailyNoteTranslate(
  date: string,
  lang: string,
  translateClient: LlmClient,
  reviewClient: LlmClient,
  status: "draft" | "published",
): Promise<DailyTranslateResult> {
  const input = await gatherInputs(date, lang);
  const translated: DailyTranslateResult["translated"] = [];
  const skipped: string[] = [];

  for (const kind of KINDS) {
    const enNote = await getEnNote(date, kind);
    if (!enNote) {
      skipped.push(kind);
      continue;
    }
    try {
      const composed = await translateNote(translateClient, lang, enNote);
      const reviewed = await reviewNote(composed, input, reviewClient);
      await persistNote(reviewed, status);
      translated.push({ kind, slug: reviewed.slug });
      logger.info({ date, lang, kind, slug: reviewed.slug }, "daily-note translated");
    } catch (e) {
      skipped.push(kind);
      logger.error({ date, lang, kind, err: String(e) }, "daily-note translation failed");
    }
  }
  return { date, lang, translated, skipped };
}
