/**
 * What the public sees when it asks for nothing in particular.
 *
 * Every distribution surface defaulted to the `verified` pool, and VERIFIED is
 * currently unreachable: it requires reviewed PRIMARY_OFFICIAL evidence, and
 * the review desk publishes, rejects, reviews templates and corrects — it has
 * no action that marks evidence reviewed. So the first three entries a human
 * published were live in the database, visible on the home page and the hubs,
 * and absent from /changes, the RSS feed and the API. RSS subscribers would
 * have received nothing, ever.
 *
 * Owner decision 2026-08-06: the default pool is `monitored`. Verified stays
 * available as an explicit filter — it is a stronger claim, not a hidden one.
 *
 * The default lives in one constant because it was previously written out in
 * five places, which is how the OpenAPI document came to advertise a default
 * the code no longer had to honour.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_PUBLIC_POOL } from "../src/public-intelligence/query.js";
import { parsePublicSearchParams } from "../src/public-intelligence/search.js";
import { openApiDocument } from "../src/public-intelligence/api.js";

describe("default public pool", () => {
  it("is monitored", () => {
    expect(DEFAULT_PUBLIC_POOL).toBe("monitored");
  });

  it("is what /changes shows when no pool is requested", () => {
    expect(parsePublicSearchParams(new URLSearchParams()).pool).toBe(DEFAULT_PUBLIC_POOL);
  });

  it("still honours an explicit pool, so verified remains reachable", () => {
    expect(parsePublicSearchParams(new URLSearchParams("pool=verified")).pool).toBe("verified");
    expect(parsePublicSearchParams(new URLSearchParams("pool=monitored")).pool).toBe("monitored");
    expect(parsePublicSearchParams(new URLSearchParams("pool=experimental-demand")).pool).toBe(
      "experimental-demand",
    );
  });

  it("falls back to the default for an unknown pool rather than erroring", () => {
    expect(parsePublicSearchParams(new URLSearchParams("pool=nonsense")).pool).toBe(
      DEFAULT_PUBLIC_POOL,
    );
  });
});

describe("the OpenAPI document tells the truth about the default", () => {
  it("declares the default the API actually applies", () => {
    // This is the drift guard. The document previously said `verified` while
    // the handler agreed — and both were wrong for the product. Now the
    // document is checked against the constant the handler uses, so the two
    // cannot disagree again.
    const doc = openApiDocument() as {
      paths: Record<string, { get?: { parameters?: Array<{ name: string; schema?: { default?: string; enum?: string[] } }> } }>;
    };
    const params = doc.paths["/api/v1/changes"]?.get?.parameters ?? [];
    const pool = params.find((p) => p.name === "pool");
    expect(pool, "the pool parameter must be documented").toBeDefined();
    expect(pool!.schema?.default).toBe(DEFAULT_PUBLIC_POOL);
    expect(pool!.schema?.enum).toContain("verified");
  });
});
