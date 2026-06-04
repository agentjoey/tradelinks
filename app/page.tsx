import Link from "next/link";
import { getAlerts, type AlertRow } from "./lib/alerts";
import { getDict, type Dict, type Lang } from "./lib/i18n";
import { AlertCard } from "./components/AlertCard";
import { Filters } from "./components/Filters";

export const dynamic = "force-dynamic";

function dayKey(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

interface Bucket { key: string; label: string; rows: AlertRow[]; ts: number }

/**
 * Recency-first timeline buckets: Last hour / 4h / 8h (pure recency), then the
 * rest of Today, Yesterday, and older dates. Buckets are ordered by their newest
 * item (so 1h→4h→8h→today→yesterday→dates falls out naturally) and within a
 * bucket by urgency then time. Empty buckets are omitted.
 */
function bucketAlerts(items: AlertRow[], t: Dict, lang: Lang): Bucket[] {
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; category?: string; platform?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const { lang, t } = await getDict();
  const { items, nextCursor } = await getAlerts(sp);
  const live = items.filter((a) => a.urgencyScore >= 4).length;
  const buckets = bucketAlerts(items, t, lang);

  let idx = 0;
  return (
    <div>
      <div className="mb-7">
        <div className="ticker flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-faint mb-3">
          <span className="inline-flex items-center gap-1.5 text-calm">
            <span className="h-1.5 w-1.5 rounded-full bg-calm animate-pulse-bar" /> {t.live}
          </span>
          <span>·</span>
          <span>{items.length} {t.dispatches}</span>
          {live > 0 && <><span>·</span><span className="text-urgent">{live} {t.actNow}</span></>}
        </div>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight max-w-2xl">
          {t.heroPre}<span className="italic text-signal">{t.heroEm}</span>{t.heroPost}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{t.heroSub}</p>
        <Link
          href="/trends"
          className="ticker mt-4 inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-signal transition-colors hover:border-signal/60 hover:bg-signal/10"
        >
          🔥 {t.bestsellersTeaser} →
        </Link>
      </div>

      <Filters region={sp.region} category={sp.category} t={t} />

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="ticker text-[11px] uppercase tracking-[0.2em] text-faint">{t.empty}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {buckets.map((b) => (
            <section key={b.key}>
              <div className="sticky top-[57px] z-[5] -mx-1 mb-3 flex items-center gap-3 bg-ink/85 px-1 py-1 backdrop-blur">
                <h2 className="ticker text-[11px] font-semibold uppercase tracking-[0.22em] text-paper">{b.label}</h2>
                <span className="ticker text-[10px] text-faint">{b.rows.length}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2.5">
                {b.rows.map((a) => <AlertCard key={a.id} a={a} index={idx++} t={t} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="mt-8 text-center">
          <Link
            href={`/?${new URLSearchParams({ ...sp, cursor: nextCursor }).toString()}`}
            className="ticker rounded-sm border border-line px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-muted transition-colors hover:border-signal/40 hover:text-signal"
          >
            {t.loadEarlier}
          </Link>
        </div>
      )}
    </div>
  );
}
