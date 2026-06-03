import Link from "next/link";
import { REGIONS, CATEGORIES } from "../lib/alerts";

const REGION_LABEL: Record<string, string> = {
  north_america: "North America", europe: "Europe", southeast_asia: "SE Asia",
  middle_east: "Middle East", latin_america: "LatAm", australia_nz: "ANZ",
};

function chip(active: boolean) {
  return `ticker rounded-sm px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors ${
    active
      ? "bg-signal text-ink"
      : "text-muted hover:text-paper hover:bg-paper/[0.05]"
  }`;
}

export function Filters({ region, category }: { region?: string; category?: string }) {
  const hrefFor = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { region, category, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mb-6 space-y-2 border-y border-line py-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="ticker mr-2 text-[9px] uppercase tracking-[0.2em] text-faint">region</span>
        <Link href={hrefFor({ region: undefined })} className={chip(!region)}>All</Link>
        {REGIONS.map((r) => (
          <Link key={r} href={hrefFor({ region: r })} className={chip(region === r)}>
            {REGION_LABEL[r]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="ticker mr-2 text-[9px] uppercase tracking-[0.2em] text-faint">type</span>
        <Link href={hrefFor({ category: undefined })} className={chip(!category)}>All</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={hrefFor({ category: c })} className={chip(category === c)}>{c}</Link>
        ))}
      </div>
    </div>
  );
}
