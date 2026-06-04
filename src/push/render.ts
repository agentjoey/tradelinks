// Push message rendering for instant alerts (Sprint 004 T3 / 006). Pure + tested.

export interface PushAlert {
  id?: string;
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

function tier(s: number): string {
  if (s >= 4) return "🚨 ACT NOW";
  if (s >= 2) return "⚠️ Worth knowing";
  return "· FYI";
}

/** HTML-formatted Telegram message body (parse_mode=HTML). */
export function renderTelegramText(a: PushAlert): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const meta = [a.category, a.regions.map(region).join("/")].filter(Boolean).join(" · ");
  const lines = [
    `${tier(a.urgencyScore)} · <b>${a.urgencyScore.toFixed(1)}</b>`,
    `<b>${esc(a.title)}</b>`,
    `<i>${esc(meta)}</i>`,
  ];
  if (a.summary) lines.push("", esc(a.summary));
  if (a.actionRequired) lines.push("", `➤ <b>${esc(a.actionRequired)}</b>`);
  if (a.sourceUrls[0]) lines.push("", `🔗 ${esc(a.sourceUrls[0])}`);
  return lines.join("\n");
}

/** Inline Approve/Reject keyboard (callback_data ≤64 bytes: "a:<id>" / "r:<id>"). */
export function approvalKeyboard(id: string): object {
  return {
    inline_keyboard: [[
      { text: "✅ Approve & publish", callback_data: `a:${id}` },
      { text: "🚫 Dismiss", callback_data: `r:${id}` },
    ]],
  };
}

/** Slack Block Kit payload. */
export function renderSlackBlocks(a: PushAlert): object {
  const regions = a.regions.map(region).join(", ");
  const blocks: object[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${tier(a.urgencyScore)} [${a.urgencyScore.toFixed(1)}] ${a.category} · ${regions}*\n*${a.title}*` },
    },
  ];
  if (a.summary || a.actionRequired) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: [a.summary, a.actionRequired ? `*➤ ${a.actionRequired}*` : ""].filter(Boolean).join("\n") },
    });
  }
  if (a.sourceUrls[0]) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `<${a.sourceUrls[0]}|source>` }] });
  }
  return { blocks };
}
