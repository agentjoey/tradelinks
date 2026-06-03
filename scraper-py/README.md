# TradeLinks Scraper Service (Python)

Stateless HTTP scraper for anti-bot sources + Google Trends. Node's `scrape-queue`
worker calls this over HTTP (crawler-contract.md §4). **No queue knowledge here.**

- **Why Python:** Scrapling (StealthyFetcher + Cloudflare solve + self-healing
  selectors) and pytrends are best-in-class in Python (ADR-002).
- **Requires Python ≥ 3.10** (Scrapling). The repo's local Python is 3.9, so run
  this in Docker or a 3.10+ venv.

## Endpoints
| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/health` | — | `{"status":"ok"}` |
| POST | `/scrape` | `{sourceId, url, mode, selectors?, trendsKeywords?, geo?}` | `{items: RawItem[]}` |

`mode`: `stealth` (Scrapling StealthyFetcher) or `trends` (pytrends).

## Local run
```bash
python3.10 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
scrapling install            # fetch Chromium
uvicorn main:app --port 8000
curl localhost:8000/health
```

## Deploy (Railway)
Build from this dir's Dockerfile (Scrapling Chromium base image). Set the Node
worker's `SCRAPER_SERVICE_URL` to the deployed URL.

## Selector tuning workflow
Use `explore.py <url>` to reverse-engineer a source's DOM (probes common
container selectors, counts matches, dumps embedded JSON markers):
```bash
.venv/bin/python explore.py "https://www.amazon.com/gp/bestsellers/electronics/"
```
Then put the working selectors in `src/config/sources.ts` `scrapeSelectors`.

## Status (verified 2026-06-03)
- ✅ Service runs (py3.11 + scrapling[fetchers] 0.4.8 + Chromium); `/health` + `/scrape` OK.
- ✅ **Amazon Best Sellers (D02)**: 30 items/page with rank, via Node→Python bridge.
  Selectors: item `#gridItemRoot`, title `div[class*=line-clamp]`,
  link `a.a-link-normal[href*=/dp/]`, rank `.zg-bdg-text`.
- ⛔ **TikTok Creative Center (D07)**: gated — public web is an empty SEO shell;
  `creative_radar_api` returns `40101 no permission` (signed token required).
  Disabled in config; revisit via official API / 3rd-party in Phase 2.
