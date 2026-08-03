/**
 * Phase 1 Public Intelligence Task 9a — legacy route → public route redirect
 * map, behind the PUBLIC_CUTOVER_ENABLED config flag.
 *
 * This module is PURE and is wired into nothing in Task 9a. Task 9b flips
 * PUBLIC_CUTOVER_ENABLED and consults getLegacyRedirect() from middleware or
 * redirect-only route files; the LegacyRedirect rows planned by
 * scripts/backfill-public-content.ts supply the daily-slug target table.
 * Making cutover a config flip rather than a code deploy is deliberate:
 * rollback is instant, and this branch's legacy routes keep serving until
 * the explicit cutover decision.
 *
 * Every redirect is a 308. Every target is a route in the plan's Public URL
 * Contract — pinned against route files on disk by test/legacy-redirects.test.ts.
 */

export type LegacyRedirectDecision = { target: string; status: 308 };

export type LegacyRedirectRow = { fromPath: string; toPath: string; status: 308 };

/**
 * The declarative static map. zh equivalents are DERIVED (see
 * listStaticLegacyRedirectRows), never duplicated here by hand.
 *
 * `/trends` carries `?view=demand-signals`: the Radar demand-signal stream
 * lives on the Amazon US hub as its observed-but-unreviewed demand section;
 * the query string is the plan's own Task 9 target and the page renders it
 * regardless.
 */
export const LEGACY_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/wire", to: "/changes" },
  { from: "/trends", to: "/amazon-us?view=demand-signals" },
  { from: "/daily", to: "/briefings" },
  // API v0 JSON endpoints retire to the API v1 documentation, not legacy JSON.
  { from: "/api/public/alerts", to: "/openapi.json" },
  { from: "/api/public/daily", to: "/openapi.json" },
];

const DAILY_PREFIX = "/daily/";
const ZH_PREFIX = "/zh";

function normalizePathname(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/")) return null;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/**
 * Resolve an English pathname against the static map and the daily-detail
 * rule. Returns the redirect target, or null when the path is not a legacy
 * route. `dailySlugTargets` maps a published legacy daily-note slug to its
 * briefing route (from the planned LegacyRedirect rows); unmapped slugs fall
 * back to the briefing index, per the plan.
 */
function resolveEnglish(
  path: string,
  dailySlugTargets?: ReadonlyMap<string, string>,
): string | null {
  for (const { from, to } of LEGACY_REDIRECTS) {
    if (path === from) return to;
  }
  if (path.startsWith(DAILY_PREFIX)) {
    const slug = path.slice(DAILY_PREFIX.length);
    if (slug === "" || slug.includes("/")) return null; // not the /daily/[slug] route
    return dailySlugTargets?.get(slug) ?? "/briefings";
  }
  return null;
}

/**
 * The redirect for a legacy pathname, or null when the pathname is not a
 * legacy route and must be left alone. `/zh/*` maps to the English
 * equivalent (Phase 1 public routes are English-only): legacy zh paths take
 * the same redirect as their English twin, any other zh path sheds the
 * prefix.
 */
export function getLegacyRedirect(
  pathname: string,
  dailySlugTargets?: ReadonlyMap<string, string>,
): LegacyRedirectDecision | null {
  const path = normalizePathname(pathname);
  if (path === null) return null;

  if (path === ZH_PREFIX) return { target: "/", status: 308 };
  if (path.startsWith(`${ZH_PREFIX}/`)) {
    const english = path.slice(ZH_PREFIX.length);
    return { target: resolveEnglish(english, dailySlugTargets) ?? english, status: 308 };
  }

  const target = resolveEnglish(path, dailySlugTargets);
  return target === null ? null : { target, status: 308 };
}

/**
 * The full static LegacyRedirect row set the cutover writes: every en entry,
 * the `/zh` root, and the zh equivalent of every non-API entry (API
 * endpoints are locale-free). The daily-detail rows are data-dependent and
 * come from scripts/backfill-public-content.ts, not from here.
 */
export function listStaticLegacyRedirectRows(): LegacyRedirectRow[] {
  const rows: LegacyRedirectRow[] = LEGACY_REDIRECTS.map(({ from, to }) => ({
    fromPath: from,
    toPath: to,
    status: 308,
  }));
  rows.push({ fromPath: ZH_PREFIX, toPath: "/", status: 308 });
  for (const { from, to } of LEGACY_REDIRECTS) {
    if (from.startsWith("/api/")) continue;
    rows.push({ fromPath: `${ZH_PREFIX}${from}`, toPath: to, status: 308 });
  }
  return rows;
}
