import type { CrawlJob, RawItem } from "../queue/schemas.js";

export interface CrawlResult {
  ok: boolean;
  blocked: boolean;
  items: RawItem[];
  error?: string;
}

export interface SourceAdapter {
  readonly kind: "rss" | "fetch";
  crawl(job: CrawlJob): Promise<CrawlResult>;
}

/** Per-source fetch parsing config (used by FetchAdapter). */
export interface FetchParseConfig {
  itemSelector: string;
  titleSelector: string;
  linkSelector?: string;
  dateSelector?: string;
  /** plain-text markers we expect when the page is healthy (blocked detection) */
  expectedSelectors?: string[];
}
