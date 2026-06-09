// BL-043 — Subscriber 名单 DB 层（自管名单）。
import { prisma } from "../db/client.js";
import { normalizeEmail, isValidEmail, newToken } from "./subscriber-util.js";

export interface UpsertResult {
  ok: boolean;
  status?: "pending" | "confirmed";
  confirmToken?: string;
  reason?: string;
}

/** 建/复用订阅(pending)。已 confirmed 直接返回不动;pending/unsubscribed → 刷新确认 token 重新 pending。 */
export async function upsertPending(rawEmail: string, lang = "en"): Promise<UpsertResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };

  const existing = await prisma.subscriber.findUnique({ where: { email } });
  if (existing) {
    if (existing.status === "confirmed") return { ok: true, status: "confirmed" };
    const confirmToken = newToken();
    await prisma.subscriber.update({
      where: { email },
      data: { status: "pending", confirmToken, unsubscribedAt: null },
    });
    return { ok: true, status: "pending", confirmToken };
  }

  const confirmToken = newToken();
  await prisma.subscriber.create({
    data: { email, lang, status: "pending", confirmToken, unsubToken: newToken() },
  });
  return { ok: true, status: "pending", confirmToken };
}

export async function confirmByToken(token: string): Promise<{ ok: boolean; email?: string; unsubToken?: string }> {
  const sub = await prisma.subscriber.findUnique({ where: { confirmToken: token } });
  if (!sub) return { ok: false };
  if (sub.status !== "confirmed") {
    await prisma.subscriber.update({ where: { id: sub.id }, data: { status: "confirmed", confirmedAt: new Date() } });
  }
  return { ok: true, email: sub.email, unsubToken: sub.unsubToken };
}

export async function unsubscribeByToken(token: string): Promise<{ ok: boolean }> {
  const sub = await prisma.subscriber.findUnique({ where: { unsubToken: token } });
  if (!sub) return { ok: false };
  await prisma.subscriber.update({
    where: { id: sub.id },
    data: { status: "unsubscribed", unsubscribedAt: new Date() },
  });
  return { ok: true };
}

export async function listConfirmed(): Promise<{ email: string; unsubToken: string; lang: string }[]> {
  return prisma.subscriber.findMany({
    where: { status: "confirmed" },
    select: { email: true, unsubToken: true, lang: true },
  });
}
