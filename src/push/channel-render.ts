// Curated Telegram channel message rendering (BL-039 slice 1).
// Pure — no I/O, no DB. Produces HTML for parse_mode=HTML posts.
// Separate from render.ts (admin-review format) per spec: public, branded, no scores.

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

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    regulatory: "Regulation",
    platform_policy: "Platform",
    logistics: "Logistics",
    trend: "Trend",
    industry: "Industry",
    tip: "Tip",
  };
  return map[c] ?? c;
}

const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LatAm", australia_nz: "ANZ",
};
function region(r: string): string { return REGION_LABEL[r] ?? r; }

/** Clamp text to a reasonable channel-post length, breaking at a word boundary. */
function clamp(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.lastIndexOf(" ", maxLen);
  return (cut > 0 ? s.slice(0, cut) : s.slice(0, maxLen)) + "…";
}

/**
 * Render a published alert for the public channel.
 * Format: emoji + bold title / italic meta / summary / action / source link / footer.
 */
export function renderChannelAlert(a: ChannelAlert): string {
  const meta = [categoryLabel(a.category), a.regions.map(region).join("/")].filter(Boolean).join(" · ");
  const lines: string[] = [
    `${tierEmoji(a.urgencyScore)} <b>${esc(clamp(a.title, 140))}</b>`,
    `<i>${esc(meta)}</i>`,
  ];
  if (a.summary) lines.push("", esc(clamp(a.summary, 200)));
  if (a.actionRequired) lines.push("", `➤ <b>${esc(a.actionRequired)}</b>`);
  if (a.sourceUrls[0]) {
    const host = new URL(a.sourceUrls[0]).hostname;
    lines.push("", `🔗 ${esc(host)}`);
  }
  lines.push("", `— via TradeLinks · ${SITE}`);
  return lines.join("\n");
}

/**
 * Render a product (bestseller or viral) for the public channel.
 * Format: emoji + bold title / italic meta / source link / footer.
 */
export function renderChannelProduct(p: ChannelProduct): string {
  let meta: string;
  if (p.kind === "viral") {
    const likes = p.likes ? `♥ ${formatLikes(p.likes)}` : "";
    meta = [p.platform, likes, "trending"].filter(Boolean).join(" · ");
  } else {
    const parts = [p.platform];
    if (p.rank) parts.push(`BSR #${p.rank}`);
    if (p.region) parts.push(region(p.region));
    meta = parts.join(" · ");
  }
  const lines: string[] = [
    `📈 <b>${esc(clamp(p.title, 100))}</b>`,
    `<i>${esc(meta)}</i>`,
  ];
  lines.push("", `🔗 ${esc(p.url)}`);
  lines.push("", `— via TradeLinks Radar · ${SITE}/trends`);
  return lines.join("\n");
}
