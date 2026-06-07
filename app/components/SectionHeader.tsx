import Link from "next/link";

/** Shared section header: accent tick + title + sublabel, with a right-aligned
 * "See all" link. Divider rule on top so sections read as distinct zones. */
export function SectionHeader({
  accent, title, sublabel, href, seeAllLabel,
}: {
  accent: string; // bg-* class for the tick
  title: string;
  sublabel: string;
  href: string;
  seeAllLabel: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-t border-line pt-7">
      <div className="flex items-center gap-2.5">
        <span className={`h-4 w-1 rounded-full ${accent}`} />
        <h2 className="font-display text-[22px] font-medium text-paper">{title}</h2>
        <span className="hidden text-[13px] text-muted sm:inline">{sublabel}</span>
      </div>
      <Link href={href} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-linestrong px-3 py-2 text-[13px] font-medium text-paper transition-colors hover:border-signal/50">
        {seeAllLabel} <span className="text-signal">→</span>
      </Link>
    </div>
  );
}
