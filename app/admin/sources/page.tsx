import {
  getSourceHealth,
  getCoverageOverview,
  type HealthTier,
  type SourceHealth,
  type CapabilityView,
  type CoverageOverview,
  type SourceContractView,
} from "../../../src/monitoring/health.js";
import type { ReadinessLevel } from "../../../src/domain/intelligence/taxonomy.js";
import { prisma } from "../../../src/db/client.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIER_ORDER: HealthTier[] = ["silent", "unhealthy", "degraded", "healthy", "disabled"];
const TIER_BAR: Record<HealthTier, string> = {
  silent: "bg-urgent", unhealthy: "bg-urgent", degraded: "bg-signal", healthy: "bg-calm", disabled: "bg-muted",
};

// Plain-word badges: one encoding per state — the 1px bar carries color, the
// word carries the exact level (emoji dots render platform-dependent colors
// that contradict the token bar). House rule: no side rail wider than 1px.
// Tier labels follow the same rule; the emoji TIER_BADGE stays in
// src/monitoring/health.ts for the Telegram worker message only.
const TIER_LABEL: Record<HealthTier, string> = {
  silent: "Silent", unhealthy: "Unhealthy", degraded: "Degraded", healthy: "Healthy", disabled: "Disabled",
};
const READINESS_BADGE: Record<ReadinessLevel, string> = {
  VERIFIED: "Verified",
  MONITORED: "Monitored",
  EXPERIMENTAL: "Experimental",
  STALE: "Stale",
  UNAVAILABLE: "Unavailable",
};
const READINESS_BAR: Record<ReadinessLevel, string> = {
  VERIFIED: "bg-calm", MONITORED: "bg-calm", EXPERIMENTAL: "bg-signal", STALE: "bg-urgent", UNAVAILABLE: "bg-muted",
};

function ago(d: Date | null): string {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
}

/** "3h ago" for a timestamp, "just now" under a minute, plain "never" for none. */
function lastAt(d: Date | null): string {
  if (!d) return "never";
  const a = ago(d);
  return a === "just now" ? a : `${a} ago`;
}

function slaLabel(minutes: number | null): string {
  if (minutes == null) return "no SLA";
  if (minutes % 1440 === 0) return `${minutes / 1440}d SLA`;
  if (minutes % 60 === 0) return `${minutes / 60}h SLA`;
  return `${minutes}m SLA`;
}

const SUB_NAME: Record<string, string> = {
  R: "Reachability", C: "Cadence", P: "Productivity", Q: "Quality",
};

function Sub({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div className="flex items-center gap-1.5" title={`${SUB_NAME[label] ?? label}: ${v}/${max}`}>
      <span className="ticker w-3 text-[9px] text-faint" aria-hidden="true">{label}</span>
      <span className="sr-only">{SUB_NAME[label] ?? label}: {v} of {max}</span>
      <div className="h-1 w-8 overflow-hidden rounded-full bg-surface2" aria-hidden="true">
        <div className={`h-full ${v === 0 ? "bg-urgent" : "bg-muted"}`} style={{ width: `${(v / max) * 100}%` }} />
      </div>
    </div>
  );
}

