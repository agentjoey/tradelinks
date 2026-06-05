type Params = Record<string, string | number | boolean | undefined | null>;

/**
 * Send a GA4 custom event — no-op until gtag is loaded (i.e. consent granted).
 * Values are trimmed to GA4's 100-char param limit.
 */
export function track(event: string, params: Params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    clean[k] = typeof v === "string" ? v.slice(0, 100) : v;
  }
  window.gtag("event", event, clean);
}
