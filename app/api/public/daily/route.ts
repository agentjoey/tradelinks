import { NextRequest, NextResponse } from "next/server";
import { getAlerts } from "../../../lib/alerts";
import { buildDigest, renderDigestText } from "../../../lib/digest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOT_UA = /curl|wget|python-requests|libwww|scrapy|httpie/i;

/** Latest daily digest (computed from recent published alerts). */
export async function GET(req: NextRequest) {
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
