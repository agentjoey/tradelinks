import Link from "next/link";

/**
 * Public footer: the product's honesty promise on the left, the machine and
 * meta surfaces on the right (Public URL Contract routes).
 */
export function PublicFooter() {
  return (
    <footer className="mt-10 border-t border-line">
      <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-6 sm:px-8">
        <span className="ticker text-label uppercase tracking-[0.12em] text-faint">
          Evidence-backed · corrections are forward-only
        </span>
        <span className="ml-auto" />
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/feeds/changes.xml" className="ticker text-label uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:text-signal">
            RSS
          </Link>
          <Link href="/api/v1/changes" className="ticker text-label uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:text-signal">
            API v1
          </Link>
          <Link href="/coverage" className="ticker text-label uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:text-signal">
            Coverage
          </Link>
          <Link href="/agent/tradelinks/SKILL.md" className="ticker text-label uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:text-signal">
            Agent Skill
          </Link>
        </nav>
      </div>
    </footer>
  );
}
