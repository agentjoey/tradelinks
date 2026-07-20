import Link from "next/link";
import type { ReactNode } from "react";
import { TrackedLink } from "./TrackedLink";

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
  track, imageLayout = "thumb",
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
  /** GA event fired on click — renders via TrackedLink (always opens in a new tab). */
  track?: { event: string; params?: Record<string, string | number | boolean | undefined | null> };
  /** "thumb" = 72px side image; "top" = full-width 16:10 image block above the body. */
  imageLayout?: "thumb" | "top";
}) {
  const body = (
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
  );
  const inner = (
    <>
      {imageUrl ? (
        imageLayout === "top" ? (
          <span className="block aspect-[16/10] w-full overflow-hidden rounded-sm bg-surface2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          </span>
        )
      ) : null}
      {body}
    </>
  );
  const cls = `${imageLayout === "top" ? "flex flex-col gap-3" : "flex gap-3"} rounded-md border border-line bg-surface p-4 transition-colors`;
  // Link-like hover affordances only on interactive renders.
  if (!href) return <div className={cls}>{inner}</div>;
  const linkCls = `${cls} card-scan hover:border-signal/40`;
  if (track) {
    return (
      <TrackedLink href={href} event={track.event} params={track.params} className={linkCls}>
        {inner}
      </TrackedLink>
    );
  }
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>{inner}</a>
  ) : (
    <Link href={href} className={linkCls}>{inner}</Link>
  );
}
