import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PUBLIC_CACHE } from "../../../src/public-intelligence/cache.js";
import {
  listPublishedGuides,
  validateGuideCorpus,
} from "../../../src/public-intelligence/guides.js";
import { ReportCard } from "../ReportCard";
import { StatePanel } from "../StatePanel";
import { formatDate } from "../IntelligenceCard";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export const metadata: Metadata = {
  title: "Guides — TradeLinks",
  description:
    "Evergreen, evidence-backed guides to US market requirements for cross-border sellers. Only human-reviewed, citation-verified guides are ever listed here.",
  alternates: { canonical: `${SITE}/guides` },
};

export function GuidesShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">Guides</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        Evergreen references for US market entry, platform rules and category requirements.
        A guide states requirements with authority — so one is listed here only after a
        human reviewer has verified every citation.
      </p>
      {children}
    </>
  );
}

/**
 * The honest-absence state (DESIGN.md §States). The corpus is drafted and
 * awaiting human review; the count is read from the corpus itself, and the
 * drafts are never linked.
 */
function DraftCorpusNotice({ draftCount }: { draftCount: number | null }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-linestrong bg-surface p-6">
      <h2 className="font-display text-title">No published guides yet</h2>
      <p className="mt-1.5 max-w-[62ch] text-body text-muted">
        {draftCount != null ? (
          <>
            <b className="font-medium text-ink">
              {draftCount} guide{draftCount === 1 ? " is" : "s are"} drafted
            </b>{" "}
            and awaiting human review. Every draft carries unverified citations and no
            reviewer sign-off, so none of them is listed or linked here.
          </>
        ) : (
          <>The draft corpus is unavailable right now; no guide is listed or linked here.</>
        )}{" "}
        That is deliberate: we do not publish authority we cannot stand behind.
      </p>
      <p className="mt-2 max-w-[62ch] text-meta text-faint">
        A guide appears here only after a named reviewer verifies every citation and records
        a review date. Until then the drafts stay private.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/changes"
          className="inline-flex items-center rounded-md border border-signal px-3 py-2.5 text-meta font-medium text-ink transition-colors duration-200 hover:text-signal sm:py-1.5"
        >
          Read verified changes instead →
        </Link>
        <Link
          href="/coverage"
          className="inline-flex items-center rounded-md border border-line px-3 py-2.5 text-meta text-ink transition-colors duration-200 hover:border-linestrong hover:text-signal sm:py-1.5"
        >
          See what we watch →
        </Link>
      </div>
    </div>
  );
}

export async function GuidesList() {
  // A read failure is an error state, never the honest-absence state — the
  // absence copy may only render when the query succeeded with zero rows.
  const guides = await listPublishedGuides().then(
    (rows) => ({ ok: true as const, rows }),
    () => ({ ok: false as const }),
  );
  if (!guides.ok) {
    return (
      <div className="mt-6">
        <StatePanel
          state="error"
          title="The guide list is temporarily unavailable"
          body="No conclusion about published guides can be drawn right now — this is a read failure, not an absence. The review bar described above still applies."
        />
      </div>
    );
  }
  const corpus = await validateGuideCorpus("content/guides").catch(() => null);

  if (guides.rows.length === 0) {
    return <DraftCorpusNotice draftCount={corpus ? corpus.guideCount : null} />;
  }

  return (
    <section aria-label="Published guides" className="mt-5">
      <h2 className="sr-only">Published guides</h2>
      <div className="flex flex-col gap-3.5">
        {guides.rows.map((guide) => (
          <ReportCard
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            eyebrow="Guide"
            title={guide.title}
            summary={guide.summary}
            readiness={guide.readiness}
            note={`last reviewed ${formatDate(guide.lastReviewedAt)}`}
          />
        ))}
      </div>
    </section>
  );
}

export default function GuidesPage() {
  return (
    <GuidesShell>
      {/* The list alone suspends; the shell renders immediately. No
          loading.tsx may sit at this segment — it would cover [slug] and
          reintroduce the soft-404 (see the task contract, "loading-skeleton
          trap"). */}
      <Suspense fallback={<StatePanel state="loading" heading="Guides" label="guides" />}>
        <GuidesList />
      </Suspense>
    </GuidesShell>
  );
}
