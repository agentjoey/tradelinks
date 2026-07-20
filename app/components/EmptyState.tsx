import type { ReactNode } from "react";

/** Unified empty state: mono glyph + title + optional copy + optional action. */
export function EmptyState({ glyph = "◇", title, copy, action }: { glyph?: string; title: string; copy?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-md border border-dashed border-linestrong px-6 py-12 text-center">
      <span className="font-mono text-2xl text-faint" aria-hidden="true">{glyph}</span>
      <p className="font-semibold text-ink">{title}</p>
      {copy ? <p className="max-w-[42ch] text-meta text-muted">{copy}</p> : null}
      {action}
    </div>
  );
}
