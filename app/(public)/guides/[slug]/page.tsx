import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PUBLIC_CACHE } from "../../../../src/public-intelligence/cache.js";
import { getPublishedGuideBySlug } from "../../../../src/public-intelligence/guides.js";
import type { PublishedGuideDetail } from "../../../../src/public-intelligence/guides.js";
import {
  PRODUCT_CATEGORY_LABELS,
} from "../../../../src/domain/intelligence/taxonomy.js";
import type { ProductCategory } from "@prisma/client";
import { ReadinessBadge } from "../../ReadinessBadge";
import { formatDate } from "../../IntelligenceCard";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
// Belt-and-braces (not load-bearing for the 404 status — the absence of any
// loading.tsx above this route carries that).
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const guide = await getPublishedGuideBySlug(params.slug);
  if (!guide) notFound();
  return {
    title: `${guide.title} — TradeLinks`,
    description: guide.summary,
    alternates: { canonical: `${SITE}/guides/${guide.slug}` },
  };
}

/** Minimal renderer for the guide body subset: ## sections, paragraphs, - lists. */
function GuideBody({ markdown }: { markdown: string }) {
  type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };
  const sections: Array<{ heading: string | null; blocks: Block[] }> = [];
  let current: { heading: string | null; blocks: Block[] } = { heading: null, blocks: [] };
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      sections.push(current);
      current = { heading: line.slice(3).trim(), blocks: [] };
    } else if (line.trim() === "") {
      continue;
    } else if (line.startsWith("- ")) {
      const last = current.blocks[current.blocks.length - 1];
      if (last && last.type === "ul") last.items.push(line.slice(2));
      else current.blocks.push({ type: "ul", items: [line.slice(2)] });
    } else {
      current.blocks.push({ type: "p", text: line });
    }
  }
  sections.push(current);

  let key = 0;
  return (
    <>
      {sections.map((section) => {
        const body = (
          <>
            {section.blocks.map((block) =>
              block.type === "ul" ? (
                <ul key={key++} className="mt-2 flex max-w-[68ch] list-disc flex-col gap-1 pl-5 text-body text-muted">
                  {block.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={key++} className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
                  {block.text}
                </p>
              ),
            )}
          </>
        );
        if (!section.heading) return <div key={key++}>{body}</div>;
        return (
          <section key={key++} className="mt-9 border-t border-line pt-5">
            <h2 className="font-display text-title">{section.heading}</h2>
            {body}
          </section>
        );
      })}
    </>
  );
}

function GuideEvidence({ guide }: { guide: PublishedGuideDetail }) {
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-5">
      {guide.evidence.map((entry) => (
        <div
          key={entry.url}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2.5 text-meta first:border-t-0"
        >
          <span className="ticker w-24 flex-none text-[0.625rem] uppercase tracking-[0.08em] text-faint">
            {entry.authorityLevel === "GOVERNMENT_OFFICIAL"
              ? "Government"
              : entry.authorityLevel === "PLATFORM_OFFICIAL"
                ? "Platform"
                : "Industry"}
          </span>
          <span>
            <a
              href={entry.url}
              className="text-ink underline decoration-signal/45 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
            >
              {entry.normalizedSummary}
            </a>{" "}
            <span className="ticker text-label text-faint">{entry.sourceName}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function GuidePage({ params }: { params: { slug: string } }) {
  const guide = await getPublishedGuideBySlug(params.slug);
  // Every draft and every unknown slug is a real 404 — drafts never render.
  if (!guide) notFound();

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="ticker mb-3 flex flex-wrap gap-2 text-label uppercase tracking-[0.08em] text-faint"
      >
        <Link href="/" className="transition-colors duration-200 hover:text-signal">
          TradeLinks
        </Link>
        <span>/</span>
        <Link href="/guides" className="transition-colors duration-200 hover:text-signal">
          Guides
        </Link>
        <span>/</span>
        <span aria-current="page">{guide.title}</span>
      </nav>

      <ReadinessBadge
        readiness={guide.readiness}
        note={`last reviewed ${formatDate(guide.lastReviewedAt)}`}
      />
      <h1 className="mt-2 font-display text-headline [text-wrap:balance]">{guide.title}</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">{guide.summary}</p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 ticker text-label tracking-[0.02em] text-faint">
        <span>
          MARKET <b className="font-medium text-ink">United States</b>
        </span>
        {guide.productCategories.length > 0 && (
          <span>
            CATEGORIES{" "}
            <b className="font-medium text-ink">
              {guide.productCategories
                .map((c) => PRODUCT_CATEGORY_LABELS[c as ProductCategory] ?? c)
                .join(" · ")}
            </b>
          </span>
        )}
        <span>
          REVIEWED BY <b className="font-medium text-ink">{guide.reviewedBy}</b>
        </span>
      </div>

      <GuideBody markdown={guide.bodyMarkdown} />

      <section className="mt-9 border-t border-line pt-5">
        <h2 className="font-display text-title">Sources</h2>
        <p className="mt-1 text-meta text-faint">
          The official records this guide rests on, reviewed {formatDate(guide.lastReviewedAt)}.
        </p>
        <GuideEvidence guide={guide} />
      </section>

      <section className="mt-9 rounded-lg border border-urgent/45 bg-surface p-5">
        <h2 className="font-display text-title">What this does not tell you</h2>
        <p className="mt-2 max-w-[68ch] text-body text-muted [text-wrap:pretty]">
          This guide is general information, not legal advice. It does not cover state or
          local rules beyond the cited instruments, and it cannot judge whether your specific
          product or documents satisfy a requirement. Confirm anything load-bearing against
          the primary source or a qualified adviser.
        </p>
      </section>
    </>
  );
}
