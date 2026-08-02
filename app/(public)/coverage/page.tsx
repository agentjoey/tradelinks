import type { Metadata } from "next";

import { PUBLIC_CACHE } from "../../../src/public-intelligence/cache.js";
import { getCoverageMatrix } from "../../../src/public-intelligence/coverage.js";
import type { PublicCoverage } from "../../../src/public-intelligence/coverage.js";
import { CoveragePanel } from "../CoveragePanel";
import { formatDateTimeUtc, formatSla } from "../IntelligenceCard";
import { ReadinessBadge } from "../ReadinessBadge";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export const metadata: Metadata = {
  title: "Coverage & readiness — TradeLinks",
  description:
    "What TradeLinks watches, how often it reaches each source, and what it knows it is missing — weakest coverage first, with a stated gap on every capability.",
  alternates: { canonical: `${SITE}/coverage` },
};

function slaLabel(row: PublicCoverage): string {
  return row.slaMinutes != null ? formatSla(row.slaMinutes) : "—";
}

function lastCheckLabel(row: PublicCoverage, now: Date): { text: string; overdue: boolean } {
  if (!row.lastSuccessfulCheck) {
    return { text: row.overdueCount > 0 ? "never — source has not succeeded" : "never", overdue: row.overdueCount > 0 };
  }
  if (row.overdueCount > 0 && row.slaMinutes != null) {
    const overdueHours = Math.max(
      1,
      Math.round((now.getTime() - new Date(row.lastSuccessfulCheck).getTime() - row.slaMinutes * 60000) / 3600000),
    );
    return {
      text: `${formatDateTimeUtc(row.lastSuccessfulCheck)} — ${overdueHours}h overdue`,
      overdue: true,
    };
  }
  return { text: formatDateTimeUtc(row.lastSuccessfulCheck), overdue: false };
}

export default async function CoveragePage() {
  const now = new Date();
  const matrix = await getCoverageMatrix(now);

  const sourceTotal = matrix.reduce((sum, row) => sum + row.sourceCount, 0);
  const withinSla = matrix.reduce((sum, row) => sum + row.sourcesWithinSla, 0);
  const overdueTotal = matrix.reduce((sum, row) => sum + row.overdueCount, 0);
  const staleTotal = matrix.filter((row) => row.readiness === "STALE").length;

  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">Coverage &amp; readiness</h1>
      <p className="mt-2 max-w-[68ch] text-lede text-muted [text-wrap:pretty]">
        What we watch, how often we reach it, and what we know we are missing. Weakest coverage
        first — a capability that cannot support a public conclusion is the most important thing on
        this page.
      </p>

      <div className="mt-4">
        <CoveragePanel
          stats={[
            { label: "AS OF", value: formatDateTimeUtc(now.toISOString()) },
            { label: "CAPABILITIES", value: String(matrix.length) },
            { label: "SOURCES WITHIN SLA", value: `${withinSla} / ${sourceTotal}` },
            ...(overdueTotal > 0 || staleTotal > 0
              ? [
                  {
                    label: `${overdueTotal} OVERDUE · ${staleTotal} STALE`,
                    value: "",
                    tone: "bad" as const,
                    title:
                      "Overdue sources missed their check schedule; a stale capability is restored only by human re-review",
                  },
                ]
              : []),
          ]}
        />
      </div>

      <table className="mt-6 block w-full border-collapse sm:table">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-linestrong">
            <th scope="col" className="py-2 pr-4 text-left ticker text-label uppercase tracking-[0.1em] text-faint">
              Capability
            </th>
            <th scope="col" className="py-2 pr-4 text-left ticker text-label uppercase tracking-[0.1em] text-faint">
              Readiness
            </th>
            <th scope="col" className="py-2 pr-4 text-left ticker text-label uppercase tracking-[0.1em] text-faint">
              SLA
            </th>
            <th scope="col" className="py-2 text-left ticker text-label uppercase tracking-[0.1em] text-faint">
              Last successful check
            </th>
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {matrix.map((row) => {
            const lastCheck = lastCheckLabel(row, now);
            const troubled = row.readiness === "UNAVAILABLE" || row.readiness === "STALE";
            return (
              <tr
                key={row.key}
                className={`block border-b border-line py-3 sm:table-row sm:py-0 ${
                  troubled ? "bg-urgent/[0.05]" : ""
                }`}
              >
                <td className="block py-1 pr-4 align-top sm:table-cell sm:py-3">
                  <b className="text-body font-semibold">{row.label}</b>
                  {row.knownGaps.map((gap) => (
                    <span key={gap} className="block text-meta text-faint">
                      {gap}
                    </span>
                  ))}
                </td>
                <td className="block py-1 pr-4 align-top sm:table-cell sm:py-3">
                  <ReadinessBadge readiness={row.readiness} />
                </td>
                <td className="hidden py-3 pr-4 align-top ticker text-meta text-muted sm:table-cell">
                  {slaLabel(row)}
                </td>
                <td
                  className={`hidden py-3 align-top ticker text-meta sm:table-cell ${
                    lastCheck.overdue ? "text-urgent" : "text-muted"
                  }`}
                >
                  {lastCheck.text}
                </td>
                <td
                  className={`block py-1 ticker text-meta sm:hidden ${
                    lastCheck.overdue ? "text-urgent" : "text-muted"
                  }`}
                >
                  SLA {slaLabel(row)} · last check {lastCheck.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-6 rounded-lg border border-urgent/45 bg-surface p-5">
        <h2 className="font-display text-title">How to read this page</h2>
        <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
          <b className="font-medium text-ink">Verified</b> means a reviewer has confirmed the entry
          against primary-official evidence. <b className="font-medium text-ink">Monitored</b>{" "}
          means published and watched, but not yet confirmed to that standard — the entry states
          its own limit in prose. <b className="font-medium text-ink">Unavailable</b> means we
          have no lawful public route to the authoritative source and never will under the current
          design. <b className="font-medium text-ink">Experimental</b> means observed but
          unreviewed — it cannot support a conclusion.{" "}
          <b className="font-medium text-ink">Stale</b> means a source missed its SLA; a stale
          capability is only restored by human re-review, never automatically.
        </p>
      </div>
    </>
  );
}
