import type { SourceConfig } from "../config/sources.js";
import type { SourceAdapter } from "./types.js";
import { RssAdapter } from "./rss.js";
import { FetchAdapter } from "./fetch.js";

/**
 * Build the TS adapter for a source. Returns null for sources routed to the
 * Python Scrapling service (adapter=scrapling) — the crawler worker enqueues
 * those onto scrape-queue instead. JSON-API sources (json:true) are a
 * follow-up (JsonAdapter) and also return null for now.
 */
export function buildAdapter(source: SourceConfig): SourceAdapter | null {
  if (source.adapter === "scrapling") return null;
  if (source.json) return null; // JSON-API handler is a follow-up task
  if (source.adapter === "rss") return new RssAdapter(source.language);
  if (source.adapter === "fetch") {
    if (!source.fetchConfig) {
      throw new Error(`Source ${source.id} adapter=fetch but missing fetchConfig`);
    }
    return new FetchAdapter(source.fetchConfig, source.language);
  }
  return null;
}
