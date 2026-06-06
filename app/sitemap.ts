import type { MetadataRoute } from "next";
import { getPublishedNotes } from "../src/daily/db.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const notes = await getPublishedNotes(1000).catch(() => []);
  const noteEntries: MetadataRoute.Sitemap = notes.map((n) => ({
    url: `${SITE}/daily/${n.slug}`,
    lastModified: n.publishedAt ?? n.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/trends`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/daily`, changeFrequency: "daily", priority: 0.9 },
  ];

  return [...staticEntries, ...noteEntries];
}
