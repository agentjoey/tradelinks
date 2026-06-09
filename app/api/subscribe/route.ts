import { NextRequest, NextResponse } from "next/server";
import { upsertPending } from "../../../src/email/subscriber-db.js";
import { sendEmail } from "../../../src/email/resend.js";
import { confirmEmail } from "../../../src/email/transactional.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";
const BOT_UA = /curl|wget|python-requests|libwww|scrapy|httpie/i;

export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return NextResponse.json({ ok: false }, { status: 403 });

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = String(body?.email ?? "");
  } catch {
    // ignore malformed body
  }

  const r = await upsertPending(email);
  // 始终返回 ok（不泄露邮箱是否已存在/无效，防枚举）。
  if (r.ok && r.status === "pending" && r.confirmToken) {
    const m = confirmEmail(`${SITE}/api/subscribe/confirm?token=${r.confirmToken}`);
    await sendEmail(email.trim().toLowerCase(), m.subject, m.html, m.text);
  }
  return NextResponse.json({ ok: true });
}
