import { createHash } from "node:crypto";

import type { SourceConfig } from "../config/sources.js";
import type { CrawlResult, FetchOutcome, SourceAdapter } from "./types.js";
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

/**
 * Convert a legacy CrawlResult into the structured Phase 1 FetchOutcome.
 * A successful crawl keeps its items plus the response status and a content
 * hash (of the raw body when given, else of the normalized items); a bot
 * wall becomes a non-retryable `blocked`; HTTP/network errors become
 * `failed` and stay retryable for 5xx/429 and transport errors only.
 */
export function toFetchOutcome(
  result: CrawlResult,
  ctx: { httpStatus?: number; body?: string } = {},
): FetchOutcome {
  if (result.ok) {
    return {
      kind: "success",
      items: result.items,
      httpStatus: ctx.httpStatus ?? 200,
      contentHash: createHash("sha256")
        .update(ctx.body ?? JSON.stringify(result.items))
        .digest("hex"),
    };
  }
  if (result.blocked) {
    return { kind: "blocked", code: "BOT_WALL", retryable: false, httpStatus: ctx.httpStatus };
  }
  const status = ctx.httpStatus ?? Number(result.error?.match(/HTTP (\d{3})/)?.[1]);
  if (Number.isInteger(status)) {
    return {
      kind: "failed",
      code: `HTTP_${status}`,
      retryable: status === 429 || status >= 500,
      httpStatus: status,
    };
  }
  return { kind: "failed", code: "FETCH_ERROR", retryable: true };
}
