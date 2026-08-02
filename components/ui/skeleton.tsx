import { cn } from "../lib/utils";

// Skeleton bars keep the layout's heading structure stable while data lands
// (DESIGN.md states); the pulse has a global prefers-reduced-motion fallback.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-sm bg-ink/10", className)} {...props} />;
}

export { Skeleton };
