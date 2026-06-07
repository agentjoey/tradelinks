import { describe, it, expect } from "vitest";
import { glossaryBlock, GLOSSARY } from "../src/i18n/glossary";

describe("glossaryBlock", () => {
  it("renders the zh term map as a deterministic prompt block", () => {
    const block = glossaryBlock("zh");
    expect(block).toContain("tariff");
    expect(block).toContain("关税");
    expect(block).toContain("marketplace");
    // every glossary entry appears as a "term -> translation" line
    for (const [term, tr] of Object.entries(GLOSSARY.zh ?? {})) {
      expect(block).toContain(`${term} → ${tr}`);
    }
  });
  it("is stable across calls", () => {
    expect(glossaryBlock("zh")).toBe(glossaryBlock("zh"));
  });
  it("returns an empty block for a lang with no glossary", () => {
    expect(glossaryBlock("en")).toBe("");
  });
});
