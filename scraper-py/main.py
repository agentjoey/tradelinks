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

from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel

from scrapers.stealth import scrape_stealth
from scrapers.trends import scrape_trends

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
    if req.mode == "trends":
        items = scrape_trends(keywords=req.trendsKeywords or [], geo=req.geo)
    else:
        items = scrape_stealth(url=req.url, selectors=req.selectors or {})
    return ScrapeResponse(items=[RawItem(**it) for it in items])
