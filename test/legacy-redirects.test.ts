import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EnvSchema } from "../src/config/env.js";
import { briefingPath } from "../src/public-intelligence/briefings.js";
import {
  getLegacyRedirect,
  LEGACY_REDIRECTS,
  listStaticLegacyRedirectRows,
} from "../src/public-intelligence/legacy-redirects.js";

/**
 * Task 9a — the legacy→public redirect map, behind PUBLIC_CUTOVER_ENABLED.
 *
 * The module is pure and wired into NOTHING in this task: these tests pin
 * the map, the lookup semantics, and — programmatically, against route
 * files on disk — that every redirect target is a route that exists today
 * in the plan's Public URL Contract.
 */

describe("getLegacyRedirect — static legacy routes", () => {
  it.each([
    ["/wire", "/changes"],
    ["/trends", "/amazon-us?view=demand-signals"],
    ["/daily", "/briefings"],
    ["/api/public/alerts", "/openapi.json"],
    ["/api/public/daily", "/openapi.json"],
  ])("redirects %s → %s with 308", (from, to) => {
    expect(getLegacyRedirect(from)).toEqual({ target: to, status: 308 });
  });

  it("normalizes a trailing slash", () => {
    expect(getLegacyRedirect("/wire/")).toEqual({ target: "/changes", status: 308 });
    expect(getLegacyRedirect("/daily/")).toEqual({ target: "/briefings", status: 308 });
  });

  it("ignores a query string on the incoming path", () => {
    expect(getLegacyRedirect("/wire?region=europe")).toEqual({
      target: "/changes",
      status: 308,
    });
  });
});

describe("getLegacyRedirect — zh locale maps to the English equivalent", () => {
  it.each([
    ["/zh", "/"],
    ["/zh/wire", "/changes"],
    ["/zh/trends", "/amazon-us?view=demand-signals"],
    ["/zh/daily", "/briefings"],
  ])("redirects %s → %s", (from, to) => {
    expect(getLegacyRedirect(from)).toEqual({ target: to, status: 308 });
  });

  it("maps any other zh path to the same path without the prefix", () => {
    expect(getLegacyRedirect("/zh/subscribe")).toEqual({ target: "/subscribe", status: 308 });
  });
});

describe("getLegacyRedirect — daily detail routes", () => {
  const MAPPED = new Map([
    ["2026-07-01-tariff-brief", "/briefings/daily/2026-07-01"],
    ["2026-07-01-tariff-brief-zh", "/briefings/daily/2026-07-01"],
  ]);

  it("sends an unmapped daily slug to the briefing index", () => {
    expect(getLegacyRedirect("/daily/2026-07-01-tariff-brief")).toEqual({
      target: "/briefings",
      status: 308,
    });
  });

  it("sends a mapped daily slug to its briefing route", () => {
    expect(getLegacyRedirect("/daily/2026-07-01-tariff-brief", MAPPED)).toEqual({
      target: "/briefings/daily/2026-07-01",
      status: 308,
    });
  });

  it("maps a zh daily slug through the same table", () => {
    expect(getLegacyRedirect("/zh/daily/2026-07-01-tariff-brief-zh", MAPPED)).toEqual({
      target: "/briefings/daily/2026-07-01",
      status: 308,
    });
  });

  it("sends an unmapped zh daily slug to the briefing index", () => {
    expect(getLegacyRedirect("/zh/daily/2026-07-01-tariff-brief-zh")).toEqual({
      target: "/briefings",
      status: 308,
    });
  });
});

describe("getLegacyRedirect — non-legacy paths are untouched", () => {
  it.each([
    "/",
    "/changes",
    "/changes/some-slug",
    "/briefings",
    "/briefings/daily/2026-07-01",
    "/subscribe",
    "/admin/review",
    "/wirefoo",
    "/wire/archive",
    "/trendsfoo",
    "/api/v1/changes",
    "/api/public/alerts/extra",
  ])("returns null for %s", (path) => {
    expect(getLegacyRedirect(path)).toBeNull();
  });

  it("returns null for a malformed path", () => {
    expect(getLegacyRedirect("wire")).toBeNull();
    expect(getLegacyRedirect("")).toBeNull();
  });
});

