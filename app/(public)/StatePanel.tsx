import type { ReactNode } from "react";
import { Button, buttonVariants } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/lib/utils";

export interface StatePanelAction {
  label: string;
  href?: string;
  primary?: boolean;
  disabled?: boolean;
}

export type StatePanelProps =
  | { state: "loading"; heading: string; label?: string }
  | { state: "empty"; title: string; body: ReactNode; actions?: StatePanelAction[] }
  | { state: "error"; title?: string; body: ReactNode; actions?: StatePanelAction[] }
  | { state: "stale"; label?: string; body: ReactNode }
  | { state: "restricted"; title: string; body: ReactNode; actions?: StatePanelAction[]; note?: string };

function Actions({ actions }: { actions: StatePanelAction[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) =>
        action.href ? (
          <a
            key={action.label}
            href={action.href}
            className={cn(buttonVariants({ variant: action.primary ? "default" : "outline", size: "sm" }))}
          >
            {action.label}
          </a>
        ) : (
          <Button
            key={action.label}
            type="button"
            size="sm"
            variant={action.primary ? "default" : "outline"}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ),
      )}
    </div>
  );
}

/**
 * The Phase 1 state vocabulary (DESIGN.md §States), one component for every
 * surface: loading skeletons preserve the section's heading structure so the
 * page does not reflow when data lands; empty states teach the surface; error
 * states name the cached fallback; stale states state the consequence in
 * prose; restricted states require explicit selection and never offer drafts.
 */
export function StatePanel(props: StatePanelProps) {
  switch (props.state) {
    case "loading":
      return (
        <section aria-label={props.heading}>
          <h2 className="font-display text-title">{props.heading}</h2>
          <div className="mt-4 flex flex-col gap-3.5">
            <article aria-busy="true" className="rounded-lg border border-line bg-surface p-5">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="mt-3 h-5 w-3/4" />
              <Skeleton className="mt-2.5 h-3 w-full" />
              <Skeleton className="mt-2.5 h-3 w-7/12" />
              <div className="mt-3.5 border-t border-line pt-3">
                <span className="ticker mb-1.5 block text-[0.625rem] uppercase tracking-[0.14em] text-faint">
                  Evidence
                </span>
                <Skeleton className="h-3 w-9/12" />
                <Skeleton className="mt-2.5 h-3 w-7/12" />
              </div>
              <span className="sr-only">Loading {props.label ?? props.heading}</span>
            </article>
          </div>
        </section>
      );
    case "empty":
      return (
        <div className="rounded-lg border border-dashed border-linestrong bg-surface p-6">
          <h3 className="font-display text-title">{props.title}</h3>
          <p className="mt-1.5 max-w-[62ch] text-body text-muted">{props.body}</p>
          {props.actions && props.actions.length > 0 && <Actions actions={props.actions} />}
        </div>
      );
    case "error":
      return (
        <div role="alert" className="rounded-lg border border-urgent/45 bg-surface p-6">
          <h3 className="font-display text-title text-urgent">{props.title ?? "Showing the last published copy"}</h3>
          <p className="mt-1.5 max-w-[62ch] text-body text-muted">{props.body}</p>
          {props.actions && props.actions.length > 0 && <Actions actions={props.actions} />}
        </div>
      );
    case "stale":
      return (
        <div
          role="status"
          className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-md border border-urgent/40 px-3.5 py-2.5 text-meta text-urgent"
        >
          <span className="ticker text-label uppercase tracking-[0.06em]">{props.label ?? "Stale"}</span>
          <span>{props.body}</span>
        </div>
      );
    case "restricted":
      return (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h3 className="text-body font-semibold">{props.title}</h3>
          <p className="mt-1.5 max-w-[62ch] text-body text-muted">{props.body}</p>
          {props.actions && props.actions.length > 0 && <Actions actions={props.actions} />}
          {props.note && <p className="mt-2 text-meta text-faint">{props.note}</p>}
        </div>
      );
  }
}
