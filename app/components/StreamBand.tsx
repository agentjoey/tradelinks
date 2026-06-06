import Link from "next/link";
import type { ReactNode } from "react";

/** A "Today at a glance" stream section: header (tick + title + sublabel + count
 * + See all) over a caller-provided grid of cards. */
export function StreamBand({
  accent, title, sublabel, count, href, seeAllLabel, children,
}: {
  accent: string; // bg-* class for the tick
  title: string;
  sublabel: string;
  count: string;
  href: string;
  seeAllLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-9">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-4 w-1 rounded-full ${accent}`} />
          <h2 className="font-display text-[21px] font-medium text-paper">{title}</h2>
          <span className="text-[13px] text-muted">{sublabel}</span>
          <span className="ticker text-[11px] text-faint">{count}</span>
        </div>
        <Link href={href} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-linestrong px-3 py-2 text-[13px] font-medium text-paper transition-colors hover:border-signal/50">
          {seeAllLabel} <span className="text-signal">→</span>
        </Link>
      </div>
      {children}
    </section>
  );
}
