/**
 * One host, agreed on by every surface.
 *
 * The Phase 1 plan fixed the canonical base at `https://tradelinks.us` and
 * four modules hardcoded it. The domain is registered to someone else and
 * cannot be bought, so the OpenAPI `servers` entry, the RSS `link`/`self`
 * URLs and every change permalink were advertising a host that does not
 * resolve — while the pages themselves emitted a different host again from
 * `NEXT_PUBLIC_SITE_URL`. Three surfaces, two wrong answers.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SITE_URL, canonicalBase, canonicalUrl } from "../src/public-intelligence/site-url.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canonicalBase", () => {
  it("uses the configured origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tradelinks.agentjoey.ai");
    expect(canonicalBase()).toBe("https://tradelinks.agentjoey.ai");
  });

  it("falls back to the project's own host when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(canonicalBase()).toBe(DEFAULT_SITE_URL);
  });

  it("never returns a trailing slash, so joins cannot double up", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    expect(canonicalBase()).toBe("https://example.com");
    expect(canonicalUrl("/changes")).toBe("https://example.com/changes");
  });

  it("joins a path with or without its leading slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    expect(canonicalUrl("/changes/x")).toBe("https://example.com/changes/x");
    expect(canonicalUrl("changes/x")).toBe("https://example.com/changes/x");
  });

  it("reads the environment on every call, not once at import", () => {
    // A module-level constant would be captured at import time and would go
    // stale the moment the deployment's origin changed — which is exactly how
    // the hardcoded base survived unnoticed.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://one.example");
    expect(canonicalBase()).toBe("https://one.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://two.example");
    expect(canonicalBase()).toBe("https://two.example");
  });

  it("no longer names the unavailable domain anywhere it is generated", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tradelinks.agentjoey.ai");
    expect(canonicalBase()).not.toContain("tradelinks.us");
    expect(canonicalUrl("/openapi.json")).not.toContain("tradelinks.us");
  });
});
