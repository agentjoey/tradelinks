import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PUBLIC_CACHE } from "../../../src/public-intelligence/cache.js";
import { getHub } from "../../../src/public-intelligence/coverage.js";
import type { PublicHub } from "../../../src/public-intelligence/coverage.js";
import type { CanonicalPublicRecord } from "../../../src/public-intelligence/types.js";
import { CoveragePanel } from "../CoveragePanel";
import { JsonLd, breadcrumbJsonLd } from "../JsonLd";
import {
  CompactChangeRow,
  GuideCard,
  IntelligenceCard,
  MONITORED_LIMIT_NOTE,
  formatDate,
  formatDateTimeUtc,
  formatSla,
} from "../IntelligenceCard";
import { ReadinessBadge } from "../ReadinessBadge";
import { StatePanel } from "../StatePanel";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
// Belt-and-braces (not load-bearing for the 404 status — the loading.tsx
// deletion carries that): pages are already dynamic via the cookie-reading
// shell; revalidate documents the intended ISR cadence.
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";
const SLUG = "us";

export async function generateMetadata(): Promise<Metadata> {
  const hub = await getHub(SLUG);
  // Belt-and-braces for the status, but keeps a gated 404 from rendering
  // with a hub fallback title.
  if (!hub) notFound();
  return {
    title: `${hub.title} — TradeLinks`,
    description: `${hub.overview} Readiness: ${hub.readiness === "VERIFIED" ? "Verified" : "Monitored"} — known gaps stated on the page.`,
    alternates: { canonical: `${SITE}/${SLUG}` },
  };
}

function Section({
  title,
  sub,
  moreHref,
  moreLabel,
}: {
  title: string;
  sub?: string;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <div className="mt-9 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-t border-line pt-5">
      <h2 className="font-display text-title">{title}</h2>
      {sub && <p className="text-meta text-muted">{sub}</p>}
      {moreHref && moreLabel && (
        <>
          <span className="ml-auto" />
          <Link
            href={moreHref}
            className="ticker text-label text-muted transition-colors duration-200 hover:text-signal"
          >
            {moreLabel}
          </Link>
        </>
      )}
    </div>
  );
}