function Spark({ days }: { days: number[] }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days);
  return (
    <div className="flex items-end gap-0.5 h-6" title="items/day, last 7d">
      <span className="sr-only">Items per day, last 7 days: {days.join(", ")}</span>
      {days.map((n, i) => (
        // A zero-item day is a 1px baseline tick, never a stub bar — on the
        // silent-zero detector a silent day must read as zero.
        <div
          key={i}
          aria-hidden="true"
          className="w-1.5 rounded-sm bg-signal/50"
          style={{ height: n === 0 ? "1px" : `${Math.max(6, (n / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Row({ h, spark, contract }: { h: SourceHealth; spark: number[]; contract?: SourceContractView }) {
  const passRate = h.items7d > 0 ? Math.round((h.scored7d / h.items7d) * 100) : null;
  return (
    <article id={`src-${h.id}`} className="relative scroll-mt-24 overflow-hidden rounded-md border border-line bg-surface/70 p-3 pl-4">
      <div className={`absolute left-0 top-0 h-full w-px ${TIER_BAR[h.tier]}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[16px] text-ink truncate">{h.name}</h3>
            <span className="ticker text-[10px] text-faint">{h.id}</span>
          </div>
          <div className="ticker mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-faint">
            {h.category && <span className="rounded-sm bg-surface2 px-1.5 py-0.5">{h.category}</span>}
            <span>{h.adapter}</span>
            <span>· every {h.expectedIntervalMin >= 60 ? `${(h.expectedIntervalMin / 60).toFixed(0)}h` : `${h.expectedIntervalMin}m`}</span>
            <span>· {slaLabel(contract?.slaMinutes ?? null)}</span>
            <span>· crawl {lastAt(h.lastCrawledAt)}</span>
            <span>· last ok {lastAt(h.lastOkAt)}</span>
            <span>· item {lastAt(h.lastItemAt)}</span>
            {h.consecutiveFailures > 0 && <span className="text-urgent">· {h.consecutiveFailures} fails</span>}
          </div>
          <div className="ticker mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>24h <span className="text-ink">{h.items24h}</span></span>
            <span>7d <span className="text-ink">{h.items7d}</span></span>
            {h.isBestseller ? (
              <span className="text-faint">Radar source · no AI scoring (pass/urg n/a)</span>
            ) : (
              <>
                {passRate !== null && <span>pass <span className="text-ink">{passRate}%</span></span>}
                {h.avgUrgency != null && <span>urg <span className="text-ink">{h.avgUrgency.toFixed(1)}</span></span>}
              </>
            )}
          </div>
          {contract?.userPromise && (
            <p className="mt-1.5 text-[12px] text-muted"><span className="text-faint">Promise:</span> {contract.userPromise}</p>
          )}
          {contract?.degradationPolicy && (
            <p className="mt-0.5 text-[12px] text-muted"><span className="text-faint">Degradation:</span> {contract.degradationPolicy}</p>
          )}
          {contract && contract.capabilityKeys.length > 0 && (
            <p className="ticker mt-0.5 text-[10px] uppercase tracking-[0.1em] text-faint">
              Capabilities: {contract.capabilityKeys.join(" · ")}
            </p>
          )}
          {h.reasons.length > 0 && h.tier !== "healthy" && (
            <p className="mt-1.5 text-[12px] text-muted">{h.reasons.join(" · ")}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="ticker text-[10px] uppercase tracking-[0.1em] text-muted">{TIER_LABEL[h.tier]}</div>
          <div className="font-display text-2xl leading-none text-ink">{h.score}<span className="text-[12px] text-faint">/100</span></div>
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

function CapabilityCard({ cap }: { cap: CapabilityView }) {
  return (
    <article className="relative overflow-hidden rounded-md border border-line bg-surface/70 p-3 pl-4">
      <div className={`absolute left-0 top-0 h-full w-px ${READINESS_BAR[cap.readiness]}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] text-ink">{cap.key}</h3>
          <p className="mt-1 text-[12px] text-muted">{cap.summary}</p>
          {cap.knownGaps.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted">
              {cap.knownGaps.map((gap) => (
                <li key={gap}><span aria-hidden="true">· </span>{gap}</li>
              ))}
            </ul>
          )}
          <div className="ticker mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-faint">
            {cap.sources.map((s) => (
              <a
                key={s.id}
                href={`#src-${s.id}`}
                className={s.overdue ? "text-urgent hover:underline" : "hover:text-ink hover:underline"}
                title={`${s.name} — ${slaLabel(s.slaMinutes)}, ${s.lastOkAt ? `last ok ${lastAt(s.lastOkAt)}` : "no successful check"}${s.overdue ? " (overdue)" : ""}`}
              >
                {s.id} · {s.lastOkAt ? `ok ${lastAt(s.lastOkAt)}` : "no successful check"}
                {s.overdue && " · overdue"}
                {!s.enabled && " · disabled"}
                <span className="sr-only"> ({slaLabel(s.slaMinutes)})</span>
              </a>
            ))}
          </div>
        </div>
        <div className="ticker shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted">
          {READINESS_BADGE[cap.readiness]}
        </div>
      </div>
    </article>
  );
}

export default async function SourcesHealthPage() {
  const health = await getSourceHealth();
  // Coverage capabilities + per-source contracts. Failure here must not take
  // down the health dashboard — degrade to an explicit error note instead.
  const coverage: CoverageOverview | null = await getCoverageOverview().catch(() => null);

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
          Two views of the same promise: coverage capabilities (reviewed readiness ceilings,
          known gaps, required sources — worst first), then every configured source with its
          data flow, cadence and a 0–100 health score (reachability · cadence · productivity · quality).
        </p>
        <div className="ticker mt-3 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.12em]">
          {TIER_ORDER.filter((t) => counts[t]).map((t) => (
            <a key={t} href={`#tier-${t}`} className="hover:text-ink hover:underline">
              {TIER_LABEL[t]} <span className="text-ink">{counts[t]}</span>
            </a>
          ))}
          <span className="text-faint normal-case tracking-normal">
            as of {new Date().toISOString().slice(11, 16)} UTC
          </span>
        </div>
      </div>

      <section aria-label="Coverage capabilities" className="mb-8">
        <h2 className="ticker mb-2 text-[10px] uppercase tracking-[0.2em] text-faint">
          Coverage capabilities · {coverage?.capabilities.length ?? "—"}
        </h2>
        {coverage === null ? (
          <p className="rounded-md border border-line bg-surface/70 p-3 text-[12px] text-urgent">
            Coverage overview unavailable — the capability query failed. Health rows below are unaffected.
          </p>
        ) : coverage.capabilities.length === 0 ? (
          <p className="rounded-md border border-line bg-surface/70 p-3 text-[12px] text-muted">
            No coverage capabilities seeded yet. Run the worker boot seed to create the Phase 1 set.
          </p>
        ) : (
          <div className="space-y-2">
            {coverage.capabilities.map((cap) => (
              <CapabilityCard key={cap.id} cap={cap} />
            ))}
          </div>
        )}
      </section>

      <div className="space-y-6">
        {byTier.map(([tier, rows]) => (
          <section key={tier} id={`tier-${tier}`} className="scroll-mt-24">
            <h2 className="ticker mb-2 text-[10px] uppercase tracking-[0.2em] text-faint">{TIER_LABEL[tier]} · {rows.length}</h2>
            <div className="space-y-2">
              {rows.map((h) => (
                <Row key={h.id} h={h} spark={sparkBy.get(h.id) ?? []} contract={coverage?.bySource.get(h.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
