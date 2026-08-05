/**
 * The one place that decides what host TradeLinks calls itself.
 *
 * The Phase 1 plan fixed the canonical base at `https://tradelinks.us`, and
 * four modules hardcoded it. That domain turned out to be registered to
 * someone else and unavailable for purchase, so the machine contracts were
 * advertising a host that does not resolve — an OpenAPI `servers` entry, RSS
 * `self`/`link` URLs and change permalinks all pointing nowhere.
 *
 * Everything now reads the deployment's own configured origin, so the host is
 * a deployment decision rather than a compile-time constant, and the page
 * metadata, feeds, API contract and Telegram permalinks can never disagree
 * about it again.
 *
 * Read it through `canonicalBase()` rather than caching the value at module
 * scope: a module-level constant is captured at import time, which makes it
 * invisible to per-test environment stubbing and to any future runtime
 * override.
 */

/** Used when NEXT_PUBLIC_SITE_URL is unset — the project's own Vercel host. */
export const DEFAULT_SITE_URL = "https://tradelinks-mvp.vercel.app";

/** Absolute origin, no trailing slash. */
export function canonicalBase(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = configured && configured !== "" ? configured : DEFAULT_SITE_URL;
  return base.replace(/\/+$/, "");
}

/** Absolute URL for a site-relative path (`/changes` → `https://host/changes`). */
export function canonicalUrl(path: string): string {
  return `${canonicalBase()}${path.startsWith("/") ? path : `/${path}`}`;
}
