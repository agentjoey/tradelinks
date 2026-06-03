import { describe, it, expect } from "vitest";
import { renderTelegramText, renderSlackBlocks, type PushAlert } from "../src/push/render.js";

const CRIT: PushAlert = {
  title: "US de minimis exemption ends Monday",
  summary: "Duties now apply to all parcels.",
  urgencyScore: 5,
  category: "regulatory",
  regions: ["north_america"],
  actionRequired: "Recalculate landed cost now.",
  sourceUrls: ["https://x.test/a", "https://x.test/b"],
};

describe("renderTelegramText", () => {
  const t = renderTelegramText(CRIT);
  it("marks urgent with score, category, region", () => {
    expect(t).toContain("🚨 URGENT");
    expect(t).toContain("[5.0]");
    expect(t).toContain("regulatory");
    expect(t).toContain("NA");
  });
  it("includes title, action and first source", () => {
    expect(t).toContain(CRIT.title);
    expect(t).toContain("→ Recalculate landed cost now.");
    expect(t).toContain("https://x.test/a");
  });
  it("non-urgent uses ⚠️ not 🚨", () => {
    expect(renderTelegramText({ ...CRIT, urgencyScore: 2.5 })).toContain("⚠️");
  });
});

describe("renderSlackBlocks", () => {
  it("produces a blocks payload with title + action + source", () => {
    const p = renderSlackBlocks(CRIT) as { blocks: { type: string; text?: { text: string } }[] };
    expect(Array.isArray(p.blocks)).toBe(true);
    const flat = JSON.stringify(p);
    expect(flat).toContain(CRIT.title);
    expect(flat).toContain("Recalculate");
    expect(flat).toContain("source");
  });
});
