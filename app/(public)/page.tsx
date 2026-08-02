import Link from "next/link";

/**
 * Phase 1 public home (mockup surface 1, design/phase1-public-intelligence.html).
 * Task 2 ships the shell with the approved example records; Task 3 wires the
 * real read model into this page. No BL-045 liveness choreography — no wire
 * tape, no masthead entrance, no radar glyph, no live blip.
 */

function SectionHeader({ title, sub, moreHref, moreLabel }: { title: string; sub?: string; moreHref?: string; moreLabel?: string }) {
  return (
    <div className="mt-9 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-t border-line pt-5">
      <h2 className="font-display text-title">{title}</h2>
      {sub && <p className="text-meta text-muted">{sub}</p>}
      {moreHref && moreLabel && (
        <>
          <span className="ml-auto" />
          <Link href={moreHref} className="ticker text-label text-muted transition-colors duration-200 hover:text-signal">
            {moreLabel}
          </Link>
        </>
      )}
    </div>
  );
}

function ReadinessLine({ word, tone, when }: { word: string; tone: "verified" | "monitored"; when: string }) {
  return (
    <div className="ticker flex flex-wrap items-center gap-2.5 text-label uppercase tracking-[0.1em]">
      <span className={tone === "verified" ? "font-semibold text-calm" : "text-faint"}>{word}</span>
      <span className="normal-case tracking-[0.04em] text-faint">{when}</span>
    </div>
  );
}

