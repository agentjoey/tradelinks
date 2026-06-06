// X (Twitter) Radar queries. Rows live in `items` under source X01
// (status=processed, Radar-only — never the Wire), the same fork as Amazon
// bestsellers. Two tracks share the source, discriminated by rawContent.kind:
//   - "product" → viral consumer products      (getViralX)
//   - "topic"   → cross-border e-commerce hot  (getHotTopicsX)
// See workers/x.ts for the write path.
import { prisma } from "../db/client.js";
import { X_SOURCE_ID } from "../config/sources.js";

interface XRawContent {
  kind?: "product" | "topic";
  tweetId?: string;
  author?: string;
  likes?: number;
  retweets?: number;
  why_viral?: string;
  why_hot?: string;
  category?: string;
  query?: string;
}

/**
 * Latest stored tweet time for an author (the account's user_id) — used as the
 * `start_time` cursor so the curated-accounts track only reads NEW posts. Returns
 * undefined when we've never stored a tweet from this account.
 */
export async function latestTweetTimeByAuthor(authorId: string): Promise<string | undefined> {
  const it = await prisma.item.findFirst({
    where: { sourceId: X_SOURCE_ID, rawContent: { path: ["author"], equals: authorId } },
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });
  return it?.publishedAt ? it.publishedAt.toISOString() : undefined;
}

async function recentXItems(kind: "product" | "topic") {
  return prisma.item.findMany({
    where: {
      sourceId: X_SOURCE_ID,
      crawledAt: { gte: new Date(Date.now() - 7 * 864e5) },
      rawContent: { path: ["kind"], equals: kind },
    },
    orderBy: { crawledAt: "desc" },
    take: 200,
    select: { title: true, url: true, imageUrl: true, rawContent: true },
  });
}

export interface ViralXRow {
  product: string;
  link: string;
  imageUrl: string | null;
  likes: number;
  retweets: number;
  whyViral: string;
  author: string | null;
  query: string | null;
}

/** Recent viral-product rows for the Radar's "Viral on X" section, hottest first. */
export async function getViralX(limit = 24): Promise<ViralXRow[]> {
  const items = await recentXItems("product");
  const rows = items.map((it) => {
    const rc = (it.rawContent ?? {}) as XRawContent;
    return {
      product: it.title,
      link: it.url,
      imageUrl: it.imageUrl,
      likes: rc.likes ?? 0,
      retweets: rc.retweets ?? 0,
      whyViral: rc.why_viral ?? "",
      author: rc.author ?? null,
      query: rc.query ?? null,
    };
  });
  rows.sort((a, b) => b.likes - a.likes);
  return rows.slice(0, limit);
}

export interface HotTopicXRow {
  headline: string;
  link: string;
  imageUrl: string | null;
  likes: number;
  retweets: number;
  whyHot: string;
  category: string;
  author: string | null;
}

/** Recent cross-border e-commerce hot topics for the Radar's "Hot on X" section. */
export async function getHotTopicsX(limit = 18): Promise<HotTopicXRow[]> {
  const items = await recentXItems("topic");
  const rows = items.map((it) => {
    const rc = (it.rawContent ?? {}) as XRawContent;
    return {
      headline: it.title,
      link: it.url,
      imageUrl: it.imageUrl,
      likes: rc.likes ?? 0,
      retweets: rc.retweets ?? 0,
      whyHot: rc.why_hot ?? "",
      category: rc.category ?? "industry",
      author: rc.author ?? null,
    };
  });
  rows.sort((a, b) => b.likes - a.likes);
  return rows.slice(0, limit);
}
