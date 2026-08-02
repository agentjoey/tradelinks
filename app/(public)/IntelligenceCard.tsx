import Link from "next/link";

import type { CanonicalPublicRecord } from "../../src/public-intelligence/types.js";
import {
  RISK_TO_TOPIC,
  topicSlug,
} from "../../src/public-intelligence/coverage.js";
import {
  PRODUCT_CATEGORY_LABELS,
  RISK_ATTRIBUTE_LABELS,
} from "../../src/domain/intelligence/taxonomy.js";
import { ReadinessBadge } from "./ReadinessBadge";

// ---------- formatting helpers (shared by hub/coverage pages) ----------

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function formatDateTimeUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function formatSla(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

// ---------- evidence ----------

const ROLE_LABELS: Record<string, string> = {
  PRIMARY_OFFICIAL: "Primary",
  SUPPORTING_OFFICIAL: "Supporting",
  SECONDARY_CONTEXT: "Secondary",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function EvidenceRow({
  kind,
  title,
  host,
  href,
}: {
  kind: string;
  title: string;
  host: string;
  href: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1 text-meta">
      <span
        className={`ticker w-20 flex-none text-[0.625rem] uppercase tracking-[0.08em] ${
          kind === "Primary" ? "font-semibold text-calm" : "text-faint"
        }`}
      >
        {kind}
      </span>
      <span>
        <a
          href={href}
          className="text-ink underline decoration-signal/45 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
        >
          {title}
        </a>{" "}
        <span className="ticker text-label text-faint block sm:inline">{host}</span>
      </span>
    </div>
  );
}

// ---------- impact bolding ----------

const BOLD_TERMS = [
  ...Object.values(PRODUCT_CATEGORY_LABELS),
  "Amazon US",
  "Shopify US",
  "Amazon",
  "Shopify",
].sort((a, b) => b.length - a.length);

/** Bold the first occurrence of each category/platform name in the impact line. */
function ImpactLine({ text }: { text: string }) {
  const parts: Array<{ text: string; bold: boolean }> = [{ text, bold: false }];
  for (const term of BOLD_TERMS) {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (part.bold) continue;
      const idx = part.text.indexOf(term);
      if (idx === -1) continue;
      parts.splice(
        i,
        1,
        { text: part.text.slice(0, idx), bold: false },
        { text: term, bold: true },
        { text: part.text.slice(idx + term.length), bold: false },
      );
      i += 2;
    }
  }
  return (
    <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
      {parts.map((part, i) =>
        part.bold ? (
          <b key={i} className="font-medium text-ink">
            {part.text}
          </b>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

// ---------- the evidence card ----------

/**
 * The definitional Monitored limit (DESIGN.md §Card anatomy: a Monitored
 * card states its limit in a full sentence, never a bare badge). True of
 * every MONITORED record by the publication invariant: Verified requires
 * reviewed primary-official evidence. Hubs with a persisted, more specific
 * limit (e.g. amazon-us's login wall) pass their own sentence instead.
 */
export const MONITORED_LIMIT_NOTE =
  "We cannot verify this to the Verified standard — this entry has not been confirmed against reviewed primary-official evidence, so details may be restated.";

function whenLine(record: CanonicalPublicRecord, now: Date): string {
  if (record.effectiveAt) {
    const effective = new Date(record.effectiveAt);
    const days = Math.round((effective.getTime() - now.getTime()) / 86400000);
    if (days > 0) return `effective ${formatDate(record.effectiveAt)} · in ${days} days`;
    if (days === 0) return `effective ${formatDate(record.effectiveAt)} · today`;
    return `in effect since ${formatDate(record.effectiveAt)}`;
  }
  return `published ${formatDate(record.sourcePublishedAt)}`;
}

/**
 * The evidence card (DESIGN.md §Card anatomy): readiness word, title,
 * impact, an optional coverage-limit note in prose (never a bare badge),
 * the evidence list with primary first, and the version footer. Risk
 * Attribute chips route to the closest explicit topic with the exact label
 * kept as a filter.
 */
export function IntelligenceCard({
  record,
  limitNote,
  now = new Date(),
}: {
  record: CanonicalPublicRecord;
  limitNote?: string | null;
  now?: Date;
}) {
  const href = `/changes/${record.slug}`;
  const latestCorrection = record.correctionHistory[record.correctionHistory.length - 1];
  return (
    <article className="rounded-lg border border-line bg-surface p-5 transition-colors duration-200 hover:border-linestrong">
      <ReadinessBadge readiness={record.readiness} note={whenLine(record, now)} />
      <h3 className="mt-2 font-display text-title [text-wrap:balance]">
        <Link href={href} className="transition-colors duration-200 hover:text-signal">
          {record.title}
        </Link>
      </h3>
      <ImpactLine text={record.generalImpact} />
      {limitNote && (
        <p className="mt-3 max-w-[68ch] rounded-md border border-urgent/45 px-3 py-2.5 text-meta text-urgent">
          {limitNote}
        </p>
      )}
      {record.riskAttributes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="ticker text-[0.625rem] uppercase tracking-[0.12em] text-faint">
            Risk
          </span>
          {record.riskAttributes.map((attribute) => {
            const label = RISK_ATTRIBUTE_LABELS[attribute];
            return (
              <Link
                key={attribute}
                href={`/topics/${topicSlug(RISK_TO_TOPIC[attribute])}?risk=${encodeURIComponent(label)}`}
                className="rounded-full border border-line px-2.5 py-0.5 text-meta text-muted transition-colors duration-200 hover:border-linestrong hover:text-ink"
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
      <div className="mt-3.5 border-t border-line pt-3">
        <div className="ticker mb-1.5 text-[0.625rem] uppercase tracking-[0.14em] text-faint">
          Evidence
        </div>
        {record.evidence.map((evidence) => (
          <EvidenceRow
            key={`${evidence.sourceId}-${evidence.url}`}
            kind={ROLE_LABELS[evidence.role] ?? evidence.role}
            title={evidence.normalizedSummary}
            host={`${hostOf(evidence.url)}${evidence.publishedAt ? ` · ${formatDate(evidence.publishedAt)}` : ""}`}
            href={evidence.url}
          />
        ))}
        <div className="ticker mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-label text-faint">
          <span>
            v{record.version} · published {formatDate(record.reviewedAt)}
          </span>
          {latestCorrection && (
            <span className="text-urgent">
              corrected {formatDate(latestCorrection.createdAt)} — {latestCorrection.correctionReason}
            </span>
          )}
          <Link
            href={href}
            className="underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
          >
            version history
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Compact change row for federal/platform slices on hub pages. */
export function CompactChangeRow({ record }: { record: CanonicalPublicRecord }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2.5 first:border-t-0">
      <ReadinessBadge readiness={record.readiness} />
      <Link
        href={`/changes/${record.slug}`}
        className="text-body text-ink underline decoration-signal/45 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
      >
        {record.title}
      </Link>
      <span className="ticker text-label text-faint">
        {formatDate(record.effectiveAt ?? record.sourcePublishedAt)}
      </span>
    </div>
  );
}

/** Guide card: evergreen, sourced, dated by last review. */
export function GuideCard({
  guide,
}: {
  guide: {
    slug: string;
    title: string;
    summary: string;
    readiness: "MONITORED" | "VERIFIED" | "EXPERIMENTAL" | "STALE" | "UNAVAILABLE";
    lastReviewedAt: string;
  };
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-5 transition-colors duration-200 hover:border-linestrong">
      <ReadinessBadge readiness={guide.readiness} note={`last reviewed ${formatDate(guide.lastReviewedAt)}`} />
      <h3 className="mt-2 font-display text-title [text-wrap:balance]">
        <Link href="/guides" className="transition-colors duration-200 hover:text-signal">
          {guide.title}
        </Link>
      </h3>
      <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">{guide.summary}</p>
    </article>
  );
}
