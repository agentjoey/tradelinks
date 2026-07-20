/** Skeleton rows for route loading states (pulse disabled under reduced-motion via .sk in globals? — uses animate-pulse core utility). */
export function SkeletonRow({ withThumb = true }: { withThumb?: boolean }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-surface p-4">
      {withThumb ? <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-sm bg-surface2" /> : null}
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="h-3 w-3/5 animate-pulse rounded-sm bg-surface2" />
        <div className="h-3 w-1/3 animate-pulse rounded-sm bg-surface2" />
      </div>
    </div>
  );
}
