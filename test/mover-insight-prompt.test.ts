import { describe, it, expect } from "vitest";
import { buildMoverInsightPrompt, parseMoverInsight } from "../src/ai/prompts/mover-insight";
import type { MoverEvidence } from "../src/movers/evidence";

const ev: MoverEvidence = {
  asin: "B1", title: "Glow Serum", region: "north_america", category: "Beauty",
  rankTrajectory: [30, 8], currentRank: 8, rankDelta: 22, reviewDelta: 200,
  reviewCount: 1200, rating: 4.6, price: 18.9, isNewEntrant: false, daysTracked: 2, spreadingTo: ["europe"],
};

describe("buildMoverInsightPrompt", () => {
  it("system carries the writing standard; user carries the evidence numbers", () => {
    const p = buildMoverInsightPrompt(ev);
    expect(p.system).toContain("ANALYTICAL DEPTH");
    expect(p.user).toContain("Glow Serum");
    expect(p.user).toContain("+22");
    expect(p.user).toContain("200");
  });
});

describe("parseMoverInsight", () => {
  it("parses the four sections", () => {
    const c = parseMoverInsight(
      JSON.stringify({ what_it_is: "A Korean glow serum", why_now: "rank +22 in a day", trajectory: "US→EU", so_what: "source now" }),
    );
    expect(c.whatItIs).toContain("serum");
    expect(c.whyNow).toContain("+22");
    expect(c.soWhat).toContain("source");
  });
});
