// Curated Telegram channel message rendering (BL-039 / BL-040).
// Pure — no I/O. Produces the HTML caption/text for a channel post; the image
// is attached separately by sendToChannel (sendPhoto). News-card style:
// source (blue link) / bold headline / summary / action / meta.

export interface ChannelAlert {
  title: string;
  summary: string;
  urgencyScore: number;
  category: string;
  regions: string[];
  actionRequired?: string | null;
  sourceUrls: string[];
}

export interface ChannelProduct {
  title: string;
  kind: "bestseller" | "viral";
  platform: string;
  rank?: number | null;
  likes?: number | null;
  region?: string;
  url: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Clamp text to a channel-post length, breaking at a word boundary. */
function clamp(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.lastIndexOf(" ", maxLen);
  return (cut > 0 ? s.slice(0, cut) : s.slice(0, maxLen)) + "…";
}

function formatLikes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function tierEmoji(urgencyScore: number): string {
  if (urgencyScore >= 4) return "🚨";
  if (urgencyScore >= 2) return "⚠️";
  return "🔹";
}

function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    regulatory: "Regulation", platform_policy: "Platform", logistics: "Logistics",
    trend: "Trend", industry: "Industry", tip: "Tip",
  };
  return map[c] ?? c;
}

const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LatAm", australia_nz: "ANZ",
};
function region(r: string): string { return REGION_LABEL[r] ?? r; }

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/**
 * Render a published alert as a news card caption: source (blue link) / emoji +
 * bold headline / summary / action / italic meta. The image (if any) is attached
 * by the send layer.
 */
export function renderChannelAlert(a: ChannelAlert): string {
  const url = a.sourceUrls[0];
  const host = url ? hostOf(url) : "";
  const meta = [categoryLabel(a.category), a.regions.map(region).join("/")].filter(Boolean).join(" · ");
  const lines: string[] = [];
  if (url && host) lines.push(`<a href="${esc(url)}"><b>${esc(host)}</b></a>`);
  lines.push(`${tierEmoji(a.urgencyScore)} <b>${esc(clamp(a.title, 140))}</b>`);
  if (a.summary) lines.push("", esc(clamp(a.summary, 240)));
  if (a.actionRequired) lines.push("", `➤ <b>${esc(clamp(a.actionRequired, 200))}</b>`);
  if (meta) lines.push("", `<i>${esc(meta)}</i>`);
  return lines.join("\n");
}

/**
 * Render a product (bestseller or viral) as a card caption: platform (blue link)
 * / 📈 bold title / italic metric. The product image is attached by the send layer.
 */
export function renderChannelProduct(p: ChannelProduct): string {
  let meta: string;
  if (p.kind === "viral") {
    const likes = p.likes ? `♥ ${formatLikes(p.likes)}` : "";
    meta = [likes, "trending"].filter(Boolean).join(" · ");
  } else {
    const parts: string[] = [];
    if (p.rank) parts.push(`BSR #${p.rank}`);
    if (p.region) parts.push(region(p.region));
    meta = parts.join(" · ");
  }
  const lines: string[] = [
    `<a href="${esc(p.url)}"><b>${esc(p.platform)}</b></a>`,
    `📈 <b>${esc(clamp(p.title, 110))}</b>`,
  ];
  if (meta) lines.push("", `<i>${esc(meta)}</i>`);
  return lines.join("\n");
}
