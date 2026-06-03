import type { SourceConfig } from "../config/sources.js";
import type { SourceAdapter } from "./types.js";
import { RssAdapter } from "./rss.js";
import { FetchAdapter } from "./fetch.js";
import { JsonAdapter } from "./json.js";

/**
 * Build the TS adapter for a source. Returns null for sources routed to the
 * Python Scrapling service (adapter=scrapling) — the crawler worker enqueues
 * those onto scrape-queue instead.
 */
export function buildAdapter(source: SourceConfig): SourceAdapter | null {
  if (source.adapter === "scrapling") return null;
  if (source.json) {
    if (!source.jsonShape) throw new Error(`Source ${source.id} json=true but missing jsonShape`);
    return new JsonAdapter(source.jsonShape, source.language);
  }
  if (source.adapter === "rss") return new RssAdapter(source.language);
  if (source.adapter === "fetch") {
    if (!source.fetchConfig) {
      throw new Error(`Source ${source.id} adapter=fetch but missing fetchConfig`);
    }
    return new FetchAdapter(source.fetchConfig, source.language);
  }
  return null;
}
