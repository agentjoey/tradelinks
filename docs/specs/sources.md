# TradeLinks — Information Sources (Live Registry)

> Last updated: 2026-06-05 · Source of truth: `src/config/sources.ts` (this doc mirrors it).
> **25 active · 16 disabled/backlog.** Region codes: NA / EU / SEA / ME / LATAM / ANZ.

The crawler is polyglot (ADR-002): `rss`/`fetch` run in the Node worker; `scrapling`
sources route to the Python StealthyFetcher service. `categoryHint` is a hint — the
AI assigns the final category. **Amazon best-seller (BSR) sources bypass AI** and feed
the Trend Radar's Bestsellers board directly (see "Bestseller fork" below).

## Active sources (25)

### B — Regulatory (5) · throttled to 12h (was 4–6h) to rebalance the Wire
| ID | Name | Adapter | Freq | Region |
|----|------|---------|------|--------|
| B01 | USTR Press Releases | rss | 12h | NA |
| B02 | US CBP Trade Blog | rss | 12h | NA |
| B03 | US Federal Register (Trade/Tariff) | fetch+json | 12h | NA |
| B06 | UK Gov customs/VAT | rss | 12h | EU |
| B16 | ACCC Product Safety Recalls | rss | 12h | ANZ |

### A — Platform Policy (4)
| ID | Name | Adapter | Freq | Region | Notes |
|----|------|---------|------|--------|-------|
| A01 | eBay Seller Updates | fetch | daily | NA/EU/ANZ | items are `/seller-updates/<period>` anchors (selector fixed 2026-06-05); quarterly/low-volume |
| A02 | Shopify Changelog | rss | 4h | NA/EU | reliable official RSS |
| A04 | TikTok Shop (news) | rss | 8h | NA/EU/SEA | **Google News RSS** aggregator — fills the TikTok Shop gap (seller center is auth-walled) |
| F04 | Tamebay (ChannelX) | rss | 4h | EU | eBay/Amazon EU; categorised platform_policy |

### E — Logistics (2) · added 2026-06-05 (category was empty before)
| ID | Name | Adapter | Freq | Region |
|----|------|---------|------|--------|
| E01 | Supply Chain Dive | rss | 6h | global |
| E02 | FreightWaves | rss | 6h | NA/EU |

### F — Media / Industry (4)
| ID | Name | Adapter | Freq | Region | Notes |
|----|------|---------|------|--------|-------|
| F01 | Marketplace Pulse | fetch | 12h | NA/EU | items are `/articles/` anchors (selector fixed 2026-06-05; SSR ok) |
| F02 | Modern Retail | rss | 4h | NA/EU | |
| F03 | Retail Dive | rss | 4h | NA | |
| F11 | EcommerceBytes | rss | 6h | NA/EU | Amazon/eBay/Etsy **seller-policy** news — main platform_policy fix |
| F12 | Practical Ecommerce | rss | 8h | NA/EU | strategy/tools |

### D — Trend / Amazon Best Sellers (10, BSR) · Radar-only, bypass AI · 12h, minutes staggered
| ID | Name | Region | Cron (min) |
|----|------|--------|-----------|
| D02 | Amazon Best Sellers US (Electronics) | NA | :00 */12 |
| D04 | Amazon Best Sellers UK (Electronics) | EU | :16 */12 |
| D05 | Amazon Best Sellers UAE (Electronics) | ME | :24 */12 |
| D06 | Amazon Best Sellers AU (Electronics) | ANZ | :32 */12 |
| D30 | Amazon Best Sellers US (Home & Garden) | NA | :40 */12 |
| D31 | Amazon Best Sellers US (Kitchen) | NA | :48 */12 |
| D32 | Amazon Best Sellers US (Toys & Games) | NA | :56 */12 |
| D33 | Amazon Best Sellers US (Beauty) | NA | :04 */12 |
| D34 | Amazon Best Sellers US (Sports & Outdoors) | NA | :12 */12 |

Selectors (verified): item `#gridItemRoot` · title `div[class*=line-clamp]` · link `a.a-link-normal[href*=/dp/]` · rank `.zg-bdg-text`.

## Disabled / backlog (16)

| ID | Name | Why disabled |
|----|------|--------------|
| D01 | Google Trends | handled by the dedicated **trends-tick** worker (writes `trend_snapshots`), not the crawl scheduler |
| D03 | Amazon Movers & Shakers US | **2026-06-05:** page loads but grid never renders in headless (`#gridItemRoot`=0; scroll doesn't help) — bot-gated/gridless; overlaps D02 |
| A03 | TikTok Shop US Newsroom | **2026-06-05:** newsroom.tiktok.com is consumer PR (#BookTok), not seller policy → replaced by A04 |
| B04/B05 | EU Official Journal / EUR-Lex GPSR | EUR-Lex `rss.xml` 404 — need a stable EU feed |
| B07 | German LUCID Packaging | `/en/news` 404 — correct path TBD |
| D07 | TikTok Creative Center | gated: public web is empty SEO shell; `creative_radar_api` needs signed token |
| D11/D12 | Reddit FBA / AmazonSeller | Reddit `.json` 403 to datacenter IPs — needs OAuth/proxy |
| F05 | Momentum Works | feed blocked (likely Cloudflare → scrapling) |
| F09/F10 | CIFNews / Ebrun (中文) | RSS bot-blocked (403/405) — route via scrapling in Phase 2 |
| D20 | Mercado Libre Más Vendidos (MX) | strongest LatAm source; SSR ~515KB, selectors TBD |
| D21/D23 | Temu / AliExpress Best Sellers | hard anti-bot (slider-captcha / x5sec) — needs paid API/residential proxy |
| D22 | Noon Best Sellers (UAE) | unreachable from env (geo/anti-bot); ME covered by D05 meanwhile |

## Wire content balance (why it was rebalanced — 2026-06-05)
Regulatory was **61%** of alerts (5 reliable RSS feeds), while platform was thin and
logistics had **no dedicated source**. Fixes: added E01/E02 (logistics), F11 + A04
(platform), F12 (industry); fixed the silent F01/A01 (wrong selectors → 0 items);
throttled regulatory 4–6h→12h. Result: regulatory **48%**, logistics 7%→12% (real
sources), platform 7%→13%, industry 14%→18%.

## Bestseller fork (爆品 → Radar, not Wire)
`BESTSELLER_SOURCE_IDS` (D02–D06, D30–D34) are stored as terminal `processed` items
tagged with region/platform/category and **not** enqueued for AI scoring — they power
`/trends`' Bestsellers board. This stops ~30 products/source flooding the Wire and
saves AI tokens.

## URL canonicalization (dedup, 2026-06-05)
Amazon `/dp/<ASIN>` URLs carry a per-crawl `/ref=…/<session-id>` suffix that defeated
url-dedup — every crawl re-stored the same ~30 products (one source had 2022 rows for
~30 products). `normalizeUrl()` now collapses any `amazon.<tld>` `/dp|/gp/product/<ASIN>`
to `https://<host>/dp/<ASIN>` (host kept so regional listings differ). One-off cleanup
collapsed 18,330 → 268 rows.

## Health & scraping notes
- Source health is tracked live at **`/admin/sources`** (see operations.md) — score
  0–100 with a 💀 Silent tier that catches "200 OK but 0 items" feeds (how F01/A01/D03
  were found).
- Scraper is **serialized** (one Chromium at a time) with `disable_resources` +
  `--disable-dev-shm-usage`; `solve_cloudflare` is off (our sources aren't CF-gated).
- Never scrape login-walled portals (Amazon SC, Temu/Shein seller) — use media proxies.
