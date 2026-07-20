"use client";
export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-urgent bg-surface p-5">
      <div className="flex-1">
        <p className="font-semibold text-ink">The wire went quiet on our end.</p>
        <p className="mt-1 text-meta text-muted">Couldn&apos;t reach the database. Your filters are intact — retry in a moment.</p>
      </div>
      <button onClick={reset} className="min-h-[40px] shrink-0 rounded-full border border-linestrong px-4 text-meta text-ink transition-colors hover:border-signal hover:text-signal">
        Retry
      </button>
    </div>
  );
}
