import Link from "next/link";

import type { ReadinessLevel } from "@prisma/client";
import type { PublishedBriefing } from "../../src/public-intelligence/briefings.js";
import { IntelligenceCard, formatDate } from "./IntelligenceCard";
import { JsonLd, articleJsonLd, breadcrumbJsonLd } from "./JsonLd";
import { ReadinessBadge } from "./ReadinessBadge";

/**
 * The report card (DESIGN.md §Card anatomy applied to guides and
 * briefings): readiness word first, title, one-paragraph summary, and a
 * mono meta footer. Same 1px full border as the evidence card — no new
 * visual language.
 */
export function ReportCard({
  href,
  eyebrow,
  title,
  summary,
  readiness,
  note,
  meta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  summary: string;
  readiness: ReadinessLevel;
  note?: string;
  meta?: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-5 transition-colors duration-200 hover:border-linestrong">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="ticker text-[0.625rem] uppercase tracking-[0.12em] text-faint">
          {eyebrow}
        </span>
        <ReadinessBadge readiness={readiness} note={note} />
      </div>
      <h3 className="mt-2 font-display text-title [text-wrap:balance]">
        <Link href={href} className="transition-colors duration-200 hover:text-signal">
          {title}
        </Link>
      </h3>
      <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">{summary}</p>
      {meta && (
        <div className="ticker mt-3.5 flex flex-wrap gap-x-3.5 gap-y-1 border-t border-line pt-3 text-label text-faint">
          {meta}
        </div>
      )}
    </article>
  );
}

const KIND_LABELS: Record<string, string> = {
  WEEKLY: "Weekly briefing",
  MONTHLY: "Monthly briefing",
  DAILY: "Daily briefing",
};

/**
 * The shared briefing period page body (weekly / monthly / daily). Entries
 * render as full evidence cards in the exact order the Operations
 * qualification run pinned them; the run fingerprint stays visible because
 * it is the audit link back to that run.
 */
export function BriefingPeriodView({ briefing }: { briefing: PublishedBriefing }) {
  return (
    <>
      <JsonLd
        data={[
          articleJsonLd({
            title: briefing.title,
            summary: briefing.summary,
            path: briefing.path,
            datePublished: briefing.publishedAt,
          }),
          breadcrumbJsonLd([
            { name: "TradeLinks", path: "/" },
            { name: "Briefings", path: "/briefings" },
            { name: `${KIND_LABELS[briefing.kind]} ${briefing.periodKey}`, path: briefing.path },
          ]),
        ]}
      />
      <nav
        aria-label="Breadcrumb"
        className="ticker mb-3 flex flex-wrap gap-2 text-label uppercase tracking-[0.08em] text-faint"
      >
        <Link href="/" className="transition-colors duration-200 hover:text-signal">
          TradeLinks
        </Link>
        <span>/</span>
        <Link href="/briefings" className="transition-colors duration-200 hover:text-signal">
          Briefings
        </Link>
        <span>/</span>
        <span aria-current="page">
          {KIND_LABELS[briefing.kind]} {briefing.periodKey}
        </span>
      </nav>

      <ReadinessBadge readiness={briefing.readiness} />
      <h1 className="mt-2 font-display text-headline [text-wrap:balance]">{briefing.title}</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        {briefing.summary}
      </p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 ticker text-label tracking-[0.02em] text-faint">
        <span>
          PERIOD <b className="font-medium text-ink">{briefing.periodKey}</b>
        </span>
        <span>
          ENTRIES <b className="font-medium text-ink">{briefing.entries.length}</b>
        </span>
        <span>
          PUBLISHED <b className="font-medium text-ink">{formatDate(briefing.publishedAt)}</b>
        </span>
        <span className="[overflow-wrap:anywhere]">
          FINGERPRINT <b className="font-medium text-ink">{briefing.fingerprint}</b>
        </span>
      </div>

      <p className="mt-3 max-w-[68ch] text-meta text-faint">
        Entries are pinned to the exact ordered versions the Operations qualification run
        selected for this period. A correction never edits a published briefing; it produces
        a new fingerprint and a new review event.
      </p>

      <section aria-label="Briefing entries" className="mt-6">
        <h2 className="sr-only">Entries in pinned order</h2>
        <div className="flex flex-col gap-3.5">
          {briefing.entries.map((entry) => (
            <IntelligenceCard
              key={entry.changeVersionId}
              record={entry.record}
            />
          ))}
        </div>
      </section>
    </>
  );
}
