import Link from "next/link";
import { getAlerts } from "./lib/alerts";
import { AlertCard } from "./components/AlertCard";
import { Filters } from "./components/Filters";

export const dynamic = "force-dynamic"; // always live from Neon

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; category?: string; platform?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const { items, nextCursor } = await getAlerts(sp);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Cross-border alerts</h1>
      <p className="text-sm text-muted mb-4">
        Regulatory, platform-policy, logistics &amp; trend signals across 6 regions.
      </p>

      <Filters region={sp.region} category={sp.category} />

      {items.length === 0 ? (
        <p className="text-muted text-sm py-12 text-center">No alerts match these filters yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => <AlertCard key={a.id} a={a} />)}
        </div>
      )}

      {nextCursor && (
        <div className="mt-6 text-center">
          <Link
            href={`/?${new URLSearchParams({ ...sp, cursor: nextCursor }).toString()}`}
            className="rounded border border-border bg-panel px-4 py-2 text-sm hover:text-emerald-300"
          >
            Load more →
          </Link>
        </div>
      )}
    </div>
  );
}
