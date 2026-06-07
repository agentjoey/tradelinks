// Google News redirect-link resolution (BL-040 ③).
//
// Google News RSS items link to `news.google.com/rss/articles/CBMi…` redirect
// pages, not the publisher. The new (2024+) format is an opaque id that can't be
// base64-decoded and doesn't 302 — the link serves a JS interstitial that hides
// the destination. The only reliable resolution is Google's own `batchexecute`
// endpoint, which takes a signature + timestamp embedded in that interstitial.
//
// We resolve at processing time so the stored item URL (→ alert sourceUrl, tap
// target, og:image source) is the real publisher article, not a Google redirect.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** True for Google News article/redirect links (which need resolving). Pure. */
export function isGoogleNewsUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("news.google.com");
  } catch {
    return false;
  }
}

/**
 * Parse the real article URL out of a `batchexecute` response. The body is
 * `)]}'\n\n[["wrb.fr","Fbv4je","<json>",…]]` where `<json>` is itself a JSON
 * array whose [1] is the resolved URL. Pure; null on any malformed shape.
 */
export function parseBatchExecuteUrl(text: string): string | null {
  try {
    const part = text.split("\n\n")[1];
    if (!part) return null;
    const outer = JSON.parse(part) as unknown[][];
    const payload = outer[0]?.[2];
    if (typeof payload !== "string") return null;
    const inner = JSON.parse(payload) as unknown[];
    const url = inner[1];
    return typeof url === "string" && url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Google News redirect link to the real publisher URL. Two requests:
 * fetch the interstitial for `data-n-a-{sg,ts,id}`, then POST batchexecute.
 * Never throws — returns null on any failure so callers can fall back.
 */
export async function resolveGoogleNewsUrl(gnUrl: string): Promise<string | null> {
  try {
    const page = await fetch(gnUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!page.ok) return null;
    const html = await page.text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    const id = html.match(/data-n-a-id="([^"]+)"/)?.[1];
    if (!sg || !ts || !id) return null;

    const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
    const freq = JSON.stringify([[["Fbv4je", inner, null, "generic"]]]);
    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
      body: "f.req=" + encodeURIComponent(freq),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return parseBatchExecuteUrl(await res.text());
  } catch {
    return null;
  }
}
