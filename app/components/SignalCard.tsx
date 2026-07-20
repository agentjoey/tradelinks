import Link from "next/link";
import type { ReactNode } from "react";

export type SignalTone = "urgent" | "signal" | "calm" | "neutral";

const TONE_CHIP: Record<SignalTone, string> = {
  urgent: "bg-urgent text-white",
  signal: "bg-chipbg text-chipink",
  calm: "bg-calm text-canvas",
  neutral: "bg-faint/15 text-muted",
};

/**
 * The unified signal card: tier chip + ticker meta + title + optional dek,
 * thumbnail and foot slot. Replaces the StreamCard variants, the trends-page
 * grid markups and HotOnX one-offs. Tier is carried by chip + hairline border
 * (no side-stripe — impeccable absolute ban).
 */
export function SignalCard({
  href, external, tierLabel, tone = "signal", meta, title, dek, imageUrl, foot,
}: {
  /** Omit for a non-interactive card (e.g. insight cards without a source URL). */
  href?: string;
  external?: boolean;
  tierLabel?: string;
  tone?: SignalTone;
  meta: string;
  title: string;
  dek?: string;
  imageUrl?: string | null;
  foot?: ReactNode;
}) {
  const inner = (
    <>
      {imageUrl ? (
        <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          {tierLabel ? (
            <span className={`ticker rounded-full px-2 py-0.5 text-label uppercase ${TONE_CHIP[tone]}`}>{tierLabel}</span>
          ) : null}
          <span className="ticker text-meta text-faint">{meta}</span>
        </span>
        <span className="text-[0.9375rem] font-semibold leading-snug text-ink">{title}</span>
        {dek ? <span className="line-clamp-2 text-meta text-muted">{dek}</span> : null}
        {foot}
      </span>
    </>
  );
  const cls =
    "card-scan flex gap-3 rounded-md border border-line bg-surface p-4 transition-colors hover:border-signal/40";
  if (!href) return <div className={cls}>{inner}</div>;
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  ) : (
    <Link href={href} className={cls}>{inner}</Link>
  );
}
