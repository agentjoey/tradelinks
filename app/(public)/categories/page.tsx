import type { Metadata } from "next";
import Link from "next/link";

import { PUBLIC_CACHE } from "../../../src/public-intelligence/cache.js";
import { canRenderHub, getCoverageMatrix } from "../../../src/public-intelligence/coverage.js";
import {
  INITIAL_PUBLIC_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  categorySlug,
} from "../../../src/domain/intelligence/taxonomy.js";
import { ReadinessBadge } from "../ReadinessBadge";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export const metadata: Metadata = {
  title: "Categories — TradeLinks",
  description:
    "The six launch product categories TradeLinks covers for the US market. A category hub appears only once its coverage reaches Monitored readiness.",
  alternates: { canonical: `${SITE}/categories` },
};

export default async function CategoriesIndexPage() {
  const matrix = await getCoverageMatrix();

  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">Categories</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        The six launch product categories. A category hub appears only once its coverage reaches
        Monitored — below that it is stated as hidden, never rendered as a placeholder.
      </p>
      <div className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {INITIAL_PUBLIC_CATEGORIES.map((category) => {
          const slug = categorySlug(category);
          const row = matrix.find((entry) => entry.key === `category:${slug}`);
          const renderable = row != null && canRenderHub(row);
          if (!renderable) {
            return (
              <div
                key={slug}
                className="flex flex-col gap-1.5 rounded-lg border border-dashed border-line p-4"
              >
                <span className="ticker text-label uppercase tracking-[0.08em] text-faint">
                  {row ? <ReadinessBadge readiness={row.readiness} /> : "No capability"}
                </span>
                <h2 className="font-display text-title text-faint">
                  {PRODUCT_CATEGORY_LABELS[category]}
                </h2>
                <p className="text-meta text-faint">Below Monitored — hidden until coverage is reviewed.</p>
              </div>
            );
          }
          return (
            <Link
              key={slug}
              href={`/categories/${slug}`}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 transition-colors duration-200 hover:border-linestrong"
            >
              <ReadinessBadge readiness={row.readiness as "MONITORED" | "VERIFIED"} />
              <h2 className="font-display text-title">{PRODUCT_CATEGORY_LABELS[category]}</h2>
              <p className="text-meta text-muted">{row.summary}</p>
              <span className="ticker text-label uppercase tracking-[0.08em] text-faint">
                {row.knownGaps.length} known gap{row.knownGaps.length === 1 ? "" : "s"} stated
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
