import Link from "next/link";
import type { ReactNode } from "react";

/** Shared section header: accent tick + title + sublabel, with an optional
 * right-aligned "See all" link. Divider rule on top so sections read as
 * distinct zones. Pass `tick` to replace the default colored dot (e.g. the
 * RadarGlyph on radar sections). */
export function SectionHeader({
  accent, tick, title, sublabel, href, seeAllLabel,
}: {
  accent: string; // bg-* class for the default tick
  tick?: ReactNode; // custom tick node — overrides the colored dot
  title: string;
  sublabel?: string;
  href?: string; // omit (with seeAllLabel) to hide the "See all" link
  seeAllLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-t border-line pt-7">
      <div className="flex items-center gap-2.5">
        {tick ?? <span className={`h-4 w-1 rounded-full ${accent}`} />}
        <h2 className="font-display text-[22px] font-medium text-ink">{title}</h2>
        {sublabel ? <span className="hidden text-[13px] text-muted sm:inline">{sublabel}</span> : null}
      </div>
      {href && seeAllLabel ? (
        <Link href={href} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-linestrong px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:border-signal/50">
          {seeAllLabel} <span className="text-signal">→</span>
        </Link>
      ) : null}
    </div>
  );
}
