import { getDict } from "./lib/i18n";
import { getHomeData } from "./lib/home-data";
import { cardMode } from "./lib/home";
import { BreakingStrip } from "./components/BreakingStrip";
import { StreamBand } from "./components/StreamBand";
import { WireCard, RadarCard, DailyCard } from "./components/StreamCard";
import { AlertRow } from "./components/AlertRow";
import { EarlierFeed } from "./components/EarlierFeed";
import { SubscribeBar } from "./components/SubscribeBar";

export const dynamic = "force-dynamic";

/**
 * Editorial Home: orient first (breaking → masthead → "Today at a glance" three
 * streams), then continue into the date-bucketed Earlier feed. Funnels into the
 * timeline secondary pages.
 */
export default async function Home() {
  const { lang, t } = await getDict();
  const { breaking, wireTop, radarTop, notes, earlierAlerts } = await getHomeData(lang);
  const tiers = { act: t.tierAct, watch: t.tierWatch, fyi: t.tierFyi };

  return (
    <div>
      <BreakingStrip alert={breaking} label={t.breaking} />

      <div className="mb-7">
        <h1 className="font-display text-[26px] leading-tight tracking-tight text-paper sm:text-[31px]">
          {t.homeMastheadPre}<span className="italic text-signal">{t.homeMastheadEm}</span>{t.homeMastheadPost}
        </h1>
        <p className="mt-2 max-w-2xl text-[14.5px] text-muted">{t.homeMastheadSub}</p>
      </div>

      <div className="ticker mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" /> {t.glance}
      </div>

      <StreamBand accent="bg-urgent" title={t.streamWire} sublabel={t.streamWireSub} count={`${wireTop.length} ${t.cntToday}`} href="/wire" seeAllLabel={t.seeAll}>
        <div className="grid gap-4 sm:grid-cols-3">
          {wireTop.map((a) =>
            cardMode(a) === "image"
              ? <WireCard key={a.id} a={a} tiers={tiers} />
              : <AlertRow key={a.id} a={a} tiers={tiers} />,
          )}
        </div>
      </StreamBand>

      <StreamBand accent="bg-signal" title={t.streamRadar} sublabel={t.streamRadarSub} count={`${radarTop.length} ${t.cntMoving}`} href="/trends" seeAllLabel={t.seeAll}>
        <div className="grid gap-4 sm:grid-cols-3">
          {radarTop.map((p) => <RadarCard key={p.key} p={p} />)}
        </div>
      </StreamBand>

      <StreamBand accent="bg-calm" title={t.streamDaily} sublabel={t.streamDailySub} count={`${notes.length} ${t.cntNew}`} href="/daily" seeAllLabel={t.seeAll}>
        <div className="grid gap-4 sm:grid-cols-2">
          {notes.map((n) => (
            <DailyCard key={n.slug} note={n} briefLabel={t.kindBrief} roundupLabel={t.kindRoundup} byLabel={t.dailyBy} lang={lang} />
          ))}
        </div>
      </StreamBand>

      <EarlierFeed
        alerts={earlierAlerts}
        labels={{ last1h: t.last1h, last4h: t.last4h, last8h: t.last8h, today: t.today, yesterday: t.yesterday }}
        lang={lang}
        tiers={tiers}
        strings={{ earlier: t.earlier, all: t.all, wire: t.streamWire, radar: t.streamRadar, daily: t.streamDaily, loadEarlier: t.loadEarlier, otherHint: t.earlierOtherHint }}
      />

      <SubscribeBar title={t.subscribeTitle} sub={t.subscribeSub} cta={t.subscribeCta} />
    </div>
  );
}
