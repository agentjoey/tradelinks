import type { MetadataRoute } from "next";
import { getPublishedNotes } from "../src/daily/db.js";
import { prisma } from "../src/db/client.js";
import { briefingPath } from "../src/public-intelligence/briefings.js";
import type { BriefingKind } from "../src/public-intelligence/briefings.js";
import {
  canRenderHub,
  getCoverageMatrix,
  listTopicSummaries,
} from "../src/public-intelligence/coverage.js";
import { addLocale } from "./lib/locale";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const notes = await getPublishedNotes(1000).catch(() => []);
  const noteEntries: MetadataRoute.Sitemap = notes.map((n) => ({
    url: `${SITE}${addLocale(`/daily/${n.slug}`, n.lang === "zh" ? "zh" : "en")}`,
    lastModified: n.publishedAt ?? n.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const paths: { p: string; cf: "hourly" | "daily"; pr: number }[] = [
    { p: "/", cf: "hourly", pr: 1 },
    { p: "/wire", cf: "hourly", pr: 0.9 },
    { p: "/trends", cf: "daily", pr: 0.8 },
    { p: "/daily", cf: "daily", pr: 0.9 },
  ];
  // en (root) + zh (/zh) for each. Daily-note slugs are en-only until Phase 2.
  const staticEntries: MetadataRoute.Sitemap = paths.flatMap(({ p, cf, pr }) => [
    { url: `${SITE}${addLocale(p, "en")}`, changeFrequency: cf, priority: pr },
    { url: `${SITE}${addLocale(p, "zh")}`, changeFrequency: cf, priority: pr },
  ]);

  // Phase 1 public hubs: eligible (renderable) hubs and supported topics only,
  // English-only for Phase 1. A hub below Monitored 404s and stays out.
  const [matrix, topics] = await Promise.all([
    getCoverageMatrix().catch(() => []),
    listTopicSummaries().catch(() => []),
  ]);

  const publicEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/coverage`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/categories`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/topics`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/changes`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/briefings`, changeFrequency: "daily", priority: 0.7 },
  ];

  // Task 5: published briefings only — draft briefings, empty periods and
  // the locked guide corpus never appear. (The /guides index itself renders
  // the honest-absence state and is deliberately not a crawl target while
  // zero guides are published.)
  try {
    const briefings = await prisma.briefing.findMany({
      where: { editorialStatus: "PUBLISHED" },
      select: { kind: true, periodKey: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 500,
    });
    for (const briefing of briefings) {
      publicEntries.push({
        url: `${SITE}${briefingPath(briefing.kind as BriefingKind, briefing.periodKey)}`,
        lastModified: briefing.publishedAt ?? undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // A read failure must not take the rest of the sitemap down.
  }

  // Published canonical changes (Task 4): every public permalink is an
  // entry; unknown, unpublished or below-Monitored slugs never appear
  // because the where-clause re-states the Task 1 visibility gate
  // (isCurrent / PUBLISHED / reviewed / MONITORED|VERIFIED — pinned by
  // test/public-search.test.ts). One lightweight slug-only round trip:
  // listPublicChanges' count+page pair was measurably too slow for cold
  // callers (~7s against a 5s budget), this is ~3.5s cold, ~200ms warm.
  // The 4.5s budget bounds a pathologically slow read model: the sitemap is
  // then served without change entries rather than not served at all, and
  // the next request retries. (The returned array is spread-copied below,
  // so an abandoned query finishing late can never mutate the response.)
  const SITEMAP_CHANGES_BUDGET_MS = 4500;
  try {
    const collect = async () => {
      const rows = await prisma.canonicalChangeVersion.findMany({
        where: {
          isCurrent: true,
          editorialStatus: "PUBLISHED",
          reviewedAt: { not: null },
          readiness: { in: ["MONITORED", "VERIFIED"] },
        },
        select: { reviewedAt: true, canonicalChange: { select: { slug: true } } },
        orderBy: { reviewedAt: "desc" },
        take: 1000,
      });
      return rows;
    };
    const rows = await Promise.race([
      collect(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SITEMAP_CHANGES_BUDGET_MS)),
    ]);
    for (const row of rows ?? []) {
      publicEntries.push({
        url: `${SITE}/changes/${row.canonicalChange.slug}`,
        lastModified: row.reviewedAt ?? undefined,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch {
    // A read-model failure must not take the rest of the sitemap down.
  }

  for (const row of matrix) {
    if (!canRenderHub(row)) continue;
    let path: string | null = null;
    if (row.kind === "market") path = "/us";
    else if (row.kind === "platform") path = `/${row.key.slice("platform:".length)}`;
    else if (row.kind === "category") path = `/categories/${row.key.slice("category:".length)}`;
    if (path) {
      publicEntries.push({ url: `${SITE}${path}`, changeFrequency: "hourly", priority: 0.8 });
    }
  }

  for (const topic of topics) {
    if (!topic.supported) continue;
    publicEntries.push({
      url: `${SITE}/topics/${topic.slug}`,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  return [...staticEntries, ...noteEntries, ...publicEntries];
}
