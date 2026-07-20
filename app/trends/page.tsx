import { getTrendsView, getBestsellers, getRadarKpis, getMovers } from "../../src/trends/db.js";
import { getViralX, getHotTopicsX } from "../../src/social/db.js";
import { SOURCES, BESTSELLER_SOURCE_IDS } from "../../src/config/sources.js";
import { getDict } from "../lib/i18n";
import { CAT_LABEL, REGION_LABEL } from "../lib/labels";
import { BestsellersBoard } from "./BestsellersBoard";
import { SignalCard } from "../components/SignalCard";
import { PageHeader } from "../components/PageHeader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REGION_ORDER = ["north_america", "europe", "middle_east", "australia_nz", "southeast_asia", "latin_america"];

function Kpi({ n, label, spark }: { n: number; label: string; spark?: number[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface/70 p-4">
      <div className="font-display text-3xl leading-none text-ink">{n}</div>
      <div className="ticker mt-1.5 text-[10px] uppercase tracking-[0.12em] text-faint">{label}</div>
      {spark && spark.length > 0 && (
        <div className="mt-2 flex h-4 items-end gap-1">
          {spark.map((v, i) => (
            <div key={i} className="flex-1 rounded-sm bg-signal/50" style={{ height: `${Math.max(15, v * 100)}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function TrendsPage() {
  const { t } = await getDict();
  const [{ signals }, bestsellers, kpis, viralX, hotX, movers] = await Promise.all([
    getTrendsView(),
    getBestsellers(),
    getRadarKpis(),
    getViralX(),
    getHotTopicsX(),
    getMovers(),
  ]);

  // KPI derivations from the bestseller rows
  const regionCounts = new Map<string, number>();
  for (const b of bestsellers) regionCounts.set(b.region, (regionCounts.get(b.region) ?? 0) + 1);
  const maxR = Math.max(1, ...regionCounts.values());
  const regionMix = REGION_ORDER.filter((r) => regionCounts.has(r)).map((r) => regionCounts.get(r)! / maxR);
  const feeds = SOURCES.filter((s) => BESTSELLER_SOURCE_IDS.has(s.id) && s.enabled !== false).length;

  return (
    <div>
      <PageHeader
        eyebrow={t.radarEyebrow}
        title={<>{t.radarPre}<span className="italic text-signal">{t.radarEm}</span>.</>}
        sub={t.radarSub}
      />

      {/* KPI strip */}
      <div className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi n={kpis.products} label={t.kpiProducts} />
        <Kpi n={regionCounts.size} label={t.kpiRegions} spark={regionMix} />
        <Kpi n={feeds} label={t.kpiFeeds} />
        <Kpi n={kpis.signals} label={t.kpiSignals} />
      </div>

      {/* The Movers — flagship: proprietary movers + evidence-bound insight (BL-044) */}
      {movers.length > 0 && (
        <div className="mb-12">
          <h2 className="ticker mb-1 text-[10px] uppercase tracking-[0.2em] text-signal/80">The Movers</h2>
          <p className="mb-4 max-w-xl text-[13px] text-muted">
            Products on the move on Amazon — what changed, why now, and what it means for sellers.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {movers.map((m, i) => (
              <div key={`${m.asin}-${m.region}`} className="animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
                <SignalCard
                  tone="signal"
                  tierLabel={REGION_LABEL[m.region] ?? m.region}
                  meta={[
                    CAT_LABEL[m.category] ?? m.category,
                    m.rank != null ? `#${m.rank}` : null,
                    m.rankDelta != null && m.rankDelta > 0 ? `▲ ${m.rankDelta}` : null,
                    m.isNewEntrant ? "NEW" : null,
                    ...m.spreadingTo.map((r) => `→ ${REGION_LABEL[r] ?? r}`),
                  ].filter((s): s is string => !!s).join(" · ")}
                  title={m.title}
                  foot={
                    <>
                      <span className="block text-meta leading-relaxed text-muted">{m.whyNow}</span>
                      <span className="mt-1.5 block text-meta leading-relaxed text-ink/90">{m.soWhat}</span>
                    </>
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* bestsellers board (region chips + category cards live inside) */}
      <div className="mb-12">
        <h2 className="ticker mb-1 text-[10px] uppercase tracking-[0.2em] text-signal/80">{t.bestsellers}</h2>
        <p className="mb-4 max-w-xl text-[13px] text-muted">{t.bestsellersSub}</p>
        {bestsellers.length === 0 ? (
          <p className="text-sm text-muted">{t.bestsellersEmpty}</p>
        ) : (
          <BestsellersBoard items={bestsellers} />
        )}
      </div>

      {/* viral on X — social product signal (Radar-only) */}
      <div className="mb-12">
        <h2 className="ticker mb-1 text-[10px] uppercase tracking-[0.2em] text-signal/80">{t.viralX}</h2>
        <p className="mb-4 max-w-xl text-[13px] text-muted">{t.viralXSub}</p>
        {viralX.length === 0 ? (
          <p className="text-sm text-muted">{t.viralXEmpty}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {viralX.map((x, i) => (
              <div key={x.link + i} className="animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
                <SignalCard
                  href={x.link} external tone="signal"
                  meta={`♥ ${x.likes.toLocaleString()}`}
                  title={x.product}
                  dek={x.whyViral || undefined}
                  imageUrl={x.imageUrl}
                  foot={
                    <span className="ticker text-meta text-faint">🔁 {x.retweets.toLocaleString()} · X</span>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* cross-border e-commerce hot topics on X — separate track */}
      <div className="mb-12">
        <h2 className="ticker mb-1 text-[10px] uppercase tracking-[0.2em] text-signal/80">{t.hotX}</h2>
        <p className="mb-4 max-w-xl text-[13px] text-muted">{t.hotXSub}</p>
        {hotX.length === 0 ? (
          <p className="text-sm text-muted">{t.hotXEmpty}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hotX.map((x, i) => (
              <div key={x.link + i} className="animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
                <SignalCard
                  href={x.link} external tone="calm"
                  tierLabel={x.category}
                  meta={`${x.author ? `@${x.author.replace(/^@/, "")} · ` : ""}♥ ${x.likes.toLocaleString()}`}
                  title={x.headline}
                  dek={x.whyHot || undefined}
                  foot={
                    <span className="ticker text-meta text-faint">🔁 {x.retweets.toLocaleString()} · X</span>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* cross-region diffusion — analytics cards */}
      <h2 className="ticker mb-3 text-[10px] uppercase tracking-[0.2em] text-faint">{t.diffusionSignals}</h2>
      {signals.length === 0 ? (
        <p className="text-sm text-muted">No diffusion signals yet — run the trends ingest.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((s, i) => (
            <div key={s.keyword + i} className="animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
              <SignalCard
                tone="signal"
                meta={`${REGION_LABEL[s.originRegion] ?? s.originRegion} → ${s.spreadingTo.map((r) => REGION_LABEL[r] ?? r).join(", ")} · ${Math.round(s.confidence * 100)}%`}
                title={s.keyword}
                dek={s.signalBasis}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
