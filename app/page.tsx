import Link from "next/link";
import { getAlerts } from "./lib/alerts";
import { AlertCard } from "./components/AlertCard";
import { Filters } from "./components/Filters";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; category?: string; platform?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const { items, nextCursor } = await getAlerts(sp);
  const live = items.filter((a) => a.urgencyScore >= 4).length;

  return (
    <div>
      {/* editorial masthead */}
      <div className="mb-7">
        <div className="ticker flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-faint mb-3">
          <span className="inline-flex items-center gap-1.5 text-calm">
            <span className="h-1.5 w-1.5 rounded-full bg-calm animate-pulse-bar" /> live
          </span>
          <span>·</span>
          <span>{items.length} dispatches</span>
          {live > 0 && <><span>·</span><span className="text-urgent">{live} critical</span></>}
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
        <div className="space-y-2.5">
          {items.map((a, i) => <AlertCard key={a.id} a={a} index={i} />)}
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
