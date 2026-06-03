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
