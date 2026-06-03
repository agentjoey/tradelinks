import { describe, it, expect, vi, afterEach } from "vitest";
import { callScraper } from "../src/workers/scrape.js";
import type { ScrapeJob } from "../src/queue/schemas.js";

const JOB: ScrapeJob = { sourceId: "D07", url: "https://example.com", mode: "stealth" };

afterEach(() => vi.restoreAllMocks());

describe("callScraper (Node→Python HTTP bridge)", () => {
  it("returns parsed RawItems on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [{ url: "https://example.com/a", title: "Trending product", lang: "en" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const items = await callScraper(JOB, "http://scraper");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ url: "https://example.com/a", title: "Trending product" });
  });

  it("throws on non-200 (so pg-boss retries)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    await expect(callScraper(JOB, "http://scraper")).rejects.toThrow(/502/);
  });

  it("rejects malformed response (schema validation)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ items: [{ title: "no url" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(callScraper(JOB, "http://scraper")).rejects.toThrow();
  });
});