describe("the declarative map", () => {
  it("has unique from-paths, all absolute", () => {
    const froms = LEGACY_REDIRECTS.map((r) => r.from);
    expect(new Set(froms).size).toBe(froms.length);
    for (const from of froms) expect(from.startsWith("/")).toBe(true);
  });

  it("enumerates the full static row set including zh equivalents", () => {
    const rows = listStaticLegacyRedirectRows();
    const byFrom = new Map(rows.map((r) => [r.fromPath, r]));
    // Every row is a permanent redirect.
    for (const row of rows) expect(row.status).toBe(308);
    // The zh root and every non-API en entry have a zh equivalent row.
    expect(byFrom.get("/zh")?.toPath).toBe("/");
    expect(byFrom.get("/zh/wire")?.toPath).toBe("/changes");
    expect(byFrom.get("/zh/trends")?.toPath).toBe("/amazon-us?view=demand-signals");
    expect(byFrom.get("/zh/daily")?.toPath).toBe("/briefings");
    // API endpoints are locale-free: no zh API rows.
    expect(byFrom.has("/zh/api/public/alerts")).toBe(false);
    // Every enumerated row resolves through getLegacyRedirect to the same target.
    for (const row of rows) {
      expect(getLegacyRedirect(row.fromPath)).toEqual({ target: row.toPath, status: 308 });
    }
  });
});

/**
 * The plan's Public URL Contract (plan §"Public URL Contract"), pinned to
 * the route files that serve it. A redirect target that is not one of these
 * routes fails here — the check is the filesystem, not anyone's say-so.
 */
const CONTRACT_ROUTE_FILES: Record<string, string> = {
  "/": "app/(public)/page.tsx",
  "/us": "app/(public)/us/page.tsx",
  "/amazon-us": "app/(public)/amazon-us/page.tsx",
  "/shopify-us": "app/(public)/shopify-us/page.tsx",
  "/categories": "app/(public)/categories/page.tsx",
  "/topics": "app/(public)/topics/page.tsx",
  "/changes": "app/(public)/changes/page.tsx",
  "/guides": "app/(public)/guides/page.tsx",
  "/briefings": "app/(public)/briefings/page.tsx",
  "/coverage": "app/(public)/coverage/page.tsx",
  "/openapi.json": "app/openapi.json/route.ts",
};

const BRIEFING_DETAIL_ROUTE_FILES = [
  "app/(public)/briefings/weekly/[year]/[week]/page.tsx",
  "app/(public)/briefings/monthly/[year]/[month]/page.tsx",
  "app/(public)/briefings/daily/[date]/page.tsx",
];

function expectTargetInUrlContract(target: string): void {
  const pathname = target.split("?")[0]!;
  const routeFile = CONTRACT_ROUTE_FILES[pathname];
  if (routeFile) {
    expect(existsSync(routeFile), `route file for ${pathname}`).toBe(true);
    return;
  }
  // Briefing detail targets come from briefingPath() — the contract's own
  // route builder — and match one of the three detail route files on disk.
  expect(
    /^\/briefings\/(weekly\/\d{4}\/\d{1,2}|monthly\/\d{4}\/\d{1,2}|daily\/\d{4}-\d{2}-\d{2})$/.test(
      pathname,
    ),
    `${target} is not a URL-contract route`,
  ).toBe(true);
}

describe("every redirect target exists in the URL contract", () => {
  it("all contract route files named here exist on disk", () => {
    for (const file of [
      ...Object.values(CONTRACT_ROUTE_FILES),
      ...BRIEFING_DETAIL_ROUTE_FILES,
    ]) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it("covers every declarative map target", () => {
    for (const { to } of LEGACY_REDIRECTS) expectTargetInUrlContract(to);
  });

  it("covers every enumerated static row target", () => {
    for (const row of listStaticLegacyRedirectRows()) expectTargetInUrlContract(row.toPath);
  });

  it("briefingPath() output — the daily-detail redirect target — satisfies the contract", () => {
    expectTargetInUrlContract(briefingPath("DAILY", "2026-07-01"));
    expectTargetInUrlContract(briefingPath("WEEKLY", "2026-W27"));
    expectTargetInUrlContract(briefingPath("MONTHLY", "2026-07"));
  });
});

describe("PUBLIC_CUTOVER_ENABLED feature flag", () => {
  it("defaults to off when unset", () => {
    expect(EnvSchema.parse({}).PUBLIC_CUTOVER_ENABLED).toBeFalsy();
  });

  it("is enabled only by an explicit true/1", () => {
    expect(EnvSchema.parse({ PUBLIC_CUTOVER_ENABLED: "true" }).PUBLIC_CUTOVER_ENABLED).toBe(true);
    expect(EnvSchema.parse({ PUBLIC_CUTOVER_ENABLED: "1" }).PUBLIC_CUTOVER_ENABLED).toBe(true);
    expect(EnvSchema.parse({ PUBLIC_CUTOVER_ENABLED: "false" }).PUBLIC_CUTOVER_ENABLED).toBe(false);
    expect(EnvSchema.parse({ PUBLIC_CUTOVER_ENABLED: "yes" }).PUBLIC_CUTOVER_ENABLED).toBe(false);
  });
});
