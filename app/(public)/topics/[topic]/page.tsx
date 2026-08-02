import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PUBLIC_CACHE } from "../../../../src/public-intelligence/cache.js";
import { getTopicHub } from "../../../../src/public-intelligence/coverage.js";
import { GuideCard, IntelligenceCard } from "../../IntelligenceCard";
import { StatePanel } from "../../StatePanel";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
// Belt-and-braces (not load-bearing for the 404 status — the loading.tsx
// deletion carries that): pages are already dynamic via the cookie-reading
// shell; revalidate documents the intended ISR cadence.
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

type PageParams = { params: { topic: string }; searchParams: { risk?: string } };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const hub = await getTopicHub(params.topic);
  // Belt-and-braces for the status, but keeps a gated 404 from rendering
  // with a hub fallback title.
  if (!hub) notFound();
  return {
    title: `${hub.label} — TradeLinks`,
    description: `Recurring US policy topic: ${hub.label}. Aggregated from reviewed, published canonical changes and guides — topics have no separate editorial store.`,
    alternates: { canonical: `${SITE}/topics/${params.topic}` },
  };
}

export default async function TopicHubPage({ params, searchParams }: PageParams) {
  const hub = await getTopicHub(params.topic);
  if (!hub) notFound();

  // Risk Attribute links keep their exact label as a filter on the closest
  // explicit topic. Unknown labels are ignored rather than erroring.
  const activeRisk = hub.riskFilters.find((filter) => filter.label === searchParams.risk) ?? null;
  const changes = activeRisk
    ? hub.changes.filter((record) => record.riskAttributes.includes(activeRisk.attribute))
    : hub.changes;

  return (
    <>
      <nav aria-label="Breadcrumb" className="ticker mb-3 flex flex-wrap gap-2 text-label uppercase tracking-[0.08em] text-faint">
        <Link href="/" className="transition-colors duration-200 hover:text-signal">TradeLinks</Link>
        <span>/</span>
        <Link href="/topics" className="transition-colors duration-200 hover:text-signal">Topics</Link>
        <span>/</span>
        <span aria-current="page">{hub.label}</span>
      </nav>
      <h1 className="font-display text-headline [text-wrap:balance]">{hub.label}</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        A recurring US policy topic, aggregated from reviewed canonical changes —{" "}
        {hub.total} published change{hub.total === 1 ? "" : "s"} in scope. Topics have no separate
        editorial store; every entry traces back to its canonical record.
      </p>

      {hub.riskFilters.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="ticker text-[0.625rem] uppercase tracking-[0.12em] text-faint">
            Filter by risk attribute
          </span>
          {hub.riskFilters.map((filter) => (
            <Link
              key={filter.attribute}
              href={`/topics/${hub.slug}?risk=${encodeURIComponent(filter.label)}`}
              aria-current={activeRisk?.attribute === filter.attribute ? "true" : undefined}
              className={`rounded-full border px-2.5 py-1 text-meta transition-colors duration-200 ${
                activeRisk?.attribute === filter.attribute
                  ? "border-signal text-ink"
                  : "border-line text-muted hover:border-linestrong hover:text-ink"
              }`}
            >
              {filter.label}
            </Link>
          ))}
          {activeRisk && (
            <Link
              href={`/topics/${hub.slug}`}
              className="text-meta text-muted underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
            >
              Clear filter
            </Link>
          )}
        </div>
      )}

      <div className="mt-9 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-t border-line pt-5">
        <h2 className="font-display text-title">
          {activeRisk ? `Changes filtered to ${activeRisk.label}` : "Changes in this topic"}
        </h2>
        {activeRisk && (
          <p className="text-meta text-muted">
            Exact Risk Attribute label kept as the filter — nothing is re-bucketed.
          </p>
        )}
      </div>
      {changes.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {changes.map((record) => (
            <IntelligenceCard key={record.versionId} record={record} />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <StatePanel
            state="empty"
            title={activeRisk ? `No qualified changes tagged ${activeRisk.label}` : "No qualified changes in this topic"}
            body="A change appears here once it has been reviewed and published at Monitored or Verified readiness. An absence is stated plainly, never padded."
          />
        </div>
      )}

      {hub.guides.length > 0 && (
        <>
          <div className="mt-9 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-t border-line pt-5">
            <h2 className="font-display text-title">Guides for this topic</h2>
            <p className="text-meta text-muted">Evergreen, sourced, and dated by last review</p>
          </div>
          <div className="mt-4 flex flex-col gap-3.5">
            {hub.guides.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
