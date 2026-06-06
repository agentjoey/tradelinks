import type { AlertRow } from "../lib/alerts";

/** Slim full-width urgent bar for the single top breaking alert (urgency≥4,
 * <24h). Renders nothing when there's no qualifying alert. */
export function BreakingStrip({ alert, label }: { alert: AlertRow | null; label: string }) {
  if (!alert) return null;
  const href = alert.sourceUrls[0] ?? "#";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="group block border-b border-urgent/30 bg-urgent/[0.08] transition-colors hover:bg-urgent/[0.12]">
      <div className="mx-auto flex max-w-[64rem] items-center gap-3 px-5 py-2.5 text-[13px] sm:px-8">
        <span className="ticker inline-flex shrink-0 items-center gap-1.5 rounded bg-urgent/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-urgent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-urgent" />{label}
        </span>
        <span className="truncate text-paper/90">{alert.title}</span>
        <span className="ml-auto shrink-0 text-urgent transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </a>
  );
}
