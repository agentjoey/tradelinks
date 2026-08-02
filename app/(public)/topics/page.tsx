import type { Metadata } from "next";
import Link from "next/link";

import { PUBLIC_CACHE } from "../../../src/public-intelligence/cache.js";
import { listTopicSummaries } from "../../../src/public-intelligence/coverage.js";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export const metadata: Metadata = {
  title: "Topics — TradeLinks",
  description:
    "The six recurring US policy topics TradeLinks tracks: import and customs, product safety and recalls, labeling and claims, fees and payments, privacy and consumer protection, listing and account health.",
  alternates: { canonical: `${SITE}/topics` },
};

export default async function TopicsIndexPage() {
  const topics = await listTopicSummaries();

  return (
    <>
      <h1 className="font-display text-headline [text-wrap:balance]">Topics</h1>
      <p className="mt-2 max-w-[62ch] text-lede text-muted [text-wrap:pretty]">
        Six recurring policy topics, aggregated from reviewed canonical changes — topics have no
        separate editorial store. A topic page opens at three published changes, or one reviewed
        guide plus one current published change.
      </p>
      <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
        {topics.map((topic) => {
          if (!topic.supported) {
            return (
              <div
                key={topic.slug}
                className="flex flex-col gap-1.5 rounded-lg border border-dashed border-line p-4"
              >
                <h2 className="font-display text-title text-faint">{topic.label}</h2>
                <p className="text-meta text-faint">
                  {topic.changeCount} published change{topic.changeCount === 1 ? "" : "s"} ·{" "}
                  {topic.guideCount} reviewed guide{topic.guideCount === 1 ? "" : "s"} — below the
                  publication threshold, so no topic page yet.
                </p>
              </div>
            );
          }
          return (
            <Link
              key={topic.slug}
              href={`/topics/${topic.slug}`}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 transition-colors duration-200 hover:border-linestrong"
            >
              <h2 className="font-display text-title">{topic.label}</h2>
              <span className="ticker text-label uppercase tracking-[0.08em] text-faint">
                {topic.changeCount} change{topic.changeCount === 1 ? "" : "s"} · {topic.guideCount}{" "}
                guide{topic.guideCount === 1 ? "" : "s"}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
