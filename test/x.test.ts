import { describe, it, expect, vi } from "vitest";
import { searchRecent, fetchViralTweets } from "../src/social/x.js";

/**
 * Build a fake `GET /2/tweets/search/recent` response. `gen(query, max)` yields
 * the tweets for one page; we wrap them in the X API v2 envelope (data +
 * includes.media + meta.result_count) and echo the requested page size.
 */
function makeFetch(gen: (query: string, maxResults: number) => Array<{ id: string; text?: string; likes?: number; retweets?: number; mediaKey?: string; previewUrl?: string }>) {
  return vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const u = new URL(String(url));
    const query = u.searchParams.get("query") ?? "";
    const maxResults = Number(u.searchParams.get("max_results") ?? "10");
    const rows = gen(query, maxResults);
    const data = rows.map((r) => ({
      id: r.id,
      text: r.text ?? `tweet ${r.id}`,
      author_id: `author_${r.id}`,
      created_at: "2026-06-05T00:00:00.000Z",
      public_metrics: { like_count: r.likes ?? 100, retweet_count: r.retweets ?? 0 },
      ...(r.mediaKey ? { attachments: { media_keys: [r.mediaKey] } } : {}),
    }));
    const media = rows.filter((r) => r.mediaKey).map((r) => ({ media_key: r.mediaKey, preview_image_url: r.previewUrl ?? `https://pbs.twimg.com/${r.mediaKey}.jpg` }));
    return new Response(
      JSON.stringify({ data, includes: { media }, meta: { result_count: data.length } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}

describe("searchRecent (X API v2 bearer search)", () => {
  it("sends the bearer token and parses tweets (likes, retweets, permalink, media)", async () => {
    const fetchImpl = makeFetch(() => [{ id: "1", likes: 80, retweets: 5, mediaKey: "m1", previewUrl: "https://img/m1.jpg" }]);
    const page = await searchRecent("#TikTokMadeMeBuyIt", { bearer: "TKN", maxResults: 10, fetchImpl: fetchImpl as unknown as typeof fetch });

    // bearer sent
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TKN");

    // relevancy sort (surface most-engaged tweets, not just newest)
    const calledUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(calledUrl).toContain("sort_order=relevancy");

    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({ id: "1", likes: 80, retweets: 5, mediaUrl: "https://img/m1.jpg" });
    expect(page[0]!.link).toContain("1");
  });

  it("throws on non-200 so the worker can back off", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    await expect(
      searchRecent("q", { bearer: "TKN", maxResults: 10, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/429/);
  });
});

describe("fetchViralTweets — read-cap accounting", () => {
  it("stops issuing queries once the cumulative read budget is reached", async () => {
    const fetchImpl = makeFetch((_q, max) =>
      Array.from({ length: max }, (_, i) => ({ id: `${_q}-${i}`, likes: 100 })),
    );
    const { reads, tweets } = await fetchViralTweets({
      queries: ["a", "b", "c", "d", "e"],
      maxReads: 12,
      minLikes: 0,
      maxResultsPerQuery: 4,
      bearer: "TKN",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // 4 + 4 + 4 = 12 → stops; queries d,e never issued.
    expect(reads).toBe(12);
    expect(tweets).toHaveLength(12);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("clamps the final page to the remaining budget (never over-reads the cap)", async () => {
    const fetchImpl = makeFetch((_q, max) =>
      Array.from({ length: max }, (_, i) => ({ id: `${_q}-${i}`, likes: 100 })),
    );
    const { reads } = await fetchViralTweets({
      queries: ["a", "b", "c"],
      maxReads: 10,
      minLikes: 0,
      maxResultsPerQuery: 4,
      bearer: "TKN",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    // 4 + 4 + (remaining 2) = 10, not 12.
    expect(reads).toBe(10);
  });
});

describe("fetchViralTweets — engagement pre-filter", () => {
  it("drops tweets below minLikes but still counts them as reads (cost incurred)", async () => {
    const fetchImpl = makeFetch(() => [
      { id: "hi", likes: 120 },
      { id: "lo", likes: 10 },
      { id: "edge", likes: 50 },
    ]);
    const { reads, tweets } = await fetchViralTweets({
      queries: ["a"],
      maxReads: 100,
      minLikes: 50,
      maxResultsPerQuery: 33,
      bearer: "TKN",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(reads).toBe(3); // all three were read (we paid for them)
    expect(tweets.map((t) => t.id).sort()).toEqual(["edge", "hi"]); // lo dropped, edge (==50) kept
    expect(tweets.every((t) => t.query === "a")).toBe(true); // tagged with originating query
  });
});
