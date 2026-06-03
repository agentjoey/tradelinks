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

## Status (Sprint 001 T6)
Skeleton: FastAPI + stealth/trends scrapers wired to Scrapling/pytrends.
**Not yet run end-to-end** (needs 3.10+ env + Chromium). Per-source selector
tuning (TikTok CC / Amazon BSR / Shopee) is iterative — next step.
