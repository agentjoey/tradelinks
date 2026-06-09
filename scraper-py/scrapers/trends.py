"""
Google Trends via pytrends (D01). Each keyword becomes a RawItem whose
rawContent carries the recent interest series; downstream Sprint-004 diffusion
consumes these snapshots.

NOTE: Google aggressively rate-limits unauthenticated Trends (HTTP 429). We
space requests and retry with backoff. For reliable high-volume use, switch to
a paid provider (SerpAPI / DataForSEO Google Trends) — see sprint-004 notes.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("scrapers.trends")


def _now_z() -> str:
    # Z-suffixed UTC (zod datetime-friendly)
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def scrape_trends(keywords: list[str], geo: str | None) -> list[dict[str, Any]]:
    if not keywords:
        return []
    from pytrends.request import TrendReq
    from pytrends.exceptions import TooManyRequestsError

    pytrends = TrendReq(hl="en-US", tz=0, retries=2, backoff_factor=0.5)
    items: list[dict[str, Any]] = []
    now = _now_z()

    for bi, batch in enumerate(_chunks(keywords, 5)):
        if bi > 0:
            time.sleep(8)  # space batches to avoid 429
        df = None
        for attempt in range(3):
            try:
                pytrends.build_payload(batch, timeframe="now 7-d", geo=geo or "")
                df = pytrends.interest_over_time()
                break
            except TooManyRequestsError:
                time.sleep(15 * (attempt + 1))  # 15s, 30s, 45s backoff
            except Exception as e:
                # Don't swallow silently — a dependency break (e.g. urllib3 2.x
                # removing Retry.method_whitelist) froze Trends for days unnoticed.
                log.warning("trends batch failed (geo=%s kw=%s): %s: %s",
                            geo, batch, type(e).__name__, str(e)[:200])
                break
        if df is None:
            continue  # skip this batch on persistent failure
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
