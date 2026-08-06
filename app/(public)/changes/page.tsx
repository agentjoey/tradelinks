import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCoverageMatrix } from "../../../src/public-intelligence/coverage.js";
import type { DemandContext } from "../../../src/public-intelligence/coverage.js";
import { PUBLIC_CACHE } from "../../../src/public-intelligence/cache.js";
import {
  getDemandCapabilityContext,
  listExperimentalDemand,
  parsePublicSearchParams,
  searchPublicChanges,
} from "../../../src/public-intelligence/search.js";
import type { PublicSearchFilters } from "../../../src/public-intelligence/search.js";
import { FilterBar } from "../FilterBar";
import {
  IntelligenceCard,
  MONITORED_LIMIT_NOTE,
  formatDateTimeUtc,
} from "../IntelligenceCard";
import { ReadinessBadge } from "../ReadinessBadge";
import { StatePanel } from "../StatePanel";
import { DEFAULT_PUBLIC_POOL } from "../../../src/public-intelligence/query.js";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export const metadata: Metadata = {
  title: "Changes — TradeLinks",
  description:
    "Every published canonical change affecting US-market sellers, with the evidence each one rests on. Verified by default; Monitored only on explicit selection.",
  alternates: { canonical: `${SITE}/changes` },
};

// ---------- helpers ----------

function hrefWith(filters: PublicSearchFilters, overrides: Partial<PublicSearchFilters>): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  // Omit only the default, or every link would carry a redundant param —
  // and picking the wrong one to omit silently rewrites the user's filter.
  if (next.pool !== DEFAULT_PUBLIC_POOL) params.set("pool", next.pool);
  if (next.signal) params.set("signal", next.signal);
  if (next.platform) params.set("platform", next.platform.toLowerCase());
  if (next.category) params.set("category", next.category.toLowerCase().replace(/_/g, "-"));
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.q) params.set("q", next.q);
  if (next.cursor) params.set("cursor", next.cursor);
  const qs = params.toString();
  return qs ? `/changes?${qs}` : "/changes";
}

function toURLSearchParams(searchParams: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

// ---------- shell (sync — testable without streaming) ----------

const SCOPES: Array<{ pool: PublicSearchFilters["pool"]; label: string }> = [
  { pool: "verified", label: "Verified" },
  { pool: "monitored", label: "All Monitored" },
  { pool: "experimental-demand", label: "Experimental demand" },
];

export function ChangesShell({
  filters,
  demand,
  children,
}: {
  filters: PublicSearchFilters;
  demand: DemandContext | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">
        Changes affecting US-market sellers
      </h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        Each entry is one canonical record. Readiness states how far the evidence supports it —
        not how urgent it is.
      </p>

      <nav aria-label="Readiness scope" className="mt-4 flex flex-wrap gap-2">
        {SCOPES.filter((scope) => scope.pool !== "experimental-demand" || demand).map((scope) => (
          <Link
            key={scope.pool}
            href={hrefWith(filters, { pool: scope.pool, cursor: null })}
            aria-current={filters.pool === scope.pool ? "page" : undefined}
            className="rounded-md border border-line px-3 py-2.5 text-meta text-muted transition-colors duration-200 hover:border-linestrong hover:text-ink aria-[current=page]:border-signal aria-[current=page]:font-medium aria-[current=page]:text-ink sm:py-1.5"
          >
            {scope.label}
          </Link>
        ))}
      </nav>

      {filters.pool === "monitored" && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-md border border-line bg-surface px-3.5 py-2.5 text-meta text-muted">
          <span className="ticker text-label uppercase tracking-[0.06em] text-faint">Expert view</span>
          <span>
            Monitored entries are included. Their evidence has not reached primary-official
            strength — read each entry's limit before acting.
          </span>
        </div>
      )}

      {filters.pool !== "experimental-demand" && (
        <>
          <FilterBar filters={filters} />
          {children}
        </>
      )}

      {demand ? (
        <section aria-labelledby="demand-heading" className="mt-9 border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <h2 id="demand-heading" className="font-display text-title">
              Experimental demand
            </h2>
            <ReadinessBadge readiness="EXPERIMENTAL" />
          </div>
          <div className="mt-4 rounded-lg border border-line bg-surface p-5">
            <h3 className="text-body font-semibold">Held apart on purpose</h3>
            <p className="mt-1.5 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
              Rank observations from public bestseller pages.{" "}
              <b className="font-medium text-ink">
                Not a bestseller list, not a launch recommendation, and not evidence that an
                opportunity exists.
              </b>{" "}
              These entries have not been reviewed and cannot support a compliance or sourcing
              conclusion — including any market-size estimate.
            </p>
            <ul className="mt-2.5 flex max-w-[68ch] flex-col gap-1 text-meta text-faint">
              {demand.knownGaps.map((gap) => (
                <li key={gap}>— {gap}</li>
              ))}
            </ul>
            {filters.pool === "experimental-demand" ? (
              children
            ) : (
              <p className="mt-3">
                <Link
                  href={hrefWith(filters, { pool: "experimental-demand", cursor: null })}
                  className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-meta text-ink transition-colors duration-200 hover:border-linestrong hover:text-signal"
                >
                  Show experimental demand →
                </Link>
              </p>
            )}
          </div>
        </section>
      ) : (
        filters.pool === "experimental-demand" && (
          <div className="mt-6">
            <StatePanel
              state="empty"
              title="Experimental demand is not published right now"
              body="Demand observations render only while their coverage capability sits at Experimental readiness with its limits stated. It is not there today — an absence, stated plainly."
              actions={[{ label: "Back to Verified changes", href: "/changes", primary: true }]}
            />
          </div>
        )
      )}
    </>
  );
}

