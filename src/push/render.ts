// Push message rendering for instant alerts (Sprint 004 T3). Pure + tested.

export interface PushAlert {
  title: string;
  summary: string;
  urgencyScore: number;
  category: string;
  regions: string[];
  actionRequired: string | null;
  sourceUrls: string[];
}

const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LatAm", australia_nz: "ANZ",
};
const region = (r: string) => REGION_LABEL[r] ?? r;

/** Plain text for Telegram sendMessage. */
export function renderTelegramText(a: PushAlert): string {
  const tag = a.urgencyScore >= 4 ? "🚨 URGENT" : "⚠️";
  const regions = a.regions.map(region).join(", ");
  const lines = [
    `${tag} [${a.urgencyScore.toFixed(1)}] ${a.category} · ${regions}`,
    "",
    a.title,
  ];
  if (a.summary) lines.push("", a.summary);
  if (a.actionRequired) lines.push("", `→ ${a.actionRequired}`);
  if (a.sourceUrls[0]) lines.push("", a.sourceUrls[0]);
  return lines.join("\n");
}

/** Slack Block Kit payload. */
export function renderSlackBlocks(a: PushAlert): object {
  const regions = a.regions.map(region).join(", ");
  const blocks: object[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*🚨 [${a.urgencyScore.toFixed(1)}] ${a.category} · ${regions}*\n*${a.title}*` },
    },
  ];
  if (a.summary || a.actionRequired) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: [a.summary, a.actionRequired ? `*→ ${a.actionRequired}*` : ""].filter(Boolean).join("\n") },
    });
  }
  if (a.sourceUrls[0]) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `<${a.sourceUrls[0]}|source>` }] });
  }
  return { blocks };
}
