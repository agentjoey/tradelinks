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
    // throttled 4h→12h: regulatory feeds were ~61% of the Wire; slow them to
    // rebalance against platform/logistics/industry (still same-day coverage).
    frequencyCron: "0 */12 * * *",
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
    frequencyCron: "0 */12 * * *",
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
    frequencyCron: "0 */12 * * *",
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
    enabled: false,
    note: "pytrends handled by the dedicated trends-tick worker (writes trend_snapshots directly); disabled in the crawl scheduler to avoid double-handling + Wire noise",
  },
  {
    id: "D02",
    name: "Amazon Best Sellers US (Electronics)",
    // category landing under /gp/bestsellers/<cat>/ serves the grid; root redirects
    url: "https://www.amazon.com/gp/bestsellers/electronics/",
    adapter: "scrapling",
    scrapeMode: "stealth",
    // bestseller lists change slowly → 12h cadence; minutes staggered across
    // D02–D34 so the 10 Amazon crawls never burst the (serialized) scraper.
    frequencyCron: "0 */12 * * *",
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
    enabled: false,
    note: "DISABLED 2026-06-05: page loads (correct title) but the product grid is NOT in the headless DOM (#gridItemRoot=0 vs 30 on bestsellers; scrolling doesn't reveal it) — Amazon serves Movers&Shakers a gridless/bot-gated render. Overlaps D02 (Electronics bestsellers). Revisit in Phase 2 with a non-headless/interaction approach if 'fastest risers' is wanted.",
    frequencyCron: "8 */12 * * *",
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
    frequencyCron: "16 */12 * * *",
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
    frequencyCron: "24 */12 * * *",
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
    frequencyCron: "32 */12 * * *",
    language: "en",
    regions: ["australia_nz"],
    platforms: ["amazon"],
    categoryHint: "trend",
    scrapeSelectors: { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text" },
  },
  // Amazon US best-seller categories — broaden hot-product coverage
  // (slugs verified 2026-06-04, 30 items each). 12h cadence, minutes staggered
  // after D02–D06 (0/8/16/24/32) so the 10 Amazon crawls never collide.
  ...(
    [
      ["D30", "Home & Garden", "home-garden", 40],
      ["D31", "Kitchen", "kitchen", 48],
      ["D32", "Toys & Games", "toys-and-games", 56],
      ["D33", "Beauty", "beauty", 4],
      ["D34", "Sports & Outdoors", "sporting-goods", 12],
    ] as const
  ).map(([id, label, slug, min]) => ({
    id,
    name: `Amazon Best Sellers US (${label})`,
    url: `https://www.amazon.com/gp/bestsellers/${slug}/`,
    adapter: "scrapling" as const,
    scrapeMode: "stealth" as const,
    frequencyCron: `${min} */12 * * *`,
    language: "en",
    regions: ["north_america"] as Region[],
    platforms: ["amazon"],
    categoryHint: "trend" as Category,
    scrapeSelectors: { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text" },
  })),
  // Regional best-seller categories — broaden non-US coverage so the Radar isn't
  // NA-only. Slugs verified per-domain 2026-06-05 (only the ones that return 30
  // items; some slugs differ by locale). 12h, minutes staggered vs D02–D34.
  ...(
    [
      ["D40", "europe", "amazon.co.uk", "UK", "home-garden", "Home & Garden", 14],
      ["D41", "europe", "amazon.co.uk", "UK", "kitchen", "Kitchen", 20],
      ["D42", "europe", "amazon.co.uk", "UK", "beauty", "Beauty", 28],
      ["D50", "middle_east", "amazon.ae", "UAE", "kitchen", "Kitchen", 36],
      ["D51", "middle_east", "amazon.ae", "UAE", "beauty", "Beauty", 44],
      ["D60", "australia_nz", "amazon.com.au", "AU", "kitchen", "Kitchen", 52],
      ["D61", "australia_nz", "amazon.com.au", "AU", "beauty", "Beauty", 6],
      ["D62", "australia_nz", "amazon.com.au", "AU", "sporting-goods", "Sports & Outdoors", 10],
    ] as const
  ).map(([id, region, domain, loc, slug, label, min]) => ({
    id,
    name: `Amazon Best Sellers ${loc} (${label})`,
    url: `https://www.${domain}/gp/bestsellers/${slug}/`,
    adapter: "scrapling" as const,
    scrapeMode: "stealth" as const,
    frequencyCron: `${min} */12 * * *`,
    language: "en",
    regions: [region] as Region[],
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
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: ["amazon"],
    categoryHint: "industry",
    note: "SSR ok; items are /articles/ anchors (selectors fixed 2026-06-05 — was returning 0 because itemSelector matched no article/.card nodes). Marketplace analysis, low frequency.",
    fetchConfig: {
      itemSelector: "a[href*='/articles/']",
      titleSelector: "h2, h3, .title",
      expectedSelectors: ["Marketplace Pulse"],
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

  {
    id: "F11",
    name: "EcommerceBytes",
    url: "https://www.ecommercebytes.com/feed/",
    adapter: "rss",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: ["ebay", "amazon", "etsy"],
    categoryHint: "platform_policy",
    note: "verified 2026-06-05: valid RSS, frequent Amazon/eBay/Etsy SELLER-POLICY news (Prime Day, refunds, fee changes) — the main fix for thin platform_policy coverage.",
  },
  {
    id: "F12",
    name: "Practical Ecommerce",
    url: "https://www.practicalecommerce.com/feed",
    adapter: "rss",
    frequencyCron: "0 */8 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: [],
    categoryHint: "industry",
    note: "verified 2026-06-05: valid RSS, ecommerce strategy/tools/cross-border analysis.",
  },
  // Regional coverage via Google News RSS — reachable + aggregates many
  // publishers (the native SEA/ME/LatAm media feeds are bot-blocked/defunct).
  {
    id: "F13",
    name: "SE Asia marketplaces (news)",
    url: "https://news.google.com/rss/search?q=(Shopee+OR+Lazada+OR+%22TikTok+Shop%22)+(seller+OR+policy+OR+fees+OR+tax)&hl=en-SG&gl=SG&ceid=SG:en",
    adapter: "rss",
    frequencyCron: "10 */8 * * *",
    language: "en",
    regions: ["southeast_asia"],
    platforms: ["shopee", "lazada", "tiktok-shop"],
    categoryHint: "platform_policy",
    note: "verified 2026-06-05: Google News RSS — Shopee/Lazada/TikTok Shop seller-fee & policy news (VN/MY/SG). Fills empty SEA coverage (Tech in Asia/e27 are bot-blocked).",
  },
  {
    id: "F14",
    name: "Latin America trade (news)",
    url: "https://news.google.com/rss/search?q=(%22Mercado+Libre%22+OR+ecommerce+OR+cross-border)+(Brazil+OR+Mexico+OR+%22Latin+America%22)+(seller+OR+tax+OR+import)&hl=en-US&gl=US&ceid=US:en",
    adapter: "rss",
    frequencyCron: "20 */8 * * *",
    language: "en",
    regions: ["latin_america"],
    platforms: ["mercado-libre"],
    categoryHint: "regulatory",
    note: "verified 2026-06-05: Google News RSS — Brazil/Mexico import-tax & cross-border ecommerce regulation. Fills empty LatAm coverage (LABS feed defunct).",
  },
  {
    id: "F15",
    name: "Middle East commerce (news)",
    url: "https://news.google.com/rss/search?q=(noon+OR+%22Amazon.ae%22+OR+ecommerce)+(UAE+OR+Saudi+OR+%22Middle+East%22)+(seller+OR+VAT+OR+regulation+OR+marketplace)&hl=en-US&gl=US&ceid=US:en",
    adapter: "rss",
    frequencyCron: "30 */8 * * *",
    language: "en",
    regions: ["middle_east"],
    platforms: ["noon", "amazon"],
    categoryHint: "industry",
    note: "verified 2026-06-05: Google News RSS — Noon/Amazon.ae & MEA marketplace/VAT news. Broadens ME beyond Amazon.ae bestsellers.",
  },

  // ---- E. Logistics (RSS) ----
  {
    id: "E01",
    name: "Supply Chain Dive",
    url: "https://www.supplychaindive.com/feeds/news/",
    adapter: "rss",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["north_america", "europe", "southeast_asia", "middle_east", "latin_america", "australia_nz"],
    platforms: [],
    categoryHint: "logistics",
    note: "verified 2026-06-05: valid RSS, strong logistics/tariff/inventory coverage. Fills the previously-empty logistics category.",
  },
  {
    id: "E02",
    name: "FreightWaves",
    url: "https://www.freightwaves.com/news/feed",
    adapter: "rss",
    frequencyCron: "0 */6 * * *",
    language: "en",
    regions: ["north_america", "europe"],
    platforms: [],
    categoryHint: "logistics",
    note: "verified 2026-06-05: valid RSS, freight/customs/duty-enforcement news.",
  },

  // ---- A. Platform Policy ----
  {
    id: "A01",
    name: "eBay Seller Updates",
    url: "https://www.ebay.com/sellercenter/resources/seller-updates",
    adapter: "fetch",
    // quarterly official updates → once a day is plenty
    frequencyCron: "0 6 * * *",
    language: "en",
    regions: ["north_america", "europe", "australia_nz"],
    platforms: ["ebay"],
    categoryHint: "platform_policy",
    note: "items are dated /seller-updates/<period> anchors (selectors fixed 2026-06-05 — was 0 with article/.card). Low volume (quarterly); frequent eBay news comes from EcommerceBytes/Tamebay.",
    fetchConfig: {
      itemSelector: "a[href*='/seller-updates/20']",
      titleSelector: "h2, h3, .title",
      expectedSelectors: ["seller-updates"],
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
    frequencyCron: "0 */12 * * *",
    language: "en",
    regions: ["north_america"],
    platforms: ["tiktok-shop"],
    categoryHint: "platform_policy",
    enabled: false,
    note: "DISABLED 2026-06-05: newsroom.tiktok.com is consumer/brand PR (e.g. #BookTok reading lists), NOT TikTok Shop seller policy — wrong content for platform_policy. TODO: find a real TikTok Shop seller/policy channel (hard; likely seller-center or scrapling).",
    fetchConfig: {
      itemSelector: "article, .article-card, a[href*='/en-us/']",
      titleSelector: "h2, h3, .headline",
      expectedSelectors: ["tiktok", "newsroom"],
    },
  },
  {
    id: "A04",
    name: "TikTok Shop (news)",
    // Google News RSS aggregator — robust fill for the TikTok Shop gap; the
    // official seller center is auth-walled and newsroom.tiktok.com is consumer PR.
    url: "https://news.google.com/rss/search?q=%22TikTok+Shop%22+(seller+OR+policy+OR+commission+OR+fee)&hl=en-US&gl=US&ceid=US:en",
    adapter: "rss",
    frequencyCron: "0 */8 * * *",
    language: "en",
    regions: ["north_america", "europe", "southeast_asia"],
    platforms: ["tiktok-shop"],
    categoryHint: "platform_policy",
    note: "verified 2026-06-05: valid RSS, strong TikTok Shop seller/policy coverage (commission changes, shipping policy, seller reactions). Items are news.google.com redirect links.",
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

  // ---- X (Twitter) social signal ----
  {
    id: "X01",
    name: "Social — X viral",
    url: "https://api.x.com/2/tweets/search/recent",
    adapter: "fetch", // placeholder; the dedicated x-tick worker calls the X API
    frequencyCron: "0 3 * * *",
    language: "en",
    regions: [],
    platforms: ["x"],
    categoryHint: "trend",
    enabled: false,
    note: "X signal handled by the dedicated x-tick worker — two Radar-only tracks (viral products + cross-border e-commerce hot topics), discriminated by rawContent.kind. Writes X01 items directly; disabled in the crawl scheduler to avoid double-handling + Wire noise. Gated at runtime by X_ENABLED + X_BEARER_TOKEN; engagement floor = X_MIN_LIKES.",
  },
];

export const SOURCES_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

/** The single X (Twitter) viral-products source id (Radar-only, see workers/x.ts). */
export const X_SOURCE_ID = "X01";

/**
 * Amazon best-seller sources. These produce hot-PRODUCT rows (dozens per crawl),
 * not "event" news. We ingest them for the Trend Radar's Bestsellers board but
 * DON'T run them through AI scoring / alert generation — otherwise every product
 * floods the Wire as a low-value "trend" alert + burns AI tokens. See ingest.ts.
 */
export const BESTSELLER_SOURCE_IDS = new Set<string>([
  "D02", "D03", "D04", "D05", "D06", "D30", "D31", "D32", "D33", "D34",
  "D40", "D41", "D42", "D50", "D51", "D60", "D61", "D62",
]);

/** BL-042 Phase 1 验证范围：Beauty×4 区 + Toys US（仅这些源写 product_snapshots）。 */
export const VALIDATION_SOURCE_IDS = new Set(["D33", "D42", "D51", "D61", "D32"]);
