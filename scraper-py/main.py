"""
TradeLinks Python Scraper Service (T6) — stateless HTTP scraper.

Architecture: ADR-002 / ADR-004 / crawler-contract.md §4.
Node owns the pg-boss queues; this service is a plain HTTP endpoint that Node's
scrape-queue worker calls. It does NOT touch the queue.

Endpoints:
  GET  /health           -> {"status": "ok"}
  POST /scrape           -> {"items": [RawItem, ...]}
    body: {sourceId, url, mode: "stealth"|"trends", selectors?, trendsKeywords?, geo?}

Requires Python >= 3.10 (Scrapling). Run: uvicorn main:app --port 8000
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from scrapers.stealth import scrape_stealth
from scrapers.trends import scrape_trends

logger = logging.getLogger("scraper")

# Serialize browser launches: only ONE Chromium at a time. Concurrent
# launch_persistent_context calls spike memory and kill the driver mid-launch
# ("Connection closed while reading from the driver"), and earlier exhausted the
# container (fork EAGAIN). The browser is the scarce resource, so a single global
# lock is the right backpressure. With the worker's batchSize=1 this is
# serialized end-to-end. (trends mode = pytrends/HTTP, no browser → no lock.)
_browser_lock = threading.Lock()

app = FastAPI(title="TradeLinks Scraper", version="0.1.0")


class ScrapeRequest(BaseModel):
    sourceId: str
    url: str
    mode: Literal["stealth", "trends"]
    selectors: dict[str, str] | None = None
    trendsKeywords: list[str] | None = None
    geo: str | None = None


class RawItem(BaseModel):
    url: str
    title: str
    publishedAt: str | None = None
    rawContent: Any | None = None
    lang: str | None = None


class ScrapeResponse(BaseModel):
    items: list[RawItem]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scrape", response_model=ScrapeResponse)
def scrape(req: ScrapeRequest) -> ScrapeResponse:
    try:
        if req.mode == "trends":
            items = scrape_trends(keywords=req.trendsKeywords or [], geo=req.geo)
        else:
            with _browser_lock:  # one Chromium at a time
                items = scrape_stealth(url=req.url, selectors=req.selectors or {})
    except Exception as e:  # noqa: BLE001 — convert to a clean 503
        # Log ONE concise line. Full tracebacks here were flooding Railway's
        # 500-logs/sec limit (1500+ msgs dropped) and obscuring real signal.
        logger.warning("scrape failed: source=%s mode=%s err=%s: %s",
                       req.sourceId, req.mode, type(e).__name__, str(e)[:200])
        raise HTTPException(status_code=503, detail=f"scrape failed: {type(e).__name__}") from None
    return ScrapeResponse(items=[RawItem(**it) for it in items])
