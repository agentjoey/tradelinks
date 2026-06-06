import type { AlertRow } from "./alerts";

export type CardMode = "image" | "compact";

/** A usable image → image card; otherwise a compact row (decision C: no fake images). */
export function cardMode(item: { imageUrl?: string | null }): CardMode {
  return item.imageUrl && item.imageUrl.trim() !== "" ? "image" : "compact";
}

const tsOf = (a: AlertRow) => new Date(a.publishedAt ?? a.createdAt).getTime();
const byUrgencyThenRecency = (x: AlertRow, y: AlertRow) =>
  (y.urgencyScore - x.urgencyScore) || (tsOf(y) - tsOf(x));

/** Top urgency≥4 alert within `windowMs` (default 24h), urgency desc then recency. Null if none. */
export function pickBreaking(alerts: AlertRow[], now: number, windowMs = 24 * 3_600_000): AlertRow | null {
  const fresh = alerts.filter((a) => a.urgencyScore >= 4 && now - tsOf(a) <= windowMs);
  return fresh.length ? [...fresh].sort(byUrgencyThenRecency)[0] : null;
}

/** First `n` alerts by urgency desc then recency, excluding `excludeId`. */
export function topAlerts(alerts: AlertRow[], n: number, excludeId?: string): AlertRow[] {
  return [...alerts].filter((a) => a.id !== excludeId).sort(byUrgencyThenRecency).slice(0, n);
}
