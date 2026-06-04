import { getTrendsView } from "../../src/trends/db.js";
import { getDict } from "../lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LATAM", australia_nz: "ANZ",
};

function Bar({ v }: { v: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-paper/[0.07]">
      <div className="h-full bg-signal" style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  );
}

export default async function TrendsPage() {
  const { t } = await getDict();
  const { signals, rising } = await getTrendsView();

  return (
    <div>
      <div className="mb-7">
        <div className="ticker text-[10px] uppercase tracking-[0.2em] text-signal/80 mb-2">{t.radarEyebrow}</div>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight">
          {t.radarPre}<span className="italic text-signal">{t.radarEm}</span>.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-muted">{t.radarSub}</p>
      </div>

      {/* diffusion signals */}
      <h2 className="ticker mb-3 text-[10px] uppercase tracking-[0.2em] text-faint">{t.diffusionSignals}</h2>
      {signals.length === 0 ? (
        <p className="mb-8 text-sm text-muted">No diffusion signals yet — run the trends ingest.</p>
      ) : (
        <div className="mb-10 space-y-2.5">
          {signals.map((s, i) => (
            <article
              key={s.keyword + i}
              className="animate-rise rounded-md border border-line bg-surface/70 p-4"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="font-display text-[19px] text-paper">{s.keyword}</div>
                <span className="ticker text-[11px] text-signal">
                  {Math.round(s.confidence * 100)}% conf
                </span>
              </div>
              <div className="ticker mt-2 flex items-center gap-2 text-[12px] uppercase tracking-[0.1em]">
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
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.signalBasis}</p>
            </article>
          ))}
        </div>
      )}

      {/* rising board */}
      <h2 className="ticker mb-3 text-[10px] uppercase tracking-[0.2em] text-faint">{t.risingNow}</h2>
      {rising.length === 0 ? (
        <p className="text-sm text-muted">No rising keywords captured yet.</p>
      ) : (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rising.map((r, i) => (
            <div key={r.keyword + r.region + i} className="flex items-center gap-3">
              <span className="ticker w-10 text-right text-[11px] text-muted">
                {REGION_LABEL[r.region] ?? r.region}
              </span>
              <span className="w-36 truncate text-[14px] text-paper">{r.keyword}</span>
              <div className="flex-1"><Bar v={r.signalStrength} /></div>
              <span className="ticker w-8 text-right text-[11px] text-signal">{r.level}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
