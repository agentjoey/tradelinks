import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PUBLIC_CACHE } from "../../../../../../src/public-intelligence/cache.js";
import {
  getPublishedBriefing,
  parseMonthlyPeriod,
} from "../../../../../../src/public-intelligence/briefings.js";
import { BriefingPeriodView } from "../../../../ReportCard";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
// Belt-and-braces (not load-bearing for the 404 status — the absence of any
// loading.tsx above this route carries that).
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

async function resolve(params: { year: string; month: string }) {
  const periodKey = parseMonthlyPeriod(params.year, params.month);
  // Out-of-range months (and any malformed param) are real 404s, not errors.
  if (!periodKey) notFound();
  const briefing = await getPublishedBriefing("MONTHLY", periodKey);
  // Unknown, unpublished, or never-qualified periods are real 404s.
  if (!briefing) notFound();
  return briefing;
}

export async function generateMetadata({
  params,
}: {
  params: { year: string; month: string };
}): Promise<Metadata> {
  const briefing = await resolve(params);
  return {
    title: `${briefing.title} — TradeLinks`,
    description: briefing.summary,
    alternates: { canonical: `${SITE}${briefing.path}` },
  };
}

export default async function MonthlyBriefingPage({
  params,
}: {
  params: { year: string; month: string };
}) {
  const briefing = await resolve(params);
  return <BriefingPeriodView briefing={briefing} />;
}
