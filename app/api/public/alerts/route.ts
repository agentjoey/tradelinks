import { NextRequest, NextResponse } from "next/server";
import { getAlerts } from "../../../lib/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Light anti-abuse: block obvious non-browser clients (AIHOT-style UA gate).
const BOT_UA = /curl|wget|python-requests|libwww|scrapy|httpie/i;

export async function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) {
    return NextResponse.json({ error: "forbidden: browser User-Agent required" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const page = await getAlerts({
    region: sp.get("region") ?? undefined,
    category: sp.get("category") ?? undefined,
    platform: sp.get("platform") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
  });

  return NextResponse.json(
    {
      items: page.items.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.summary,
        urgencyScore: a.urgencyScore,
        category: a.category,
        regions: a.regions,
        platforms: a.platforms,
        action: a.actionRequired,
        sources: a.sourceUrls,
        publishedAt: (a.publishedAt ?? a.createdAt).toISOString(),
      })),
      count: page.items.length,
      hasNext: page.nextCursor !== null,
      nextCursor: page.nextCursor,
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
