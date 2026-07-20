"use client";
import { useMemo, useState } from "react";
import type { BestsellerRow } from "../../src/trends/db";
import { track } from "../lib/track";
import { REGION_LABEL } from "../lib/labels";

const REGION_FULL: Record<string, string> = {
  north_america: "North America", europe: "Europe", southeast_asia: "SE Asia",
  middle_east: "Middle East", latin_america: "Latin America", australia_nz: "Australia / NZ",
};
const REGION_ORDER = ["north_america", "europe", "middle_east", "australia_nz", "southeast_asia", "latin_america"];

function Img({ src, alt }: { src: string | null; alt: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return <span className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-wider text-faint">no image</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setErr(true)} className="h-full w-full object-contain" />;
}

function Card({ b, showRegion }: { b: BestsellerRow; showRegion: boolean }) {
  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("bestseller_open", { product_title: b.title, product_region: b.region, product_category: b.category, product_rank: b.rank ?? undefined })}
      className="group flex gap-4 rounded-md border border-line bg-surface p-3.5 transition-colors hover:border-signal/40"
    >
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md bg-surface2">
        <Img src={b.imageUrl} alt={b.title} />
        {b.rank != null && (
          <span className="ticker absolute left-0 top-0 rounded-br-md bg-chipbg px-2 py-1 text-[11px] font-semibold text-chipink">
            #{b.rank}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <p className="line-clamp-3 text-[14px] leading-snug text-ink group-hover:text-signal">{b.title}</p>
        <div className="ticker mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.1em]">
          {b.rank != null && <span className="text-signal">BSR&nbsp;#{b.rank}</span>}
          {showRegion && (
            <span className="rounded-sm bg-calm/15 px-1.5 py-0.5 text-calm">{REGION_LABEL[b.region] ?? b.region}</span>
          )}
        </div>
      </div>
    </a>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`ticker inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
        active
          ? "border-signal/60 bg-signal/15 text-signal"
          : "border-line bg-surface/60 text-muted hover:border-signal/40 hover:text-ink"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-70">{count}</span>
    </button>
  );
}

export function BestsellersBoard({ items }: { items: BestsellerRow[] }) {
  const regions = useMemo(() => {
    const c = new Map<string, number>();
    for (const it of items) c.set(it.region, (c.get(it.region) ?? 0) + 1);
    return REGION_ORDER.filter((r) => c.has(r)).map((r) => ({ region: r, count: c.get(r)! }));
  }, [items]);

  const [region, setRegion] = useState<string>("all");
  const pickRegion = (r: string) => { setRegion(r); track("region_filter", { filter_region: r }); };
  const filtered = region === "all" ? items : items.filter((i) => i.region === region);

  const byCat = useMemo(() => {
    const m = new Map<string, BestsellerRow[]>();
    for (const it of filtered) (m.get(it.category) ?? m.set(it.category, []).get(it.category)!).push(it);
    for (const arr of m.values()) arr.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={region === "all"} onClick={() => pickRegion("all")} label="All regions" count={items.length} />
        {regions.map(({ region: r, count }) => (
          <Chip key={r} active={region === r} onClick={() => pickRegion(r)} label={REGION_FULL[r] ?? r} count={count} />
        ))}
      </div>

      {byCat.length === 0 ? (
        <p className="text-sm text-muted">No bestsellers for this region yet.</p>
      ) : (
        <div className="space-y-8">
          {byCat.map(([category, rows]) => (
            <div key={category}>
              <h3 className="font-display mb-3 text-[17px] text-ink">
                {category} <span className="ticker text-[11px] text-faint">top {Math.min(12, rows.length)}</span>
              </h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rows.slice(0, 12).map((b, i) => (
                  <Card key={b.url + i} b={b} showRegion={region === "all"} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
