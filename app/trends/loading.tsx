import { SkeletonRow } from "../components/Skeleton";
export default function Loading() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-8 w-1/4 animate-pulse rounded-sm bg-surface2" />
      <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
    </div>
  );
}
