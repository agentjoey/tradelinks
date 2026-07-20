import { getDict } from "../lib/i18n";
import { addLocale } from "../lib/locale";
import { getHomeData } from "../lib/home-data";
import { HeroLead } from "../components/HeroLead";
import { SecondaryHighlights } from "../components/SecondaryHighlights";
import { LatestRail } from "../components/LatestRail";
import { WireSection } from "../components/WireSection";
import { RadarSection } from "../components/RadarSection";
import { HotOnX } from "../components/HotOnX";
import { DailyCard } from "../components/StreamCard";
import { SectionHeader } from "../components/SectionHeader";
import { SubscribeBar } from "../components/SubscribeBar";

export const dynamic = "force-dynamic";

/**
 * Editorial Home (BL-026 v2, mining-technology layout): a lead-hero + 2 secondary
 * highlights + live Latest cluster, then visually distinct sections (Wire
 * featured+list, Radar #1+grid, Hot on X discussion, Daily Insight) with the
 * earlier feed folded into each. Funnels into the timeline secondary pages.
 */
export default async function Home() {
  const { lang, t } = await getDict();
  const {
    hero, secondary, latest, wireFeatured, wireList, radarLeader, radarGrid, hotTopics, notes,
  } = await getHomeData(lang);
  const tiers = { act: t.tierAct, watch: t.tierWatch, fyi: t.tierFyi };

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-display text-[26px] leading-tight tracking-tight text-ink sm:text-[31px]">
          {t.homeMastheadPre}<span className="italic text-signal">{t.homeMastheadEm}</span>{t.homeMastheadPost}
        </h1>
        <p className="mt-2 max-w-2xl text-[14.5px] text-muted">{t.homeMastheadSub}</p>
      </div>

      <div className="ticker mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" /> {t.glance}
      </div>

      {/* top cluster: hero + 2 secondary highlights + live Latest rail */}
      <section className="mb-12 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <HeroLead
          hero={hero} tiers={tiers} topStoryLabel={t.topStory}
          briefLabel={t.kindBrief} roundupLabel={t.kindRoundup} byLabel={t.dailyBy} lang={lang}
        />
        <SecondaryHighlights alerts={secondary} tiers={tiers} />
        <LatestRail
          items={latest} latestLabel={t.latest} liveLabel="live" seeAllLabel={t.seeAll} href={addLocale("/wire", lang)}
          kindLabels={{ wire: t.streamWire, radar: t.streamRadar, x: "X" }}
        />
      </section>

      <WireSection
        featured={wireFeatured} list={wireList} tiers={tiers}
        title={t.streamWire} sublabel={t.streamWireSub} seeAllLabel={t.seeAll} href={addLocale("/wire", lang)}
      />

      <RadarSection
        leader={radarLeader} grid={radarGrid}
        title={t.streamRadar} sublabel={t.streamRadarSub} seeAllLabel={t.seeAll} href={addLocale("/trends", lang)}
      />

      <HotOnX
        topics={hotTopics}
        title={t.streamX} sublabel={t.streamXSub} seeAllLabel={t.seeAll} href={addLocale("/trends", lang)} emptyLabel={t.hotXEmpty}
      />

      <section className="mb-12">
        <SectionHeader accent="bg-calm" title={t.streamDaily} sublabel={t.streamDailySub} href={addLocale("/daily", lang)} seeAllLabel={t.seeAll} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <DailyCard key={n.slug} note={n} briefLabel={t.kindBrief} roundupLabel={t.kindRoundup} byLabel={t.dailyBy} lang={lang} />
          ))}
        </div>
      </section>

      <SubscribeBar title={t.subscribeTitle} sub={t.subscribeSub} cta={t.subscribeCta} />
    </div>
  );
}
