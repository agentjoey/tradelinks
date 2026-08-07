import Link from "next/link";
import type { Metadata } from "next";

import { PUBLIC_CACHE } from "../../src/public-intelligence/cache.js";
import {
  canRenderHub,
  getCoverageMatrix,
  getLatestPublishedBriefing,
} from "../../src/public-intelligence/coverage.js";
import { listPublicChanges } from "../../src/public-intelligence/query.js";
import {
  INITIAL_PUBLIC_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  categorySlug,
} from "../../src/domain/intelligence/taxonomy.js";
import { CoveragePanel } from "./CoveragePanel";
import { IntelligenceCard, formatDateTimeUtc } from "./IntelligenceCard";
import { MonitoredPageNote } from "./MonitoredPageNote";
import { ReadinessBadge } from "./ReadinessBadge";
import { StatePanel } from "./StatePanel";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export const metadata: Metadata = {
  title: "TradeLinks — US market intelligence for cross-border sellers",
  description:
    "Government rules, platform policies and compliance changes for sellers entering the US market, traced to their primary sources. Every entry states how far the evidence supports it — and what we still cannot see.",
  alternates: { canonical: SITE },
};

/**
 * Phase 1 public home (mockup surface 1). Task 3 wires the real read model:
 * changes come from the canonical public query, hub cards and category chips
 * are gated by capability readiness, and the briefing block shows the latest
 * published briefing or an honest absence. No liveness choreography.
 */

