import type { ProductCard } from "../lib/home-data";
import { SectionHeader } from "./SectionHeader";
import { RadarCard } from "./StreamCard";
import { TrackedLink } from "./TrackedLink";
import { REGION_LABEL } from "./alert-style";

const proxied = (u: string) => `/api/img-proxy?u=${encodeURIComponent(u)}`;

/** Radar = a big #1 leader square card (col-span-4) + a grid of movers
 * (col-span-8), image-forward and distinct from the Wire list. */
export function RadarSection({
  leader, grid, title, sublabel, seeAllLabel, href,
}: {
  leader: ProductCard | null;
  grid: ProductCard[];
  title: string;
  sublabel: string;
  seeAllLabel: string;
  href: string;
}) {
  return (
    <section className="mb-12">
      <SectionHeader accent="bg-signal" title={title} sublabel={sublabel} href={href} seeAllLabel={seeAllLabel} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {leader && <Leader p={leader} />}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-8">
          {grid.map((p) => <RadarCard key={p.key} p={p} />)}
        </div>
      </div>
    </section>
  );
}

function Leader({ p }: { p: ProductCard }) {
  return (
    <TrackedLink href={p.url} event="bestseller_open"
      params={{ product_title: p.title, product_platform: p.platform, product_region: p.region }}
      className="group overflow-hidden rounded-xl border border-line bg-surface/70 transition-colors hover:border-signal/40 lg:col-span-4"
    >
      <div className="relative aspect-square bg-surface2">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxied(p.imageUrl)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-faint">no image</span>
        )}
        {p.rank != null && (
          <span className="ticker absolute left-0 top-0 rounded-br-xl bg-signal px-3 py-1.5 text-[15px] font-semibold text-ink">#{p.rank}</span>
        )}
        <span className="ticker absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-paper/90">{p.platform}</span>
      </div>
      <div className="p-4">
        <div className="font-display text-[18px] font-medium leading-snug text-paper transition-colors group-hover:text-signal">{p.title}</div>
        <div className="ticker mt-2 text-[13px] font-semibold text-signal">
          {p.metric}{p.region ? ` · ${REGION_LABEL[p.region] ?? p.region}` : ""}
        </div>
      </div>
    </TrackedLink>
  );
}
