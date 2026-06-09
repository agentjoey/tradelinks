import { describe, it, expect } from "vitest";
import { extractAsin, isCommodity, rankDelta, reviewDelta, evergreenPenalty, crossRegionDivergence, trendScoreV1, isTrueNewEntrant, qualifiesAsMover, renderRadarReview, type ProductHistory, type Mover } from "../src/trends/product-signal";

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

describe("trendScoreV1", () => {
  it("climbing non-commodity outscores flat evergreen", () => {
    const climber = trendScoreV1({ history: hist([40, 8]), isNewEntrant: false, cross: { score: 0, spreadingTo: [] } });
    const evergreen = trendScoreV1({ history: hist([5, 5, 5]), isNewEntrant: false, cross: { score: 0, spreadingTo: [] } });
    expect(climber).toBeGreaterThan(evergreen);
  });
  it("new entrant gets novelty credit", () => {
    const s = trendScoreV1({ history: hist([12]), isNewEntrant: true, cross: { score: 0, spreadingTo: [] } });
    expect(s).toBeGreaterThan(0);
  });
});

describe("renderRadarReview", () => {
  it("renders header + per-mover why lines, escapes nothing weird", () => {
    const movers: Mover[] = [
      { asin: "B1", title: "Mascara X", region: "north_america", category: "Beauty", score: 0.8,
        rankDelta: 22, reviewDelta: null, isNewEntrant: false, currentRank: 8, spreadingTo: ["europe"] },
    ];
    const txt = renderRadarReview(movers, "2026-06-09");
    expect(txt).toContain("2026-06-09");
    expect(txt).toContain("Mascara X");
    expect(txt).toContain("+22"); // 排名变化证据
  });
  it("empty → explicit 'no movers' line", () => {
    expect(renderRadarReview([], "2026-06-09")).toContain("无");
  });
});

const ph = (points: { date: string; rank: number | null }[], opts: Partial<ProductHistory> = {}): ProductHistory => ({
  asin: "B000",
  region: "north_america",
  category: "Beauty",
  title: "T",
  isCommodity: false,
  points: points.map((p) => ({ ...p, reviewCount: null })),
  ...opts,
});

describe("isTrueNewEntrant", () => {
  it("true when source has ≥2 days and product only on the latest day", () => {
    expect(isTrueNewEntrant(ph([{ date: "2026-06-09", rank: 5 }]), 2, "2026-06-09")).toBe(true);
  });
  it("false when source has only 1 day (no baseline → can't judge)", () => {
    expect(isTrueNewEntrant(ph([{ date: "2026-06-09", rank: 5 }]), 1, "2026-06-09")).toBe(false);
  });
  it("false for a drop-out (single point on the OLDER day)", () => {
    expect(isTrueNewEntrant(ph([{ date: "2026-06-08", rank: 5 }]), 2, "2026-06-09")).toBe(false);
  });
  it("false when product spans 2 days (not new)", () => {
    expect(isTrueNewEntrant(ph([{ date: "2026-06-08", rank: 8 }, { date: "2026-06-09", rank: 5 }]), 2, "2026-06-09")).toBe(false);
  });
});

describe("qualifiesAsMover", () => {
  const noCross = { score: 0, spreadingTo: [] };
  it("qualifies a climber (rankDelta>0)", () => {
    expect(qualifiesAsMover(ph([{ date: "2026-06-08", rank: 30 }, { date: "2026-06-09", rank: 8 }]), 2, "2026-06-09", noCross)).toBe(true);
  });
  it("excludes a flat product (rankDelta=0, not new)", () => {
    expect(qualifiesAsMover(ph([{ date: "2026-06-08", rank: 5 }, { date: "2026-06-09", rank: 5 }]), 2, "2026-06-09", noCross)).toBe(false);
  });
  it("excludes a single-day product on a 1-day source (the day-1 noise)", () => {
    expect(qualifiesAsMover(ph([{ date: "2026-06-09", rank: 3 }]), 1, "2026-06-09", noCross)).toBe(false);
  });
  it("qualifies a true new entrant (source has a prior day)", () => {
    expect(qualifiesAsMover(ph([{ date: "2026-06-09", rank: 3 }]), 2, "2026-06-09", noCross)).toBe(true);
  });
  it("qualifies on cross-region spread", () => {
    expect(qualifiesAsMover(ph([{ date: "2026-06-09", rank: 3 }]), 1, "2026-06-09", { score: 0.7, spreadingTo: ["europe"] })).toBe(true);
  });
  it("excludes commodity regardless", () => {
    expect(qualifiesAsMover(ph([{ date: "2026-06-08", rank: 30 }, { date: "2026-06-09", rank: 8 }], { isCommodity: true }), 2, "2026-06-09", noCross)).toBe(false);
  });
});
