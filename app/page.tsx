import Link from "next/link";
import { getAlerts, type AlertRow } from "./lib/alerts";
import { getDict } from "./lib/i18n";
import { AlertCard } from "./components/AlertCard";
import { Filters } from "./components/Filters";

export const dynamic = "force-dynamic";

function dayKey(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}
function groupByDay(items: AlertRow[]): [string, AlertRow[]][] {
  const m = new Map<string, AlertRow[]>();
  for (const a of items) {
    const k = dayKey(a.publishedAt ?? a.createdAt);
    (m.get(k) ?? m.set(k, []).get(k)!).push(a);
  }
  // newest day first; within a day, highest urgency first (then newest)
  for (const rows of m.values()) {
    rows.sort((a, b) => {
      if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
      const ta = new Date(a.publishedAt ?? a.createdAt).getTime();
      const tb = new Date(b.publishedAt ?? b.createdAt).getTime();
      return tb - ta;
    });
  }
  return [...m.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1));
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
  const groups = groupByDay(items);

  const today = new Date().toISOString().slice(0, 10);
  const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayLabel = (key: string) =>
    key === today ? t.today
    : key === yday ? t.yesterday
    : new Date(key + "T00:00:00Z").toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US",
        { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" });

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
      </div>

      <Filters region={sp.region} category={sp.category} t={t} />

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="ticker text-[11px] uppercase tracking-[0.2em] text-faint">{t.empty}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([key, rows]) => (
            <section key={key}>
              <div className="sticky top-[57px] z-[5] -mx-1 mb-3 flex items-center gap-3 bg-ink/85 px-1 py-1 backdrop-blur">
                <h2 className="ticker text-[11px] font-semibold uppercase tracking-[0.22em] text-paper">{dayLabel(key)}</h2>
                <span className="ticker text-[10px] text-faint">{rows.length}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2.5">
                {rows.map((a) => <AlertCard key={a.id} a={a} index={idx++} t={t} />)}
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
