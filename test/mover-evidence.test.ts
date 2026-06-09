import { describe, it, expect } from "vitest";
import { buildMoverEvidence } from "../src/movers/evidence";
import type { ProductHistory } from "../src/trends/product-signal";

const h: ProductHistory = {
  asin: "B1", region: "north_america", category: "Beauty", title: "Glow Serum", isCommodity: false,
  points: [
    { date: "2026-06-08", rank: 30, reviewCount: 1000, rating: 4.5, price: 18.9 },
    { date: "2026-06-09", rank: 8, reviewCount: 1200, rating: 4.6, price: 17.9 },
  ],
};

describe("buildMoverEvidence", () => {
  it("extracts rank trajectory + deltas + latest review/rating/price", () => {
    const e = buildMoverEvidence(h, { spreadingTo: ["europe"] });
    expect(e.title).toBe("Glow Serum");
    expect(e.rankDelta).toBe(22);
    expect(e.reviewDelta).toBe(200);
    expect(e.currentRank).toBe(8);
    expect(e.rankTrajectory).toEqual([30, 8]);
    expect(e.rating).toBe(4.6);
    expect(e.price).toBe(17.9);
    expect(e.spreadingTo).toEqual(["europe"]);
    expect(e.daysTracked).toBe(2);
  });
  it("nulls where data is thin (single day)", () => {
    const e = buildMoverEvidence(
      { ...h, points: [{ date: "2026-06-09", rank: 5, reviewCount: null }] },
      { spreadingTo: [] },
    );
    expect(e.rankDelta).toBeNull();
    expect(e.reviewDelta).toBeNull();
    expect(e.rating).toBeNull();
    expect(e.isNewEntrant).toBe(true);
  });
});
