// Tweet → viral-product extraction via the shared LLM client. The client is
// injected (testable with a stub, see test/x-extract.test.ts). Non-product
// tweets are dropped; engagement/link/media always come from the source tweet,
// never the model, so the Radar links and metrics stay trustworthy.
import { z } from "zod";
import type { LlmClient } from "../ai/client.js";
import { extractJson } from "../ai/json.js";
import type { ViralTweet } from "./x.js";
import { logger } from "../lib/logger.js";

// Cap tweets per LLM call so the JSON response can't overflow maxTokens and
// truncate into invalid JSON (the curated-accounts track can surface ~200/run).
const EXTRACT_BATCH = 25;
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export interface ExtractedProduct {
  product: string; // product or brand name
  category: string; // free-text category label (e.g. "kitchen", "beauty")
  whyViral: string; // one-line reason it's taking off
  link: string; // tweet permalink
  mediaUrl: string | null; // tweet media (if any)
  engagement: { likes: number; retweets: number };
  tweet: ViralTweet; // source reference (id, author, query …)
}

const SYSTEM = `You analyze tweets to find VIRAL CONSUMER PRODUCTS that cross-border sellers
could source and resell. For each tweet decide if it is genuinely about a buyable
physical product (a gadget, kitchen tool, beauty item, accessory, etc.) — NOT a
service, app, meme, opinion, or generic chatter. For product tweets, extract the
product/brand name, a short category label, and a one-line reason it is going viral.
Respond ONLY with JSON: {"results":[{"id","is_product","product","category","why_viral"}]}.`;

const ResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      is_product: z.boolean(),
      product: z.string().default(""),
      category: z.string().default(""),
      why_viral: z.string().default(""),
    }),
  ),
});

/** Extract viral products from a batch of tweets. Drops non-product tweets. */
export async function extractProducts(tweets: ViralTweet[], client: LlmClient): Promise<ExtractedProduct[]> {
  if (tweets.length === 0) return [];

  const byId = new Map(tweets.map((t) => [t.id, t]));
  const out: ExtractedProduct[] = [];

  for (const batch of chunk(tweets, EXTRACT_BATCH)) {
    const list = batch.map((t) => `- id=${t.id} | ${t.text.replace(/\s+/g, " ").slice(0, 240)}`).join("\n");
    let parsed;
    try {
      const res = await client.complete({ system: SYSTEM, user: `Tweets:\n${list}`, json: true, maxTokens: 1500 });
      parsed = ResultSchema.parse(extractJson(res.text)).results;
    } catch (e) {
      logger.error({ err: String(e), batch: batch.length }, "extractProducts batch failed; skipping");
      continue;
    }
    for (const r of parsed) {
      if (!r.is_product || !r.product.trim()) continue;
      const t = byId.get(r.id);
      if (!t) continue;
      out.push({
        product: r.product.trim(),
        category: r.category.trim() || "trend",
        whyViral: r.why_viral.trim(),
        link: t.link,
        mediaUrl: t.mediaUrl,
        engagement: { likes: t.likes, retweets: t.retweets },
        tweet: t,
      });
    }
  }
  return out;
}

// ---- Cross-border e-commerce hot-topic track (separate from products) ----

export interface HotTopic {
  headline: string; // short headline of the hot topic
  category: string; // free-text label (e.g. "policy", "logistics", "platform")
  whyHot: string; // one-line why it matters to cross-border sellers
  link: string; // tweet permalink
  mediaUrl: string | null;
  engagement: { likes: number; retweets: number };
  tweet: ViralTweet;
}

const TOPIC_SYSTEM = `You analyze tweets to find HOT TOPICS in CROSS-BORDER E-COMMERCE that matter
to global online sellers — e.g. platform policy/rule changes (Temu, Shein, TikTok Shop,
Amazon, AliExpress…), customs/tariffs/tax, logistics/shipping shifts, marketplace
expansions, or notable industry moves. For each tweet decide if it is a genuine,
substantive cross-border e-commerce topic — NOT a product ad, generic chatter, a
meme, or off-topic content. For relevant tweets, write a short headline, a category
label, and a one-line reason it matters to sellers.
Respond ONLY with JSON: {"results":[{"id","is_relevant","headline","category","why_hot"}]}.`;

const TopicResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      is_relevant: z.boolean(),
      headline: z.string().default(""),
      category: z.string().default(""),
      why_hot: z.string().default(""),
    }),
  ),
});

/** Extract cross-border e-commerce hot topics from a batch of tweets. Drops the
 *  irrelevant ones. Engagement/link/media always come from the source tweet. */
export async function extractTopics(tweets: ViralTweet[], client: LlmClient): Promise<HotTopic[]> {
  if (tweets.length === 0) return [];

  const byId = new Map(tweets.map((t) => [t.id, t]));
  const out: HotTopic[] = [];

  for (const batch of chunk(tweets, EXTRACT_BATCH)) {
    const list = batch.map((t) => `- id=${t.id} | ${t.text.replace(/\s+/g, " ").slice(0, 240)}`).join("\n");
    let parsed;
    try {
      const res = await client.complete({ system: TOPIC_SYSTEM, user: `Tweets:\n${list}`, json: true, maxTokens: 1500 });
      parsed = TopicResultSchema.parse(extractJson(res.text)).results;
    } catch (e) {
      logger.error({ err: String(e), batch: batch.length }, "extractTopics batch failed; skipping");
      continue;
    }
    for (const r of parsed) {
      if (!r.is_relevant || !r.headline.trim()) continue;
      const t = byId.get(r.id);
      if (!t) continue;
      out.push({
        headline: r.headline.trim(),
        category: r.category.trim() || "industry",
        whyHot: r.why_hot.trim(),
        link: t.link,
        mediaUrl: t.mediaUrl,
        engagement: { likes: t.likes, retweets: t.retweets },
        tweet: t,
      });
    }
  }
  return out;
}
