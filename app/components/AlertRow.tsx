import type { AlertRow as Row } from "../lib/alerts";
import { TrackedLink } from "./TrackedLink";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, hhmm, type Tiers } from "./alert-style";

/** Compact, scannable alert row (no-image mode). Used in the Earlier feed and
 * secondary timelines. Whole row is the click target. */
export function AlertRow({ a, tiers }: { a: Row; tiers: Tiers }) {
  const u = tierStyle(a.urgencyScore, tiers);
  const href = a.sourceUrls[0];
  const src = domainOf(href);
  const cls = "group block rounded-xl border border-line bg-surface/70 px-4 py-3.5 transition-colors hover:bg-surface2";
  const style = { borderLeft: `3px solid ${u.rail}` };

  const inner = (
    <>
      <div className="ticker mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${u.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${u.dot}`} />{u.label}
        </span>
        <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
        {a.regions.map((r) => <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>)}
        {src && <span className="text-faint">· {src}</span>}
        <span className="ml-auto text-faint">{hhmm(a.publishedAt ?? a.createdAt)}</span>
      </div>
      <div className="font-display text-[17px] font-medium leading-snug text-paper transition-colors group-hover:text-signal">
        {a.title}
      </div>
    </>
  );

  return href ? (
    <TrackedLink href={href} event="alert_open" params={{ alert_title: a.title, alert_category: a.category, alert_region: a.regions[0], source: src }} className={cls} style={style}>
      {inner}
    </TrackedLink>
  ) : (
    <div className={cls} style={style}>{inner}</div>
  );
}
