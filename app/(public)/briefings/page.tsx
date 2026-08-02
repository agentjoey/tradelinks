import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PUBLIC_CACHE } from "../../../src/public-intelligence/cache.js";
import { listPublishedBriefings } from "../../../src/public-intelligence/briefings.js";
import { ReportCard } from "../ReportCard";
import { StatePanel } from "../StatePanel";
import { formatDate } from "../IntelligenceCard";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export const metadata: Metadata = {
  title: "Briefings — TradeLinks",
  description:
    "Weekly and monthly briefings of qualified US-market changes, pinned to the Operations qualification run. Daily briefings exist only for days that meet the quality threshold.",
  alternates: { canonical: `${SITE}/briefings` },
};

const KIND_LABELS: Record<string, string> = {
  WEEKLY: "Weekly briefing",
  MONTHLY: "Monthly briefing",
  DAILY: "Daily briefing",
};

export function BriefingsShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">Briefings</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        Periodic reports of the changes Operations qualified for US-market sellers. Weekly
        (Monday–Sunday UTC) is the primary report; monthly covers the calendar month. A
        daily briefing exists only for days with at least three qualified changes including
        one Verified — quiet days produce no page, and that absence is deliberate.
      </p>
      {children}
    </>
  );
}

export async function BriefingsList() {
  // A read failure is an error state, never the honest-absence state — the
  // absence copy may only render when the query succeeded with zero rows.
  const result = await listPublishedBriefings().then(
    (rows) => ({ ok: true as const, rows }),
    () => ({ ok: false as const }),
  );
  if (!result.ok) {
    return (
      <div className="mt-6">
        <StatePanel
          state="error"
          title="The briefing list is temporarily unavailable"
          body="No conclusion about published briefings can be drawn right now — this is a read failure, not an absence. Periods without a qualified report still never get a page."
        />
      </div>
    );
  }
  const briefings = result.rows;

  if (briefings.length === 0) {
    return (
      <div className="mt-6">
        <StatePanel
          state="empty"
          title="No published briefings yet"
          body="A briefing appears here after the Operations qualification run for a period completes and an editor publishes the report. Periods without a finished run, and days below the daily threshold, never get a page — we do not manufacture volume."
          actions={[{ label: "Read verified changes", href: "/changes", primary: true }]}
        />
      </div>
    );
  }

  return (
    <section aria-label="Published briefings" className="mt-5">
      <h2 className="sr-only">Published briefings</h2>
      <div className="flex flex-col gap-3.5">
        {briefings.map((briefing) => (
          <ReportCard
            key={briefing.path}
            href={briefing.path}
            eyebrow={KIND_LABELS[briefing.kind] ?? briefing.kind}
            title={briefing.title}
            summary={briefing.summary}
            readiness={briefing.readiness}
            note={`published ${formatDate(briefing.publishedAt)}`}
            meta={
              <>
                <span>period {briefing.periodKey}</span>
                <span>
                  {briefing.entryCount} {briefing.entryCount === 1 ? "entry" : "entries"}
                </span>
              </>
            }
          />
        ))}
      </div>
      <p className="mt-4 max-w-[68ch] text-meta text-faint">
        Missing a period? Only published briefings are listed. An absent week or day means
        no qualified report exists — not that the page failed to load.{" "}
        <Link
          href="/coverage"
          className="underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
        >
          See what we watch →
        </Link>
      </p>
    </section>
  );
}

export default function BriefingsPage() {
  return (
    <BriefingsShell>
      {/* The list alone suspends; the shell renders immediately. No
          loading.tsx may sit at this segment — it would cover the period
          routes and reintroduce the soft-404 (see the task contract,
          "loading-skeleton trap"). */}
      <Suspense fallback={<StatePanel state="loading" heading="Briefings" label="briefings" />}>
        <BriefingsList />
      </Suspense>
    </BriefingsShell>
  );
}
