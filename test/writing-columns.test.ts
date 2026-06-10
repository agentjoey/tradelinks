import { describe, it, expect } from "vitest";
import { composeSystemPrompt } from "../src/ai/writing/index.js";
import { dailyBrief } from "../src/ai/writing/columns/daily-brief.js";
import { dailyRoundup } from "../src/ai/writing/columns/daily-roundup.js";
import { moversInsight } from "../src/ai/writing/columns/movers-insight.js";
import type { DailyNoteInput } from "../src/daily/compose.js";

function dailyInput(over: Partial<DailyNoteInput> = {}): DailyNoteInput {
  return {
    date: "2026-06-05", lang: "en",
    alerts: [{ id: "a1", title: "t", summary: "", category: "regulatory", regions: ["europe"], urgencyScore: 4, actionRequired: null, sourceUrl: null }],
    signals: [{ keyword: "k", originRegion: "north_america", spreadingTo: ["southeast_asia"], confidence: 0.7 }],
    radar: [{ kind: "product", title: "p", link: "l" }, { kind: "product", title: "q", link: "m" }],
    recentTitles: [],
    ...over,
  };
}

describe("composeSystemPrompt", () => {
  it("daily-brief carries its angle, the core blocks, the depth bar, and the output shape", () => {
    const sys = composeSystemPrompt(dailyBrief).toLowerCase();
    expect(sys).toMatch(/alert|affected|policy/);
    expect(sys).toContain("analytical depth");
    expect(sys).toMatch(/in conclusion|moreover/);
    expect(sys).toMatch(/thin|honest/);        // depth bar
    expect(sys).toContain("body_markdown");      // output shape
  });

  it("daily-roundup carries the sourcing angle and the moved-in playbook line", () => {
    const sys = composeSystemPrompt(dailyRoundup).toLowerCase();
    expect(sys).toContain("sourc");
    expect(sys).toMatch(/trend|product|viral/);
    expect(sys).toMatch(/lead time|pre-position|margin/); // playbook line moved out of core DEPTH
  });

  it("movers-insight carries the anti-cause grounding and its own output shape", () => {
    const sys = composeSystemPrompt(moversInsight);
    expect(sys).toContain("ANALYTICAL DEPTH");
    expect(sys.toLowerCase()).toMatch(/do not invent the cause|never claim/);
    expect(sys).toContain("what_it_is");
  });
});

describe("column gate configs", () => {
  it("daily-brief requires a high-urgency alert; daily-roundup requires trend/radar", () => {
    expect(dailyBrief.gateConfig.hook(dailyInput())).toBe(true);
    const noUrgent = dailyInput({ alerts: [{ id: "x", title: "t", summary: "", category: "industry", regions: [], urgencyScore: 1, actionRequired: null, sourceUrl: null }] });
    expect(dailyBrief.gateConfig.hook(noUrgent)).toBe(false);
    expect(dailyRoundup.gateConfig.hook(noUrgent)).toBe(true); // has 1 signal + 2 radar
  });
});
