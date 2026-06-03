"""DOM/JSON exploration for anti-bot sources. Usage: python explore.py [url]"""
import re
import sys
from scrapling.fetchers import StealthyFetcher


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else \
        "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en"
    print(f"fetching: {url}")
    page = StealthyFetcher.fetch(
        url, headless=True, solve_cloudflare=True, network_idle=True, timeout=90000,
    )
    print("status:", getattr(page, "status", "?"))
    html = page.html_content
    print("html length:", len(html))
    t = page.css("title::text")
    print("title:", t.get() if t else "?")

    # 1) probe DOM selectors
    candidates = [
        "a[href*='hashtag']", "a[href*='keyword']", "a[href*='product']",
        "[class*='CardPc']", "[class*='Card']", "[class*='card']",
        "[class*='item']", "[class*='Item']", "[class*='ItemCard']",
        "[data-testid]", "tbody tr", "[class*='rank']", "[class*='Rank']",
        "span[class*='title']", "div[class*='title']", "[class*='name']",
    ]
    print("\n== DOM probe (count : sample) ==")
    for sel in candidates:
        try:
            els = page.css(sel)
            if len(els):
                txt = page.css(f"{sel}::text")
                s = (txt.get() or "") if txt else ""
                print(f"  {len(els):4d}  {sel:28s} | {s[:45]}")
        except Exception as e:
            print(f"   err  {sel:28s} | {e}")

    # 2) look for embedded JSON / data markers
    print("\n== embedded-data markers ==")
    for marker in ["__NEXT_DATA__", "window.__", "application/json", "hashtag", "trend", "rankList", "itemList"]:
        print(f"  {marker:18s}: {html.count(marker)}")

    # 3) any <script type=application/json> blobs?
    blobs = re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S)
    print(f"\n== {len(blobs)} application/json script blob(s) ==")
    for b in blobs[:2]:
        print("  blob len", len(b), "head:", b[:200].replace("\n", " "))


if __name__ == "__main__":
    main()
