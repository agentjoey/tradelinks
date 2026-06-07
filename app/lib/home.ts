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
  const [top] = [...fresh].sort(byUrgencyThenRecency);
  return top ?? null;
}

/** First `n` alerts by urgency desc then recency, excluding `excludeId`. */
export function topAlerts(alerts: AlertRow[], n: number, excludeId?: string): AlertRow[] {
  return [...alerts].filter((a) => a.id !== excludeId).sort(byUrgencyThenRecency).slice(0, n);
}

const hasImg = (a: AlertRow) => !!(a.imageUrl && a.imageUrl.trim() !== "");

/**
 * The lead-hero alert: the top story to feature with a big image. Prefers alerts
 * that actually have an image (the hero is image-forward), then urgency, then
 * recency — within `windowMs` (default 48h). NOT limited to urgency≥4: a high
 * editorial story qualifies, not only 预警. Null when there are no recent alerts.
 */
export function pickHero(alerts: AlertRow[], now: number, windowMs = 48 * 3_600_000): AlertRow | null {
  const fresh = alerts.filter((a) => now - tsOf(a) <= windowMs);
  const [top] = [...fresh].sort(
    (x, y) =>
      (Number(hasImg(y)) - Number(hasImg(x))) ||
      (y.urgencyScore - x.urgencyScore) ||
      (tsOf(y) - tsOf(x)),
  );
  return top ?? null;
}

export type LatestKind = "wire" | "radar" | "x";
export interface LatestItem {
  kind: LatestKind;
  time: number;
  title: string;
  href: string;
  author?: string;
  tier?: number;
}

interface ViralLite { product: string; link: string; likes: number; createdAt: Date; author?: string | null }
interface TopicLite { headline: string; link: string; createdAt: Date; author?: string | null }

/**
 * The live "Latest" rail: Wire alerts + viral-X products + X hot-topics merged
 * into one chronological stream (newest first), capped at `n`. Each row is tagged
 * with its `kind` so the UI can colour-code it. Amazon bestsellers carry no
 * per-item time, so they stay out of Latest (still shown in the Radar band).
 */
export function buildLatest(alerts: AlertRow[], viral: ViralLite[], topics: TopicLite[], n: number): LatestItem[] {
  const items: LatestItem[] = [
    ...alerts.map((a): LatestItem => ({
      kind: "wire", time: tsOf(a), title: a.title, href: a.sourceUrls[0] ?? "#", tier: a.urgencyScore,
    })),
    ...viral.map((v): LatestItem => ({
      kind: "radar", time: v.createdAt.getTime(), title: v.product, href: v.link, author: v.author ?? undefined,
    })),
    ...topics.map((t): LatestItem => ({
      kind: "x", time: t.createdAt.getTime(), title: t.headline, href: t.link, author: t.author ?? undefined,
    })),
  ];
  return items.sort((a, b) => b.time - a.time).slice(0, n);
}
