import Link from "next/link";
import type { LatestItem, LatestKind } from "../lib/home";
import { hhmm } from "./alert-style";

const DOT: Record<LatestKind, string> = { wire: "bg-urgent", radar: "bg-signal", x: "bg-calm" };
const TONE: Record<LatestKind, string> = { wire: "text-urgent", radar: "text-signal", x: "text-calm" };

/** The live "Latest" rail: chronological Wire + Radar + X rows, colour-coded by
 * kind, with See-all pinned to the bottom. Stretches to the cluster height. */
export function LatestRail({
  items, latestLabel, liveLabel, seeAllLabel, href, kindLabels,
}: {
  items: LatestItem[];
  latestLabel: string;
  liveLabel: string;
  seeAllLabel: string;
  href: string;
  kindLabels: Record<LatestKind, string>;
}) {
  return (
    <aside className="flex flex-col rounded-xl border border-line bg-surface/40 lg:col-span-3">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="ticker flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-paper">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-urgent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-urgent" />
          </span>
          {latestLabel}
        </div>
        <span className="ticker text-[10px] uppercase tracking-wider text-faint">{liveLabel}</span>
      </div>
      <div className="flex-1 divide-y divide-line">
        {items.map((it, i) => (
          <a key={`${it.kind}:${it.href}:${i}`} href={it.href} target="_blank" rel="noopener noreferrer"
             className="group flex gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface2/60">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[it.kind]}`} />
            <div className="min-w-0">
              <div className="ticker mb-0.5 flex items-center gap-2 text-[9.5px] uppercase tracking-wider text-faint">
                <span className={TONE[it.kind]}>{kindLabels[it.kind]}</span>
                <span>{hhmm(new Date(it.time))}</span>
                {it.author && <span className="truncate text-muted">{it.author}</span>}
              </div>
              <div className="text-[13px] font-medium leading-snug text-paper/90 transition-colors group-hover:text-signal">{it.title}</div>
            </div>
          </a>
        ))}
      </div>
      <Link href={href} className="ticker flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-signal">
        {seeAllLabel} <span className="text-signal">→</span>
      </Link>
    </aside>
  );
}