function EmptySlice({ label }: { label: string }) {
  return (
    <p className="mt-3 text-meta text-faint">
      No qualified records in this slice yet — an absence, not an omission. {label}
    </p>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Monitored cards state their limit in prose, never a bare badge. */
function limitNoteFor(hub: PublicHub, record: CanonicalPublicRecord): string | null {
  if (record.readiness !== "MONITORED") return null;
  if (hub.slug === "amazon-us") {
    return "We cannot verify this. Amazon's official policy pages require a seller login, so this entry rests on public announcements and reviewed secondary reporting. Treat exact figures as unconfirmed.";
  }
  return MONITORED_LIMIT_NOTE;
}

export default async function UsMarketHubPage() {
  const hub = await getHub(SLUG);
  if (!hub) notFound();

  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "TradeLinks", path: "/" }, { name: hub.title, path: "/us" }])} />
      <nav aria-label="Breadcrumb" className="ticker mb-3 flex flex-wrap gap-2 text-label uppercase tracking-[0.08em] text-faint">
        <Link href="/" className="transition-colors duration-200 hover:text-signal">TradeLinks</Link>
        <span>/</span>
        <span aria-current="page">{hub.title}</span>
      </nav>
      <h1 className="font-display text-headline [text-wrap:balance]">{hub.title}</h1>
      <div className="mt-2.5">
        <ReadinessBadge readiness={hub.readiness} note={hub.ceilingNote ?? undefined} />
      </div>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">{hub.overview}</p>

      {hub.warningPanel && (
        <div className="mt-5 rounded-lg border border-urgent/45 bg-surface p-5">
          <h2 className="font-display text-title">{hub.warningPanel.heading}</h2>
          <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">{hub.warningPanel.body}</p>
          <ul className="mt-2.5 flex max-w-[68ch] flex-col gap-1.5 text-body text-muted">
            <li>
              <b className="font-medium text-ink">We can see</b> — {hub.warningPanel.canSee}
            </li>
            <li>
              <b className="font-medium text-ink">We cannot see</b> — {hub.warningPanel.cannotSee}
            </li>
            <li>
              <b className="font-medium text-ink">What that means</b> — {hub.warningPanel.consequence}
            </li>
          </ul>
        </div>
      )}

      <div className="mt-4">
        <CoveragePanel
          stats={[
            { label: "SOURCES FEEDING THIS HUB", value: String(hub.sources.length) },
            {
              label: "LAST SUCCESSFUL CHECK",
              value: hub.lastSuccessfulCheck ? formatDateTimeUtc(hub.lastSuccessfulCheck) : "never",
            },
            ...(hub.slaMinutes != null ? [{ label: "SLA", value: formatSla(hub.slaMinutes) }] : []),
            ...(hub.overdueSources.length > 0
              ? [
                  {
                    label: `${hub.overdueSources.length} SOURCE${hub.overdueSources.length > 1 ? "S" : ""} OVERDUE`,
                    value: "— missed its check schedule",
                    tone: "bad" as const,
                    title: "A source that misses its check schedule marks the capability stale until human re-review",
                  },
                ]
              : []),
          ]}
        />
      </div>

      <Section
        title={`Changes on ${hub.title}`}
        sub={`${hub.changeCount90d} in the last 90 days`}
        moreHref="/changes"
        moreLabel="All →"
      />
      {hub.changes.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {hub.changes.map((record) => (
            <IntelligenceCard
              key={record.versionId}
              record={record}
              limitNote={limitNoteFor(hub, record)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <StatePanel
            state="empty"
            title="No qualified changes in this hub yet"
            body="A change appears here once it has been reviewed and published at Monitored or Verified readiness. An absence is stated plainly, never padded with manufactured volume."
          />
        </div>
      )}

      <Section title="Federal requirements" sub="Market-level rules with no platform tag" />
      {hub.federalRequirements.length > 0 ? (
        <div className="mt-4">
          {hub.federalRequirements.map((record) => (
            <CompactChangeRow key={record.versionId} record={record} />
          ))}
        </div>
      ) : (
        <EmptySlice label="Federal records appear here once published." />
      )}

      {hub.platformConsiderations.length > 0 && (
        <>
          <Section title="Platform considerations" />
          {hub.platformConsiderations.map((slice) => (
            <div key={slice.platform} className="mt-4">
              <h3 className="text-body font-semibold">{slice.label}</h3>
              <div className="mt-1.5">
                {slice.changes.map((record) => (
                  <CompactChangeRow key={record.versionId} record={record} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <Section title="Recurring risk topics" sub="Long-lived topics aggregated from published changes" />
      {hub.recurringTopics.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {hub.recurringTopics.map((topic) => (
            <Link
              key={topic.slug}
              href={`/topics/${topic.slug}`}
              className="rounded-full border border-line px-2.5 py-1 text-meta text-muted transition-colors duration-200 hover:border-linestrong hover:text-ink"
            >
              {topic.label} · {topic.count}
            </Link>
          ))}
        </div>
      ) : (
        <EmptySlice label="Topics appear once this hub has published changes." />
      )}

      <Section title={`Guides for ${hub.title}`} sub="Evergreen, sourced, and dated by last review" />
      {hub.guides.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {hub.guides.map((guide) => (
            <GuideCard key={guide.slug} guide={guide} />
          ))}
        </div>
      ) : (
        <EmptySlice label="Guides appear here once reviewed and published." />
      )}

      {hub.demand && (
        <div className="mt-9 border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <h2 className="font-display text-title">Demand context</h2>
            <ReadinessBadge readiness="EXPERIMENTAL" />
          </div>
          <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
            {hub.demand.summary} This stream is observed but unreviewed — it cannot support a
            bestseller claim, a launch recommendation, or a market-size estimate.
          </p>
          <ul className="mt-2.5 flex max-w-[68ch] flex-col gap-1 text-meta text-faint">
            {hub.demand.knownGaps.map((gap) => (
              <li key={gap}>— {gap}</li>
            ))}
          </ul>
          <p className="mt-2 ticker text-label uppercase tracking-[0.08em] text-faint">
            Last successful check{" "}
            {hub.demand.lastSuccessfulCheck ? formatDateTimeUtc(hub.demand.lastSuccessfulCheck) : "never"}
          </p>
        </div>
      )}

      <Section title="Sources feeding this hub" />
      <div className="mt-4">
        {hub.sources.map((source) => (
          <div
            key={source.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2.5 text-meta first:border-t-0"
          >
            <a
              href={source.url}
              className="text-ink underline decoration-signal/45 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
            >
              {source.name}
            </a>
            <span className="ticker text-label text-faint">{hostOf(source.url)}</span>
            <span className="ticker text-label text-faint">
              {source.authorityLevel ? source.authorityLevel.toLowerCase().replace(/_/g, " ") : "authority unclassified"}
            </span>
            <span className="ticker text-label text-faint">
              SLA {source.slaMinutes != null ? formatSla(source.slaMinutes) : "—"}
            </span>
            <span className="ticker text-label text-faint">
              last ok {source.lastOkAt ? formatDateTimeUtc(source.lastOkAt) : "never"}
            </span>
            {!source.isActive && <span className="ticker text-label text-faint">(disabled)</span>}
          </div>
        ))}
      </div>

      <Section title="Known coverage gaps" sub="Stated, never smoothed over" />
      <ul className="mt-4 flex max-w-[68ch] flex-col gap-1.5 text-body text-muted">
        {hub.knownGaps.map((gap) => (
          <li key={gap}>— {gap}</li>
        ))}
      </ul>
      <p className="mt-3 ticker text-label uppercase tracking-[0.08em] text-faint">
        Last content review{" "}
        {hub.lastContentReview ? formatDate(hub.lastContentReview) : "— never reviewed since seeding"}
      </p>
    </>
  );
}
