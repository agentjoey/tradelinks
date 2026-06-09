import { NextRequest, NextResponse } from "next/server";
import { confirmByToken } from "../../../../src/email/subscriber-db.js";
import { sendEmail } from "../../../../src/email/resend.js";
import { welcomeEmail } from "../../../../src/email/transactional.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const r = await confirmByToken(token);
  if (r.ok && r.email && r.unsubToken) {
    const m = welcomeEmail(`${SITE}/api/unsubscribe?token=${r.unsubToken}`);
    await sendEmail(r.email, m.subject, m.html, m.text);
    return NextResponse.redirect(`${SITE}/subscribe/confirmed`);
  }
  return NextResponse.redirect(`${SITE}/subscribe?error=token`);
}
