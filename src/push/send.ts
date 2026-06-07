// Push delivery (Sprint 004 T3 / 006). Gated on env tokens; dry-run/log without them.
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { renderTelegramText, renderSlackBlocks, approvalKeyboard, type PushAlert } from "./render.js";

export interface PushResult {
  telegram: "sent" | "skipped" | "failed";
  slack: "sent" | "skipped" | "failed";
}

export interface ChannelSendResult {
  status: "sent" | "skipped" | "failed";
  messageId?: number;
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

/** Operational alert (plain HTML text, Telegram only) — e.g. source-health regressions. */
export async function sendOpsAlert(text: string): Promise<"sent" | "skipped" | "failed"> {
  const r = await telegramSend(text);
  logger.info({ telegram: r }, "ops alert sent");
  return r;
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

async function tgChannelCall(method: string, body: object): Promise<{ ok: boolean; messageId?: number }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      logger.warn({ method, status: res.status, body: t.slice(0, 200) }, "channel send non-ok");
      return { ok: false };
    }
    const data = (await res.json()) as { ok: boolean; result?: { message_id: number } };
    return { ok: data.ok, messageId: data.result?.message_id };
  } catch (e) {
    logger.error({ method, err: String(e) }, "channel send error");
    return { ok: false };
  }
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export interface ChannelSendOpts {
  /** Tappable link preview of this URL (tap image → source). Used for alerts. */
  previewUrl?: string | null;
  /** Guaranteed image via sendPhoto (our stored URL). Used for products whose
   * source page (e.g. Amazon) blocks link-preview og:image. */
  imageUrl?: string | null;
  /** Source URL for the inline button shown under a photo. */
  sourceUrl?: string | null;
  /** Inline button label (e.g. "↗ Amazon"). */
  buttonLabel?: string;
}

/**
 * Post a news card to the public channel. Two modes:
 *  - `imageUrl` → `sendPhoto` (guaranteed big image we control) + an inline
 *    button linking to `sourceUrl` (tap button → source). Raw URL → img-proxy
 *    → text fallback.
 *  - else `previewUrl` → large tappable link preview (tap image → source).
 * Gated: no token/channel → "skipped".
 */
export async function sendToChannel(text: string, opts: ChannelSendOpts = {}): Promise<ChannelSendResult> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) return { status: "skipped" };
  const chat_id = env.TELEGRAM_CHANNEL_ID;

  if (opts.imageUrl) {
    const markup = opts.sourceUrl
      ? { reply_markup: { inline_keyboard: [[{ text: opts.buttonLabel ?? "↗ View source", url: opts.sourceUrl }]] } }
      : {};
    const proxied = `${SITE}/api/img-proxy?u=${encodeURIComponent(opts.imageUrl)}`;
    for (const photo of [opts.imageUrl, proxied]) {
      const r = await tgChannelCall("sendPhoto", { chat_id, photo, caption: text, parse_mode: "HTML", ...markup });
      if (r.ok) return { status: "sent", messageId: r.messageId };
    }
    // both photo attempts failed → fall through to text
  }

  const link_preview_options = opts.previewUrl
    ? { url: opts.previewUrl, prefer_large_media: true, show_above_text: false }
    : { is_disabled: true };
  const r = await tgChannelCall("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options });
  return r.ok ? { status: "sent", messageId: r.messageId } : { status: "failed" };
}
