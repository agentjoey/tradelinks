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
    const parsedDate = dateText ? new Date(dateText) : undefined;
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
      const items = parseHtml(body, job.url, this.config, this.lang);
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
