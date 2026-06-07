// src/i18n/db.ts
import { prisma } from "../db/client.js";
import type { AlertFields } from "../ai/prompts/translate-content.js";

export interface UntranslatedAlert extends AlertFields {
  id: string;
}

/** stable Translation key for an alert. */
export function alertEntityId(id: string): string {
  return `alert:${id}`;
}

/**
 * Published alerts from the last `lookbackDays` that have no current `lang`
 * translation (missing row, or stored sourceHash != current source). Capped at
 * `limit`. Returns the source fields the worker needs to translate.
 */
export async function findUntranslatedAlerts(
  lang: string,
  lookbackDays: number,
  limit: number,
  currentHash: (f: AlertFields) => string,
): Promise<UntranslatedAlert[]> {
  const since = new Date(Date.now() - lookbackDays * 864e5);
  const alerts = await prisma.alert.findMany({
    where: { status: "published", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 500, // scan window; we filter then cap to `limit`
    select: { id: true, title: true, summary: true, actionRequired: true },
  });
  const ids = alerts.map((a) => alertEntityId(a.id));
  const existing = await prisma.translation.findMany({
    where: { entityType: "alert", lang, entityId: { in: ids } },
    select: { entityId: true, sourceHash: true },
  });
  const byKey = new Map(existing.map((t) => [t.entityId, t.sourceHash]));
  const out: UntranslatedAlert[] = [];
  for (const a of alerts) {
    const fields = { title: a.title, summary: a.summary, actionRequired: a.actionRequired };
    const stored = byKey.get(alertEntityId(a.id));
    if (stored === undefined || stored !== currentHash(fields)) {
      out.push({ id: a.id, ...fields });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Upsert a translation row (unique on entityType+entityId+lang). */
export async function upsertTranslation(
  entityType: string,
  entityId: string,
  lang: string,
  fields: Record<string, unknown>,
  sourceHash: string,
  model: string | null,
): Promise<void> {
  await prisma.translation.upsert({
    where: { entityType_entityId_lang: { entityType, entityId, lang } },
    create: { entityType, entityId, lang, fields, sourceHash, model },
    update: { fields, sourceHash, model },
  });
}

/** Fetch translations for many alert ids → Map<alertId, fields>. Read path. */
export async function getAlertTranslations(
  ids: string[],
  lang: string,
): Promise<Map<string, Record<string, unknown>>> {
  if (ids.length === 0) return new Map();
  const keys = ids.map(alertEntityId);
  const rows = await prisma.translation.findMany({
    where: { entityType: "alert", lang, entityId: { in: keys } },
    select: { entityId: true, fields: true },
  });
  const out = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    out.set(r.entityId.replace(/^alert:/, ""), r.fields as Record<string, unknown>);
  }
  return out;
}
