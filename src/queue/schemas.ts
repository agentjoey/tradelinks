import { z } from "zod";

// See docs/specs/crawler-contract.md §2

export const RawItemSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  // nullish: producers (incl. the Python service via Pydantic) may send null
  publishedAt: z.string().datetime().nullish(),
  rawContent: z.unknown().nullish(),
  lang: z.string().nullish(),
});
export type RawItem = z.infer<typeof RawItemSchema>;

export const CrawlJobSchema = z.object({
  sourceId: z.string(),
  url: z.string().url(),
  adapter: z.enum(["rss", "fetch", "scrapling"]),
  attempt: z.number().int().nonnegative().optional(),
});
export type CrawlJob = z.infer<typeof CrawlJobSchema>;

export const ScrapeJobSchema = z.object({
  sourceId: z.string(),
  url: z.string().url(),
  mode: z.enum(["stealth", "trends"]),
  selectors: z.record(z.string()).optional(),
  trendsKeywords: z.array(z.string()).optional(),
  geo: z.string().optional(),
});
export type ScrapeJob = z.infer<typeof ScrapeJobSchema>;

export const IngestJobSchema = z.object({
  sourceId: z.string(),
  items: z.array(RawItemSchema),
});
export type IngestJob = z.infer<typeof IngestJobSchema>;

/** Response shape from the Python scraper service POST /scrape. */
export const ScrapeResponseSchema = z.object({
  items: z.array(RawItemSchema),
});
export type ScrapeResponse = z.infer<typeof ScrapeResponseSchema>;
