// src/workers/translate.ts
// translate-content-tick: materialize zh (and any TRANSLATE_TARGET_LANGS) versions
// of recently-published Wire alerts into the Translation table. Idempotent via
// sourceHash; gated off by default (TRANSLATE_ENABLED) for zero cost.
import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { env } from "../config/env.js";
import { deepseekChat } from "../ai/client.js";
import { logger } from "../lib/logger.js";
import {
  findUntranslatedAlerts,
  upsertTranslation,
  alertEntityId,
} from "../i18n/db.js";
import { sourceHashOf, translateAlertFields } from "../i18n/translate-content.js";

export interface TranslateRunResult {
  enabled: boolean;
  perLang: { lang: string; translated: number; failed: number }[];
}

function targetLangs(): string[] {
  return env.TRANSLATE_TARGET_LANGS.split(",").map((s) => s.trim()).filter(Boolean);
}

/** One translation pass over all target langs. Reusable from scripts + worker. */
export async function runTranslate(): Promise<TranslateRunResult> {
  if (!env.TRANSLATE_ENABLED || !env.DEEPSEEK_API_KEY) {
    logger.info("translate-tick: disabled (TRANSLATE_ENABLED off or no DEEPSEEK_API_KEY)");
    return { enabled: false, perLang: [] };
  }
  const client = deepseekChat;
  const perLang: TranslateRunResult["perLang"] = [];

  for (const lang of targetLangs()) {
    const candidates = await findUntranslatedAlerts(
      lang,
      env.TRANSLATE_LOOKBACK_DAYS,
      env.TRANSLATE_MAX_PER_RUN,
      sourceHashOf,
    );
    let translated = 0;
    let failed = 0;
    for (const a of candidates) {
      const fields = { title: a.title, summary: a.summary, actionRequired: a.actionRequired };
      try {
        const tr = await translateAlertFields(client, fields, lang);
        await upsertTranslation(
          "alert",
          alertEntityId(a.id),
          lang,
          tr as unknown as Record<string, unknown>,
          sourceHashOf(fields),
          client.name,
        );
        translated++;
      } catch (err) {
        failed++;
        logger.warn({ err, alertId: a.id, lang }, "translate-tick: alert translation failed");
      }
    }
    logger.info({ lang, translated, failed, candidates: candidates.length }, "translate-tick: lang done");
    perLang.push({ lang, translated, failed });
  }
  return { enabled: true, perLang };
}

export async function registerTranslateWorker(boss: PgBoss): Promise<void> {
  await boss.work(QUEUES.translate, async () => {
    await runTranslate();
  });
}
