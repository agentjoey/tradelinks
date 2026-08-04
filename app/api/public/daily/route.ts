import { NextRequest, NextResponse } from "next/server";
import { getAlerts } from "../../../lib/alerts";
import { buildDigest, renderDigestText } from "../../../lib/digest";
import { getLegacyRedirect } from "../../../../src/public-intelligence/legacy-redirects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOT_UA = /curl|wget|python-requests|libwww|scrapy|httpie/i;

// Task 9b cutover: see app/api/public/alerts/route.ts — middleware's matcher
// excludes /api/, so API v0 retires here. Flag off = unchanged behaviour.
// Relative Location for the same reason documented there: nextUrl.origin
// resolves to localhost in a route handler even when Host says otherwise.
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

/** Latest daily digest (computed from recent published alerts). */
export async function GET(req: NextRequest) {
  const retired = cutoverRedirect(req);
  if (retired) return retired;

  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) {
    return NextResponse.json({ error: "forbidden: browser User-Agent required" }, { status: 403 });
  }
  const { items } = await getAlerts({ take: 100 });
  const date = new Date().toISOString().slice(0, 10);
  const digest = buildDigest(items, date);
  const wantText = req.nextUrl.searchParams.get("format") === "text";
  if (wantText) {
    return new NextResponse(renderDigestText(digest), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.json(digest);
}
