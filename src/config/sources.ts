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
  /** JSON-API marker: handled by JsonAdapter (Reddit/FederalRegister) */
  json?: boolean;
  /** which JSON shape the JsonAdapter should parse */
  jsonShape?: "federal_register" | "reddit";
  frequencyCron: string;
  language: string;
  regions: Region[];
  platforms: string[];
  categoryHint?: Category;
  fetchConfig?: FetchParseConfig;
  /** when adapter=scrapling stealth: CSS selectors passed to the Python service */
  scrapeSelectors?: { item: string; title: string; link?: string; rank?: string };
  /** false = skip in scheduler (e.g. source gated/unavailable) */
  enabled?: boolean;
  note?: string;
}

export const SOURCES: SourceConfig[] = [
  // ---- B. Regulatory (RSS / API) ----
  {
    id: "B01",
    name: "USTR Press Releases",
    url: "https://ustr.gov/rss.xml",
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
    name: "US Federal Register (Trade/Tariff)",
    // term search (topics=Trade returns 400; verified 2026-06-04)
    url: "https://www.federalregister.gov/api/v1/documents.json?fields[]=title&fields[]=publication_date&fields[]=abstract&fields[]=html_url&per_page=20&order=newest&conditions[term]=import+tariff+antidumping",
    adapter: "fetch",
    json: true,
    jsonShape: "federal_register",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: [],
    categoryHint: "regulatory",
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
    enabled: false,
    note: "rss.xml 404 (verified 2026-06-04); EUR-Lex stable feed TBD — revisit",
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
    enabled: false,
    note: "same dead EUR-Lex feed as B04 (404); revisit",
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
    enabled: false,
    note: "/en/news 404 (verified 2026-06-04); correct path TBD — revisit",
    fetchConfig: {
      itemSelector: "article, .news-item, .teaser",
      titleSelector: "h2, h3, .title",
      expectedSelectors: ["news", "LUCID", "packaging"],
    },
  },
  {
    id: "B16",
    name: "ACCC Product Safety Recalls",
    url: "https://www.productsafety.gov.au/rss/recalls.xml",
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
    name: "Amazon Best Sellers US (Electronics)",
    // category landing under /gp/bestsellers/<cat>/ serves the grid; root redirects
    url: "https://www.amazon.com/gp/bestsellers/electronics/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "trend",
    // verified selectors 2026-06-03 (30 items/page)
    scrapeSelectors: {
      item: "#gridItemRoot",
      title: "div[class*='line-clamp']",
      link: "a.a-link-normal[href*='/dp/']",
      rank: ".zg-bdg-text",
    },
  },
  {
    id: "D03",
    name: "Amazon Movers & Shakers US (Electronics)",
    url: "https://www.amazon.com/gp/movers-and-shakers/electronics/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "trend",
    scrapeSelectors: {
      item: "#gridItemRoot",
      title: "div[class*='line-clamp']",
      link: "a.a-link-normal[href*='/dp/']",
      rank: ".zg-bdg-text",
    },
  },
  // Amazon Best Sellers by region — hot-product signal (selectors verified
  // 2026-06-04 on .com/.co.uk/.ae/.com.au; .de/.mx/.br need cookie-wall work)
  {
    id: "D04",
    name: "Amazon Best Sellers UK (Electronics)",
    url: "https://www.amazon.co.uk/gp/bestsellers/electronics/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["europe"],
    platforms: ["amazon"],
    categoryHint: "trend",
    scrapeSelectors: { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text" },
  },
  {
    id: "D05",
    name: "Amazon Best Sellers UAE (Electronics)",
    url: "https://www.amazon.ae/gp/bestsellers/electronics/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["middle_east"],
    platforms: ["amazon"],
    categoryHint: "trend",
    scrapeSelectors: { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text" },
  },
  {
    id: "D06",
    name: "Amazon Best Sellers AU (Electronics)",
    url: "https://www.amazon.com.au/gp/bestsellers/electronics/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["australia_nz"],
    platforms: ["amazon"],
    categoryHint: "trend",
    scrapeSelectors: { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text" },
  },
  // Amazon US best-seller categories — broaden hot-product coverage
  // (slugs verified 2026-06-04, 30 items each; staggered to be polite to Amazon)
  ...(
    [
      ["D30", "Home & Garden", "home-garden", 5],
      ["D31", "Kitchen", "kitchen", 15],
      ["D32", "Toys & Games", "toys-and-games", 25],
      ["D33", "Beauty", "beauty", 35],
      ["D34", "Sports & Outdoors", "sporting-goods", 45],
    ] as const
  ).map(([id, label, slug, min]) => ({
    id,
    name: `Amazon Best Sellers US (${label})`,
    url: `https://www.amazon.com/gp/bestsellers/${slug}/`,
    adapter: "scrapling" as const,
    scrapeMode: "stealth" as const,
    frequencyCron: `${min} */6 * * *`,
    language: "en",
    regions: ["north_america"] as Region[],
    platforms: ["amazon"],
    categoryHint: "trend" as Category,
    scrapeSelectors: { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text" },
  })),
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
    enabled: false,
    note: "GATED (verified 2026-06-03): public web redirects to empty SEO shell; creative_radar_api returns 40101 no-permission (needs signed token). Revisit via official API / 3rd-party data in Phase 2.",
  },
  {
    id: "D11",
    name: "Reddit r/FulfillmentByAmazon",
    url: "https://www.reddit.com/r/FulfillmentByAmazon.json",
    adapter: "fetch",
    json: true,
    jsonShape: "reddit",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "industry",
    enabled: false,
    note: "Reddit .json returns 403 to datacenter IPs/UAs (verified 2026-06-04); needs OAuth or proxy — JsonAdapter ready, re-enable when reachable",
  },
  {
    id: "D12",
    name: "Reddit r/AmazonSeller",
    url: "https://www.reddit.com/r/AmazonSeller.json",
    adapter: "fetch",
    json: true,
    jsonShape: "reddit",
    frequencyCron: "0 */4 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["amazon"],
    categoryHint: "industry",
    enabled: false,
    note: "same Reddit 403 as D11; JsonAdapter ready, re-enable when reachable",
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
    enabled: false,
    note: "feed connection fails/blocked (verified 2026-06-04); revisit (likely Cloudflare → scrapling)",
  },
  {
    id: "F09",
    name: "雨果跨境 CIFNews",
    url: "https://www.cifnews.com/xmlconfig/YuGuo.xml",
    adapter: "rss",
    frequencyCron: "0 */4 * * *",
    language: "zh",
    regions: ["north_america", "europe", "southeast_asia"],
    platforms: ["amazon", "temu", "shein"],
    categoryHint: "industry",
    enabled: false,
    note: "feed bot-blocked (405 to plain fetch, verified 2026-06-04); route via scrapling stealth in Phase 2",
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
    enabled: false,
    note: "rss 403 bot-blocked (verified 2026-06-04); route via scrapling stealth in Phase 2",
  },

  // ---- A. Platform Policy ----
  {
    id: "A01",
    name: "eBay Seller Updates",
    url: "https://www.ebay.com/sellercenter/resources/seller-updates",
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

  // ---- Platform hot-product backlog (assessed 2026-06-04; need per-source
  //      DOM/JSON reverse-engineering via scrapling — Phase 2) ----
  {
    id: "D20",
    name: "Mercado Libre — Más Vendidos (MX)",
    url: "https://www.mercadolibre.com.mx/mas-vendidos",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */12 * * *",
    language: "es",
    regions: ["latin_america"],
    platforms: ["mercado-libre"],
    categoryHint: "trend",
    enabled: false,
    note: "SSR page ~515KB; strongest LatAm hot-product source. Selectors TBD (reverse-engineer DOM like Amazon BSR).",
  },
  {
    id: "D21",
    name: "Temu — Best Sellers",
    url: "https://www.temu.com/best-sellers.html",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: ["temu"],
    categoryHint: "trend",
    enabled: false,
    note: "BLOCKED (verified 2026-06-04): scrapling → bgn_verification slider-captcha page, no product data. Needs captcha-solving + residential proxy or paid API (Bright Data/Apify). Phase 2.",
  },
  {
    id: "D23",
    name: "AliExpress — Best Selling",
    url: "https://www.aliexpress.com/category/best-selling.html",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["north_america", "europe", "southeast_asia"],
    platforms: ["aliexpress"],
    categoryHint: "trend",
    enabled: false,
    note: "BLOCKED (verified 2026-06-04): Alibaba x5sec anti-bot 'punish' page (captcha). Needs paid API/residential proxy. Phase 2.",
  },
  {
    id: "D22",
    name: "Noon — Best Sellers (UAE)",
    url: "https://www.noon.com/uae-en/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["middle_east"],
    platforms: ["noon"],
    categoryHint: "trend",
    enabled: false,
    note: "unreachable from current env (conn 000 — geo/anti-bot). ME hot products currently covered by Amazon.ae (D05). Revisit with regional proxy.",
  },
];

export const SOURCES_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
