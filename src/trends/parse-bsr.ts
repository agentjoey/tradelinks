// BL-042 P2a — BSR 富集字段解析（DB-free 纯函数）。

/** "1,234 ratings" / "(8,901)" → 1234 / 8901；无数字 → null。 */
export function parseReviewCount(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/,/g, "").match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

/** "$1,299.00" / "£8.50" → 1299 / 8.5；无数字 → null。 */
export function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "4.5 out of 5 stars" → 4.5；无数字 → null。 */
export function parseRating(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
