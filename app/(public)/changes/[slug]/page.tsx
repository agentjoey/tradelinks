import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PUBLIC_CACHE } from "../../../../src/public-intelligence/cache.js";
import { getPublicChangeDetail } from "../../../../src/public-intelligence/search.js";
import type { PublicChangeDetail } from "../../../../src/public-intelligence/search.js";
import { topicSlug } from "../../../../src/public-intelligence/coverage.js";
import {
  POLICY_TOPIC_LABELS,
  PRODUCT_CATEGORY_LABELS,
} from "../../../../src/domain/intelligence/taxonomy.js";
import { EvidenceList } from "../../EvidenceList";
import { ShareButton } from "../../ShareButton";
import { ReadinessBadge } from "../../ReadinessBadge";
import { MONITORED_LIMIT_NOTE, formatDate } from "../../IntelligenceCard";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
// Belt-and-braces (not load-bearing for the 404 status — the absence of any
// loading.tsx above this route carries that): pages are already dynamic via
// the cookie-reading shell; revalidate documents the intended ISR cadence.
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const detail = await getPublicChangeDetail(params.slug);
  // Belt-and-braces for the status, and keeps a gated 404 from rendering
  // with a fallback title.
  if (!detail) notFound();
  return {
    title: `${detail.record.title} — TradeLinks`,
    description: `${detail.record.summary} Readiness: ${detail.record.readiness === "VERIFIED" ? "Verified" : "Monitored"} — evidence and correction history on the page.`,
    // The canonical URL excludes filters and tracking parameters, always.
    alternates: { canonical: `${SITE}/changes/${detail.record.slug}` },
  };
}

const AUTHORITY_LABELS: Record<string, string> = {
  GOVERNMENT_OFFICIAL: "federal",
  PLATFORM_OFFICIAL: "platform",
  INDUSTRY_OFFICIAL: "industry body",
  REPUTABLE_SECONDARY: "secondary press",
  COMMUNITY: "community",
};

