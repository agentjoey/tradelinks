// BL-043 — Resend 发信封装。无 RESEND_API_KEY → 跳过（零配置不报错）。
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<"sent" | "skipped" | "failed"> {
  if (!env.RESEND_API_KEY) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, html, text }),
    });
    if (!res.ok) {
      logger.warn({ to, status: res.status }, "resend send failed");
      return "failed";
    }
    return "sent";
  } catch (e) {
    logger.warn({ to, err: String(e) }, "resend send error");
    return "failed";
  }
}
