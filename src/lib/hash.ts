import { createHash } from "node:crypto";

/** Stable sha256 hex of a URL, used as items.urlHash (dedup level 1). */
export function urlHash(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

/** Normalize URL for dedup: lowercase host, strip trailing slash, drop common tracking params. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hostname = u.hostname.toLowerCase();
    // Amazon (any TLD): collapse to /dp/<ASIN>. The "/ref=…/<session-id>" path
    // segment + query vary on every crawl and defeat url-dedup, exploding the
    // items table with the same ~30 products (e.g. one source had 2022 rows for
    // ~30 products). Keep the host so regional listings stay distinct.
    if (/(^|\.)amazon\.[a-z.]+$/.test(u.hostname)) {
      const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?]|$)/i)?.[1];
      if (asin) return `https://${u.hostname}/dp/${asin.toUpperCase()}`;
    }
    const TRACKING = /^(utm_|fbclid|gclid|mc_|ref|ref_src|spm)/i;
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}
