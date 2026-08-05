/**
 * One malformed ampersand must not discard an entire feed.
 *
 * FreightWaves (E02) publishes a valid-looking RSS document containing a bare
 * `&` inside a URL query string. rss-parser's sax parser is strict, so it
 * threw "Invalid character in entity name" and the adapter returned zero items
 * for a 750 KB feed that was otherwise fine. Collection retried three times,
 * then `collect-fast` exited 1 and Railway recorded the whole service as
 * CRASHED — for one character.
 *
 * The repair is deliberately narrow: try strict parsing first and only repair
 * on failure, so well-formed feeds are never rewritten and a genuinely broken
 * document still fails loudly.
 */

import { describe, expect, it } from "vitest";

import { parseFeed, repairXmlEntities } from "../src/adapters/rss.js";

function feed(itemXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>t</title><link>https://e.com</link>
${itemXml}
</channel></rss>`;
}

const ITEM = (title: string, link: string) =>
  `<item><title>${title}</title><link>${link}</link><pubDate>Mon, 04 Aug 2026 10:00:00 GMT</pubDate></item>`;

describe("repairXmlEntities", () => {
  it("escapes a bare ampersand in a query string", () => {
    expect(repairXmlEntities("https://e.com/a?x=1&y=2")).toBe("https://e.com/a?x=1&amp;y=2");
  });

  it("leaves named entities untouched", () => {
    const s = "Tom &amp; Jerry &lt;b&gt; &quot;q&quot; &apos;a&apos;";
    expect(repairXmlEntities(s)).toBe(s);
  });

  it("leaves numeric and hex entities untouched", () => {
    const s = "&#8212; &#x2014; &#160;";
    expect(repairXmlEntities(s)).toBe(s);
  });

  it("escapes an ampersand followed by something entity-shaped but unterminated", () => {
    // `&utm` with no semicolon is not an entity, however much it looks like one.
    expect(repairXmlEntities("?a=1&utm_source=x")).toBe("?a=1&amp;utm_source=x");
  });

  it("escapes a trailing ampersand", () => {
    expect(repairXmlEntities("a&")).toBe("a&amp;");
  });

  it("does not double-escape an already-escaped document", () => {
    const once = repairXmlEntities("a&b&amp;c");
    expect(repairXmlEntities(once)).toBe(once);
  });
});

describe("parseFeed", () => {
  it("parses a well-formed feed", async () => {
    const items = await parseFeed(feed(ITEM("Hello", "https://e.com/1")), "en");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Hello");
  });

  it("recovers the whole feed when one link carries a bare ampersand", async () => {
    // Exactly the FreightWaves shape: strict parsing throws, and before the
    // repair every one of these items was lost.
    const xml = feed(
      [
        ITEM("Kept one", "https://e.com/a?utm_source=rss&utm_medium=feed"),
        ITEM("Kept two", "https://e.com/b"),
        ITEM("Kept three", "https://e.com/c?x=1&y=2"),
      ].join("\n"),
    );
    const items = await parseFeed(xml, "en");
    expect(items.map((i) => i.title)).toEqual(["Kept one", "Kept two", "Kept three"]);
    expect(items[0]!.url).toBe("https://e.com/a?utm_source=rss&utm_medium=feed");
  });

  it("does not rewrite a feed that parses strictly", async () => {
    // A correctly-escaped ampersand must survive as one ampersand, not two.
    const items = await parseFeed(feed(ITEM("A &amp; B", "https://e.com/1?x=1&amp;y=2")), "en");
    expect(items[0]!.title).toBe("A & B");
    expect(items[0]!.url).toBe("https://e.com/1?x=1&y=2");
  });

  it("still fails loudly on a genuinely broken document", async () => {
    // The repair fixes entities, not structure. An unclosed tag is a real
    // parse failure and must not be swallowed into an empty success.
    await expect(parseFeed("<rss><channel><item><title>x</q></channel>", "en")).rejects.toThrow();
  });

  it("skips entries missing a title or link rather than emitting a half item", async () => {
    const xml = feed(
      [ITEM("Good", "https://e.com/1"), "<item><title>No link</title></item>"].join("\n"),
    );
    const items = await parseFeed(xml, "en");
    expect(items.map((i) => i.title)).toEqual(["Good"]);
  });
});
