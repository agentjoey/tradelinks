import Link from "next/link";

/**
 * The Monitored limit, stated once for the page it applies to.
 *
 * It used to render on every Monitored card. Readiness is inherited from the
 * source contract and both live sources are graded Monitored, so it fired on
 * every row — the same thirty words twenty times down a list. A signal that
 * never varies carries no information; the repeated red block read as breakage
 * rather than as honesty, and at 390px it ran to five lines, leaving each card
 * about half disclaimer.
 *
 * Nothing is concealed by moving it. `ReadinessBadge` already prints the
 * literal word on every card, and the prose was layered on top of it. Now that
 * VERIFIED is reachable, the chip carries the distinction the prose was only
 * pretending to: Verified renders in calm and semibold, Monitored in faint, so
 * a mixed list separates at a glance.
 *
 * Deliberately not the ticker style. Thirty words of uppercase mono is harder
 * to read than the block it replaces, and relocating a wall of text while
 * making it more painful is not a fix.
 *
 * Approved at the Mockup Gate, 2026-08-07.
 * Record: .agent/frontend-design/2026-08-07-monitored-limit-note.md
 */
export function MonitoredPageNote({
  records,
}: {
  records: readonly { readiness: string }[];
}) {
  const monitored = records.filter((r) => r.readiness === "MONITORED").length;
  // No Monitored entry means no limit to state. A caveat that renders where it
  // does not apply is the same failure as one that never varies.
  if (monitored === 0) return null;
  const all = monitored === records.length;

  return (
    <p className="mt-2 max-w-[68ch] text-meta text-faint [text-wrap:pretty]">
      {all ? (
        <>
          Every entry here is <b className="font-semibold text-muted">Monitored</b>
        </>
      ) : (
        <>
          Entries marked <b className="font-semibold text-muted">Monitored</b> are
        </>
      )}{" "}
      — published and watched, not yet confirmed against reviewed primary-official
      evidence, so details may be restated.{" "}
      <Link
        href="/coverage"
        className="text-signal underline underline-offset-2 transition-colors duration-200 hover:text-ink"
      >
        How we grade coverage →
      </Link>
    </p>
  );
}
