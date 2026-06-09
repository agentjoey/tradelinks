import { NextRequest, NextResponse } from "next/server";
import { unsubscribeByToken } from "../../../src/email/subscriber-db.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  await unsubscribeByToken(token);
  return NextResponse.redirect(`${SITE}/subscribe/unsubscribed`);
}
