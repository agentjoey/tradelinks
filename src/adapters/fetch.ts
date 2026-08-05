import * as cheerio from "cheerio";
import type { CrawlJob, RawItem } from "../queue/schemas.js";
import type { CrawlResult, FetchParseConfig, SourceAdapter } from "./types.js";
import { isBlocked } from "./blocked.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

/**
 * Parse a publication date without letting the crawler's timezone move it.
 *
 * `new Date("May 22, 2026")` is local midnight, so `toISOString()` renders it
 * as the 21st anywhere east of Greenwich — every date-only byline would shift
 * a day, and the ninety-day promotion window would inherit the error. A
 * date-only string names a calendar day, not an instant, so its Y/M/D is taken
 * as UTC. Strings that do carry a time (ISO `datetime` attributes) are left
 * exactly as the publisher wrote them.
 */
export function parsePublishedDate(text: string): Date | undefined {
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const hasTimeOfDay = /\d:\d/.test(text);
  if (hasTimeOfDay) return parsed;
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
  );
}

/** Parse already-fetched HTML with a per-source config. Pulled out for unit testing. */
export function parseHtml(
  html: string,
  baseUrl: string,
  config: FetchParseConfig,
  lang?: string,
): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  $(config.itemSelector).each((_, el) => {
    const node = $(el);
    // title: prefer the configured selector; fall back to the node's own text
    // (handles the common "item IS the anchor" pattern: <a href=…>Headline</a>).
    let title = node.find(config.titleSelector).first().text().trim();
    if (!title) title = node.text().replace(/\s+/g, " ").trim();
    let href = config.linkSelector
      ? node.find(config.linkSelector).first().attr("href")
      : node.find("a").first().attr("href");
    if (!href && node.is("a")) href = node.attr("href"); // node itself is the link
    if (!title || !href) return;
    title = title.slice(0, 300);
    let url: string;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const dateText = config.dateSelector
      ? node.find(config.dateSelector).first().attr("datetime") ??
        node.find(config.dateSelector).first().text().trim()
      : undefined;
    const parsedDate = dateText ? parsePublishedDate(dateText) : undefined;
    items.push({
      url,
      title,
      publishedAt:
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : undefined,
      lang,
    });
  });
  return items;
}

export class FetchAdapter implements SourceAdapter {
  readonly kind = "fetch" as const;

  constructor(
    private readonly config: FetchParseConfig,
    private readonly lang?: string,
  ) {}

  async crawl(job: CrawlJob): Promise<CrawlResult> {
    try {
      const res = await fetch(job.url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        return { ok: false, blocked: false, items: [], error: `HTTP ${res.status}` };
      }
      const body = await res.text();
      if (isBlocked({ body, expectedSelectors: this.config.expectedSelectors })) {
        return { ok: false, blocked: true, items: [], error: "blocked: bot-wall detected" };
      }
      const matched = cheerio.load(body)(this.config.itemSelector).length;
      const items = parseHtml(body, job.url, this.config, this.lang);
      if (items.length === 0) {
        // A listing page that parses to nothing is a broken selector far more
        // often than a genuinely empty feed, and reporting it as an empty
        // success is how AMZ-ANNOUNCEMENTS looked healthy while parsing zero
        // items for its entire life. Say which of the two failures it is: no
        // container matched at all, or containers matched but carried no
        // extractable title and link.
        const error =
          matched === 0
            ? `SELECTOR_NO_MATCH: ${this.config.itemSelector}`
            : `SELECTOR_NO_ITEMS: ${this.config.itemSelector} matched ${matched}, none yielded a title and link`;
        return { ok: false, blocked: false, items: [], error };
      }
      return { ok: true, blocked: false, items };
    } catch (err) {
      return {
        ok: false,
        blocked: false,
        items: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
