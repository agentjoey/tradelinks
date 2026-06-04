import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// transparent 1x1 gif fallback (so <img> never shows a broken icon)
const BLANK = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
function blank() {
  return new Response(BLANK, {
    headers: { "content-type": "image/gif", "cache-control": "public, max-age=86400" },
  });
}

/**
 * Proxy an external article image through our origin: bypasses hotlink/referer
 * blocks and lets the browser load it same-origin. Falls back to a blank pixel.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return blank();
  let target: URL;
  try {
    target = new URL(u);
    if (target.protocol !== "https:" && target.protocol !== "http:") return blank();
  } catch {
    return blank();
  }
  try {
    const res = await fetch(target.toString(), {
      headers: { "User-Agent": UA, Accept: "image/*", Referer: target.origin },
      signal: AbortSignal.timeout(12_000),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.startsWith("image/")) return blank();
    const body = await res.arrayBuffer();
    return new Response(body, {
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return blank();
  }
}
