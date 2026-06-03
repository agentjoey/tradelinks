import { describe, it, expect } from "vitest";
import type { LlmClient, LlmCompleteOpts, LlmResult } from "../src/ai/client.js";
import { extractJson } from "../src/ai/json.js";
import { parsePrefilter, buildPrefilterPrompt } from "../src/ai/prompts/prefilter.js";
import { parseCategorize } from "../src/ai/prompts/categorize.js";
import { parseTranslate } from "../src/ai/prompts/translate.js";
import { runStage1, type Stage1Input } from "../src/ai/stage1.js";

// ---- extractJson ----
describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses fenced JSON", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("parses padded JSON", () => {
    expect(extractJson('Sure! {"a":1} done')).toEqual({ a: 1 });
  });
  it("throws on no JSON", () => {
    expect(() => extractJson("nope")).toThrow();
  });
});

// ---- parsers ----
describe("parsers", () => {
  it("parsePrefilter reads results array", () => {
    const r = parsePrefilter('{"results":[{"id":"x","keep":true,"reason":"ok"}]}');
    expect(r[0]).toMatchObject({ id: "x", keep: true });
  });
  it("parseTranslate handles null titleEn", () => {
    const r = parseTranslate('{"titleEn":null,"summaryEn":"hi"}');
    expect(r.titleEn).toBeNull();
    expect(r.summaryEn).toBe("hi");
  });
  it("parseCategorize falls back to source regions when empty", () => {
    const r = parseCategorize(
      '{"category":"regulatory","regions":[],"platforms":["Amazon"]}',
      ["europe"],
    );
    expect(r.regions).toEqual(["europe"]);
    expect(r.platforms).toEqual(["amazon"]); // lowercased + deduped
  });
  it("parseCategorize dedupes regions", () => {
    const r = parseCategorize(
      '{"category":"trend","regions":["europe","europe","north_america"],"platforms":[]}',
      [],
    );
    expect(r.regions.sort()).toEqual(["europe", "north_america"]);
  });
});

// ---- buildPrefilterPrompt ----
describe("buildPrefilterPrompt", () => {
  it("requests JSON and lists item ids", () => {
    const p = buildPrefilterPrompt([{ id: "abc", title: "Amazon raises FBA fees" }]);
    expect(p.json).toBe(true);
    expect(p.user).toContain("id=abc");
  });
});

/**
 * FakeLlmClient: routes by the system prompt to return canned JSON, simulating
 * a reasonable model. Lets us test orchestration without a real API key.
 */
class FakeLlmClient implements LlmClient {
  readonly name = "fake";
  async complete(opts: LlmCompleteOpts): Promise<LlmResult> {
    const sys = opts.system ?? "";
    let text = "{}";
    if (sys.includes("filter for a cross-border")) {
      // drop anything with "buy now"/"sale"/"discount code"
      const ids = [...opts.user.matchAll(/id=(\S+) \| ([^\n|]+)/g)];
      const results = ids.map(([, id, title]) => {
        const drop = /buy now|% off|discount code|sponsored|giveaway/i.test(title ?? "");
        return { id, keep: !drop, reason: drop ? "promo" : "relevant" };
      });
      text = JSON.stringify({ results });
    } else if (sys.includes("normalize cross-border")) {
      const isEn = /Source language: en/i.test(opts.user);
      text = JSON.stringify({
        titleEn: isEn ? null : "Translated title",
        summaryEn: "A concise english summary.",
      });
    } else if (sys.includes("tag cross-border")) {
      // naive: detect a couple regions from keywords, else empty (force fallback)
      const regions: string[] = [];
      if (/GPSR|EU|VAT/i.test(opts.user)) regions.push("europe");
      if (/FBA|Amazon\.com|US /i.test(opts.user)) regions.push("north_america");
      text = JSON.stringify({
        category: /VAT|GPSR|customs|tariff/i.test(opts.user) ? "regulatory" : "industry",
        regions,
        platforms: /Amazon/i.test(opts.user) ? ["amazon"] : [],
      });
    }
    return { text, usage: { promptTokens: 50, completionTokens: 20 }, model: "fake" };
  }
}