function EvidenceRow({ kind, title, host, href }: { kind: "Primary" | "Supporting"; title: string; host: string; href: string }) {
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

export default function Home() {
  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">What changed for sellers entering the US market</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        Government rules, platform policies and compliance changes, traced to their primary sources. Every entry
        states how far the evidence supports it — and what we still cannot see.
      </p>

      <div
        role="status"
        aria-label="Coverage status"
        className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 ticker text-label tracking-[0.02em] text-faint"
      >
        <span className="sr-only">
          21 of 23 sources were checked on schedule, most recently at 14:02 UTC. 2 sources are overdue. 6 known
          coverage gaps.
        </span>
        <span title="Last time every source was checked">
          LAST SOURCE CHECK <b className="font-medium text-ink">14:02 UTC</b>
        </span>
        <span title="21 of 23 sources checked on schedule">
          SOURCES WITHIN SLA <b className="font-medium text-ink">21 / 23</b>
        </span>
        <span className="text-urgent" title="2 sources missed their check schedule">
          2 OVERDUE
        </span>
        <span title="6 known coverage gaps">
          KNOWN GAPS <b className="font-medium text-ink">6</b>
        </span>
        <Link href="/coverage" className="text-muted underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal">
          Coverage &amp; readiness →
        </Link>
      </div>

      <SectionHeader
        title="Changes to know now"
        sub="Verified first. Readiness is evidence strength, not importance."
        moreHref="/changes"
        moreLabel="All changes →"
      />
      <div className="mt-4 flex flex-col gap-3.5">
        <article className="rounded-lg border border-linestrong bg-surface p-5 transition-colors duration-200">
          <ReadinessLine word="Verified" tone="verified" when="effective 2026-09-15 · in 44 days" />
          <h3 className="mt-2 font-display text-title [text-wrap:balance]">
            <Link href="/changes" className="transition-colors duration-200 hover:text-signal">
              CPSC expands third-party testing to imported children&apos;s sleepwear
            </Link>
          </h3>
          <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
            Hits <b className="font-medium text-ink">Toys &amp; Children&apos;s Products</b> and{" "}
            <b className="font-medium text-ink">Apparel &amp; Accessories</b> sellers importing finished garments.
            Children&apos;s Product Certificates issued before the effective date are not carried over.
          </p>
          <div className="mt-3.5 border-t border-line pt-3">
            <div data-evidence-label className="ticker mb-1.5 text-[0.625rem] uppercase tracking-[0.14em] text-faint">
              Evidence
            </div>
            <EvidenceRow kind="Primary" title="Safety Standard for Children's Sleepwear; Final Rule" host="federalregister.gov · 2026-07-22" href="/changes" />
            <EvidenceRow kind="Primary" title="16 CFR Part 1615 testing requirements" host="cpsc.gov · retrieved 2026-07-28" href="/changes" />
            <div className="ticker mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-label text-faint">
              <span>v3 · published 2026-07-22</span>
              <span className="text-urgent">corrected 2026-07-30 — effective date restated</span>
              <Link href="/changes" className="underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal">
                version history
              </Link>
            </div>
          </div>
        </article>

        <article className="rounded-lg border border-line bg-surface p-5 transition-colors duration-200 hover:border-linestrong">
          <ReadinessLine word="Monitored" tone="monitored" when="effective 2026-10-01 · in 60 days" />
          <h3 className="mt-2 font-display text-title [text-wrap:balance]">
            <Link href="/changes" className="transition-colors duration-200 hover:text-signal">
              Amazon US raises referral fees for oversize Home &amp; Kitchen listings
            </Link>
          </h3>
          <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
            Hits <b className="font-medium text-ink">Home &amp; Kitchen</b> sellers on{" "}
            <b className="font-medium text-ink">Amazon US</b> whose units fall in the oversize tiers.
          </p>
          <p className="mt-3 max-w-[68ch] rounded-md border border-urgent/45 px-3 py-2.5 text-meta text-urgent">
            We cannot verify this. Amazon&apos;s official fee page requires a seller login, so this entry rests on
            one public announcement plus two secondary summaries. Treat the exact tier thresholds as unconfirmed.
          </p>
          <div className="mt-3.5 border-t border-line pt-3">
            <div data-evidence-label className="ticker mb-1.5 text-[0.625rem] uppercase tracking-[0.14em] text-faint">
              Evidence
            </div>
            <EvidenceRow kind="Primary" title="Selling partner fee schedule announcement" host="sellercentral.amazon.com · 2026-07-28" href="/changes" />
            <EvidenceRow kind="Supporting" title="Fee change breakdown" host="ecommercebytes.com · 2026-07-29" href="/changes" />
            <div className="ticker mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-label text-faint">
              <span>v1 · published 2026-07-29</span>
              <Link href="/changes" className="underline decoration-signal/40 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal">
                version history
              </Link>
            </div>
          </div>
        </article>
      </div>

      <SectionHeader title="Where to look" sub="A hub appears only once its coverage reaches Monitored." />
      <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr]">
        <Link href="/us" className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface2 p-4 transition-colors duration-200 hover:border-linestrong sm:col-span-2 lg:col-span-1">
          <span className="ticker text-label uppercase tracking-[0.08em] font-semibold text-calm">Verified</span>
          <h3 className="font-display text-title">US Market</h3>
          <p className="text-meta text-muted">
            Federal rules, customs, product safety and labeling that apply regardless of where you sell.
          </p>
          <span className="ticker text-label uppercase tracking-[0.08em] text-faint">18 changes · 4 guides</span>
        </Link>
        <Link href="/amazon-us" className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 transition-colors duration-200 hover:border-linestrong">
          <span className="ticker text-label uppercase tracking-[0.08em] text-faint">Monitored</span>
          <h3 className="font-display text-title">Amazon US</h3>
          <p className="text-meta text-muted">Fees, listing and account policy.</p>
          <span className="text-meta text-urgent">Official policy pages are login-walled.</span>
        </Link>
        <Link href="/shopify-us" className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 transition-colors duration-200 hover:border-linestrong">
          <span className="ticker text-label uppercase tracking-[0.08em] text-faint">Monitored</span>
          <h3 className="font-display text-title">Shopify US</h3>
          <p className="text-meta text-muted">Payments, chargebacks, merchant terms.</p>
          <span className="ticker text-label uppercase tracking-[0.08em] text-faint">6 changes · 1 guide</span>
        </Link>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {[
          "Consumer Electronics",
          "Pet Supplies",
          "Beauty & Personal Care",
          "Toys & Children's Products",
          "Home & Kitchen",
          "Apparel & Accessories",
        ].map((cat) => (
          <Link
            key={cat}
            href="/categories"
            className="rounded-full border border-line px-2.5 py-1 text-meta text-muted transition-colors duration-200 hover:border-linestrong hover:text-ink"
          >
            {cat}
          </Link>
        ))}
        <span className="rounded-full border border-dashed border-line px-2.5 py-1 text-meta text-faint">
          Grocery — below Monitored, hidden
        </span>
      </div>

      <SectionHeader title="This week's briefing" moreHref="/briefings" moreLabel="All briefings →" />
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h3 className="text-body font-semibold">Week 31 · 2026-07-27 → 2026-08-02</h3>
        <p className="mt-1.5 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
          Three verified changes and one correction. The CPSC sleepwear rule moved its effective date; the FTC
          narrowed its Made in USA scope to origin claims. Nothing qualified in Consumer Electronics this week —
          that is an absence, not an omission.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/briefings"
            className="rounded-md border border-linestrong px-3 py-1.5 text-meta text-ink transition-colors duration-200 hover:bg-surface2"
          >
            Read the briefing
          </Link>
          <Link
            href="/feeds/briefings.xml"
            className="rounded-md border border-linestrong px-3 py-1.5 text-meta text-ink transition-colors duration-200 hover:bg-surface2"
          >
            RSS
          </Link>
        </div>
      </div>
    </>
  );
}
