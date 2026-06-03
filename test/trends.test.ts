import { describe, it, expect } from "vitest";
import { scoreSeries } from "../src/trends/score.js";
import { detectDiffusion, risingKeywords, type RegionPoint } from "../src/trends/diffusion.js";

describe("scoreSeries", () => {
  it("rising series → positive slope + strength", () => {
    const series = Array.from({ length: 48 }, (_, i) => i); // 0..47 climbing
    const s = scoreSeries(series);
    expect(s.slope).toBeGreaterThan(0);
    expect(s.level).toBeGreaterThan(0);
    expect(s.signalStrength).toBeGreaterThan(0);
  });
  it("falling series → negative slope, zero strength", () => {
    const series = Array.from({ length: 48 }, (_, i) => 47 - i); // 47..0
    const s = scoreSeries(series);
    expect(s.slope).toBeLessThan(0);
    expect(s.signalStrength).toBeLessThanOrEqual(0.4); // only heat contributes
  });
  it("flat-high series → high level, ~0 slope", () => {
    const s = scoreSeries(Array(48).fill(80));
    expect(s.level).toBe(80);
    expect(s.slope).toBe(0);
  });
  it("empty series → zeros", () => {
    expect(scoreSeries([])).toEqual({ level: 0, slope: 0, signalStrength: 0 });
  });
});

function pt(region: RegionPoint["region"], level: number, slope: number, ss: number): RegionPoint {
  return { region, level, slope, signalStrength: ss };
}

describe("detectDiffusion", () => {
  it("flags mature-hot → emerging-lagging diffusion", () => {
    const sig = detectDiffusion("neck fan", [
      pt("north_america", 78, 22, 0.85),
      pt("europe", 60, 10, 0.6),
      pt("southeast_asia", 20, 3, 0.2),
      pt("middle_east", 15, 1, 0.15),
    ]);
    expect(sig).not.toBeNull();
    expect(sig!.originRegion).toBe("north_america");
    expect(sig!.spreadingTo).toEqual(expect.arrayContaining(["southeast_asia", "middle_east"]));
    expect(sig!.confidence).toBeGreaterThan(0);
  });

  it("no signal when origin not hot enough", () => {
    const sig = detectDiffusion("phone case", [
      pt("north_america", 30, 5, 0.3),
      pt("southeast_asia", 10, 0, 0.1),
    ]);
    expect(sig).toBeNull();
  });

  it("no signal when no region lags by the gap", () => {
    const sig = detectDiffusion("air fryer", [
      pt("north_america", 70, 10, 0.7),
      pt("europe", 68, 8, 0.68),
    ]);
    expect(sig).toBeNull();
  });

  it("emerging-only hot does not become an origin (mature leads)", () => {
    const sig = detectDiffusion("x", [
      pt("southeast_asia", 80, 20, 0.9),
      pt("north_america", 10, 0, 0.1),
    ]);
    expect(sig).toBeNull();
  });
});

describe("risingKeywords", () => {
  it("returns rising, sorted by strength", () => {
    const out = risingKeywords([
      { keyword: "a", region: "north_america", score: { level: 70, slope: 20, signalStrength: 0.8 } },
      { keyword: "b", region: "europe", score: { level: 50, slope: 10, signalStrength: 0.5 } },
      { keyword: "c", region: "europe", score: { level: 90, slope: -5, signalStrength: 0.3 } }, // falling
    ]);
    expect(out.map((o) => o.keyword)).toEqual(["a", "b"]);
  });
});
