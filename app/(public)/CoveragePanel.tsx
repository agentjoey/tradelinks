import type { ReactNode } from "react";

export type CoverageStat = {
  label: string;
  value: string;
  tone?: "default" | "bad";
  title?: string;
};

/**
 * The coverage status strip (mockup `.cover`): mono counters for sources,
 * freshness and overdue state, with a plain-language sr-only summary so the
 * figures are never the only carrier of meaning (DESIGN.md §States).
 */
export function CoveragePanel({
  stats,
  ariaLabel = "Coverage status",
  children,
}: {
  stats: CoverageStat[];
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const summary = stats
    .map((stat) => stat.title ?? `${stat.label.toLowerCase()} ${stat.value}`)
    .join(". ");
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 ticker text-label tracking-[0.02em] text-faint"
    >
      <span className="sr-only">{summary}</span>
      {stats.map((stat) => (
        <span key={stat.label} title={stat.title} className={stat.tone === "bad" ? "text-urgent" : undefined}>
          {stat.label}{" "}
          {stat.tone === "bad" ? (
            stat.value
          ) : (
            <b className="font-medium text-ink">{stat.value}</b>
          )}
        </span>
      ))}
      {children}
    </div>
  );
}
