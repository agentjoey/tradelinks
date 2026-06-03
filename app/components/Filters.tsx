import Link from "next/link";
import { REGIONS, CATEGORIES } from "../lib/alerts";

const REGION_LABEL: Record<string, string> = {
  north_america: "North America", europe: "Europe", southeast_asia: "SE Asia",
  middle_east: "Middle East", latin_america: "LatAm", australia_nz: "ANZ",
};

function chip(active: boolean) {
  return `rounded-full border px-3 py-1 text-xs ${
    active ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
           : "border-border bg-panel text-muted hover:text-ink"
  }`;
}

/** Server-rendered filter bar; selecting sets a query param (link-based, no JS). */
export function Filters({ region, category }: { region?: string; category?: string }) {
  const hrefFor = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { region, category, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Link href={hrefFor({ region: undefined })} className={chip(!region)}>All regions</Link>
        {REGIONS.map((r) => (
          <Link key={r} href={hrefFor({ region: r })} className={chip(region === r)}>
            {REGION_LABEL[r]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={hrefFor({ category: undefined })} className={chip(!category)}>All types</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={hrefFor({ category: c })} className={chip(category === c)}>{c}</Link>
        ))}
      </div>
    </div>
  );
}
