// Push delivery (Sprint 004 T3). Gated on env tokens; dry-run/log without them.
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { renderTelegramText, renderSlackBlocks, type PushAlert } from "./render.js";

export interface PushResult {
  telegram: "sent" | "skipped" | "failed";
  slack: "sent" | "skipped" | "failed";
}

async function sendTelegram(text: string): Promise<"sent" | "skipped" | "failed"> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return "skipped";
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

async function sendSlack(payload: object): Promise<"sent" | "skipped" | "failed"> {
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

/** Dispatch an alert to all configured channels. No-ops cleanly if unconfigured. */
export async function dispatchPush(a: PushAlert): Promise<PushResult> {
  const [telegram, slack] = await Promise.all([
    sendTelegram(renderTelegramText(a)),
    sendSlack(renderSlackBlocks(a)),
  ]);
  const result = { telegram, slack };
  if (telegram === "skipped" && slack === "skipped") {
    logger.info({ title: a.title.slice(0, 60) }, "push dry-run (no channels configured)");
  } else {
    logger.info({ ...result, title: a.title.slice(0, 60) }, "push dispatched");
  }
  return result;
}
