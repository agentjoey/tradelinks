import Link from "next/link";
import { getAlerts, type AlertRow } from "./lib/alerts";
import { AlertCard } from "./components/AlertCard";
import { Filters } from "./components/Filters";

export const dynamic = "force-dynamic";

// group alerts into day buckets with human labels (Today / Yesterday / date)
function dayKey(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}
function dayLabel(key: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === y) return "Yesterday";
  return new Date(key + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}
function groupByDay(items: AlertRow[]): [string, AlertRow[]][] {
  const m = new Map<string, AlertRow[]>();
  for (const a of items) {
    const k = dayKey(a.publishedAt ?? a.createdAt);
    (m.get(k) ?? m.set(k, []).get(k)!).push(a);
  }
  return [...m.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1));
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; category?: string; platform?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const { items, nextCursor } = await getAlerts(sp);
  const live = items.filter((a) => a.urgencyScore >= 4).length;
  const groups = groupByDay(items);
  let idx = 0;

  return (
    <div>
      <div className="mb-7">
        <div className="ticker flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-faint mb-3">
          <span className="inline-flex items-center gap-1.5 text-calm">
            <span className="h-1.5 w-1.5 rounded-full bg-calm animate-pulse-bar" /> live
          </span>
          <span>·</span>
          <span>{items.length} dispatches</span>
          {live > 0 && <><span>·</span><span className="text-urgent">{live} act-now</span></>}
        </div>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight max-w-2xl">
          Cross-border <span className="italic text-signal">intelligence</span>, on the wire.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          Regulatory shifts, platform policy, logistics shocks and trend signals — across six
          regions, scored by how fast you need to move.
        </p>
      </div>

      <Filters region={sp.region} category={sp.category} />

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="ticker text-[11px] uppercase tracking-[0.2em] text-faint">no dispatches match this filter</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([key, rows]) => (
            <section key={key}>
              {/* timeline day divider (T1) */}
              <div className="sticky top-[57px] z-[5] -mx-1 mb-3 flex items-center gap-3 bg-ink/85 px-1 py-1 backdrop-blur">
                <h2 className="ticker text-[11px] font-semibold uppercase tracking-[0.22em] text-paper">{dayLabel(key)}</h2>
                <span className="ticker text-[10px] text-faint">{rows.length}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2.5">
                {rows.map((a) => <AlertCard key={a.id} a={a} index={idx++} />)}
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
            load earlier ↓
          </Link>
        </div>
      )}
    </div>
  );
}
