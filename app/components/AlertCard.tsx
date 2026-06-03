import type { AlertRow } from "../lib/alerts";

const CAT_LABEL: Record<string, string> = {
  regulatory: "REGULATORY", platform_policy: "PLATFORM", logistics: "LOGISTICS",
  trend: "TREND", industry: "INDUSTRY", tip: "TIP",
};
const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LATAM", australia_nz: "ANZ",
};

function tone(s: number) {
  if (s >= 4) return { bar: "bg-urgent", num: "text-urgent", ring: "shadow-[0_0_24px_-6px_rgba(255,90,77,0.5)]", label: "CRITICAL" };
  if (s >= 2) return { bar: "bg-watch", num: "text-watch", ring: "", label: "WATCH" };
  return { bar: "bg-faint", num: "text-faint", ring: "", label: "NOTE" };
}

function ago(d: Date | null) {
  const t = new Date(d ?? Date.now()).getTime();
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export function AlertCard({ a, index = 0 }: { a: AlertRow; index?: number }) {
  const t = tone(a.urgencyScore);
  return (
    <article
      className={`group relative animate-rise overflow-hidden rounded-md border border-line bg-surface/70 transition-all duration-200 hover:border-line hover:bg-surface2 ${t.ring}`}
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      {/* urgency rail */}
      <div className={`absolute left-0 top-0 h-full w-[3px] ${t.bar}`} />

      <div className="grid grid-cols-[auto_1fr] gap-4 p-4 pl-5">
        {/* score column */}
        <div className="flex w-12 flex-col items-center pt-0.5">
          <span className={`ticker text-2xl font-semibold leading-none ${t.num}`}>
            {a.urgencyScore.toFixed(1)}
          </span>
          <span className="ticker mt-1 text-[8px] uppercase tracking-[0.15em] text-faint">{t.label}</span>
        </div>

        {/* body */}
        <div className="min-w-0">
          <div className="ticker mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.12em]">
            <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
            <span className="text-faint">/</span>
            {a.regions.map((r) => (
              <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>
            ))}
            {a.platforms.map((p) => (
              <span key={p} className="rounded-sm bg-paper/[0.06] px-1.5 py-0.5 text-[9px] text-paper/70">{p}</span>
            ))}
            <span className="ml-auto text-faint">{ago(a.publishedAt ?? a.createdAt)} ago</span>
          </div>

          <h2 className="font-display text-[19px] font-medium leading-snug text-paper">
            {a.title}
          </h2>

          {a.summary && (
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{a.summary}</p>
          )}

          {a.actionRequired && (
            <div className="mt-3 flex gap-2 border-l border-signal/30 pl-3 text-[13px] leading-relaxed">
              <span className="ticker shrink-0 text-[10px] uppercase tracking-wider text-signal pt-0.5">act</span>
              <span className="text-paper/90">{a.actionRequired}</span>
            </div>
          )}

          {a.sourceUrls[0] && (
            <a
              href={a.sourceUrls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="ticker mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-faint transition-colors hover:text-signal"
            >
              source{a.sourceUrls.length > 1 ? ` +${a.sourceUrls.length - 1}` : ""}
              <span className="transition-transform group-hover:translate-x-0.5">↗</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
