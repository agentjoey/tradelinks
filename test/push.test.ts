import { describe, it, expect } from "vitest";
import { renderTelegramText, renderSlackBlocks, approvalKeyboard, type PushAlert } from "../src/push/render.js";

const CRIT: PushAlert = {
  id: "abc123",
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
  it("marks ACT NOW with score + meta", () => {
    expect(t).toContain("🚨 ACT NOW");
    expect(t).toContain("5.0");
    expect(t).toContain("regulatory");
    expect(t).toContain("NA");
  });
  it("includes title, action and first source; escapes HTML", () => {
    expect(t).toContain(CRIT.title);
    expect(t).toContain("➤");
    expect(t).toContain("Recalculate landed cost now.");
    expect(t).toContain("https://x.test/a");
  });
  it("non-urgent uses ⚠️ not 🚨", () => {
    expect(renderTelegramText({ ...CRIT, urgencyScore: 2.5 })).toContain("⚠️");
  });
});

describe("approvalKeyboard", () => {
  it("builds Approve/Reject inline buttons with compact callback_data", () => {
    const kb = approvalKeyboard("abc123") as { inline_keyboard: { text: string; callback_data: string }[][] };
    const btns = kb.inline_keyboard[0]!;
    expect(btns[0]!.callback_data).toBe("a:abc123");
    expect(btns[1]!.callback_data).toBe("r:abc123");
    expect(btns[0]!.callback_data.length).toBeLessThanOrEqual(64);
  });
});

describe("renderSlackBlocks", () => {
  it("produces a blocks payload with title + action + source", () => {
    const flat = JSON.stringify(renderSlackBlocks(CRIT));
    expect(flat).toContain(CRIT.title);
    expect(flat).toContain("Recalculate");
    expect(flat).toContain("source");
  });
});
