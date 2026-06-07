// Extract an article's title image (Open Graph / Twitter card). Best-effort.
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Generic site banners / logos / social-share placeholders — NOT article images.
// Skip these so a card shows a real photo or no image (cleaner than GOV.UK banners).
// `J6_coFbog…` is the Google News generic share logo served as og:image on the
// news.google.com redirect interstitial — never an article photo (BL-040).
const GENERIC_IMAGE = /banner|opengraph|og[-_]?image|og[-_]?default|meta[-_%0-9 ]{0,4}tag|placeholder|default[-_]?(image|share|og)|share[-_]?image|social[-_]?(share|card|image)|site[-_]?image|logo|seal|favicon|sprite|govuk-opengraph|J6_coFbog/i;

export function isGenericBanner(url: string): boolean {
  return GENERIC_IMAGE.test(url);
}

/** Parse og:image / twitter:image from page HTML, skipping generic banners. Pure. */
export function parseOgImage(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const cand =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[property="og:image:url"]').attr("content") ||
    $('meta[name="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $('meta[property="twitter:image"]').attr("content") ||
    $('link[rel="image_src"]').attr("href");
  if (!cand) return null;
  try {
    const u = new URL(cand.trim(), baseUrl).toString();
    if (!u.startsWith("http")) return null;
    if (isGenericBanner(u)) return null; // prefer no image over a generic banner
    return u;
  } catch {
    return null;
  }
}

/** Fetch an article URL and return its og:image, or null. Never throws. */
export async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    const html = await res.text();
    return parseOgImage(html, url);
  } catch {
    return null;
  }
}
