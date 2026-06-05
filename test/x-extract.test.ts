import { describe, it, expect, vi } from "vitest";
import { extractProducts, extractTopics } from "../src/social/extract.js";
import type { ViralTweet } from "../src/social/x.js";
import type { LlmClient } from "../src/ai/client.js";

function tweet(over: Partial<ViralTweet>): ViralTweet {
  return {
    id: "t1",
    text: "obsessed with this mini portable blender",
    author: "a1",
    likes: 120,
    retweets: 9,
    createdAt: "2026-06-05T00:00:00.000Z",
    link: "https://x.com/i/web/status/t1",
    mediaUrl: "https://img/t1.jpg",
    query: "#TikTokMadeMeBuyIt",
    ...over,
  };
}

/** Stub LlmClient returning a canned JSON body; records the prompt it saw. */
function stubClient(json: unknown): LlmClient & { lastUser?: string } {
  const c: LlmClient & { lastUser?: string } = {
    name: "stub",
    async complete(opts) {
      c.lastUser = opts.user;
      return { text: JSON.stringify(json), usage: { promptTokens: 1, completionTokens: 1 }, model: "stub" };
    },
  };
  return c;
}

describe("extractProducts (tweet → product via AI)", () => {
  it("keeps product tweets and drops non-product ones", async () => {
    const tweets = [tweet({ id: "p" }), tweet({ id: "noise", text: "good morning everyone" })];
    const client = stubClient({
      results: [
        { id: "p", is_product: true, product: "PocketBlend mini blender", category: "kitchen", why_viral: "cordless, viral on TikTok" },
        { id: "noise", is_product: false, product: "", category: "", why_viral: "" },
      ],
    });

    const out = await extractProducts(tweets, client);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ product: "PocketBlend mini blender", category: "kitchen", whyViral: "cordless, viral on TikTok" });
  });

  it("carries engagement, link and media from the source tweet (not the LLM)", async () => {
    const tweets = [tweet({ id: "p", likes: 333, retweets: 42, link: "https://x.com/i/web/status/p", mediaUrl: "https://img/p.jpg" })];
    const client = stubClient({ results: [{ id: "p", is_product: true, product: "Thing", category: "gadget", why_viral: "neat" }] });

    const out = await extractProducts(tweets, client);
    const row = out[0]!;

    expect(row.engagement).toEqual({ likes: 333, retweets: 42 });
    expect(row.link).toBe("https://x.com/i/web/status/p");
    expect(row.mediaUrl).toBe("https://img/p.jpg");
    expect(row.tweet.id).toBe("p");
  });

  it("returns [] without calling the LLM when there are no tweets", async () => {
    const client = stubClient({ results: [] });
    const spy = vi.spyOn(client, "complete");
    const out = await extractProducts([], client);
    expect(out).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("extractTopics (tweet → cross-border e-commerce hot topic via AI)", () => {
  it("keeps relevant cross-border topics and drops irrelevant tweets", async () => {
    const tweets = [
      tweet({ id: "rel", text: "Temu just changed its EU import rules — big impact for cross-border sellers" }),
      tweet({ id: "off", text: "my cat is so cute today" }),
    ];
    const client = stubClient({
      results: [
        { id: "rel", is_relevant: true, headline: "Temu changes EU import rules", category: "policy", why_hot: "affects cross-border sellers' costs" },
        { id: "off", is_relevant: false, headline: "", category: "", why_hot: "" },
      ],
    });

    const out = await extractTopics(tweets, client);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ headline: "Temu changes EU import rules", category: "policy", whyHot: "affects cross-border sellers' costs" });
  });

  it("carries engagement, link and media from the source tweet (not the LLM)", async () => {
    const tweets = [tweet({ id: "rel", likes: 210, retweets: 30, link: "https://x.com/i/web/status/rel", mediaUrl: "https://img/rel.jpg" })];
    const client = stubClient({ results: [{ id: "rel", is_relevant: true, headline: "H", category: "logistics", why_hot: "w" }] });

    const out = await extractTopics(tweets, client);
    const row = out[0]!;

    expect(row.engagement).toEqual({ likes: 210, retweets: 30 });
    expect(row.link).toBe("https://x.com/i/web/status/rel");
    expect(row.mediaUrl).toBe("https://img/rel.jpg");
    expect(row.tweet.id).toBe("rel");
  });

  it("returns [] without calling the LLM when there are no tweets", async () => {
    const client = stubClient({ results: [] });
    const spy = vi.spyOn(client, "complete");
    expect(await extractTopics([], client)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
