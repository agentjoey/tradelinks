// BL-043 — 订阅纯工具（token + 邮箱）。DB-free。
import { randomBytes } from "node:crypto";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** URL-safe 随机 token（base64url，>=32 字符）。 */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}
