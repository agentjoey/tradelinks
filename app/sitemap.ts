import type { MetadataRoute } from "next";
import { getPublishedNotes } from "../src/daily/db.js";
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
  ];

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
