import type { ReactNode } from "react";

/** Unified page top: signal eyebrow + display headline + optional lede + actions. */
export function PageHeader({ eyebrow, title, sub, children }: { eyebrow: string; title: ReactNode; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <p className="ticker text-label uppercase text-signal">{eyebrow}</p>
      <h1 className="mt-2 max-w-[24ch] text-balance font-display text-headline font-semibold text-ink">{title}</h1>
      {sub ? <p className="mt-2 max-w-[56ch] text-lede text-muted">{sub}</p> : null}
      {children}
    </div>
  );
}
