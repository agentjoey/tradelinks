import { describe, it, expect } from "vitest";
import { applyAlertTranslation } from "../app/lib/i18n-content";
import type { AlertRow } from "../app/lib/alerts";

const base: AlertRow = {
  id: "a1", title: "EN title", summary: "EN summary", urgencyScore: 3,
  regions: [], platforms: [], category: "regulatory", actionRequired: "EN action",
  imageUrl: null, sourceUrls: [], publishedAt: null, createdAt: new Date(),
};

describe("applyAlertTranslation", () => {
  it("overlays zh fields when present", () => {
    const r = applyAlertTranslation(base, { title: "中文标题", summary: "中文摘要", actionRequired: "中文行动" });
    expect(r.title).toBe("中文标题");
    expect(r.summary).toBe("中文摘要");
    expect(r.actionRequired).toBe("中文行动");
  });
  it("falls back to English per-field when a field is missing", () => {
    const r = applyAlertTranslation(base, { title: "中文标题" });
    expect(r.title).toBe("中文标题");
    expect(r.summary).toBe("EN summary");
    expect(r.actionRequired).toBe("EN action");
  });
  it("returns the original alert when there is no translation", () => {
    expect(applyAlertTranslation(base, undefined)).toEqual(base);
  });
  it("does not mutate non-text fields", () => {
    const r = applyAlertTranslation(base, { title: "X" });
    expect(r.id).toBe("a1");
    expect(r.urgencyScore).toBe(3);
  });
});
