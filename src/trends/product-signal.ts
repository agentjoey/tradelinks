// BL-042 Phase 1 — 爆品信号纯函数（DB-free，TDD）。
import type { Region } from "../config/sources.js";

export function extractAsin(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/i);
  return m ? m[1]!.toUpperCase() : null;
}

// 大宗/常青商品关键词：命中即"打标不删"（仍存排名当对照，不进精分析）。
const COMMODITY_RE =
  /\b(cable|cord|charger|battery|batteries|surge protector|power strip|zip ties?|extension cord|adapter|mount|screen protector|hdmi|usb|wire|outlet)\b/i;

export function isCommodity(title: string): boolean {
  return COMMODITY_RE.test(title);
}
