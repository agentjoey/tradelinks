import type { CSSProperties } from "react";
import type { AlertRow } from "../lib/alerts";
import { TrackedLink } from "./TrackedLink";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, type Tiers } from "./alert-style";

const proxied = (u: string) => `/api/img-proxy?u=${encodeURIComponent(u)}`;

/** The two secondary highlight cards beside the hero: top image (16:9) + kicker +
 * headline, stretched (flex-1) to match the hero height. */
export function SecondaryHighlights({ alerts, tiers }: { alerts: AlertRow[]; tiers: Tiers }) {
  return (
    <div className="flex flex-col gap-4 lg:col-span-3" style={{ "--i": 1 } as CSSProperties}>
      {alerts.map((a) => {
        const u = tierStyle(a.urgencyScore, tiers);
        const href = a.sourceUrls[0] ?? "#";
        const src = domainOf(href);
        const img = a.imageUrl && a.imageUrl.trim() !== "" ? a.imageUrl : null;
        return (
          <TrackedLink
            key={a.id} href={href} event="alert_open"
            params={{ alert_title: a.title, alert_category: a.category, alert_region: a.regions[0], source: src }}
            className="card-scan group flex flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface/70 transition-colors hover:border-signal/40"
          >
            {img && (
              <div className="aspect-[16/9] shrink-0 bg-surface2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proxied(img)} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="flex flex-1 flex-col justify-center p-3.5">
              <div className="ticker mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] uppercase tracking-wider">
                <span className={`rounded px-1.5 py-0.5 ${u.pill}`}>{u.label}</span>
                <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
                {a.regions[0] && <span className="text-muted">{REGION_LABEL[a.regions[0]] ?? a.regions[0]}</span>}
              </div>
              <div className="font-display text-[15.5px] font-medium leading-snug text-ink transition-colors group-hover:text-signal">{a.title}</div>
            </div>
          </TrackedLink>
        );
      })}
    </div>
  );
}
