# TradeLinks — Information Sources Master List

> Version: 1.0 | Last updated: 2026-06-03
> Total: 58 sources | Phase 1 (S1): 25 sources | Phase 1.5 (S2): 33 additional sources

**Columns:** ID · Name · URL · Adapter · Frequency · Language · Region · Category · Notes

Legend — Adapter: `rss` `fetch` `playwright` `api`  
Legend — Frequency: `1h` `4h` `12h` `1d` `3d` `7d`  
Legend — Priority: `S1` = Sprint 001 (MVP core) · `S2` = Sprint 004 (Phase 1.5)

---

## A. Platform Policy Sources

| ID | Name | URL | Adapter | Freq | Lang | Region | Priority | Notes |
|----|------|-----|---------|------|------|--------|----------|-------|
| A01 | eBay Seller Updates | https://www.ebay.com/sellercenter/resources/news | fetch | 12h | EN | NA/EU/AU | S1 | Public page, stable structure |
| A02 | Shopify Changelog | https://changelog.shopify.com/feed.xml | rss | 4h | EN | Global | S1 | Official RSS, reliable |
| A03 | TikTok Shop US Newsroom | https://newsroom.tiktok.com/en-us/ | fetch | 4h | EN | NA | S1 | Filter by "shop" tag; no RSS |
| A04 | TikTok Shop SEA Seller Blog | https://seller.tiktok.com/university/home | playwright | 1d | EN/multilingual | SEA | S2 | JS-heavy, login-optional sections |
| A05 | Shopee Seller Centre Blog (SG) | https://seller.shopee.sg/edu/home | playwright | 1d | EN | SEA | S2 | Covers MY/TH/PH/ID policies too |
| A06 | Lazada Seller Centre Updates | https://sellercenter.lazada.com/seller/information/index | playwright | 1d | EN | SEA | S2 | Covers ID/TH/MY/PH/VN |
| A07 | Mercado Libre Noticias | https://vendedores.mercadolibre.com.ar/blog | rss | 1d | ES | LatAm | S2 | Primary LatAm platform blog |
| A08 | Walmart Marketplace Blog | https://marketplace.walmart.com/blog/ | fetch | 1d | EN | NA | S2 | Stable fetch, sporadic updates |
| A09 | Etsy Seller Handbook | https://www.etsy.com/seller-handbook | fetch | 3d | EN | NA/EU | S2 | Low frequency, policy-relevant |
| A10 | Amazon Seller News (via secondary) | — | — | — | EN | Global | — | **No direct scrape.** Captured via Marketplace Pulse (F01) + 雨果跨境 (F09). Do not scrape amazon.com/seller. |
| A11 | Noon Seller Centre | https://sell.noon.com/en/news | fetch | 3d | EN/AR | ME | S2 | UAE/KSA platform; EN available |
| A12 | Trade Me Seller Blog (NZ) | https://www.trademe.co.nz/c/seller-blog | fetch | 7d | EN | ANZ | S2 | Low frequency |

---

## B. Regulatory / Compliance Sources

| ID | Name | URL | Adapter | Freq | Lang | Region | Priority | Notes |
|----|------|-----|---------|------|------|--------|----------|-------|
| B01 | USTR Press Releases | https://ustr.gov/news-releases/feed | rss | 4h | EN | NA/Global | **S1** | Tariffs, de minimis, trade actions |
| B02 | US CBP Trade Blog | https://www.cbp.gov/rss.xml | rss | 12h | EN | NA | **S1** | Section 321 de minimis, customs |
| B03 | US Federal Register (Trade/Tariff) | https://www.federalregister.gov/api/v1/documents.json?fields[]=title&fields[]=publication_date&fields[]=abstract&fields[]=html_url&per_page=20&order=newest&conditions[topics][]=Trade | api | 6h | EN | NA | **S1** | Official API, JSON, free, no key |
| B04 | EU Official Journal (OJ) | https://eur-lex.europa.eu/oj/direct-access.html (OJ RSS) | rss | 12h | EN/multilingual | EU | **S1** | GPSR/VAT/EPR/EPD source of truth |
| B05 | EUR-Lex GPSR / REACH alerts | https://eur-lex.europa.eu/rss/rss.xml | rss | 12h | EN | EU | **S1** | Filter by GPSR keyword |
| B06 | UK Gov (HMRC / BEIS customs) | https://www.gov.uk/search/policy-papers-and-consultations.atom?keywords=customs+vat | rss | 12h | EN | EU (UK) | **S1** | UKCA, VAT, customs post-Brexit |
| B07 | German Verpackungsregister (LUCID) | https://www.verpackungsregister.org/en/news | fetch | 7d | EN/DE | EU | **S1** | Packaging law compliance |
| B08 | SASO (Saudi Standards) | https://www.saso.gov.sa/en/news | fetch | 7d | EN/AR | ME | S2 | SABER certification, halal labeling |
| B09 | UAE ESMA Standards | https://www.esma.gov.ae/en-us/News/Pages/News.aspx | fetch | 7d | EN/AR | ME | S2 | Emirates conformity, product safety |
| B10 | Indonesia Kemendag (MoCI) | https://jdih.kemendag.go.id/ | playwright | 7d | ID | SEA | S2 | Import permit (NPWP), local content reqs. Use Qwen-Plus for ID→EN |
| B11 | Malaysia Royal Customs (RMCD) | https://www.customs.gov.my/en/CP/Pages/CP_LVG.aspx | fetch | 7d | EN/MY | SEA | S2 | LVG tax (low-value goods) |
| B12 | Singapore IRAS (GST on LVG) | https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-and-digital-economy/local-businesses/overseas-vendor-registration | fetch | 30d | EN | SEA | S2 | Slow-changing, quarterly check |
| B13 | Thailand Revenue Department | https://www.rd.go.th/english/ | fetch | 30d | EN/TH | SEA | S2 | VAT on imports, quarterly |
| B14 | Brazil Receita Federal | https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/noticias | rss | 3d | PT | LatAm | S2 | Remessa Conforme. Use DeepSeek PT→EN |
| B15 | Australia ATO (GST on imports) | https://www.ato.gov.au/api/... (news feed) | fetch | 30d | EN | ANZ | S2 | Low-value GST ($0 threshold) |
| B16 | ACCC (AU Product Safety) | https://www.productsafety.gov.au/news.rss | rss | 3d | EN | ANZ | **S1** | Mandatory safety standards, recalls |

