import Link from "next/link";
import type { HeroItem } from "../lib/home-data";
import { TrackedLink } from "./TrackedLink";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, hhmm, type Tiers } from "./alert-style";
import { addLocale } from "../lib/locale";

const proxied = (u: string) => `/api/img-proxy?u=${encodeURIComponent(u)}`;

/** The lead hero: a 2:1 image-forward feature. Handles both the usual alert hero
 * and the Daily-note fallback (when there are no alerts). Renders nothing if
 * there is no hero at all. */
export function HeroLead({
  hero, tiers, topStoryLabel, briefLabel, roundupLabel, byLabel, lang,
}: {
  hero: HeroItem;
  tiers: Tiers;
  topStoryLabel: string;
  briefLabel: string;
  roundupLabel: string;
  byLabel: string;
  lang: string;
}) {
  if (!hero) return null;

  const shell =
    "group flex flex-col overflow-hidden rounded-lg border border-line bg-surface/70 transition-colors hover:border-signal/40 lg:col-span-6";

  if (hero.kind === "note") {
    const n = hero.note;
    const roundup = n.kind === "roundup";
    const date = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(n.date));
    return (
      <Link href={addLocale(`/daily/${n.slug}`, lang as "en" | "zh")} className={shell} style={{ borderTop: "3px solid #4FD1C5" }}>
        <div className="flex flex-1 flex-col justify-center p-5">
          <div className="ticker mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] uppercase tracking-wider">
            <span className={`rounded px-1.5 py-0.5 ${roundup ? "bg-calm/15 text-calm" : "bg-signal/15 text-signal"}`}>{roundup ? roundupLabel : briefLabel}</span>
            <span className="text-faint">· {date} · {byLabel}</span>
          </div>
          <h2 className="font-display text-[23px] font-medium leading-[1.13] tracking-tight text-ink transition-colors group-hover:text-signal sm:text-[27px]">{n.title}</h2>
          {n.dek && <p className="mt-2.5 line-clamp-2 max-w-2xl text-[14.5px] leading-relaxed text-muted">{n.dek}</p>}
        </div>
      </Link>
    );
  }

  const a = hero.alert;
  const u = tierStyle(a.urgencyScore, tiers);
  const href = a.sourceUrls[0] ?? "#";
  const src = domainOf(href);
  const img = a.imageUrl && a.imageUrl.trim() !== "" ? a.imageUrl : null;

  const meta = (
    <div className="ticker mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] uppercase tracking-wider">
      {!img && <span className="text-signal">★ {topStoryLabel}</span>}
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${u.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${u.dot}`} />{u.label}
      </span>
      <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
      {a.regions.map((r) => <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>)}
      <span className="text-faint">· {src ?? ""} · {hhmm(a.publishedAt ?? a.createdAt)}</span>
    </div>
  );

  return (
    <TrackedLink
      href={href} event="alert_open"
      params={{ alert_title: a.title, alert_category: a.category, alert_region: a.regions[0], source: src }}
      className={shell} style={{ borderTop: `3px solid ${u.rail}` }}
    >
      {img ? (
        <>
          <div className="relative aspect-[2/1] bg-surface2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxied(img)} alt="" loading="lazy" className="h-full w-full object-cover" />
            <span className="ticker absolute left-3 top-3 inline-flex items-center gap-1.5 rounded bg-canvas/80 px-2 py-1 text-[10px] uppercase tracking-wider text-signal backdrop-blur">★ {topStoryLabel}</span>
          </div>
          <div className="flex flex-1 flex-col justify-center p-5">
            {meta}
            <h2 className="font-display text-[23px] font-medium leading-[1.13] tracking-tight text-ink transition-colors group-hover:text-signal sm:text-[27px]">{a.title}</h2>
            {a.summary && <p className="mt-2.5 line-clamp-2 max-w-2xl text-[14.5px] leading-relaxed text-muted">{a.summary}</p>}
          </div>
        </>
      ) : (
        /* text-led fallback: gradient panel + signal bar, no empty image slot */
        <div className="relative flex min-h-[340px] flex-1 flex-col justify-end bg-gradient-to-br from-surface2 to-surface p-7">
          <span className="mb-auto h-[3px] w-12 rounded-full bg-signal" aria-hidden="true" />
          <div className="mt-5">
            {meta}
            <h2 className="max-w-[22ch] text-balance font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.125rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-ink">{a.title}</h2>
            {a.summary && <p className="mt-2 line-clamp-3 max-w-[60ch] text-body text-muted">{a.summary}</p>}
          </div>
        </div>
      )}
    </TrackedLink>
  );
}
