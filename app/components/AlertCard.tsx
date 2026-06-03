import type { AlertRow } from "../lib/alerts";

const URGENCY_STYLE = (s: number) =>
  s >= 4 ? "bg-red-500/15 text-red-300 border-red-500/30"
  : s >= 2 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
  : "bg-slate-500/15 text-slate-300 border-slate-500/30";

const CAT_LABEL: Record<string, string> = {
  regulatory: "Regulatory", platform_policy: "Platform", logistics: "Logistics",
  trend: "Trend", industry: "Industry", tip: "Tip",
};
const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LatAm", australia_nz: "ANZ",
};

function fmt(d: Date | null) {
  const t = d ?? new Date();
  return new Date(t).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

export function AlertCard({ a }: { a: AlertRow }) {
  return (
    <article className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-2 text-xs mb-2">
        <span className={`rounded border px-1.5 py-0.5 font-mono ${URGENCY_STYLE(a.urgencyScore)}`}>
          ⚠ {a.urgencyScore.toFixed(1)}
        </span>
        <span className="rounded bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5">
          {CAT_LABEL[a.category] ?? a.category}
        </span>
        {a.regions.map((r) => (
          <span key={r} className="rounded bg-sky-500/10 text-sky-300 px-1.5 py-0.5">
            {REGION_LABEL[r] ?? r}
          </span>
        ))}
        {a.platforms.map((p) => (
          <span key={p} className="rounded bg-fuchsia-500/10 text-fuchsia-300 px-1.5 py-0.5">{p}</span>
        ))}
        <span className="ml-auto text-muted">{fmt(a.publishedAt ?? a.createdAt)}</span>
      </div>
      <h2 className="font-medium leading-snug">{a.title}</h2>
      {a.summary && <p className="mt-1 text-sm text-muted">{a.summary}</p>}
      {a.actionRequired && (
        <p className="mt-2 text-sm">
          <span className="text-emerald-400">→ Action: </span>
          {a.actionRequired}
        </p>
      )}
      {a.sourceUrls[0] && (
        <a href={a.sourceUrls[0]} target="_blank" rel="noopener noreferrer"
           className="mt-2 inline-block text-xs text-sky-400 hover:underline">
          source{a.sourceUrls.length > 1 ? ` (+${a.sourceUrls.length - 1})` : ""} ↗
        </a>
      )}
    </article>
  );
}
