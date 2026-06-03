import { getAlerts } from "../lib/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function esc(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const region = url.searchParams.get("region") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const base = `${url.protocol}//${url.host}`;
  const { items } = await getAlerts({ region, category, take: 50 });

  const xmlItems = items
    .map((a) => {
      const link = a.sourceUrls[0] ?? base;
      const date = (a.publishedAt ?? a.createdAt).toUTCString();
      const desc = `[urgency ${a.urgencyScore.toFixed(1)} · ${a.category}] ${a.summary}${
        a.actionRequired ? ` — Action: ${a.actionRequired}` : ""
      }`;
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${a.id}</guid>
      <pubDate>${date}</pubDate>
      <category>${esc(a.category)}</category>
      <description>${esc(desc)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>TradeLinks — Cross-border Alerts${region ? ` (${region})` : ""}</title>
    <link>${base}</link>
    <description>Regulatory, platform, logistics &amp; trend alerts for cross-border sellers.</description>
${xmlItems}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
