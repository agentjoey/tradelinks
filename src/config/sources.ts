// Phase 1 (S1) source registry — 25 sources from docs/specs/sources.md
// adapter: rss | fetch | scrapling  (scrapling = Python service, ADR-002)
// JSON-API sources (Reddit, Federal Register, Google Trends) are noted and
// wired in via dedicated handlers in later tasks; RSS path is the Sprint-001
// fully-working path.

import type { FetchParseConfig } from "../adapters/types.js";

export type Region =
  | "north_america"
  | "europe"
  | "southeast_asia"
  | "middle_east"
  | "latin_america"
  | "australia_nz";

export type Category =
  | "regulatory"
  | "platform_policy"
  | "logistics"
  | "trend"
  | "industry"
  | "tip";

export interface SourceConfig {
  id: string;
  name: string;
  url: string;
  adapter: "rss" | "fetch" | "scrapling";
  /** when adapter=scrapling */
  scrapeMode?: "stealth" | "trends";
  /** JSON-API marker: handled by JsonAdapter (Reddit/FederalRegister) — follow-up */
  json?: boolean;
  frequencyCron: string;
  language: string;
  regions: Region[];
  platforms: string[];
  categoryHint?: Category;
  fetchConfig?: FetchParseConfig;
  note?: string;
}

