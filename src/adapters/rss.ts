import Parser from "rss-parser";
import type { CrawlJob, RawItem } from "../queue/schemas.js";
import type { CrawlResult, SourceAdapter } from "./types.js";

const parser = new Parser({
  timeout: 30_000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8",
  },
});

/**
 * Escape ampersands that do not begin a valid entity reference.
 *
 * Publishers routinely emit `?utm_source=rss&utm_medium=feed` unescaped. That
 * is malformed XML, and a strict parser is right to reject it — but rejecting
 * the document costs every item in the feed, which is a far worse outcome than
 * repairing one character. Named, decimal and hex entities are left alone, so
 * running this over an already-valid document is a no-op.
 */
export function repairXmlEntities(xml: string): string {
  return xml.replace(
    /&(?!(?:[a-zA-Z][a-zA-Z0-9]{0,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g,
    "&amp;",
  );
}

/**
 * Parse an already-fetched feed string. Pulled out for unit testing.
 *
 * Strict first: a feed that parses cleanly is never rewritten. The repair is a
 * fallback, so a structurally broken document still throws rather than being
 * silently downgraded to an empty success.
 */
export async function parseFeed(xml: string, lang?: string): Promise<RawItem[]> {
  let feed;
  try {
    feed = await parser.parseString(xml);
  } catch {
    feed = await parser.parseString(repairXmlEntities(xml));
  }
  const items: RawItem[] = [];
  for (const entry of feed.items) {
    const url = entry.link?.trim();
    const title = entry.title?.trim();
    if (!url || !title) continue;
    items.push({
      url,
      title,
      publishedAt: entry.isoDate ?? undefined,
      lang,
      rawContent: {
        contentSnippet: entry.contentSnippet,
        content: entry.content,
        creator: (entry as Record<string, unknown>).creator,
      },
    });
  }
  return items;
}

export class RssAdapter implements SourceAdapter {
  readonly kind = "rss" as const;

  constructor(private readonly lang?: string) {}

  async crawl(job: CrawlJob): Promise<CrawlResult> {
    try {
      const res = await fetch(job.url, {
        headers: { "User-Agent": "Mozilla/5.0 TradeLinks/0.1" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        return { ok: false, blocked: false, items: [], error: `HTTP ${res.status}` };
      }
      const xml = await res.text();
      const items = await parseFeed(xml, this.lang);
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
