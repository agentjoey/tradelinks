import { describe, it, expect } from "vitest";
import { parseFeed } from "../src/adapters/rss.js";
import { parseHtml } from "../src/adapters/fetch.js";
import { urlHash, normalizeUrl } from "../src/lib/hash.js";

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Marketplace Pulse</title>
  <item>
    <title>Amazon raises FBA fees in 2026</title>
    <link>https://example.com/amazon-fba-2026</link>
    <pubDate>Tue, 03 Jun 2026 09:00:00 GMT</pubDate>
    <description>Fee changes ahead.</description>
  </item>
  <item>
    <title>TikTok Shop expands to Brazil</title>
    <link>https://example.com/tiktok-brazil</link>
    <pubDate>Tue, 03 Jun 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe("parseFeed (RssAdapter)", () => {
  it("maps feed entries to RawItem[]", async () => {
    const items = await parseFeed(RSS_FIXTURE, "en");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: "https://example.com/amazon-fba-2026",
      title: "Amazon raises FBA fees in 2026",
      lang: "en",
    });
    expect(items[0]?.publishedAt).toBeDefined();
  });

  it("skips entries missing url or title", async () => {
    const xml = `<rss version="2.0"><channel><item><title>No link</title></item></channel></rss>`;
    const items = await parseFeed(xml);
    expect(items).toHaveLength(0);
  });
});

const HTML_FIXTURE = `<html><body>
  <article class="news-card">
    <h2 class="title">eBay updates seller protection policy</h2>
    <a href="/news/seller-protection">read</a>
    <time datetime="2026-06-02T10:00:00Z">Jun 2</time>
  </article>
  <article class="news-card">
    <h2 class="title">New shipping rules</h2>
    <a href="https://www.ebay.com/news/shipping">read</a>
  </article>
</body></html>`;

describe("parseHtml (FetchAdapter)", () => {
  it("extracts items and resolves relative URLs", () => {
    const items = parseHtml(HTML_FIXTURE, "https://www.ebay.com/sellercenter/news", {
      itemSelector: "article.news-card",
      titleSelector: "h2.title",
      linkSelector: "a",
      dateSelector: "time",
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: "https://www.ebay.com/news/seller-protection",
      title: "eBay updates seller protection policy",
      publishedAt: "2026-06-02T10:00:00.000Z",
    });
    expect(items[1]?.url).toBe("https://www.ebay.com/news/shipping");
  });
});

describe("url hashing / normalization", () => {
  it("normalizes tracking params and trailing slash", () => {
    expect(normalizeUrl("https://Example.com/a/?utm_source=x&id=1")).toBe(
      "https://example.com/a/?id=1",
    );
    expect(normalizeUrl("https://example.com/a/")).toBe("https://example.com/a");
  });

  it("produces stable hashes for equivalent URLs", () => {
    expect(urlHash("https://example.com/a?utm_source=x")).toBe(
      urlHash("https://example.com/a"),
    );
  });
});