function SectionHeader({
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

const HUB_CARDS = [
  {
    key: "market:us",
    href: "/us",
    title: "US Market",
    blurb:
      "Federal rules, customs, product safety and labeling that apply regardless of where you sell.",
  },
  {
    key: "platform:amazon-us",
    href: "/amazon-us",
    title: "Amazon US",
    blurb: "Fees, listing and account policy.",
  },
  {
    key: "platform:shopify-us",
    href: "/shopify-us",
    title: "Shopify US",
    blurb: "Payments, chargebacks, merchant terms.",
  },
] as const;

export default async function Home() {
  const [changesPage, matrix, briefing] = await Promise.all([
    listPublicChanges({ pool: "monitored", limit: 6 }),
    getCoverageMatrix(),
    getLatestPublishedBriefing(),
  ]);

  // Verified first — readiness is evidence strength, not importance.
  const records = [...changesPage.items]
    .sort((a, b) =>
      a.readiness === b.readiness ? 0 : a.readiness === "VERIFIED" ? -1 : 1,
    )
    .slice(0, 4);

  const checkTimes = matrix
    .filter((row) => row.lastSuccessfulCheck != null)
    .map((row) => new Date(row.lastSuccessfulCheck!).getTime());
  const lastCheck = checkTimes.length ? new Date(Math.max(...checkTimes)) : null;
  const sourceTotal = matrix.reduce((sum, row) => sum + row.sourceCount, 0);
  const withinSla = matrix.reduce((sum, row) => sum + row.sourcesWithinSla, 0);
  const overdueTotal = matrix.reduce((sum, row) => sum + row.overdueCount, 0);
  const gapTotal = matrix.reduce((sum, row) => sum + row.knownGaps.length, 0);

  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">
        What changed for sellers entering the US market
      </h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        Government rules, platform policies and compliance changes, traced to their primary
        sources. Every entry states how far the evidence supports it — and what we still cannot
        see.
      </p>

      <div className="mt-4">
        <CoveragePanel
          stats={[
            {
              label: "LAST SOURCE CHECK",
              value: lastCheck ? formatDateTimeUtc(lastCheck.toISOString()) : "never",
              title: "Most recent successful source check across all capabilities",
            },
            {
              label: "SOURCES WITHIN SLA",
              value: `${withinSla} / ${sourceTotal}`,
              title: `${withinSla} of ${sourceTotal} linked sources checked on schedule`,
            },
            ...(overdueTotal > 0
              ? [
                  {
                    label: `${overdueTotal} OVERDUE`,
                    value: "",
                    tone: "bad" as const,
                    title: `${overdueTotal} source${overdueTotal === 1 ? "" : "s"} missed the check schedule`,
                  },
                ]
              : []),
            {
              label: "KNOWN GAPS",
              value: String(gapTotal),
              title: `${gapTotal} coverage gaps stated across all capabilities`,
            },
          ]}
        >
          <Link
            href="/coverage"
            className="text-muted underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
          >
            Coverage &amp; readiness →
          </Link>
        </CoveragePanel>
      </div>

      <SectionHeader
        title="Changes to know now"
        sub="Verified first. Readiness is evidence strength, not importance."
        moreHref="/changes"
        moreLabel="All changes →"
      />
      <MonitoredPageNote records={records} />
      {records.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {records.map((record) => (
            <IntelligenceCard
              key={record.versionId}
              record={record}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <StatePanel
            state="empty"
            title="No qualified changes published yet"
            body="Changes appear here once they have been reviewed and published at Monitored or Verified readiness. An absence is stated plainly, never padded with manufactured volume."
          />
        </div>
      )}

      <SectionHeader title="Where to look" sub="A hub appears only once its coverage reaches Monitored." />
      <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr]">
        {HUB_CARDS.map((card) => {
          const row = matrix.find((entry) => entry.key === card.key);
          const renderable = row != null && canRenderHub(row);
          if (!renderable) {
            return (
              <div
                key={card.key}
                className="flex flex-col gap-1.5 rounded-lg border border-dashed border-line p-4"
              >
                <h3 className="font-display text-title text-faint">{card.title}</h3>
                <p className="text-meta text-faint">{card.title} — below Monitored, hidden</p>
              </div>
            );
          }
          return (
            <Link
              key={card.key}
              href={card.href}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 transition-colors duration-200 hover:border-linestrong"
            >
              <ReadinessBadge readiness={row.readiness as "MONITORED" | "VERIFIED"} />
              <h3 className="font-display text-title">{card.title}</h3>
              <p className="text-meta text-muted">{card.blurb}</p>
              {card.key === "platform:amazon-us" && row.knownGaps.length > 0 && (
                <span className="text-meta text-urgent">{row.knownGaps[0]}.</span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {INITIAL_PUBLIC_CATEGORIES.map((category) => {
          const slug = categorySlug(category);
          const row = matrix.find((entry) => entry.key === `category:${slug}`);
          const renderable = row != null && canRenderHub(row);
          if (!renderable) {
            return (
              <span
                key={slug}
                className="rounded-full border border-dashed border-line px-2.5 py-1 text-meta text-faint"
              >
                {PRODUCT_CATEGORY_LABELS[category]} — below Monitored, hidden
              </span>
            );
          }
          return (
            <Link
              key={slug}
              href={`/categories/${slug}`}
              className="rounded-full border border-line px-2.5 py-1 text-meta text-muted transition-colors duration-200 hover:border-linestrong hover:text-ink"
            >
              {PRODUCT_CATEGORY_LABELS[category]}
            </Link>
          );
        })}
      </div>

      <SectionHeader title="Latest briefing" moreHref="/briefings" moreLabel="All briefings →" />
      {briefing ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <h3 className="text-body font-semibold">{briefing.title}</h3>
          <p className="mt-1.5 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
            {briefing.summary}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/briefings"
              className="rounded-md border border-linestrong px-3 py-1.5 text-meta text-ink transition-colors duration-200 hover:bg-surface2"
            >
              Read the briefing
            </Link>
            <Link
              href="/feeds/briefings.xml"
              className="rounded-md border border-linestrong px-3 py-1.5 text-meta text-ink transition-colors duration-200 hover:bg-surface2"
            >
              RSS
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <StatePanel
            state="empty"
            title="No briefing published yet"
            body="Briefings appear here once an editor has reviewed and published one. Until then this section stays empty — an honest absence, not a placeholder."
          />
        </div>
      )}
    </>
  );
}
