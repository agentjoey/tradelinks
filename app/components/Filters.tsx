import Link from "next/link";
import { REGIONS, CATEGORIES } from "../lib/alerts";
import { REGION_NAME } from "../lib/labels";
import type { Dict } from "../lib/i18n";

function chip(active: boolean) {
  return `ticker rounded-sm px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors ${
    active ? "bg-signal text-chipink" : "text-muted hover:text-ink hover:bg-surface2"
  }`;
}

export function Filters({ region, category, t }: { region?: string; category?: string; t: Dict }) {
  const hrefFor = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { region, category, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/wire?${qs}` : "/wire";
  };

  return (
    <div className="mb-6 space-y-2 border-y border-line py-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="ticker mr-2 text-[9px] uppercase tracking-[0.2em] text-faint">{t.region}</span>
        <Link href={hrefFor({ region: undefined })} className={chip(!region)}>{t.all}</Link>
        {REGIONS.map((r) => (
          <Link key={r} href={hrefFor({ region: r })} className={chip(region === r)}>
            {REGION_NAME[r]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="ticker mr-2 text-[9px] uppercase tracking-[0.2em] text-faint">{t.type}</span>
        <Link href={hrefFor({ category: undefined })} className={chip(!category)}>{t.all}</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={hrefFor({ category: c })} className={chip(category === c)}>{c}</Link>
        ))}
      </div>
    </div>
  );
}
