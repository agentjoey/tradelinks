import Link from "next/link";
import { getAlerts, type AlertRow } from "../lib/alerts";
import { getDict, type Dict } from "../lib/i18n";
import { addLocale } from "../lib/locale";
import { localizeAlerts } from "../lib/i18n-content";
import { bucketAlerts } from "../lib/buckets";
import { cardMode } from "../lib/home";
import { Filters } from "../components/Filters";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { SignalCard, type SignalTone } from "../components/SignalCard";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, hhmm } from "../components/alert-style";

export const dynamic = "force-dynamic";

/** Urgency → card tone: ≥4 urgent, ≥2 signal, else neutral. */
const toneOf = (score: number): SignalTone => (score >= 4 ? "urgent" : score >= 2 ? "signal" : "neutral");

const proxied = (u: string) => `/api/img-proxy?u=${encodeURIComponent(u)}`;

/** Timeline alert on the unified SignalCard (decision C kept): image → thumb
 * card with dek + action foot; no image → compact text row. Tier via chip. */
function WireAlertCard({ a, t }: { a: AlertRow; t: Dict }) {
  const u = tierStyle(a.urgencyScore, { act: t.tierAct, watch: t.tierWatch, fyi: t.tierFyi });
  const href = a.sourceUrls[0];
  const src = domainOf(href);
  const image = cardMode(a) === "image";
  const more = a.sourceUrls.length - 1;
  const meta = [
    CAT_LABEL[a.category] ?? a.category,
    ...a.regions.map((r) => REGION_LABEL[r] ?? r),
    src,
    hhmm(a.publishedAt ?? a.createdAt),
  ].filter((s): s is string => !!s).join(" · ");
  const foot = image && (a.actionRequired || more > 0) ? (
    <span className="mt-1 flex flex-col gap-1.5">
      {a.actionRequired ? (
        <span className="flex gap-2 border-l border-signal/30 pl-3 text-[13px] leading-relaxed">
          <span className="ticker shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-signal">{t.act}</span>
          <span className="text-ink/90">{a.actionRequired}</span>
        </span>
      ) : null}
      {more > 0 ? (
        <span className="ticker text-[10px] uppercase tracking-[0.12em] text-faint">{t.moreSources(more)}</span>
      ) : null}
    </span>
  ) : undefined;

  return (
    <SignalCard
      href={href}
      track={href ? { event: "alert_open", params: { alert_title: a.title, alert_category: a.category, alert_region: a.regions[0], source: src } } : undefined}
      tierLabel={u.label}
      tone={toneOf(a.urgencyScore)}
      meta={meta}
      title={a.title}
      dek={image ? a.summary ?? undefined : undefined}
      imageUrl={image ? proxied(a.imageUrl!) : null}
      imageLayout="thumb"
      foot={foot}
    />
  );
}

export default async function Wire({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; category?: string; platform?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const { lang, t } = await getDict();
  const { items: rawItems, nextCursor } = await getAlerts(sp);
  const items = await localizeAlerts(rawItems, lang);
  const live = items.filter((a) => a.urgencyScore >= 4).length;
  const buckets = bucketAlerts(
    items,
    { last1h: t.last1h, last4h: t.last4h, last8h: t.last8h, today: t.today, yesterday: t.yesterday },
    lang,
  );

  return (
    <div>
      <PageHeader
        eyebrow={t.eyebrow}
        title={<>{t.heroPre}<span className="italic text-signal">{t.heroEm}</span>{t.heroPost}</>}
        sub={t.heroSub}
      >
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="ticker flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-faint">
            <span className="inline-flex items-center gap-1.5 text-calm">
              <span className="h-1.5 w-1.5 rounded-full bg-calm animate-pulse-bar" /> {t.live}
            </span>
            <span>·</span>
            <span>{items.length} {t.dispatches}</span>
            {live > 0 && <><span>·</span><span className="text-urgent">{live} {t.actNow}</span></>}
          </div>
          <Link
            href={addLocale("/trends", lang)}
            className="ticker inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-signal transition-colors hover:border-signal/60 hover:bg-signal/10"
          >
            🔥 {t.bestsellersTeaser} →
          </Link>
        </div>
      </PageHeader>

      <Filters region={sp.region} category={sp.category} t={t} lang={lang} />

      {items.length === 0 ? (
        <EmptyState
          title={t.empty}
          action={
            <Link
              className="ticker rounded-full border border-linestrong px-3 py-1.5 text-label uppercase text-muted hover:border-signal hover:text-signal"
              href={addLocale("/wire", lang)}
            >
              {t.emptyReset}
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {buckets.map((b) => (
            <section key={b.key}>
              <div className="sticky top-16 z-[5] -mx-1 mb-3 flex items-center gap-3 bg-canvas/85 px-1 py-1 backdrop-blur">
                <h2 className="ticker text-[11px] font-semibold uppercase tracking-[0.22em] text-ink">{b.label}</h2>
                <span className="ticker text-[10px] text-faint">{b.rows.length}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2.5">
                {b.rows.map((a) => <WireAlertCard key={a.id} a={a} t={t} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="mt-8 text-center">
          <Link
            href={`${addLocale("/wire", lang)}?${new URLSearchParams({ ...sp, cursor: nextCursor }).toString()}`}
            aria-label={t.loadEarlier}
            className="ticker rounded-sm border border-line px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-muted transition-colors hover:border-signal/40 hover:text-signal"
          >
            {t.loadEarlier}
          </Link>
        </div>
      )}
    </div>
  );
}
