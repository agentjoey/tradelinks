import type { MetadataRoute } from "next";
import { getPublishedNotes } from "../src/daily/db.js";
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

  return [...staticEntries, ...noteEntries];
}
