import type { AlertRow } from "./alerts";

export interface DigestSection {
  key: string;
  label: string;
  items: AlertRow[];
}
export interface Digest {
  date: string; // YYYY-MM-DD (UTC)
  lead: string | null;
  topAlerts: AlertRow[];
  sections: DigestSection[];
}

const SECTION_DEFS: { key: string; label: string; categories: string[] }[] = [
  { key: "regulatory", label: "📋 Regulatory Updates", categories: ["regulatory"] },
  { key: "platform", label: "🏪 Platform News", categories: ["platform_policy"] },
  { key: "logistics", label: "🚢 Logistics", categories: ["logistics"] },
  { key: "trend", label: "📈 Trend Signals", categories: ["trend"] },
  { key: "picks", label: "🛒 Product Picks & Tips", categories: ["industry", "tip"] },
];

/**
 * Build the 5-section daily digest from a day's published alerts. Pure → testable.
 * Top Alerts = the highest-urgency items across all categories (urgency ≥ 3).
 */
export function buildDigest(alerts: AlertRow[], date: string): Digest {
  const sorted = [...alerts].sort((a, b) => b.urgencyScore - a.urgencyScore);
  const topAlerts = sorted.filter((a) => a.urgencyScore >= 3).slice(0, 5);
  const topIds = new Set(topAlerts.map((a) => a.id));

  const sections: DigestSection[] = SECTION_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    items: sorted.filter((a) => def.categories.includes(a.category) && !topIds.has(a.id)),
  })).filter((s) => s.items.length > 0);

  const lead =
    topAlerts.length > 0
      ? `${topAlerts.length} high-priority alert(s) today — top: ${topAlerts[0]!.title}`
      : alerts.length > 0
        ? `${alerts.length} update(s) today across ${sections.length} categories`
        : null;

  return { date, lead, topAlerts, sections };
}

/** Render the digest as plain text (used for email text part + previews). */
export function renderDigestText(d: Digest): string {
  const lines: string[] = [`TradeLinks Daily — ${d.date}`, ""];
  if (d.lead) lines.push(d.lead, "");
  if (d.topAlerts.length) {
    lines.push("🚨 Top Alerts");
    for (const a of d.topAlerts) {
      lines.push(`  [${a.urgencyScore.toFixed(1)}] ${a.title}`);
      if (a.actionRequired) lines.push(`      → ${a.actionRequired}`);
    }
    lines.push("");
  }
  for (const s of d.sections) {
    lines.push(s.label);
    for (const a of s.items) lines.push(`  • ${a.title}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
