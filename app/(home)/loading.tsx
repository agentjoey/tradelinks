import { SkeletonRow } from "../components/Skeleton";
export default function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="h-[340px] animate-pulse rounded-lg bg-surface lg:col-span-6" />
      <div className="flex flex-col gap-4 lg:col-span-3"><SkeletonRow withThumb={false} /><SkeletonRow withThumb={false} /></div>
      <div className="flex flex-col gap-2 lg:col-span-3"><SkeletonRow withThumb={false} /><SkeletonRow withThumb={false} /><SkeletonRow withThumb={false} /></div>
    </div>
  );
}
