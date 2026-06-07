import { describe, it, expect } from "vitest";
import { buildAlertTranslatePrompt, parseAlertTranslation } from "../src/ai/prompts/translate-content";

describe("buildAlertTranslatePrompt", () => {
  it("includes source fields, target lang and the glossary block", () => {
    const opts = buildAlertTranslatePrompt(
      { title: "EU tariff change", summary: "A new customs rule.", actionRequired: "Review listings" },
      "zh",
      "- tariff → 关税",
    );
    expect(opts.json).toBe(true);
    expect(opts.user).toContain("EU tariff change");
    expect(opts.user).toContain("A new customs rule.");
    expect(opts.user).toContain("Review listings");
    expect(opts.system).toContain("zh");
    expect(opts.user).toContain("关税"); // glossary injected
  });
  it("marks actionRequired as null when absent", () => {
    const opts = buildAlertTranslatePrompt(
      { title: "T", summary: "S", actionRequired: null },
      "zh",
      "",
    );
    expect(opts.user).toContain("(none)");
  });
});

describe("parseAlertTranslation", () => {
  it("parses valid JSON", () => {
    const r = parseAlertTranslation('{"title":"标题","summary":"摘要","actionRequired":"行动"}');
    expect(r).toEqual({ title: "标题", summary: "摘要", actionRequired: "行动" });
  });
  it("accepts null actionRequired", () => {
    const r = parseAlertTranslation('{"title":"标题","summary":"摘要","actionRequired":null}');
    expect(r.actionRequired).toBeNull();
  });
  it("throws on missing required field", () => {
    expect(() => parseAlertTranslation('{"summary":"摘要"}')).toThrow();
  });
});