---

## D. Trend / Product Sources

| ID | Name | URL | Adapter | Freq | Lang | Region | Priority | Notes |
|----|------|-----|---------|------|------|--------|----------|-------|
| D01 | Google Trends (pytrends) | via pytrends Python lib or SerpAPI | api | 1d | multilingual | Global (region filter) | **S1** | Unofficial but stable. Use keyword seeds per category. Rate-limit: 5 req/min |
| D02 | Amazon Best Sellers — US | https://www.amazon.com/gp/bestsellers/**electronics/** | scrapling | 4h | EN | NA | **S1** | ✅ verified 2026-06-03: 30 items/page. sel: item `#gridItemRoot`, title `div[class*=line-clamp]`, link `a.a-link-normal[href*=/dp/]`, rank `.zg-bdg-text`. Root URL redirects → use category landing. |
| D03 | Amazon Movers & Shakers — US | https://www.amazon.com/gp/movers-and-shakers/**electronics/** | scrapling | 4h | EN | NA | **S1** | Same selectors as D02 (rank velocity = early signal) |
| D04 | Amazon Best Sellers — UK | https://www.amazon.co.uk/gp/bestsellers/ | playwright | 4h | EN | EU | S2 | Cross-region diffusion comparison |
| D05 | Amazon Best Sellers — DE | https://www.amazon.de/gp/bestsellers/ | playwright | 4h | DE | EU | S2 | Top EU market |
| D06 | Amazon Best Sellers — AU | https://www.amazon.com.au/gp/bestsellers/ | playwright | 1d | EN | ANZ | S2 | |
| D07 | TikTok Creative Center | https://ads.tiktok.com/business/creativecenter/... | scrapling | — | EN | Global | ⛔ **GATED** | verified 2026-06-03: public web → empty SEO shell; `creative_radar_api` → `40101 no permission` (needs signed token). Disabled in config (`enabled:false`). Revisit via official API / 3rd-party (Phase 2). |
| D08 | Shopee Trending (SG) | https://shopee.sg/search?sortBy=pop | playwright | 1d | EN | SEA | S2 | Public search sort by popularity |
| D09 | Lazada Top Products (MY) | https://www.lazada.com.my/catalog/ | playwright | 1d | EN | SEA | S2 | |
| D10 | Mercado Libre Tendencias (BR) | https://www.mercadolibre.com.br/tendencias/ | playwright | 1d | PT | LatAm | S2 | Official trends page |
| D11 | Reddit r/FulfillmentByAmazon | https://www.reddit.com/r/FulfillmentByAmazon.json | api | 4h | EN | NA | **S1** | Official Reddit JSON API (no auth needed for read). Alert signal + Amazon policy second-hand |
| D12 | Reddit r/AmazonSeller | https://www.reddit.com/r/AmazonSeller.json | api | 4h | EN | NA | **S1** | Same pattern |
| D13 | Reddit r/ecommerce | https://www.reddit.com/r/ecommerce.json | api | 4h | EN | Global | S2 | General signal |

---

## E. Logistics Sources

