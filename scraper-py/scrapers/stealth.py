"""
Stealth scraping via Scrapling StealthyFetcher (anti-bot sources: TikTok CC,
Amazon BSR, Shopee/Lazada). Adaptive mode self-heals selectors on redesign.

Scrapling API (verified v0.2.x):
  StealthyFetcher.adaptive = True                  # enable self-healing globally
  page = StealthyFetcher.fetch(url, headless=True, solve_cloudflare=True)
  page.css('sel::text').get() / page.css('sel')[i].attrib['href']

Returns RawItem dicts matching the Node RawItem schema (crawler-contract.md §2).
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urljoin


def scrape_stealth(url: str, selectors: dict[str, str]) -> list[dict[str, Any]]:
    from scrapling.fetchers import StealthyFetcher

    item_sel = selectors.get("item", "article")
    title_sel = selectors.get("title", "h2, h3")
    link_sel = selectors.get("link", "a")
    rank_sel = selectors.get("rank")  # optional (e.g. Amazon BSR badge)
    rating_sel = selectors.get("rating")         # BL-042 P2a
    review_sel = selectors.get("reviewCount")    # BL-042 P2a
    price_sel = selectors.get("price")           # BL-042 P2a
    image_sel = selectors.get("image", "img")  # product thumbnail

    StealthyFetcher.adaptive = True  # Smart Element Tracking / auto-heal
    # solve_cloudflare off: our scrapable sources (Amazon BSR) don't use
    # Cloudflare, so enabling it only added latency + a noisy "No Cloudflare
    # challenge found" ERROR log. Re-enable per-source if a CF-gated source is added.
    page = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        timeout=90000,
        disable_resources=True,
    )

    items: list[dict[str, Any]] = []
    for node in page.css(item_sel, auto_save=True):
        title_text = _first_text(node, title_sel)
        href = _first_attr(node, link_sel, "href")
        if not title_text or not href:
            continue
        raw: dict[str, Any] = {}
        if rank_sel:
            rank = _first_text(node, rank_sel)
            if rank:
                raw["rank"] = rank.strip()
        # product thumbnail — the <img> src is in the DOM even with
        # disable_resources (only the image bytes are blocked, not the tag).
        img = _first_attr(node, image_sel, "src") or _first_attr(node, image_sel, "data-src")
        if img:
            raw["image"] = img
        if rating_sel:
            v = _first_text(node, rating_sel)
            if v: raw["ratingText"] = v.strip()
        if review_sel:
            v = _first_text(node, review_sel)
            if v: raw["reviewText"] = v.strip()
        if price_sel:
            v = _first_text(node, price_sel)
            if v: raw["priceText"] = v.strip()
        items.append(
            {
                "url": urljoin(url, href),
                "title": title_text.strip(),
                "lang": "en",
                "rawContent": raw or None,
            }
        )
    return items


def _first_text(node, sel: str) -> str | None:
    try:
        res = node.css(f"{sel}::text")
        return res.get() if res else None
    except Exception:
        return None


def _first_attr(node, sel: str, attr: str) -> str | None:
    try:
        els = node.css(sel)
        if els:
            return els[0].attrib.get(attr)
        # node itself may be the anchor
        return node.attrib.get(attr)
    except Exception:
        return None
