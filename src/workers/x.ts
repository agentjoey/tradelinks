// X (Twitter) daily worker (x-tick). Two Radar-only tracks share one hard daily
// read budget (X_MAX_READS_PER_DAY, ~$0.005/read → ≤$0.50/day):
//   1. viral consumer products  (#TikTokMadeMeBuyIt … → extractProducts)
//   2. cross-border e-commerce hot topics (跨境电商 / cross-border … → extractTopics)
// Both upsert as X01 items (status=processed), tagged rawContent.kind, the same
// fork as Amazon bestsellers — never the AI/Wire pipeline. The whole run no-ops
// (zero cost) when X_ENABLED is off or no bearer is set.
import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";
import { urlHash, normalizeUrl } from "../lib/hash.js";
import { pickClient } from "../ai/client.js";
import { fetchViralTweets } from "../social/x.js";
import { extractProducts, extractTopics } from "../social/extract.js";
import { X_SOURCE_ID, SOURCES_BY_ID } from "../config/sources.js";
import { logger } from "../lib/logger.js";

/** Viral consumer-product queries (spec §Acquisition). Few, high-signal. */
export const X_QUERIES = [
  "#TikTokMadeMeBuyIt -is:retweet lang:en",
  "(#AmazonFinds OR #amazonmusthaves) -is:retweet lang:en",
  '("viral product" OR "tiktok made me buy") -is:retweet lang:en',
];

/** Cross-border e-commerce hot-topic queries (separate track). EN + ZH. */
export const X_TOPIC_QUERIES = [
  '("cross-border ecommerce" OR "cross-border e-commerce" OR "cross border ecommerce") -is:retweet lang:en',
  '(跨境电商 OR 跨境卖家 OR 出海电商) -is:retweet lang:zh',
];

export interface XIngestResult {
  skipped?: boolean;
  reads: number;
  products: number;
  topics: number;
  created: number;
}

/** X API page size is 10–100; split a budget across N queries within that range. */
function perQuerySize(budget: number, queryCount: number): number {
  return Math.min(100, Math.max(10, Math.floor(budget / Math.max(1, queryCount))));
}

/** Upsert one Radar-only X01 item, tagged with `kind` in rawContent. */
async function upsertXItem(
  kind: "product" | "topic",
  title: string,
  link: string,
  mediaUrl: string | null,
  createdAt: string | null,
  rawContent: Record<string, unknown>,
): Promise<boolean> {
  const src = SOURCES_BY_ID.get(X_SOURCE_ID);
  const url = normalizeUrl(link); // canonical permalink (one row per tweet)
  const hash = urlHash(link);
  const data = { kind, ...rawContent };

  const existing = await prisma.item.findUnique({ where: { urlHash: hash } });
  if (existing) {
    // refresh engagement/title/media on re-surface so the board stays current.
    await prisma.item.update({
      where: { urlHash: hash },
      data: { title, rawContent: data, ...(mediaUrl ? { imageUrl: mediaUrl } : {}), crawledAt: new Date() },
    });
    return false;
  }

  await prisma.item.create({
    data: {
      sourceId: X_SOURCE_ID,
      url,
      urlHash: hash,
      title,
      lang: "en",
      publishedAt: createdAt ? new Date(createdAt) : new Date(),
      rawContent: data,
      status: "processed",
      regions: (src?.regions ?? []) as never[],
      platforms: src?.platforms ?? ["x"],
      category: "trend",
      imageUrl: mediaUrl,
    },
  });
  return true;
}

/**
 * One daily X run: budget-capped search → AI extraction (products + cross-border
 * topics) → upsert Radar-only X01 items. Reusable directly (scripts) and via the
 * scheduled worker. No-ops (zero cost) unless X_ENABLED and a bearer are set.
 */
export async function runXIngest(): Promise<XIngestResult> {
  if (!env.X_ENABLED || !env.X_BEARER_TOKEN) {
    logger.info({ enabled: env.X_ENABLED, hasToken: !!env.X_BEARER_TOKEN }, "x-tick disabled — no-op (zero cost)");
    return { skipped: true, reads: 0, products: 0, topics: 0, created: 0 };
  }

  const bearer = env.X_BEARER_TOKEN;
  const minLikes = env.X_MIN_LIKES; // spec §Quality pre-filter; env-tunable
  // split the daily read budget between the two tracks so both run and the
  // combined reads stay within the hard cap.
  const productBudget = Math.floor(env.X_MAX_READS_PER_DAY / 2);
  const topicBudget = env.X_MAX_READS_PER_DAY - productBudget;
  const client = pickClient("en");

  // --- track 1: viral products ---
  const p = await fetchViralTweets({
    queries: X_QUERIES,
    maxReads: productBudget,
    minLikes,
    maxResultsPerQuery: perQuerySize(productBudget, X_QUERIES.length),
    bearer,
  });
  const products = await extractProducts(p.tweets, client);

  // --- track 2: cross-border e-commerce hot topics ---
  const tp = await fetchViralTweets({
    queries: X_TOPIC_QUERIES,
    maxReads: topicBudget,
    minLikes,
    maxResultsPerQuery: perQuerySize(topicBudget, X_TOPIC_QUERIES.length),
    bearer,
  });
  const topics = await extractTopics(tp.tweets, client);

  const reads = p.reads + tp.reads;
  logger.info(
    { reads, cap: env.X_MAX_READS_PER_DAY, productKept: p.tweets.length, topicKept: tp.tweets.length, products: products.length, topics: topics.length },
    "x search + extract done",
  );

  let created = 0;
  for (const it of products) {
    const isNew = await upsertXItem("product", it.product, it.link, it.mediaUrl, it.tweet.createdAt, {
      tweetId: it.tweet.id,
      author: it.tweet.author,
      likes: it.engagement.likes,
      retweets: it.engagement.retweets,
      why_viral: it.whyViral,
      category: it.category,
      query: it.tweet.query,
    });
    if (isNew) created++;
  }
  for (const it of topics) {
    const isNew = await upsertXItem("topic", it.headline, it.link, it.mediaUrl, it.tweet.createdAt, {
      tweetId: it.tweet.id,
      author: it.tweet.author,
      likes: it.engagement.likes,
      retweets: it.engagement.retweets,
      why_hot: it.whyHot,
      category: it.category,
      query: it.tweet.query,
    });
    if (isNew) created++;
  }

  logger.info({ reads, products: products.length, topics: topics.length, created }, "x-tick ingested (Radar-only)");
  return { reads, products: products.length, topics: topics.length, created };
}

export function registerXWorker(boss: PgBoss) {
  return boss.work(QUEUES.x, async () => {
    await runXIngest();
  });
}
