// Shared alert presentation helpers. Kept Dict-free (plain string `tiers`) so
// they're safe to use inside client components too.

export function domainOf(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

export { CAT_LABEL, REGION_LABEL } from "../lib/labels";

export interface Tiers { act: string; watch: string; fyi: string }
export interface TierStyle { label: string; pill: string; dot: string; rail: string; accent: string }

/** Urgency → presentation. `rail` is a hex for inline left/top borders; `accent`
 * is a bg-* class for tick marks. */
export function tierStyle(s: number, tiers: Tiers): TierStyle {
  if (s >= 4) return { label: tiers.act, pill: "bg-urgent/15 text-urgent", dot: "bg-urgent", rail: "#FF5A4D", accent: "bg-urgent" };
  if (s >= 2) return { label: tiers.watch, pill: "bg-signal/15 text-signal", dot: "bg-signal", rail: "#E8B44A", accent: "bg-signal" };
  return { label: tiers.fyi, pill: "bg-faint/15 text-muted", dot: "bg-faint", rail: "#5a5f6b", accent: "bg-faint" };
}

export function hhmm(d: Date | string | null): string {
  return new Date(d ?? Date.now()).toISOString().slice(11, 16) + "Z";
}
