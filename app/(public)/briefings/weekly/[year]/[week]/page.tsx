import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PUBLIC_CACHE } from "../../../../../../src/public-intelligence/cache.js";
import {
  getPublishedBriefing,
  parseWeeklyPeriod,
} from "../../../../../../src/public-intelligence/briefings.js";
import { BriefingPeriodView } from "../../../../ReportCard";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
// Belt-and-braces (not load-bearing for the 404 status — the absence of any
// loading.tsx above this route carries that).
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

async function resolve(params: { year: string; week: string }) {
  const periodKey = parseWeeklyPeriod(params.year, params.week);
  // Out-of-range weeks (and any malformed param) are real 404s, not errors.
  if (!periodKey) notFound();
  const briefing = await getPublishedBriefing("WEEKLY", periodKey);
  // Unknown, unpublished, or never-qualified periods are real 404s.
  if (!briefing) notFound();
  return briefing;
}

export async function generateMetadata({
  params,
}: {
  params: { year: string; week: string };
}): Promise<Metadata> {
  const briefing = await resolve(params);
  return {
    title: `${briefing.title} — TradeLinks`,
    description: briefing.summary,
    alternates: { canonical: `${SITE}${briefing.path}` },
  };
}

export default async function WeeklyBriefingPage({
  params,
}: {
  params: { year: string; week: string };
}) {
  const briefing = await resolve(params);
  return <BriefingPeriodView briefing={briefing} />;
}
