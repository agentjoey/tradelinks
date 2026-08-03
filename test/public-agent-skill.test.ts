import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { openApiDocument } from "../src/public-intelligence/api.js";

// The Agent Skill is a machine contract: an agent following it must land on
// routes the API actually serves, at the version the OpenAPI document
// declares. A Skill that documents a route the API does not serve is worse
// than no Skill — so parity is asserted here, not reviewed by eye.

const skillPath = join(__dirname, "../public/agent/tradelinks/SKILL.md");
const skill = readFileSync(skillPath, "utf8");

function skillEndpoints(text: string): string[] {
  const matches = text.match(/\/api\/v1\/[a-z/{}_-]+/gi) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))].sort();
}

describe("public/agent/tradelinks/SKILL.md", () => {
  it("declares the same version as the OpenAPI document", () => {
    const doc = openApiDocument() as { info: { version: string } };
    const versionMatch = skill.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$/m);
    expect(versionMatch).not.toBeNull();
    expect(versionMatch![1]).toBe(doc.info.version);
  });

  it("declares exactly the endpoints the OpenAPI document serves", () => {
    const doc = openApiDocument() as { paths: Record<string, unknown> };
    expect(skillEndpoints(skill)).toEqual(Object.keys(doc.paths).sort());
  });

  it("instructs agents to query current API data, never model memory", () => {
    expect(skill).toMatch(/current API data/i);
    expect(skill).toMatch(/model memory|training (data|memory)/i);
  });

  it("instructs agents to preserve the user's requested time window", () => {
    expect(skill).toMatch(/time window/i);
    expect(skill).toMatch(/widen/i);
  });

  it("requires citing the canonical TradeLinks page for every claim", () => {
    expect(skill).toMatch(/canonical/i);
    expect(skill).toMatch(/cite|citation/i);
  });

  it("requires verifying important policy facts against official evidence links", () => {
    expect(skill).toMatch(/evidence/i);
    expect(skill).toMatch(/official/i);
  });

  it("requires stating the readiness level with every conclusion", () => {
    expect(skill).toMatch(/readiness/i);
  });

  it("requires a clear unavailable-or-stale result when the API cannot be reached", () => {
    expect(skill).toMatch(/unavailable|stale/i);
    expect(skill).toMatch(/never.{0,80}(remembered|model memory)|do not.{0,80}remembered/is);
  });
});
