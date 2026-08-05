/**
 * A selector that matches nothing is a failure, not an empty page.
 *
 * AMZ-ANNOUNCEMENTS was configured with `itemSelector: "article"`. The real
 * page is Brightspot CMS: its two `<article>` elements are marketing blocks
 * with no title or link, and the nine announcements live in
 * `.PageListD-items-item`. So every crawl parsed zero items — and `parseHtml`
 * returning `[]` became `{ ok: true, items: [] }`, recorded as
 * SUCCEEDED_EMPTY with HTTP 200.
 *
 * The source therefore looked perfectly healthy for its entire life while
 * never producing a single item, and the Amazon hub — whose only policy source
 * this is — had nothing to show. Three layers had to line up for that: the
 * wrong selector, a parse failure presented as an empty success, and a
 * hand-written 401-byte fixture that matched the wrong selector so the test
 * stayed green.
 *
 * This pins the second layer, which is the one that made the other two
 * invisible.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FetchAdapter, parseHtml } from "../src/adapters/fetch.js";
import { toFetchOutcome } from "../src/adapters/index.js";
import { PHASE1_SOURCES_BY_ID } from "../src/config/phase1-sources.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sources");

/**
 * Bodies under 512 bytes are treated as bot-walls by isBlocked(), and rightly
 * so — a challenge page is short. The filler keeps these fixtures past that
 * floor so each test exercises the parser rather than the blocked detector.
 */
const FILLER = "<p>" + "Selling on Amazon and Shopify. ".repeat(24) + "</p>";

const PAGE = `<html><body>
  <div class="list">
    <div class="row"><h3><a href="/a">Real headline</a></h3></div>
    <div class="row"><h3><a href="/b">Another headline</a></h3></div>
  </div>
  ${FILLER}
</body></html>`;

describe("parseHtml", () => {
  it("parses items when the selector matches", () => {
    const items = parseHtml(PAGE, "https://e.com", {
      itemSelector: ".row",
      titleSelector: "h3",
      linkSelector: "a",
    });
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("Real headline");
  });

  it("returns nothing when the selector matches nothing", () => {
    // parseHtml stays pure — reporting the failure is the adapter's job.
    expect(
      parseHtml(PAGE, "https://e.com", { itemSelector: "article", titleSelector: "h2" }),
    ).toHaveLength(0);
  });
});

describe("FetchAdapter reports a parse failure as a failure", () => {
  function adapterOver(html: string, itemSelector: string) {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const adapter = new FetchAdapter({ itemSelector, titleSelector: "h3", linkSelector: "a" });
    return {
      run: () => adapter.crawl({ sourceId: "S", url: "https://e.com/list", adapter: "fetch" } as never),
      restore: () => { globalThis.fetch = original; },
    };
  }

  it("succeeds when items parse", async () => {
    const { run, restore } = adapterOver(PAGE, ".row");
    try {
      const res = await run();
      expect(res.ok).toBe(true);
      expect(res.items).toHaveLength(2);
    } finally { restore(); }
  });

  it("fails — does not silently succeed — when the selector matches nothing", async () => {
    const { run, restore } = adapterOver(PAGE, ".does-not-exist");
    try {
      const res = await run();
      expect(res.ok, "a zero-match parse must not report success").toBe(false);
      expect(res.blocked).toBe(false);
      expect(res.error).toMatch(/SELECTOR/);
    } finally { restore(); }
  });

  it("fails when the selector matches nodes but none yield an item", async () => {
    // The exact AMZ-ANNOUNCEMENTS shape: containers exist, but they carry no
    // title and no link, so nothing is extractable.
    const html = `<html><body><article><span>promo</span></article>${FILLER}</body></html>`;
    const { run, restore } = adapterOver(html, "article");
    try {
      const res = await run();
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/SELECTOR/);
    } finally { restore(); }
  });

  it("maps a selector failure to a non-retryable outcome", () => {
    // Retrying three times cannot make a wrong selector right; it just burns
    // the slot's budget and delays the honest failure.
    const outcome = toFetchOutcome(
      { ok: false, blocked: false, items: [], error: "SELECTOR_NO_MATCH: .row" },
      {},
    );
    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.retryable).toBe(false);
    expect(outcome.kind === "failed" && outcome.code).toMatch(/SELECTOR/);
  });
});

describe("AMZ-ANNOUNCEMENTS parses its real fixture", () => {
  const source = PHASE1_SOURCES_BY_ID.get("AMZ-ANNOUNCEMENTS")!;

  it("is configured for the page that actually exists", () => {
    expect(source.selectors?.item).toBe(".PageListD-items-item");
  });

  it("extracts every announcement, with a title, an absolute link and a date", () => {
    const html = readFileSync(join(FIXTURES, source.fixture!), "utf8");
    const items = parseHtml(html, source.url, {
      itemSelector: source.selectors!.item!,
      titleSelector: source.selectors!.title!,
      linkSelector: source.selectors!.link,
      dateSelector: source.selectors!.date,
    });
    // The fixture holds six captured announcements.
    expect(items.length).toBe(6);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(10);
      expect(item.url).toMatch(/^https:\/\/sell\.amazon\.com\/blog\/.+/);
      expect(item.publishedAt, `${item.title} has no date`).toBeTruthy();
    }
  });

  it("takes the headline, not the image link or the category chip", () => {
    const html = readFileSync(join(FIXTURES, source.fixture!), "utf8");
    const items = parseHtml(html, source.url, {
      itemSelector: source.selectors!.item!,
      titleSelector: source.selectors!.title!,
      linkSelector: source.selectors!.link,
    });
    // Each card also holds an image anchor (empty text) and a category anchor
    // reading "Announcements". Neither may become the item.
    expect(items.map((i) => i.title)).not.toContain("Announcements");
    expect(items[0]!.title).toBe(
      "Upgrades to Customer Service by Amazon help sellers save time and reduce refunds",
    );
  });

  it("reads the real publication dates rather than the crawl time", () => {
    const html = readFileSync(join(FIXTURES, source.fixture!), "utf8");
    const items = parseHtml(html, source.url, {
      itemSelector: source.selectors!.item!,
      titleSelector: source.selectors!.title!,
      linkSelector: source.selectors!.link,
      dateSelector: source.selectors!.date,
    });
    expect(items[0]!.publishedAt!.slice(0, 10)).toBe("2026-05-22");
  });
});
