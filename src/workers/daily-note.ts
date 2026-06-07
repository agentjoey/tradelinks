// Daily Note worker (daily-note-tick). Once a day, for each kind (brief, roundup)
// that clears its quality gate, run the editor→reviewer pipeline over the previous
// day's signal set and store the result. Default: store as `draft` for human
// review; set DAILY_NOTE_AUTOPUBLISH to publish straight away. A thin day simply
// produces no note (never a filler article).
import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { env } from "../config/env.js";
import { editorClient, reviewerClient, deepseekChat } from "../ai/client.js";
import { composeDailyNote, passesQualityGate, type DailyNoteKind } from "../daily/compose.js";
import { reviewNote } from "../daily/review.js";
import { gatherInputs, persistNote } from "../daily/db.js";
import { runDailyNoteTranslate } from "../daily/translate.js";
import { logger } from "../lib/logger.js";

const KINDS: DailyNoteKind[] = ["brief", "roundup"];

export interface DailyNoteResult {
  date: string;
  generated: { kind: DailyNoteKind; slug: string; status: string; removed: number }[];
  skipped: DailyNoteKind[];
}

/** UTC date string for "yesterday" (the day a morning run summarizes). */
function yesterday(): string {
  return new Date(Date.now() - 864e5).toISOString().slice(0, 10);
}

/**
 * One daily run for the given UTC date + language. Reusable directly (scripts) and
 * via the scheduled worker. Produces 0–2 notes depending on the day's signal mix.
 */
export async function runDailyNote(date = yesterday(), lang = "en"): Promise<DailyNoteResult> {
  const input = await gatherInputs(date, lang);
  const status: "draft" | "published" = env.DAILY_NOTE_AUTOPUBLISH ? "published" : "draft";
  const generated: DailyNoteResult["generated"] = [];
  const skipped: DailyNoteKind[] = [];

  for (const kind of KINDS) {
    if (!passesQualityGate(input, { kind, minItems: env.DAILY_NOTE_MIN_ITEMS })) {
      skipped.push(kind);
      continue;
    }
    try {
      const draft = await composeDailyNote(input, editorClient(), kind);
      const reviewed = await reviewNote(draft, input, reviewerClient());
      await persistNote(reviewed, status);
      generated.push({ kind, slug: reviewed.slug, status, removed: reviewed.removedClaims.length });
      logger.info(
        { date, lang, kind, slug: reviewed.slug, status, editor: reviewed.model, reviewer: reviewed.reviewModel, removed: reviewed.removedClaims.length },
        "daily-note generated",
      );
    } catch (e) {
      logger.error({ date, lang, kind, err: String(e) }, "daily-note generation failed");
    }
  }

  // Localize the freshly-written English notes into each target language (BL-041 P2).
  // Gated by the same TRANSLATE_ENABLED switch; needs DEEPSEEK_API_KEY.
  if (lang === "en" && env.TRANSLATE_ENABLED && env.DEEPSEEK_API_KEY) {
    const targets = env.TRANSLATE_TARGET_LANGS.split(",").map((s) => s.trim()).filter((l) => l && l !== "en");
    for (const target of targets) {
      const r = await runDailyNoteTranslate(date, target, deepseekChat, reviewerClient(), status);
      logger.info({ date, target, translated: r.translated.length, skipped: r.skipped }, "daily-note translate pass done");
    }
  }

  logger.info({ date, lang, generated: generated.length, skipped }, "daily-note run done");
  return { date, generated, skipped };
}

export function registerDailyNoteWorker(boss: PgBoss) {
  return boss.work(QUEUES.dailyNote, async () => {
    await runDailyNote();
  });
}