| ID | Name | URL | Adapter | Freq | Lang | Region | Priority | Notes |
|----|------|-----|---------|------|------|--------|----------|-------|
| E01 | Freightos Baltic Exchange (FBX) | https://terminal.freightos.com/freightos-baltic-exchange-fbx/ | playwright | 1d | EN | Global | S2 | Weekly rate publication. Asia→NA, Asia→EU, Asia→LatAm lanes. Scrape the index table. |
| E02 | Drewry World Container Index | https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry | fetch | 7d | EN | Global | S2 | Thursday weekly publication |
| E03 | Lloyd's List Free News | https://lloydslist.maritimeintelligence.informa.com/rss | rss | 4h | EN | Global | S2 | Maritime disruption events (Suez/Panama/port strikes). Free tier articles only. |
| E04 | Port of LA/LB Stats | https://www.portoflosangeles.org/business/statistics | fetch | 30d | EN | NA | S2 | Monthly volume, congestion signal |

---

## F. Media / Analysis Sources

| ID | Name | URL | Adapter | Freq | Lang | Region | Priority | Notes |
|----|------|-----|---------|------|------|--------|----------|-------|
| F01 | Marketplace Pulse | https://www.marketplacepulse.com/feed | rss | 4h | EN | Global | **S1** | Best Amazon/global ecom analysis. Key Amazon SC proxy. |
| F02 | Modern Retail | https://www.modernretail.co/feed/ | rss | 4h | EN | NA/EU | **S1** | Retail + ecom strategy |
| F03 | Retail Dive | https://www.retaildive.com/feeds/news/ | rss | 4h | EN | NA | **S1** | Broad retail news |
| F04 | Tamebay | https://tamebay.com/feed | rss | 4h | EN | EU (UK) | **S1** | UK/EU marketplace specialists, eBay/Amazon EU |
| F05 | Momentum Works (SEA) | https://momentumworks.co/blog/feed/ | rss | 1d | EN | SEA | **S1** | Best SEA ecom research. TikTok Shop, Shopee, Lazada deep-dives |
| F06 | Tech in Asia | https://www.techinasia.com/feed | rss | 4h | EN | SEA/Global | S2 | SEA startup + ecom |
| F07 | e27 | https://e27.co/feed/ | rss | 4h | EN | SEA | S2 | SEA ecosystem |
| F08 | Arabian Business (Retail) | https://www.arabianbusiness.com/rss | rss | 4h | EN | ME | S2 | GCC retail + ecom |
| F09 | 雨果跨境 | https://www.cifnews.com/rss.xml | rss | 4h | ZH | Global (CN sourcing) | **S1** | Best Chinese cross-border media. Amazon SC changes leak here first. |
| F10 | 亿邦动力 | https://www.ebrun.com/rss | rss | 4h | ZH | Global (CN) | **S1** | Temu/Shein/SHEIN changes often reported |
| F11 | 36氪出海 | https://36kr.com/feed | rss | 4h | ZH | Global (CN) | S2 | Chinese brands going overseas |
| F12 | Inside Retail Australia | https://insideretail.com.au/feed/ | rss | 4h | EN | ANZ | S2 | AU/NZ retail |
| F13 | Power Retail (AU) | https://powerretail.com.au/feed/ | rss | 4h | EN | ANZ | S2 | AU ecom specialist |
| F14 | LABS LatAm | https://labsnews.com/en/feed/ | rss | 1d | EN/PT/ES | LatAm | S2 | LatAm digital economy |
| F15 | ecommerceBytes | https://www.ecommercebytes.com/feed/ | rss | 1d | EN | NA | S2 | eBay/Etsy/Amazon seller community |

---

## Phase Summary

| Phase | Sprint | Sources | Source IDs |
|-------|--------|---------|-----------|
| **S1 — Phase 1 Core (25 sources)** | 001 | B01 B02 B03 B04 B05 B06 B07 B16 · D01 D02 D03 D07 D11 D12 · F01 F02 F03 F04 F05 F09 F10 · A01 A02 A03 | 23 core + 2 flex |
| **S2 — Phase 1.5 Expansion (35 sources)** | 004 | All remaining A/B/D/E/F | Full global coverage |

## Scraping Notes

**Rate limit guidance per adapter:**
- `playwright`: rotate UA, 3-5s delay between pages, max 2 concurrent browsers
- Reddit JSON API: 60 req/min, no auth needed, use `after` cursor for pagination
- Federal Register API: free, no key, 1000 req/day
- Google Trends (pytrends): max 5 req/min, use exponential backoff on 429

**Sources NOT to scrape directly:**
- Amazon Seller Central (login wall + ToS) → use F01/F09/F10 proxy
- Temu Seller Dashboard → use F10/F11 proxy
- Shein Seller Portal → use F10/F11 proxy
- Any source behind a paid wall (Helium10, Jungle Scout, Drewry full data) → free headlines only

**Language processing routing:**
- ZH → DeepSeek V3.2 (native ZH support, cheap)
- PT/ES → DeepSeek V3.2 (good quality)
- AR/ID/TH → Qwen-Plus (better multilingual support for these languages)
- All others default to DeepSeek V3.2
