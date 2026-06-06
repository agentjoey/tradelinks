import type { AlertRow } from "../lib/alerts";

/** Slim urgent bar for the single top breaking alert (urgency≥4, <24h). Renders
 * nothing when there's no qualifying alert. */
export function BreakingStrip({ alert, label }: { alert: AlertRow | null; label: string }) {
  if (!alert) return null;
  const href = alert.sourceUrls[0] ?? "#";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="group mb-6 flex items-center gap-3 rounded-lg border border-urgent/30 bg-urgent/[0.08] px-4 py-2.5 text-[13px] transition-colors hover:bg-urgent/[0.12]">
      <span className="ticker inline-flex shrink-0 items-center gap-1.5 rounded bg-urgent/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-urgent">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-urgent" />{label}
      </span>
      <span className="truncate text-paper/90">{alert.title}</span>
      <span className="ml-auto shrink-0 text-urgent transition-transform group-hover:translate-x-0.5">→</span>
    </a>
  );
}
