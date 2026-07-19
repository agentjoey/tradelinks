import type { AlertRow as Row } from "../lib/alerts";
import type { Dict } from "../lib/i18n";
import { TrackedLink } from "./TrackedLink";
import { AlertRow } from "./AlertRow";
import { cardMode } from "../lib/home";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, hhmm } from "./alert-style";

/**
 * Timeline alert card, dual-mode (decision C): no image → compact AlertRow;
 * has image → a larger lead-image card (image shows on mobile too).
 */
export function AlertCard({ a, index = 0, t }: { a: Row; index?: number; t: Dict }) {
  const tiers = { act: t.tierAct, watch: t.tierWatch, fyi: t.tierFyi };
  if (cardMode(a) === "compact") return <AlertRow a={a} tiers={tiers} />;

  const u = tierStyle(a.urgencyScore, tiers);
  const href = a.sourceUrls[0];
  const more = a.sourceUrls.length - 1;
  const img = `/api/img-proxy?u=${encodeURIComponent(a.imageUrl!)}`;
  const src = domainOf(href);
  const ev = { alert_title: a.title, alert_category: a.category, alert_region: a.regions[0], source: src };

  return (
    <article
      className="group relative animate-rise overflow-hidden rounded-md border border-line bg-surface/70 transition-colors duration-200 hover:bg-surface2"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className={`absolute left-0 top-0 h-full w-[3px] ${u.accent}`} />
      <div className="p-4 pl-5">
        <div className="ticker mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.12em]">
          <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 ${u.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${u.dot}`} />{u.label}
          </span>
          <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
          <span className="text-faint">·</span>
          {a.regions.map((r) => <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>)}
          {a.platforms.map((p) => <span key={p} className="rounded-sm bg-surface2 px-1.5 py-0.5 text-[9px] text-ink/70">{p}</span>)}
          {src && <span className="text-faint">{src}</span>}
          <span className="ml-auto text-faint">{hhmm(a.publishedAt ?? a.createdAt)}</span>
        </div>

        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            {href ? (
              <TrackedLink href={href} event="alert_open" params={ev}
                className="group/title block font-display text-[19px] font-medium leading-snug text-ink transition-colors hover:text-signal">
                {a.title}
                <span className="ml-1 text-[13px] text-faint transition-colors group-hover/title:text-signal">↗</span>
              </TrackedLink>
            ) : (
              <h2 className="font-display text-[19px] font-medium leading-snug text-ink">{a.title}</h2>
            )}
            {a.summary && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{a.summary}</p>}
          </div>

          {href && (
            <TrackedLink href={href} event="alert_open" params={ev} className="block shrink-0">
              <span className="flex h-[104px] w-[140px] items-center justify-center overflow-hidden rounded border border-line bg-canvas sm:w-[156px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
              </span>
            </TrackedLink>
          )}
        </div>

        {a.actionRequired && (
          <div className="mt-3 flex gap-2 border-l border-signal/30 pl-3 text-[13px] leading-relaxed">
            <span className="ticker shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-signal">{t.act}</span>
            <span className="text-ink/90">{a.actionRequired}</span>
          </div>
        )}

        {more > 0 && (
          <div className="ticker mt-2 text-[10px] uppercase tracking-[0.12em] text-faint">{t.moreSources(more)}</div>
        )}
      </div>
    </article>
  );
}
