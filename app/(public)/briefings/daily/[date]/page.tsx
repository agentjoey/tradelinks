import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PUBLIC_CACHE } from "../../../../../src/public-intelligence/cache.js";
import {
  getPublishedBriefing,
  parseDailyPeriod,
} from "../../../../../src/public-intelligence/briefings.js";
import { BriefingPeriodView } from "../../../ReportCard";

export const revalidate = PUBLIC_CACHE.canonicalChangeRevalidate;
// Belt-and-braces (not load-bearing for the 404 status — the absence of any
// loading.tsx above this route carries that).
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

async function resolve(params: { date: string }) {
  const periodKey = parseDailyPeriod(params.date);
  // Impossible dates (and any malformed param) are real 404s, not errors.
  if (!periodKey) notFound();
  const briefing = await getPublishedBriefing("DAILY", periodKey);
  // Below-threshold days never produce a briefing row (Owner Decision 5),
  // so they land here as real 404s — there is no empty daily page.
  if (!briefing) notFound();
  return briefing;
}

export async function generateMetadata({
  params,
}: {
  params: { date: string };
}): Promise<Metadata> {
  const briefing = await resolve(params);
  return {
    title: `${briefing.title} — TradeLinks`,
    description: briefing.summary,
    alternates: { canonical: `${SITE}${briefing.path}` },
  };
}

export default async function DailyBriefingPage({ params }: { params: { date: string } }) {
  const briefing = await resolve(params);
  return <BriefingPeriodView briefing={briefing} />;
}