export const SOURCES: SourceConfig[] = [
  // ---- B. Regulatory (RSS / API) ----
  {
    id: "B01",
    name: "USTR Press Releases",
    url: "https://ustr.gov/news-releases/feed",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: [],
    categoryHint: "regulatory",
  },
  {
    id: "B02",
    name: "US CBP Trade Blog",
    url: "https://www.cbp.gov/rss.xml",
    adapter: "rss",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: [],
    categoryHint: "regulatory",
  },
  {
    id: "B03",
    name: "US Federal Register (Trade)",
    url: "https://www.federalregister.gov/api/v1/documents.json?fields[]=title&fields[]=publication_date&fields[]=abstract&fields[]=html_url&per_page=20&order=newest&conditions[topics][]=Trade",
    adapter: "fetch",
    json: true,
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: [],
    categoryHint: "regulatory",
    note: "JSON API — JsonAdapter follow-up",
  },
  {
    id: "B04",
    name: "EU Official Journal",
    url: "https://eur-lex.europa.eu/rss/rss.xml",
    adapter: "rss",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["europe"],
    platforms: [],
    categoryHint: "regulatory",
  },
  {
    id: "B05",
    name: "EUR-Lex GPSR/REACH",
    url: "https://eur-lex.europa.eu/rss/rss.xml",
    adapter: "rss",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["europe"],
    platforms: [],
    categoryHint: "regulatory",
    note: "filter by GPSR/REACH keyword downstream",
  },
  {
    id: "B06",
    name: "UK Gov customs/VAT",
    url: "https://www.gov.uk/search/policy-papers-and-consultations.atom?keywords=customs+vat",
    adapter: "rss",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["europe"],
    platforms: [],
    categoryHint: "regulatory",
  },
  {
    id: "B07",
    name: "German LUCID Packaging Register",
    url: "https://www.verpackungsregister.org/en/news",
    adapter: "fetch",
    frequencyCron: "0 6 */3 * *",
    language: "en",
    regions: ["europe"],
    platforms: [],
    categoryHint: "regulatory",
    fetchConfig: {
      itemSelector: "article, .news-item, .teaser",
      titleSelector: "h2, h3, .title",
      expectedSelectors: ["news", "LUCID", "packaging"],
    },
  },
  {
    id: "B16",
    name: "ACCC Product Safety",
    url: "https://www.productsafety.gov.au/news.rss",
    adapter: "rss",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["australia_nz"],
    platforms: [],
    categoryHint: "regulatory",
  },

  // ---- D. Trends ----
  {
    id: "D01",
    name: "Google Trends",
    url: "https://trends.google.com/trends/",
    adapter: "scrapling",
    scrapeMode: "trends",
    frequencyCron: "0 2 * * *",
    language: "en",
    regions: ["north_america", "europe", "southeast_asia", "middle_east", "latin_america", "australia_nz"],
    platforms: [],
    categoryHint: "trend",
    note: "pytrends in Python service (T6)",
  },
  {
    id: "D02",
    name: "Amazon Best Sellers US",
    url: "https://www.amazon.com/gp/bestsellers/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "trend",
  },
  {
    id: "D03",
    name: "Amazon Movers & Shakers US",
    url: "https://www.amazon.com/gp/movers-and-shakers/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "trend",
  },
  {
    id: "D07",
    name: "TikTok Creative Center",
    url: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america", "europe", "southeast_asia", "middle_east"],
    platforms: ["tiktok-shop"],
    categoryHint: "trend",
  },
  {
    id: "D11",
    name: "Reddit r/FulfillmentByAmazon",
    url: "https://www.reddit.com/r/FulfillmentByAmazon.json",
    adapter: "fetch",
    json: true,
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "industry",
    note: "JSON API — JsonAdapter follow-up",
  },
  {
    id: "D12",
    name: "Reddit r/AmazonSeller",
    url: "https://www.reddit.com/r/AmazonSeller.json",
    adapter: "fetch",
    json: true,
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "industry",
    note: "JSON API — JsonAdapter follow-up",
  },

  // ---- F. Media (RSS) ----
  {
    id: "F01",
    name: "Marketplace Pulse",
    url: "https://www.marketplacepulse.com/articles",
    adapter: "fetch",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: ["amazon"],
    categoryHint: "industry",
    note: "no public RSS (verified 2026-06-03, all /feed paths 404) → fetch articles page; selectors need live verification",
    fetchConfig: {
      itemSelector: "article, .article, a[href*='/articles/']",
      titleSelector: "h2, h3, .title",
      expectedSelectors: ["article", "Marketplace Pulse"],
    },
  },
  {
    id: "F02",
    name: "Modern Retail",
    url: "https://www.modernretail.co/feed/",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: [],
    categoryHint: "industry",
  },
  {
    id: "F03",
    name: "Retail Dive",
    url: "https://www.retaildive.com/feeds/news/",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: [],
    categoryHint: "industry",
  },
  {
    id: "F04",
    name: "Tamebay",
    url: "https://tamebay.com/feed",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["europe"],
    platforms: ["ebay", "amazon"],
    categoryHint: "platform_policy",
  },
  {
    id: "F05",
    name: "Momentum Works",
    url: "https://momentumworks.co/blog/feed/",
    adapter: "rss",
    frequencyCron: "0 8 * * *",
    language: "en",
    regions: ["southeast_asia"],
    platforms: ["shopee", "lazada", "tiktok-shop"],
    categoryHint: "industry",
  },
  {
    id: "F09",
    name: "雨果跨境 CIFNews",
    url: "https://www.cifnews.com/rss.xml",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "zh",
    regions: ["north_america", "europe", "southeast_asia"],
    platforms: ["amazon", "temu", "shein"],
    categoryHint: "industry",
  },
  {
    id: "F10",
    name: "亿邦动力 Ebrun",
    url: "https://www.ebrun.com/rss",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "zh",
    regions: ["north_america", "europe", "southeast_asia"],
    platforms: ["temu", "shein"],
    categoryHint: "industry",
  },

  // ---- A. Platform Policy ----
  {
    id: "A01",
    name: "eBay Seller Updates",
    url: "https://www.ebay.com/sellercenter/resources/news",
    adapter: "fetch",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["north_america", "europe", "australia_nz"],
    platforms: ["ebay"],
    categoryHint: "platform_policy",
    fetchConfig: {
      itemSelector: "article, .news-card, .card",
      titleSelector: "h2, h3, .title",
      expectedSelectors: ["seller", "news"],
    },
  },
  {
    id: "A02",
    name: "Shopify Changelog",
    url: "https://changelog.shopify.com/feed.xml",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: ["shopify"],
    categoryHint: "platform_policy",
  },
  {
    id: "A03",
    name: "TikTok Shop US Newsroom",
    url: "https://newsroom.tiktok.com/en-us/",
    adapter: "fetch",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["tiktok-shop"],
    categoryHint: "platform_policy",
    fetchConfig: {
      itemSelector: "article, .article-card, a[href*='/en-us/']",
      titleSelector: "h2, h3, .headline",
      expectedSelectors: ["tiktok", "newsroom"],
    },
  },
];

export const SOURCES_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