function authorityLine(detail: PublicChangeDetail): string {
  const primary = detail.evidence.find((e) => e.role === "PRIMARY_OFFICIAL") ?? detail.evidence[0];
  if (!primary) return "—";
  const level = AUTHORITY_LABELS[primary.authorityLevel] ?? primary.authorityLevel.toLowerCase();
  return `${primary.sourceName} — ${level}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-title">{title}</h2>
      {children}
    </section>
  );
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-9 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-t border-line pt-5">
      <h2 className="font-display text-title">{title}</h2>
      {sub && <p className="text-meta text-muted">{sub}</p>}
    </div>
  );
}

export default async function CanonicalChangePage({
  params,
}: {
  params: { slug: string };
}) {
  const detail = await getPublicChangeDetail(params.slug);
  if (!detail) notFound();
  const { record } = detail;

  const showActionTemplate = detail.hasReviewedPrimaryOfficial && detail.actionTemplate != null;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="ticker mb-3 flex flex-wrap gap-2 text-label uppercase tracking-[0.08em] text-faint"
        >
          <Link href="/" className="transition-colors duration-200 hover:text-signal">
            TradeLinks
          </Link>
          <span>/</span>
          <Link href="/changes" className="transition-colors duration-200 hover:text-signal">
            Changes
          </Link>
          <span>/</span>
          <span aria-current="page">{record.title}</span>
        </nav>

        <ReadinessBadge readiness={record.readiness} note={`version ${record.version} · current`} />
        <h1 className="mt-2 font-display text-headline [text-wrap:balance]">{record.title}</h1>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 ticker text-label tracking-[0.02em] text-faint">
          <span>
            EFFECTIVE{" "}
            <b className="font-medium text-ink">
              {record.effectiveAt ? formatDate(record.effectiveAt) : "—"}
            </b>
          </span>
          <span>
            PUBLISHED <b className="font-medium text-ink">{formatDate(record.sourcePublishedAt)}</b>
          </span>
          <span>
            LAST REVIEWED <b className="font-medium text-ink">{formatDate(record.reviewedAt)}</b>
          </span>
          <span>
            AUTHORITY <b className="font-medium text-ink">{authorityLine(detail)}</b>
          </span>
        </div>

        {record.readiness === "MONITORED" && (
          <p className="mt-4 max-w-[68ch] rounded-md border border-urgent/45 px-3 py-2.5 text-meta text-urgent">
            {MONITORED_LIMIT_NOTE}
          </p>
        )}

        <Panel title="What changed">
          <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">{record.summary}</p>
        </Panel>

        <Panel title="Who it hits">
          <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
            {record.generalImpact}
          </p>
        </Panel>

        {showActionTemplate && detail.actionTemplate && (
          <Panel title="Reviewed action template">
            <p className="mt-2 max-w-[68ch] text-meta text-faint">
              Available because this record has reviewed primary-official evidence and a reviewed
              action template (reviewed {formatDate(detail.actionTemplate.reviewedAt)}). Templates
              are general guidance, not legal advice.
            </p>
            <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
              {detail.actionTemplate.body}
            </p>
          </Panel>
        )}

        <SectionHeading title="Evidence" sub="Every conclusion above rests on these records." />
        <div className="mt-4 rounded-lg border border-line bg-surface p-5">
          <EvidenceList evidence={detail.evidence} />
        </div>

        <SectionHeading title="Correction history" sub="Published versions are never rewritten." />
        <div className="mt-4">
          {detail.versionHistory.map((entry) => (
            <div
              key={entry.version}
              id={`v${entry.version}`}
              data-testid={`version-v${entry.version}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2.5 text-meta first:border-t-0"
            >
              <span className="ticker w-10 flex-none text-label text-faint">v{entry.version}</span>
              <span className="ticker text-label text-faint">{formatDate(entry.createdAt)}</span>
              <span className="text-muted">
                {entry.correctionReason ?? "First publication."}{" "}
                <a
                  href={`#v${entry.version}`}
                  className="text-ink underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
                >
                  View v{entry.version}
                </a>
              </span>
            </div>
          ))}
        </div>

        <section className="mt-9 rounded-lg border border-urgent/45 bg-surface p-5">
          <h2 className="font-display text-title">What this does not tell you</h2>
          <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
            We do not track how a specific marketplace classifies your individual listing, state or
            local rules that go beyond the source cited here, or whether your supplier's documents
            satisfy the requirement. This is general information, not legal advice — confirm
            anything load-bearing against the primary source or a qualified adviser.
          </p>
        </section>
      </div>

      <aside className="mt-9 lg:mt-0">
        <dl className="rounded-lg border border-line bg-surface p-5">
          <dt className="ticker mt-4 text-label uppercase tracking-[0.08em] text-faint first:mt-0">
            Permalink
          </dt>
          <dd data-testid="permalink" className="ticker mt-1 break-words text-meta text-ink [overflow-wrap:anywhere]">
            <a
              href={record.permalink}
              className="underline decoration-signal/45 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
            >
              {record.permalink.replace(/^https?:\/\//, "")}
            </a>
          </dd>
          <dt className="ticker mt-4 text-label uppercase tracking-[0.08em] text-faint">Version</dt>
          <dd className="ticker mt-1 text-meta text-ink">{record.version} · current</dd>
          <dt className="ticker mt-4 text-label uppercase tracking-[0.08em] text-faint">Readiness</dt>
          <dd className="mt-1">
            <ReadinessBadge readiness={record.readiness} />
          </dd>
          {record.policyTopics.length > 0 && (
            <>
              <dt className="ticker mt-4 text-label uppercase tracking-[0.08em] text-faint">Topics</dt>
              <dd className="mt-1 text-meta text-ink">
                {record.policyTopics.map((topic, i) => (
                  <span key={topic}>
                    {i > 0 && " · "}
                    <Link
                      href={`/topics/${topicSlug(topic)}`}
                      className="underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
                    >
                      {POLICY_TOPIC_LABELS[topic]}
                    </Link>
                  </span>
                ))}
              </dd>
            </>
          )}
          {record.productCategories.length > 0 && (
            <>
              <dt className="ticker mt-4 text-label uppercase tracking-[0.08em] text-faint">
                Categories
              </dt>
              <dd className="mt-1 text-meta text-ink">
                {record.productCategories
                  .map((category) => PRODUCT_CATEGORY_LABELS[category])
                  .join(" · ")}
              </dd>
            </>
          )}
          <dt className="ticker mt-4 text-label uppercase tracking-[0.08em] text-faint">Markets</dt>
          <dd className="mt-1 text-meta text-ink">United States</dd>
        </dl>
        <div className="mt-3">
          <ShareButton record={record} />
        </div>
      </aside>
    </div>
  );
}
