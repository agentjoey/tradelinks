import Link from "next/link";
import type { AlertRow } from "../lib/alerts";
import type { ProductCard } from "../lib/home-data";
import { TrackedLink } from "./TrackedLink";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, type Tiers } from "./alert-style";
import { addLocale } from "../lib/locale";

const proxied = (u: string) => `/api/img-proxy?u=${encodeURIComponent(u)}`;

/** Image-forward Wire card (top-of-band). Used only when the alert has an image
 * (decision C: no-image alerts fall back to <AlertRow/>). */
export function WireCard({ a, tiers }: { a: AlertRow; tiers: Tiers }) {
  const u = tierStyle(a.urgencyScore, tiers);
  const href = a.sourceUrls[0] ?? "#";
  const src = domainOf(href);
  return (
    <TrackedLink
      href={href} event="alert_open"
      params={{ alert_title: a.title, alert_category: a.category, alert_region: a.regions[0], source: src }}
      className="group block overflow-hidden rounded-xl border border-line bg-surface/70 transition-colors hover:border-signal/40"
      style={{ borderTop: `3px solid ${u.rail}` }}
    >
      <div className="aspect-[16/10] overflow-hidden bg-surface2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxied(a.imageUrl!)} alt="" loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="p-4">
        <div className="ticker mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${u.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${u.dot}`} />{u.label}
          </span>
          <span className="text-signal">{CAT_LABEL[a.category] ?? a.category}</span>
          {a.regions.map((r) => <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>)}
          {src && <span className="ml-auto text-faint">{src}</span>}
        </div>
        <div className="font-display text-[16px] font-medium leading-snug text-paper transition-colors group-hover:text-signal">{a.title}</div>
      </div>
    </TrackedLink>
  );
}

/** Image-forward Radar product card: rank badge + platform tag + metric. */
export function RadarCard({ p }: { p: ProductCard }) {
  return (
    <TrackedLink
      href={p.url} event="bestseller_open"
      params={{ product_title: p.title, product_platform: p.platform, product_region: p.region }}
      className="group block overflow-hidden rounded-xl border border-line bg-surface/70 transition-colors hover:border-signal/40"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface2">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxied(p.imageUrl)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-faint">no image</span>
        )}
        {p.rank != null && (
          <span className="ticker absolute left-0 top-0 rounded-br-lg bg-signal px-2.5 py-1 text-[12px] font-semibold text-ink">#{p.rank}</span>
        )}
        <span className="ticker absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-paper/90">{p.platform}</span>
      </div>
      <div className="p-4">
        <div className="font-display text-[16px] font-medium leading-snug text-paper transition-colors group-hover:text-signal">{p.title}</div>
        <div className="ticker mt-2 text-[12px] font-semibold text-signal">
          {p.metric}{p.region ? ` · ${REGION_LABEL[p.region] ?? p.region}` : ""}
        </div>
      </div>
    </TrackedLink>
  );
}

interface NoteCard { slug: string; date: Date; title: string; dek: string | null; kind: string }

/** Editorial Daily card — text only (notes carry no image; decision C). */
export function DailyCard({ note, briefLabel, roundupLabel, byLabel, lang }: {
  note: NoteCard; briefLabel: string; roundupLabel: string; byLabel: string; lang: string;
}) {
  const roundup = note.kind === "roundup";
  const date = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(note.date));
  return (
    <Link href={addLocale(`/daily/${note.slug}`, lang as "en" | "zh")}
      className="group block rounded-xl border border-line bg-surface/70 p-5 transition-colors hover:border-signal/40"
      style={{ borderLeft: `2px solid ${roundup ? "#4FD1C5" : "#E8B44A"}` }}
    >
      <span className={`ticker text-[10px] uppercase tracking-wider ${roundup ? "text-calm" : "text-signal"}`}>{roundup ? roundupLabel : briefLabel}</span>
      <div className="mt-1 font-display text-[17px] font-medium leading-snug text-paper transition-colors group-hover:text-signal">{note.title}</div>
      {note.dek && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{note.dek}</p>}
      <div className="ticker mt-2 text-[11px] text-faint">{date} · {byLabel}</div>
    </Link>
  );
}
