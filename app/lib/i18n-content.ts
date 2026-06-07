// app/lib/i18n-content.ts
import type { AlertRow } from "./alerts";
import type { Lang } from "./i18n";
import { getAlertTranslations } from "../../src/i18n/db.js";

type AlertFieldsT = { title?: unknown; summary?: unknown; actionRequired?: unknown };

/** Overlay translated fields onto an alert; per-field English fallback. Pure. */
export function applyAlertTranslation(a: AlertRow, t: AlertFieldsT | undefined): AlertRow {
  if (!t) return a;
  return {
    ...a,
    title: typeof t.title === "string" && t.title ? t.title : a.title,
    summary: typeof t.summary === "string" && t.summary ? t.summary : a.summary,
    actionRequired:
      typeof t.actionRequired === "string" && t.actionRequired ? t.actionRequired : a.actionRequired,
  };
}

/** Localize a list of alerts for `lang`. en → unchanged; zh → fetch + overlay. */
export async function localizeAlerts(alerts: AlertRow[], lang: Lang): Promise<AlertRow[]> {
  if (lang === "en" || alerts.length === 0) return alerts;
  const map = await getAlertTranslations(alerts.map((a) => a.id), lang);
  return alerts.map((a) => applyAlertTranslation(a, map.get(a.id) as AlertFieldsT | undefined));
}
