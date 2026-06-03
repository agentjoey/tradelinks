"""
Stealth scraping via Scrapling StealthyFetcher (anti-bot sources: TikTok CC,
Amazon BSR, Shopee/Lazada). Adaptive mode self-heals selectors on redesign.

This is the Sprint-001 skeleton: structure + Scrapling wiring. Per-source
selector tuning is iterative (see docs/specs/sources.md). Returns RawItem dicts
matching the Node RawItem schema (crawler-contract.md §2).
"""
from __future__ import annotations

from typing import Any


def scrape_stealth(url: str, selectors: dict[str, str]) -> list[dict[str, Any]]:
    # Imported lazily so the module imports even before Scrapling is installed.
    from scrapling.fetchers import StealthyFetcher

    item_sel = selectors.get("item", "article")
    title_sel = selectors.get("title", "h2, h3")
    link_sel = selectors.get("link", "a")

    fetcher = StealthyFetcher(adaptive=True)  # Smart Element Tracking / auto-heal
    page = fetcher.fetch(url, headless=True, solve_cloudflare=True)

    items: list[dict[str, Any]] = []
    for node in page.css(item_sel):
        title = node.css_first(title_sel)
        href = node.css_first(link_sel)
        title_text = title.text.strip() if title else None
        link = href.attrib.get("href") if href else None
        if not title_text or not link:
            continue
        items.append(
            {
                "url": _absolutize(link, url),
                "title": title_text,
                "lang": "en",
            }
        )
    return items


def _absolutize(href: str, base: str) -> str:
    from urllib.parse import urljoin

    return urljoin(base, href)
