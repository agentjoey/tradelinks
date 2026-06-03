import { describe, it, expect } from "vitest";
import { parseScore, buildScorePrompt } from "../src/ai/prompts/score.js";
import { runStage2, type Stage2Input } from "../src/ai/stage2.js";
import type { LlmClient, LlmCompleteOpts, LlmResult } from "../src/ai/client.js";

describe("parseScore", () => {
  it("parses + clamps urgencyScore", () => {
    const r = parseScore('{"urgencyScore": 7, "impactScope":"x", "recommendation":"y"}');
    expect(r.urgencyScore).toBe(5); // clamped
  });
  it("parses fenced JSON", () => {
    const r = parseScore('```json\n{"urgencyScore":3.5,"impactScope":"EU sellers","recommendation":"review VAT"}\n```');
    expect(r.urgencyScore).toBe(3.5);
    expect(r.impactScope).toBe("EU sellers");
  });
  it("rejects missing fields", () => {
    expect(() => parseScore('{"urgencyScore":3}')).toThrow();
  });
});

describe("buildScorePrompt", () => {
  it("includes category/regions and asks for JSON", () => {
    const p = buildScorePrompt({ title: "T", category: "regulatory", regions: ["europe"], platforms: ["amazon"] });
    expect(p.json).toBe(true);
    expect(p.user).toContain("category: regulatory");
    expect(p.user).toContain("regions: europe");
  });
});

/** Fake reasoning client: scores by urgency keywords in the title. */
class ScoreFake implements LlmClient {
  readonly name = "fake-score";
  async complete(opts: LlmCompleteOpts): Promise<LlmResult> {
    const u = opts.user.toLowerCase();
    let score = 2;
    if (/ban|tro|freeze|suspend|deadline|effective|tariff|de minimis/.test(u)) score = 4.5;
    else if (/new rule|requirement|fee change|policy/.test(u)) score = 3.5;
    else if (/milestone|tip|creator|how to/.test(u)) score = 1;
    return {
      text: JSON.stringify({ urgencyScore: score, impactScope: "sellers in region", recommendation: "review" }),
      usage: { promptTokens: 40, completionTokens: 20 },
      model: "fake",
    };
  }
}

const HIGH: Stage2Input = {
  title: "US de minimis exemption removed, tariffs effective next week",
  category: "regulatory", regions: ["north_america"], platforms: [],
};
const LOW: Stage2Input = {
  title: "TikTok creator hits GMV milestone — how to grow your shop",
  category: "tip", regions: ["north_america"], platforms: ["tiktok-shop"],
};

describe("runStage2", () => {
  const llm = new ScoreFake();
  it("scores high-urgency regulatory above low-value tip", async () => {
    const hi = await runStage2(HIGH, llm);
    const lo = await runStage2(LOW, llm);
    expect(hi.urgencyScore).toBeGreaterThan(lo.urgencyScore);
    expect(hi.urgencyScore).toBeGreaterThanOrEqual(4);
    expect(lo.urgencyScore).toBeLessThan(2);
  });
  it("returns impactScope + recommendation", async () => {
    const r = await runStage2(HIGH, llm);
    expect(r.impactScope.length).toBeGreaterThan(0);
    expect(r.recommendation.length).toBeGreaterThan(0);
  });
});
