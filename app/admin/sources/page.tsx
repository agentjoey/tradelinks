import { getSourceHealth, TIER_BADGE, type HealthTier, type SourceHealth } from "../../../src/monitoring/health.js";
import { prisma } from "../../../src/db/client.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIER_ORDER: HealthTier[] = ["silent", "unhealthy", "degraded", "healthy", "disabled"];
const TIER_BAR: Record<HealthTier, string> = {
  silent: "bg-urgent", unhealthy: "bg-urgent", degraded: "bg-signal", healthy: "bg-calm", disabled: "bg-paper/20",
};

function ago(d: Date | null): string {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
}

function Sub({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${v}/${max}`}>
      <span className="ticker w-3 text-[9px] text-faint">{label}</span>
      <div className="h-1 w-8 overflow-hidden rounded-full bg-paper/[0.07]">
        <div className="h-full bg-paper/50" style={{ width: `${(v / max) * 100}%` }} />
      </div>
    </div>
  );
}

function Spark({ days }: { days: number[] }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days);
  return (
    <div className="flex items-end gap-0.5 h-6" title="items/day, last 7d">
      {days.map((n, i) => (
        <div key={i} className="w-1.5 rounded-sm bg-signal/50" style={{ height: `${Math.max(6, (n / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function Row({ h, spark }: { h: SourceHealth; spark: number[] }) {
  const passRate = h.items7d > 0 ? Math.round((h.scored7d / h.items7d) * 100) : null;
  return (
    <article className="relative overflow-hidden rounded-md border border-line bg-surface/70 p-3 pl-4">
      <div className={`absolute left-0 top-0 h-full w-[3px] ${TIER_BAR[h.tier]}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-[16px] text-paper truncate">{h.name}</span>
            <span className="ticker text-[10px] text-faint">{h.id}</span>
          </div>
          <div className="ticker mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-faint">
            {h.category && <span className="rounded-sm bg-paper/[0.06] px-1.5 py-0.5">{h.category}</span>}
            <span>{h.adapter}</span>
            <span>· every {h.expectedIntervalMin >= 60 ? `${(h.expectedIntervalMin / 60).toFixed(0)}h` : `${h.expectedIntervalMin}m`}</span>
            <span>· crawl {ago(h.lastCrawledAt)} ago</span>
            <span>· item {ago(h.lastItemAt)} ago</span>
            {h.consecutiveFailures > 0 && <span className="text-urgent">· {h.consecutiveFailures} fails</span>}
          </div>
          <div className="ticker mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>24h <span className="text-paper">{h.items24h}</span></span>
            <span>7d <span className="text-paper">{h.items7d}</span></span>
            {passRate !== null && !h.isBestseller && <span>pass <span className="text-paper">{passRate}%</span></span>}
            {h.avgUrgency != null && <span>urg <span className="text-paper">{h.avgUrgency.toFixed(1)}</span></span>}
          </div>
          {h.reasons.length > 0 && h.tier !== "healthy" && (
            <p className="mt-1.5 text-[12px] text-muted">{h.reasons.join(" · ")}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="ticker text-[10px] uppercase tracking-[0.1em] text-muted">{TIER_BADGE[h.tier]}</div>
          <div className="font-display text-2xl leading-none text-paper">{h.score}<span className="text-[12px] text-faint">/100</span></div>
          <Spark days={spark} />
          {h.tier !== "disabled" && (
            <div className="mt-0.5 flex flex-col gap-1">
              <Sub label="R" v={h.sub.reach} max={40} />
              <div className="flex gap-2">
                <Sub label="C" v={h.sub.cadence} max={20} />
                <Sub label="P" v={h.sub.productivity} max={20} />
                <Sub label="Q" v={h.sub.quality} max={20} />
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function SourcesHealthPage() {
  const health = await getSourceHealth();

  // 7-day sparkline data from snapshots (items24h per day per source)
  const since = new Date(Date.now() - 7 * 864e5);
  const snaps = await prisma.sourceHealthSnapshot
    .findMany({ where: { date: { gte: since } }, orderBy: { date: "asc" }, select: { sourceId: true, items24h: true } })
    .catch(() => [] as { sourceId: string; items24h: number }[]);
  const sparkBy = new Map<string, number[]>();
  for (const s of snaps) {
    const arr = sparkBy.get(s.sourceId) ?? [];
    arr.push(s.items24h);
    sparkBy.set(s.sourceId, arr);
  }

  const counts = health.reduce<Record<string, number>>((a, h) => ((a[h.tier] = (a[h.tier] ?? 0) + 1), a), {});
  const byTier = TIER_ORDER.map((t) => [t, health.filter((h) => h.tier === t)] as const).filter(([, rows]) => rows.length);

  return (
    <div>
      <div className="mb-6">
        <div className="ticker text-[10px] uppercase tracking-[0.2em] text-signal/80 mb-2">◆ The Desk · Sources</div>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight">
          Source <span className="italic text-signal">health</span>
        </h1>
        <p className="mt-3 text-[15px] text-muted">
          Every configured source, its data flow, cadence and a 0–100 health score
          (reachability · cadence · productivity · quality). Worst first.
        </p>
        <div className="ticker mt-3 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.12em]">
          {TIER_ORDER.filter((t) => counts[t]).map((t) => (
            <span key={t}>{TIER_BADGE[t]} <span className="text-paper">{counts[t]}</span></span>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {byTier.map(([tier, rows]) => (
          <section key={tier}>
            <h2 className="ticker mb-2 text-[10px] uppercase tracking-[0.2em] text-faint">{TIER_BADGE[tier]} · {rows.length}</h2>
            <div className="space-y-2">
              {rows.map((h) => (
                <Row key={h.id} h={h} spark={sparkBy.get(h.id) ?? []} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
