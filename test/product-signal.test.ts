import { describe, it, expect } from "vitest";
import { extractAsin, isCommodity, rankDelta, reviewDelta, evergreenPenalty, crossRegionDivergence, type ProductHistory } from "../src/trends/product-signal";

describe("extractAsin", () => {
  it("pulls ASIN from a /dp/ url", () => {
    expect(extractAsin("https://www.amazon.com/dp/B09L7MDNH6")).toBe("B09L7MDNH6");
  });
  it("returns null when no ASIN", () => {
    expect(extractAsin("https://www.amazon.com/gp/bestsellers/beauty/")).toBeNull();
  });
});

describe("isCommodity", () => {
  it("flags commodity titles", () => {
    expect(isCommodity("One Beat 10Ft Extension Cord with Multiple Outlets")).toBe(true);
    expect(isCommodity("Anker Surge Protector Power Strip")).toBe(true);
    expect(isCommodity("Cable Zip Ties 400 Pack")).toBe(true);
  });
  it("does not flag a normal beauty/toy product", () => {
    expect(isCommodity("L'Oreal Paris Telescopic Mascara")).toBe(false);
    expect(isCommodity("LEGO Botanical Collection Orchid")).toBe(false);
  });
});

const hist = (rank: (number | null)[], reviews: (number | null)[] = []): ProductHistory => ({
  asin: "B000",
  region: "north_america",
  category: "Beauty",
  title: "Test",
  isCommodity: false,
  points: rank.map((r, i) => ({
    date: `2026-06-0${i + 1}`,
    rank: r,
    reviewCount: reviews[i] ?? null,
  })),
});

describe("rankDelta", () => {
  it("positive = climbed (older minus newer rank)", () => {
    expect(rankDelta(hist([30, 8]))).toBe(22);
  });
  it("null when <2 ranked points", () => {
    expect(rankDelta(hist([null, 8]))).toBeNull();
    expect(rankDelta(hist([8]))).toBeNull();
  });
});

describe("reviewDelta", () => {
  it("newer minus oldest review count", () => {
    expect(reviewDelta(hist([1, 1], [1000, 1180]))).toBe(180);
  });
  it("null when reviews absent (Phase 1)", () => {
    expect(reviewDelta(hist([1, 1]))).toBeNull();
  });
});

describe("evergreenPenalty", () => {
  it("high & flat rank → strong penalty", () => {
    // 一直 top-10、几乎不动 = 常青
    expect(evergreenPenalty(hist([5, 6, 5, 4]))).toBeGreaterThan(0.5);
  });
  it("commodity flag alone → penalty 1", () => {
    const h = { ...hist([20, 19]), isCommodity: true };
    expect(evergreenPenalty(h)).toBe(1);
  });
  it("moving product → low penalty", () => {
    expect(evergreenPenalty(hist([40, 8]))).toBeLessThan(0.3);
  });
});

describe("crossRegionDivergence", () => {
  it("strong in one region, absent in another → divergence + spreadingTo", () => {
    const r = crossRegionDivergence(
      new Map([
        ["north_america", 3],
        ["europe", null],
      ]),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.spreadingTo).toContain("europe");
  });
  it("present & similar everywhere → ~0 divergence", () => {
    const r = crossRegionDivergence(
      new Map([
        ["north_america", 5],
        ["europe", 6],
      ]),
    );
    expect(r.score).toBeLessThan(0.2);
    expect(r.spreadingTo).toEqual([]);
  });
});
