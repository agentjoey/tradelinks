import type { AlertRow } from "../lib/alerts";
import type { Dict } from "../lib/i18n";

const CAT_LABEL: Record<string, string> = {
  regulatory: "REGULATORY", platform_policy: "PLATFORM", logistics: "LOGISTICS",
  trend: "TREND", industry: "INDUSTRY", tip: "TIP",
};
const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LATAM", australia_nz: "ANZ",
};

function urgency(s: number, t: Dict) {
  if (s >= 4) return { label: t.tierAct, cls: "bg-urgent/15 text-urgent border-urgent/40", rail: "bg-urgent", dot: "bg-urgent" };
  if (s >= 2) return { label: t.tierWatch, cls: "bg-watch/15 text-watch border-watch/40", rail: "bg-watch", dot: "bg-watch" };
  return { label: t.tierFyi, cls: "bg-faint/15 text-muted border-faint/40", rail: "bg-faint", dot: "bg-faint" };
}

function hhmm(d: Date | null) {
  return new Date(d ?? Date.now()).toISOString().slice(11, 16) + "Z";
}

export function AlertCard({ a, index = 0, t }: { a: AlertRow; index?: number; t: Dict }) {
  const u = urgency(a.urgencyScore, t);
  const href = a.sourceUrls[0];
  const more = a.sourceUrls.length - 1;
  const img = a.imageUrl ? `/api/img-proxy?u=${encodeURIComponent(a.imageUrl)}` : null;

  return (
    <article
      className="group relative animate-rise overflow-hidden rounded-md border border-line bg-surface/70 transition-colors duration-200 hover:border-line hover:bg-surface2"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className={`absolute left-0 top-0 h-full w-[3px] ${u.rail}`} />
      <div className="p-4 pl-5">
        <div className="ticker mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.12em]">
          <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 ${u.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${u.dot}`} />
            {u.label}
          </span>
          <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
          <span className="text-faint">·</span>
          {a.regions.map((r) => (
            <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>
          ))}
          {a.platforms.map((p) => (
            <span key={p} className="rounded-sm bg-paper/[0.06] px-1.5 py-0.5 text-[9px] text-paper/70">{p}</span>
          ))}
          <span className="ml-auto text-faint">{hhmm(a.publishedAt ?? a.createdAt)}</span>
        </div>

        {/* layout: text + optional right-side thumbnail (image is constrained, never cropped to full width) */}
        <div className={img ? "flex gap-4" : ""}>
          <div className="min-w-0 flex-1">
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer"
                 className="group/title block font-display text-[19px] font-medium leading-snug text-paper transition-colors hover:text-signal">
                {a.title}
                <span className="ml-1 text-[13px] text-faint transition-colors group-hover/title:text-signal">↗</span>
              </a>
            ) : (
              <h2 className="font-display text-[19px] font-medium leading-snug text-paper">{a.title}</h2>
            )}
            {a.summary && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{a.summary}</p>}
          </div>

          {img && (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="hidden shrink-0 sm:block">
              <span className="flex h-[88px] w-[132px] items-center justify-center overflow-hidden rounded border border-line bg-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
              </span>
            </a>
          )}
        </div>

        {a.actionRequired && (
          <div className="mt-3 flex gap-2 border-l border-signal/30 pl-3 text-[13px] leading-relaxed">
            <span className="ticker shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-signal">{t.act}</span>
            <span className="text-paper/90">{a.actionRequired}</span>
          </div>
        )}

        {more > 0 && (
          <div className="ticker mt-2 text-[10px] uppercase tracking-[0.12em] text-faint">{t.moreSources(more)}</div>
        )}
      </div>
    </article>
  );
}
