import { NextRequest, NextResponse } from "next/server";
import { getAlerts } from "../../../lib/alerts";
import { getLegacyRedirect } from "../../../../src/public-intelligence/legacy-redirects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Light anti-abuse: block obvious non-browser clients (AIHOT-style UA gate).
const BOT_UA = /curl|wget|python-requests|libwww|scrapy|httpie/i;

// Task 9b cutover: middleware's matcher excludes /api/, so the API v0 entries
// in the redirect map are served here. Retires to the v1 documentation, never
// to legacy JSON. Flag off = unchanged behaviour.
//
// The Location header is RELATIVE on purpose. NextResponse.redirect() requires
// an absolute URL, and `req.nextUrl.origin` inside a route handler resolves to
// localhost regardless of the incoming Host header — verified locally, where a
// request carrying `Host: tradelinks.us` still produced
// `location: http://localhost:PORT/openapi.json`. Emitting the response
// directly keeps the redirect same-origin and leaks no internal hostname, and
// matches what middleware emits for the page routes.
function cutoverRedirect(req: NextRequest): NextResponse | null {
  const v = process.env.PUBLIC_CUTOVER_ENABLED;
  if (v !== "true" && v !== "1") return null;
  const decision = getLegacyRedirect(req.nextUrl.pathname);
  if (!decision) return null;
  return new NextResponse(null, {
    status: decision.status,
    headers: { location: decision.target },
  });
}

export async function GET(req: NextRequest) {
  const retired = cutoverRedirect(req);
  if (retired) return retired;

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
