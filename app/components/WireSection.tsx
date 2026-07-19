import type { AlertRow } from "../lib/alerts";
import { SectionHeader } from "./SectionHeader";
import { TrackedLink } from "./TrackedLink";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, hhmm, type Tiers } from "./alert-style";

const proxied = (u: string) => `/api/img-proxy?u=${encodeURIComponent(u)}`;
const trackParams = (a: AlertRow) => ({ alert_title: a.title, alert_category: a.category, alert_region: a.regions[0], source: domainOf(a.sourceUrls[0]) });

/** Wire = featured image card (col-span-5) + a list of rows with thumbnails
 * (col-span-7), folding "earlier" alerts into the same section. */
export function WireSection({
  featured, list, tiers, title, sublabel, seeAllLabel, href,
}: {
  featured: AlertRow | null;
  list: AlertRow[];
  tiers: Tiers;
  title: string;
  sublabel: string;
  seeAllLabel: string;
  href: string;
}) {
  return (
    <section className="mb-12">
      <SectionHeader accent="bg-urgent" title={title} sublabel={sublabel} href={href} seeAllLabel={seeAllLabel} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {featured && <Featured a={featured} tiers={tiers} />}
        <div className="divide-y divide-line rounded-lg border border-line bg-surface/40 lg:col-span-7">
          {list.map((a) => <ListRow key={a.id} a={a} tiers={tiers} />)}
        </div>
      </div>
    </section>
  );
}

function Featured({ a, tiers }: { a: AlertRow; tiers: Tiers }) {
  const u = tierStyle(a.urgencyScore, tiers);
  const href = a.sourceUrls[0] ?? "#";
  const src = domainOf(href);
  const img = a.imageUrl && a.imageUrl.trim() !== "" ? a.imageUrl : null;
  return (
    <TrackedLink href={href} event="alert_open" params={trackParams(a)}
      className="group overflow-hidden rounded-lg border border-line bg-surface/70 transition-colors hover:border-signal/40 lg:col-span-5"
      style={{ borderTop: `3px solid ${u.rail}` }}
    >
      {img && (
        <div className="aspect-[16/10] bg-surface2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxied(img)} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="p-4 sm:p-5">
        <div className="ticker mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${u.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${u.dot}`} />{u.label}
          </span>
          <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
          {a.regions[0] && <span className="text-muted">{REGION_LABEL[a.regions[0]] ?? a.regions[0]}</span>}
          {src && <span className="ml-auto text-faint">{src}</span>}
        </div>
        <div className="font-display text-[19px] font-medium leading-snug text-ink transition-colors group-hover:text-signal">{a.title}</div>
        {a.summary && <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{a.summary}</p>}
      </div>
    </TrackedLink>
  );
}

function ListRow({ a, tiers }: { a: AlertRow; tiers: Tiers }) {
  const u = tierStyle(a.urgencyScore, tiers);
  const href = a.sourceUrls[0] ?? "#";
  const src = domainOf(href);
  const img = a.imageUrl && a.imageUrl.trim() !== "" ? a.imageUrl : null;
  return (
    <TrackedLink href={href} event="alert_open" params={trackParams(a)}
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface2/60"
    >
      <div className="min-w-0 flex-1">
        <div className="ticker mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider">
          <span className={`rounded px-1.5 py-0.5 ${u.pill}`}>{u.label}</span>
          <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
          {a.regions[0] && <span className="text-muted">{REGION_LABEL[a.regions[0]] ?? a.regions[0]}</span>}
          <span className="ml-auto text-faint">{src ? `${src} · ` : ""}{hhmm(a.publishedAt ?? a.createdAt)}</span>
        </div>
        <div className="font-display text-[16px] font-medium leading-snug text-ink transition-colors group-hover:text-signal">{a.title}</div>
      </div>
      {img && (
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxied(img)} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      )}
    </TrackedLink>
  );
}
