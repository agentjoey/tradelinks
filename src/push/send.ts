// Push delivery (Sprint 004 T3 / 006). Gated on env tokens; dry-run/log without them.
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { renderTelegramText, renderSlackBlocks, approvalKeyboard, type PushAlert } from "./render.js";

export interface PushResult {
  telegram: "sent" | "skipped" | "failed";
  slack: "sent" | "skipped" | "failed";
}

async function telegramSend(text: string, replyMarkup?: object): Promise<"sent" | "skipped" | "failed"> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return "skipped";
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

async function slackSend(payload: object): Promise<"sent" | "skipped" | "failed"> {
  if (!env.SLACK_WEBHOOK_URL) return "skipped";
  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** Plain dispatch (no buttons) — e.g. published-alert broadcast. */
export async function dispatchPush(a: PushAlert): Promise<PushResult> {
  const [telegram, slack] = await Promise.all([
    telegramSend(renderTelegramText(a)),
    slackSend(renderSlackBlocks(a)),
  ]);
  const result = { telegram, slack };
  logger.info({ ...result, title: a.title.slice(0, 60) }, "push dispatched");
  return result;
}

/**
 * Push a high-urgency alert to Telegram WITH inline Approve/Reject buttons so
 * the operator can publish/dismiss straight from the chat (Sprint 006).
 */
export async function pushAlertForReview(a: PushAlert & { id: string }): Promise<PushResult> {
  const [telegram, slack] = await Promise.all([
    telegramSend(renderTelegramText(a), approvalKeyboard(a.id)),
    slackSend(renderSlackBlocks(a)),
  ]);
  const result = { telegram, slack };
  logger.info({ ...result, id: a.id, urgency: a.urgencyScore }, "alert pushed for review");
  return result;
}
