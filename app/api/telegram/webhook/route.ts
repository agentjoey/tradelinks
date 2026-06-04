import { NextRequest, NextResponse } from "next/server";
import { approveAlert, rejectAlert, getAlertBrief } from "../../../../src/alerts/review.js";
import { env } from "../../../../src/config/env.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = (m: string) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${m}`;

async function tg(method: string, body: object) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await fetch(API(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/** Telegram callback webhook — handles the inline Approve/Reject button taps. */
export async function POST(req: NextRequest) {
  // verify the secret token Telegram echoes back (set via setWebhook)
  if (
    env.TELEGRAM_WEBHOOK_SECRET &&
    req.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const cq = update?.callback_query;
  if (!cq?.data) return NextResponse.json({ ok: true });

  const [action, id] = String(cq.data).split(":");
  if (!id) return NextResponse.json({ ok: true });
  const who = cq.from?.username || cq.from?.first_name || "telegram";

  let resultText = "";
  if (action === "a") {
    resultText = (await approveAlert(id, `tg:${who}`)) ? "✅ Approved & published" : "⚠️ already handled";
  } else if (action === "r") {
    resultText = (await rejectAlert(id, `tg:${who}`)) ? "🚫 Dismissed" : "⚠️ already handled";
  } else {
    return NextResponse.json({ ok: true });
  }

  // stop the button spinner
  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: resultText });

  // edit the original message: strip buttons, append the decision
  const brief = await getAlertBrief(id);
  const origText = cq.message?.text || brief?.title || "alert";
  await tg("editMessageText", {
    chat_id: cq.message?.chat?.id,
    message_id: cq.message?.message_id,
    text: `${origText}\n\n— ${resultText} by ${who}`,
    disable_web_page_preview: true,
  });

  return NextResponse.json({ ok: true });
}
