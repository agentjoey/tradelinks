import Link from "next/link";
import { REGIONS, CATEGORIES } from "../lib/alerts";
import { REGION_NAME } from "../lib/labels";
import { addLocale } from "../lib/locale";
import type { Dict, Lang } from "../lib/i18n";
import { chipFilter } from "./ui";

export function Filters({ region, category, t, lang }: { region?: string; category?: string; t: Dict; lang: Lang }) {
  const hrefFor = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { region, category, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return addLocale(qs ? `/wire?${qs}` : "/wire", lang);
  };

  return (
    <div className="mb-6 space-y-2 border-y border-line py-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="ticker mr-2 text-[9px] uppercase tracking-[0.2em] text-faint">{t.region}</span>
        <Link href={hrefFor({ region: undefined })} className={chipFilter(!region)}>{t.all}</Link>
        {REGIONS.map((r) => (
          <Link key={r} href={hrefFor({ region: r })} className={chipFilter(region === r)}>
            {REGION_NAME[r]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="ticker mr-2 text-[9px] uppercase tracking-[0.2em] text-faint">{t.type}</span>
        <Link href={hrefFor({ category: undefined })} className={chipFilter(!category)}>{t.all}</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={hrefFor({ category: c })} className={chipFilter(category === c)}>{c}</Link>
        ))}
      </div>
    </div>
  );
}