// ---- 20-item golden set for keep/drop + region coverage ----
const GOLDEN: { item: Stage1Input; expectKeep: boolean }[] = [
  ["GPSR compliance deadline approaches for EU sellers", "en", ["europe"], true],
  ["Amazon raises FBA fees in US for 2026", "en", ["north_america"], true],
  ["BUY NOW: 50% off phone cases sponsored", "en", ["north_america"], false],
  ["TikTok Shop expands to Brazil with new seller rules", "en", ["latin_america"], true],
  ["Use discount code SAVE20 today only", "en", ["north_america"], false],
  ["UK VAT threshold changes for cross-border imports", "en", ["europe"], true],
  ["Freightos index shows Asia-US ocean rates surging", "en", ["north_america"], true],
  ["Giveaway: win a free gadget now", "en", ["north_america"], false],
  ["Shopee tightens counterfeit policy in Southeast Asia", "en", ["southeast_asia"], true],
  ["Saudi SABER certification update for electronics", "en", ["middle_east"], true],
  ["Mercado Libre logistics expansion in Mexico", "en", ["latin_america"], true],
  ["ACCC mandatory safety standard for toys in Australia", "en", ["australia_nz"], true],
  ["Sponsored: best dropshipping course ever", "en", ["north_america"], false],
  ["EU EPR packaging rules tighten for marketplaces", "en", ["europe"], true],
  ["De minimis $800 exemption under review by CBP", "en", ["north_america"], true],
  ["Temu changes seller payout schedule", "en", ["north_america"], true],
  ["亚马逊调整欧洲站VAT申报规则", "zh", ["europe"], true],
  ["50% OFF flash sale buy now", "en", ["north_america"], false],
  ["Suez canal disruption raises Asia-Europe freight", "en", ["europe"], true],
  ["Indonesia import permit changes for e-commerce", "id", ["southeast_asia"], true],
].map(([title, lang, regions, expectKeep]) => ({
  item: {
    id: String(Math.random()),
    title: title as string,
    lang: lang as string,
    fallbackRegions: regions as Stage1Input["fallbackRegions"],
  },
  expectKeep: expectKeep as boolean,
}));

describe("runStage1 (orchestration, fake client)", () => {
  it("keep/drop matches golden set ≥85%", async () => {
    const llm = new FakeLlmClient();
    let correct = 0;
    for (const g of GOLDEN) {
      const out = await runStage1(g.item, llm);
      if (out.keep === g.expectKeep) correct++;
    }
    const accuracy = correct / GOLDEN.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });

  it("≥98% of kept items get ≥1 region (fallback enforced)", async () => {
    const llm = new FakeLlmClient();
    const kept = [];
    for (const g of GOLDEN) {
      const out = await runStage1(g.item, llm);
      if (out.keep) kept.push(out);
    }
    const withRegion = kept.filter((k) => k.regions.length >= 1).length;
    expect(withRegion / kept.length).toBeGreaterThanOrEqual(0.98);
  });

  it("dropped items short-circuit without enrichment", async () => {
    const llm = new FakeLlmClient();
    const out = await runStage1(
      { id: "1", title: "BUY NOW sponsored sale", lang: "en", fallbackRegions: [] },
      llm,
    );
    expect(out.keep).toBe(false);
    expect(out.titleEn).toBeNull();
    expect(out.category).toBeNull();
  });

  it("non-English item gets a translated title", async () => {
    const llm = new FakeLlmClient();
    const out = await runStage1(
      { id: "2", title: "亚马逊调整VAT规则", lang: "zh", fallbackRegions: ["europe"] },
      llm,
    );
    expect(out.keep).toBe(true);
    expect(out.titleEn).toBe("Translated title");
    expect(out.regions).toContain("europe");
  });
});
