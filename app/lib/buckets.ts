import type { AlertRow } from "./alerts";
import type { Dict, Lang } from "./i18n";

function dayKey(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

export interface Bucket { key: string; label: string; rows: AlertRow[]; ts: number }

/**
 * Recency-first timeline buckets: Last hour / 4h / 8h (pure recency), then the
 * rest of Today, Yesterday, and older dates. Buckets are ordered by their newest
 * item (so 1h→4h→8h→today→yesterday→dates falls out naturally) and within a
 * bucket by urgency then time. Empty buckets are omitted.
 */
export function bucketAlerts(items: AlertRow[], t: Dict, lang: Lang): Bucket[] {
  const now = Date.now();
  const H = 3_600_000;
  const tsOf = (a: AlertRow) => new Date(a.publishedAt ?? a.createdAt).getTime();
  const today = dayKey(new Date(now));
  const yday = dayKey(new Date(now - 24 * H));
  const buckets = new Map<string, Bucket>();
  const put = (key: string, label: string, a: AlertRow) => {
    const b = buckets.get(key) ?? buckets.set(key, { key, label, rows: [], ts: 0 }).get(key)!;
    b.rows.push(a);
  };
  for (const a of items) {
    const age = now - tsOf(a);
    if (age <= H) put("b1", t.last1h, a);
    else if (age <= 4 * H) put("b4", t.last4h, a);
    else if (age <= 8 * H) put("b8", t.last8h, a);
    else {
      const dk = dayKey(new Date(tsOf(a)));
      if (dk === today) put("today", t.today, a);
      else if (dk === yday) put("yday", t.yesterday, a);
      else put(dk, new Date(dk + "T00:00:00Z").toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US",
        { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }), a);
    }
  }
  const out = [...buckets.values()];
  for (const b of out) {
    b.rows.sort((x, y) => (y.urgencyScore - x.urgencyScore) || (tsOf(y) - tsOf(x)));
    b.ts = Math.max(...b.rows.map(tsOf));
  }
  return out.sort((a, b) => b.ts - a.ts);
}
