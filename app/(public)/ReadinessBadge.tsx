import type { ReadinessLevel } from "@prisma/client";

import { cn } from "../../components/lib/utils";

const WORDS: Record<ReadinessLevel, string> = {
  VERIFIED: "Verified",
  MONITORED: "Monitored",
  EXPERIMENTAL: "Experimental",
  STALE: "Stale",
  UNAVAILABLE: "Unavailable",
};

// Token semantics (DESIGN.md §Colour): calm = evidentiary strength, faint =
// de-emphasis, urgent = a problem the reader must not miss. Colour never
// carries readiness alone — the literal word always renders.
const TONES: Record<ReadinessLevel, string> = {
  VERIFIED: "font-semibold text-calm",
  MONITORED: "text-faint",
  EXPERIMENTAL: "text-faint",
  STALE: "text-urgent",
  UNAVAILABLE: "text-urgent",
};

/**
 * The readiness word, always literal (mono, uppercase) with an optional
 * plain-language note. Survives greyscale, colour-blindness and print.
 */
export function ReadinessBadge({
  readiness,
  note,
  className,
}: {
  readiness: ReadinessLevel;
  note?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ticker inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-label uppercase tracking-[0.1em]",
        className,
      )}
    >
      <span className={TONES[readiness]}>{WORDS[readiness]}</span>
      {note && <span className="normal-case tracking-[0.04em] text-faint">{note}</span>}
    </span>
  );
}
