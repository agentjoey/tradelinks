import type { CrawlJob, RawItem } from "../queue/schemas.js";

// The structured fetch outcome contract lives with the source contracts;
// re-exported here so adapter consumers import it from the adapter layer.
export type { FetchOutcome } from "../domain/intelligence/source-contract.js";

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
