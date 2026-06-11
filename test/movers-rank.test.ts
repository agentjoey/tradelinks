import { describe, it, expect } from "vitest";
import { rankMovers } from "../src/trends/movers.js";
import type { ProductHistory } from "../src/trends/product-signal.js";

const histories: ProductHistory[] = [
  {
    asin: "B-CLIMB", title: "Glow Serum", region: "north_america", category: "Beauty",
    isCommodity: false,
    points: [
      { date: "2026-06-08", rank: 30, reviewCount: 1000, rating: 4.5, price: 18.9 },
      { date: "2026-06-09", rank: 8, reviewCount: 1200, rating: 4.6, price: 18.9 },
    ],
  },
  {
    asin: "B-FLAT", title: "USB Cable 6ft", region: "north_america", category: "Beauty",
    isCommodity: false,
    points: [
      { date: "2026-06-08", rank: 5, reviewCount: 90000, rating: 4.4, price: 6.99 },
      { date: "2026-06-09", rank: 5, reviewCount: 90010, rating: 4.4, price: 6.99 },
    ],
  },
];

describe("rankMovers", () => {
  it("returns {mover, evidence} pairs for qualifying movers, sorted by score desc", () => {
    const out = rankMovers(histories);
    expect(out.length).toBeGreaterThanOrEqual(1);
    const climber = out.find((x) => x.mover.asin === "B-CLIMB");
    expect(climber).toBeDefined();
    expect(climber!.mover.rankDelta).toBe(22);
    expect(climber!.mover.currentRank).toBe(8);
    expect(climber!.evidence.asin).toBe("B-CLIMB");
    expect(climber!.evidence.rankTrajectory).toEqual([30, 8]);
    expect(climber!.evidence.reviewDelta).toBe(200);
  });

  it("excludes the flat commodity", () => {
    const out = rankMovers(histories);
    expect(out.find((x) => x.mover.asin === "B-FLAT")).toBeUndefined();
  });

  it("is sorted by score descending", () => {
    const out = rankMovers(histories);
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.mover.score).toBeGreaterThanOrEqual(out[i]!.mover.score);
  });
});
