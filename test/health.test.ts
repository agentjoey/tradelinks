import { describe, it, expect } from "vitest";
import { scoreSource, expectedIntervalMin, type SourceMetrics } from "../src/monitoring/health.js";

const NOW = new Date("2026-06-05T12:00:00Z").getTime();
const mins = (n: number) => new Date(NOW - n * 60000);

function base(over: Partial<SourceMetrics> = {}): SourceMetrics {
  return {
    id: "X01", name: "Test", adapter: "rss", category: "industry",
    enabled: true, isBestseller: false,
    frequencyCron: "0 */12 * * *", expectedIntervalMin: 720,
    consecutiveFailures: 0,
    lastOkAt: mins(60), lastCrawledAt: mins(60), lastItemAt: mins(60),
    items24h: 5, items7d: 30, scored7d: 24, avgUrgency: 3.2,
    ...over,
  };
}

describe("scoreSource", () => {
  it("a fresh, producing, well-scored source is healthy", () => {
    const h = scoreSource(base(), NOW);
    expect(h.tier).toBe("healthy");
    expect(h.score).toBeGreaterThanOrEqual(85);
  });

  it("flags an active source with 0 items over many cycles as SILENT (the F01/A01 bug)", () => {
    const h = scoreSource(base({ items24h: 0, items7d: 0, scored7d: 0, avgUrgency: null }), NOW);
    expect(h.tier).toBe("silent");
    expect(h.sub.productivity).toBe(0);
    expect(h.reasons.join(" ")).toMatch(/silent/i);
  });

  it("does NOT mark a low-frequency source silent when it had <2 cycles in 7d", () => {
    // quarterly-ish: interval larger than 7d/2 → 0 items is 'insufficient data', not silent
    const h = scoreSource(base({ expectedIntervalMin: 7 * 24 * 60, items24h: 0, items7d: 0, scored7d: 0 }), NOW);
    expect(h.tier).not.toBe("silent");
  });

  it("zeroes reachability after 3+ consecutive failures", () => {
    const h = scoreSource(base({ consecutiveFailures: 4 }), NOW);
    expect(h.sub.reach).toBe(0);
    expect(h.tier === "unhealthy" || h.tier === "degraded").toBe(true);
  });

  it("disabled sources are reported as disabled, score 0", () => {
    const h = scoreSource(base({ enabled: false }), NOW);
    expect(h.tier).toBe("disabled");
    expect(h.score).toBe(0);
  });

  it("bestseller sources get full quality for producing (they bypass AI)", () => {
    const h = scoreSource(base({ isBestseller: true, scored7d: 0, avgUrgency: null, items7d: 300 }), NOW);
    expect(h.sub.quality).toBe(20);
  });

  it("penalizes a noisy source where the AI filters most items", () => {
    const good = scoreSource(base({ items7d: 100, scored7d: 80 }), NOW).sub.quality;
    const noisy = scoreSource(base({ items7d: 100, scored7d: 5 }), NOW).sub.quality;
    expect(noisy).toBeLessThan(good);
  });
});

describe("expectedIntervalMin", () => {
  it("derives ~12h from a 12-hourly cron", () => {
    expect(expectedIntervalMin("0 */12 * * *")).toBe(720);
  });
  it("derives ~1h from an hourly cron", () => {
    expect(expectedIntervalMin("0 * * * *")).toBe(60);
  });
});
