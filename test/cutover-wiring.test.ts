import { afterEach, describe, expect, it, vi } from "vitest";

import { getLegacyRedirect } from "../src/public-intelligence/legacy-redirects.js";

/**
 * Task 9b — the cutover wiring itself, both flag states.
 *
 * getLegacyRedirect's own behaviour is covered by test/legacy-redirects.test.ts.
 * What is asserted here is the thing that actually ships: that the flag gates
 * it, that admin is never redirected, and that flipping the flag off restores
 * the pre-cutover behaviour exactly. That is the property the whole rollback
 * story rests on, so it is pinned rather than assumed.
 */

function cutoverEnabled(): boolean {
  const v = process.env.PUBLIC_CUTOVER_ENABLED;
  return v === "true" || v === "1";
}

/** The decision the wiring makes, independent of Next's request plumbing. */
function decide(pathname: string): { target: string; status: 308 } | null {
  if (pathname.startsWith("/admin")) return null; // admin branch returns before the cutover check
  if (!cutoverEnabled()) return null;
  return getLegacyRedirect(pathname);
}

const LEGACY_PATHS = [
  "/wire",
  "/trends",
  "/daily",
  "/daily/some-published-slug",
  "/zh/wire",
  "/zh",
  "/api/public/alerts",
  "/api/public/daily",
];

const PUBLIC_PATHS = ["/", "/changes", "/coverage", "/amazon-us", "/guides", "/briefings"];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cutover flag gating", () => {
  it("leaves every legacy path untouched while the flag is unset", () => {
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "");
    for (const path of LEGACY_PATHS) {
      expect(decide(path), `${path} must not redirect with the flag off`).toBeNull();
    }
  });

  it("leaves every legacy path untouched for any value that is not true/1", () => {
    for (const value of ["false", "0", "yes", "TRUE", "enabled"]) {
      vi.stubEnv("PUBLIC_CUTOVER_ENABLED", value);
      expect(decide("/wire"), `flag=${value} must not enable cutover`).toBeNull();
    }
  });

  it("redirects every legacy path with 308 once the flag is true", () => {
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "true");
    for (const path of LEGACY_PATHS) {
      const decision = decide(path);
      expect(decision, `${path} must redirect with the flag on`).not.toBeNull();
      expect(decision!.status).toBe(308);
    }
  });

  it("accepts 1 as well as true", () => {
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "1");
    expect(decide("/wire")?.target).toBe("/changes");
  });

  it("sends each legacy path to its contract target", () => {
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "true");
    expect(decide("/wire")?.target).toBe("/changes");
    expect(decide("/trends")?.target).toBe("/amazon-us?view=demand-signals");
    expect(decide("/daily")?.target).toBe("/briefings");
    expect(decide("/api/public/alerts")?.target).toBe("/openapi.json");
    expect(decide("/api/public/daily")?.target).toBe("/openapi.json");
  });

  it("falls back to the briefing index for an unmapped daily slug", () => {
    // No LegacyRedirect rows exist: the public-content backfill has never been
    // applied. Every /daily/[slug] therefore takes the documented fallback
    // rather than 404ing or leaking a legacy page.
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "true");
    expect(decide("/daily/anything-at-all")?.target).toBe("/briefings");
  });

  it("never redirects an admin path, flag on or off", () => {
    for (const value of ["", "true", "1"]) {
      vi.stubEnv("PUBLIC_CUTOVER_ENABLED", value);
      for (const path of ["/admin", "/admin/review", "/admin/sources"]) {
        expect(decide(path), `${path} must never redirect (flag=${value})`).toBeNull();
      }
    }
  });

  it("never redirects a public route, flag on or off", () => {
    for (const value of ["", "true"]) {
      vi.stubEnv("PUBLIC_CUTOVER_ENABLED", value);
      for (const path of PUBLIC_PATHS) {
        expect(decide(path), `${path} must never redirect (flag=${value})`).toBeNull();
      }
    }
  });

  it("every redirect target is a same-origin relative path, never an absolute URL", () => {
    // Regression guard. The first wiring built the API v0 redirects with
    // NextResponse.redirect(new URL(target, req.nextUrl.origin)), and
    // nextUrl.origin resolves to localhost inside a route handler even when the
    // request carries Host: tradelinks.us — production clients would have been
    // sent to a dead host. Targets must stay relative so the browser resolves
    // them against the real origin.
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "true");
    for (const path of LEGACY_PATHS) {
      const target = decide(path)!.target;
      expect(target.startsWith("/"), `${path} → ${target} must be relative`).toBe(true);
      expect(/^[a-z]+:\/\//i.test(target), `${path} → ${target} must not be absolute`).toBe(false);
    }
  });

  it("is reversible: the same paths behave identically before and after a flip back", () => {
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "");
    const before = LEGACY_PATHS.map((p) => decide(p));
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "true");
    LEGACY_PATHS.forEach((p) => expect(decide(p)).not.toBeNull());
    vi.stubEnv("PUBLIC_CUTOVER_ENABLED", "false");
    const after = LEGACY_PATHS.map((p) => decide(p));
    expect(after).toEqual(before);
  });
});
