import Link from "next/link";
import { getAlerts } from "../lib/alerts";
import { getDict } from "../lib/i18n";
import { addLocale } from "../lib/locale";
import { localizeAlerts } from "../lib/i18n-content";
import { bucketAlerts } from "../lib/buckets";
import { AlertCard } from "../components/AlertCard";
import { Filters } from "../components/Filters";

export const dynamic = "force-dynamic";

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

  let idx = 0;
  return (
    <div>
      <div className="mb-7">
        <div className="ticker flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-faint mb-3">
          <span className="inline-flex items-center gap-1.5 text-calm">
            <span className="h-1.5 w-1.5 rounded-full bg-calm animate-pulse-bar" /> {t.live}
          </span>
          <span>·</span>
          <span>{items.length} {t.dispatches}</span>
          {live > 0 && <><span>·</span><span className="text-urgent">{live} {t.actNow}</span></>}
        </div>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight max-w-2xl">
          {t.heroPre}<span className="italic text-signal">{t.heroEm}</span>{t.heroPost}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{t.heroSub}</p>
        <Link
          href={addLocale("/trends", lang)}
          className="ticker mt-4 inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-signal transition-colors hover:border-signal/60 hover:bg-signal/10"
        >
          🔥 {t.bestsellersTeaser} →
        </Link>
      </div>

      <Filters region={sp.region} category={sp.category} t={t} />

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="ticker text-[11px] uppercase tracking-[0.2em] text-faint">{t.empty}</p>
        </div>
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
                {b.rows.map((a) => <AlertCard key={a.id} a={a} index={idx++} t={t} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="mt-8 text-center">
          <Link
            href={`${addLocale("/wire", lang)}?${new URLSearchParams({ ...sp, cursor: nextCursor }).toString()}`}
            className="ticker rounded-sm border border-line px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-muted transition-colors hover:border-signal/40 hover:text-signal"
          >
            {t.loadEarlier}
          </Link>
        </div>
      )}
    </div>
  );
}
