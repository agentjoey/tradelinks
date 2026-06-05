import { getTrendsView, getBestsellers, getRadarKpis } from "../../src/trends/db.js";
import { getViralX, getHotTopicsX } from "../../src/social/db.js";
import { SOURCES, BESTSELLER_SOURCE_IDS } from "../../src/config/sources.js";
import { getDict } from "../lib/i18n";
import { BestsellersBoard } from "./BestsellersBoard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LATAM", australia_nz: "ANZ",
};
const REGION_ORDER = ["north_america", "europe", "middle_east", "australia_nz", "southeast_asia", "latin_america"];

function Kpi({ n, label, spark }: { n: number; label: string; spark?: number[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface/70 p-4">
      <div className="font-display text-3xl leading-none text-paper">{n}</div>
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
  const [{ signals }, bestsellers, kpis, viralX, hotX] = await Promise.all([
    getTrendsView(),
    getBestsellers(),
    getRadarKpis(),
    getViralX(),
    getHotTopicsX(),
  ]);

  // KPI derivations from the bestseller rows
  const regionCounts = new Map<string, number>();
  for (const b of bestsellers) regionCounts.set(b.region, (regionCounts.get(b.region) ?? 0) + 1);
  const maxR = Math.max(1, ...regionCounts.values());
  const regionMix = REGION_ORDER.filter((r) => regionCounts.has(r)).map((r) => regionCounts.get(r)! / maxR);
  const feeds = SOURCES.filter((s) => BESTSELLER_SOURCE_IDS.has(s.id) && s.enabled !== false).length;

  return (
    <div>
      <div className="mb-7">
        <div className="ticker text-[10px] uppercase tracking-[0.2em] text-signal/80 mb-2">{t.radarEyebrow}</div>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight">
          {t.radarPre}<span className="italic text-signal">{t.radarEm}</span>.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-muted">{t.radarSub}</p>
      </div>

      {/* KPI strip */}
      <div className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi n={kpis.products} label={t.kpiProducts} />
        <Kpi n={regionCounts.size} label={t.kpiRegions} spark={regionMix} />
        <Kpi n={feeds} label={t.kpiFeeds} />
        <Kpi n={kpis.signals} label={t.kpiSignals} />
      </div>

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
              <a
                key={x.link + i}
                href={x.link}
                target="_blank"
                rel="noopener noreferrer"
                className="animate-rise group flex gap-3 rounded-lg border border-line border-l-2 border-l-signal bg-surface/70 p-4 transition-colors hover:border-l-signal hover:bg-surface"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {x.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.imageUrl} alt="" className="h-14 w-14 flex-none rounded-md object-cover" loading="lazy" />
                )}
                <div className="min-w-0">
                  <div className="font-display text-[15px] leading-tight text-paper group-hover:text-signal">{x.product}</div>
                  {x.whyViral && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">{x.whyViral}</p>}
                  <div className="ticker mt-2 flex items-center gap-3 text-[11px] text-faint">
                    <span className="text-signal/90">♥ {x.likes.toLocaleString()}</span>
                    <span>🔁 {x.retweets.toLocaleString()}</span>
                    <span className="text-faint/70">X</span>
                  </div>
                </div>
              </a>
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
              <a
                key={x.link + i}
                href={x.link}
                target="_blank"
                rel="noopener noreferrer"
                className="animate-rise group rounded-lg border border-line border-l-2 border-l-calm bg-surface/70 p-4 transition-colors hover:bg-surface"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="ticker mb-1.5 text-[10px] uppercase tracking-[0.1em] text-calm">{x.category}</div>
                <div className="font-display text-[15px] leading-tight text-paper group-hover:text-calm">{x.headline}</div>
                {x.whyHot && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">{x.whyHot}</p>}
                <div className="ticker mt-2 flex items-center gap-3 text-[11px] text-faint">
                  <span className="text-signal/90">♥ {x.likes.toLocaleString()}</span>
                  <span>🔁 {x.retweets.toLocaleString()}</span>
                  <span className="text-faint/70">X</span>
                </div>
              </a>
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
            <article
              key={s.keyword + i}
              className="animate-rise rounded-lg border border-line border-l-2 border-l-signal bg-surface/70 p-4"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-display text-[18px] text-paper">{s.keyword}</div>
                <span className="ticker text-[11px] text-signal">{Math.round(s.confidence * 100)}%</span>
              </div>
              <div className="ticker mt-2 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-[0.1em]">
                <span className="rounded-sm bg-calm/15 px-1.5 py-0.5 text-calm">
                  {REGION_LABEL[s.originRegion] ?? s.originRegion}
                </span>
                <span className="text-faint">→</span>
                {s.spreadingTo.map((r) => (
                  <span key={r} className="rounded-sm bg-signal/15 px-1.5 py-0.5 text-signal">
                    {REGION_LABEL[r] ?? r}
                  </span>
                ))}
              </div>
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">{s.signalBasis}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
