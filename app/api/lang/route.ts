import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Set the UI language cookie and redirect back. /api/lang?l=zh&next=/ */
export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get("l") === "zh" ? "zh" : "en";
  const next = req.nextUrl.searchParams.get("next") || req.headers.get("referer") || "/";
  let dest = "/";
  try {
    dest = new URL(next, req.nextUrl.origin).pathname + new URL(next, req.nextUrl.origin).search;
  } catch {
    dest = "/";
  }
  const res = NextResponse.redirect(new URL(dest, req.nextUrl.origin));
  res.cookies.set("tl_lang", l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