// ---------- results (async — the only part that suspends) ----------

export async function ChangesResults({ filters }: { filters: PublicSearchFilters }) {
  const [page, matrix] = await Promise.all([
    searchPublicChanges(filters),
    getCoverageMatrix().catch(() => []),
  ]);

  const okTimes = matrix
    .map((row) => row.lastSuccessfulCheck)
    .filter((v): v is string => v != null)
    .sort();
  const lastCheck = okTimes.length ? okTimes[okTimes.length - 1]! : null;
  const overdueCount = matrix.reduce((sum, row) => sum + row.overdueCount, 0);

  return (
    <section aria-label="Matching changes" className="mt-5">
      <h2 className="sr-only">Matching changes</h2>
      <div
        role="status"
        aria-label="Coverage status"
        className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 ticker text-label tracking-[0.02em] text-faint"
      >
        <span>
          SHOWING{" "}
          <b className="font-medium text-ink">
            {page.total} {filters.pool === "verified" ? "verified " : ""}
            change{page.total === 1 ? "" : "s"}
            {filters.pool === "monitored" ? " · Monitored included" : ""}
          </b>
        </span>
        <span>
          LAST SOURCE CHECK{" "}
          <b className="font-medium text-ink">{lastCheck ? formatDateTimeUtc(lastCheck) : "never"}</b>
        </span>
        {overdueCount > 0 && (
          <span className="text-urgent">
            {overdueCount} SOURCE{overdueCount === 1 ? "" : "S"} OVERDUE
          </span>
        )}
        <span>
          <Link
            href="/coverage"
            className="underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
          >
            What this view excludes →
          </Link>
        </span>
      </div>

      {page.items.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {page.items.map((record) => (
            <IntelligenceCard
              key={record.versionId}
              record={record}
              limitNote={record.readiness === "MONITORED" ? MONITORED_LIMIT_NOTE : null}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <StatePanel
            state="empty"
            title="No qualified changes in this filter"
            body="That is an absence, not a gap in this filter — we do not manufacture entries to fill a category or a date range."
            actions={[
              ...(filters.pool === "verified"
                ? [{ label: "Include Monitored", href: hrefWith(filters, { pool: "monitored", cursor: null }), primary: true }]
                : []),
              { label: "Clear filters", href: "/changes" },
              { label: "See what we watch", href: "/coverage" },
            ]}
          />
        </div>
      )}

      {page.nextCursor && (
        <p className="mt-5">
          <Link
            href={hrefWith(filters, { cursor: page.nextCursor })}
            className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-meta text-ink transition-colors duration-200 hover:border-linestrong hover:text-signal"
          >
            Next →
          </Link>
        </p>
      )}
    </section>
  );
}

export async function DemandResults() {
  const observations = await listExperimentalDemand(12);
  if (observations.length === 0) {
    return (
      <div className="mt-4">
        <StatePanel
          state="empty"
          title="No demand observations in the current window"
          body="Rank observations appear here after the next successful check of the public bestseller pages."
        />
      </div>
    );
  }
  return (
    <ul className="mt-4 flex flex-col">
      {observations.map((observation) => (
        <li
          key={observation.asin}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2.5 text-meta first:border-t-0"
        >
          <span className="ticker w-14 flex-none text-label text-faint">
            {observation.rank != null ? `#${observation.rank}` : "—"}
          </span>
          <span className="text-ink">{observation.title}</span>
          <span className="ticker text-label text-faint">
            {observation.category} · observed {observation.observedAt}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------- page ----------

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parsePublicSearchParams(toURLSearchParams(searchParams));
  const demand = await getDemandCapabilityContext().catch(() => null);

  return (
    <ChangesShell filters={filters} demand={demand}>
      {filters.pool === "experimental-demand" ? (
        <Suspense fallback={<StatePanel state="loading" heading="Experimental demand" label="experimental demand" />}>
          <DemandResults />
        </Suspense>
      ) : (
        // The list alone suspends; the shell renders immediately. No
        // loading.tsx may sit at this segment — it would cover [slug] and
        // reintroduce the soft-404 (see the task contract, "loading-skeleton
        // trap").
        <Suspense fallback={<StatePanel state="loading" heading="Changes" label="changes" />}>
          <ChangesResults filters={filters} />
        </Suspense>
      )}
    </ChangesShell>
  );
}
