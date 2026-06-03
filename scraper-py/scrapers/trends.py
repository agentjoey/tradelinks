"""
Google Trends via pytrends (D01). Each keyword becomes a RawItem whose
rawContent carries the recent interest series; downstream Sprint-004 trend
diffusion consumes these snapshots.

Sprint-001 skeleton: structure + pytrends wiring. Rate limit: <=5 req/min.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def scrape_trends(keywords: list[str], geo: str | None) -> list[dict[str, Any]]:
    if not keywords:
        return []
    from pytrends.request import TrendReq

    pytrends = TrendReq(hl="en-US", tz=0)
    items: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc).isoformat()

    # batch up to 5 keywords per pytrends payload (its limit)
    for batch in _chunks(keywords, 5):
        pytrends.build_payload(batch, timeframe="now 7-d", geo=geo or "")
        df = pytrends.interest_over_time()
        for kw in batch:
            series = df[kw].tolist() if kw in df else []
            items.append(
                {
                    "url": f"https://trends.google.com/trends/explore?q={kw}&geo={geo or ''}",
                    "title": f"Google Trends: {kw} ({geo or 'global'})",
                    "publishedAt": now,
                    "lang": "en",
                    "rawContent": {"keyword": kw, "geo": geo, "series": series},
                }
            )
    return items


def _chunks(xs: list[str], n: int):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]
