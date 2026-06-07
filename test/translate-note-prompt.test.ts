// test/translate-note-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildNoteTranslatePrompt, parseNoteTranslation } from "../src/ai/prompts/translate-note";

const en = {
  title: "EU tightens marketplace rules",
  dek: "What sellers must do now",
  bodyMarkdown: "## Heading\n\nA paragraph about tariff changes.\n\n- bullet one\n- bullet two",
  keyTakeaways: ["Check listings", "Review customs"],
  metaDescription: "EU marketplace rule changes and seller actions.",
};

describe("buildNoteTranslatePrompt", () => {
  it("includes all source fields, target lang and the glossary", () => {
    const opts = buildNoteTranslatePrompt(en, "zh", "- tariff → 关税");
    expect(opts.json).toBe(true);
    expect(opts.user).toContain("EU tightens marketplace rules");
    expect(opts.user).toContain("## Heading");
    expect(opts.user).toContain("Check listings");
    expect(opts.system).toContain("zh");
    expect(opts.user).toContain("关税");
  });
  it("instructs preserving markdown structure", () => {
    const opts = buildNoteTranslatePrompt(en, "zh", "");
    expect(opts.system?.toLowerCase() ?? "").toContain("markdown");
  });
});

describe("parseNoteTranslation", () => {
  it("parses valid JSON into camelCase fields", () => {
    const r = parseNoteTranslation(
      '{"title":"标题","dek":"副标","body_markdown":"## 标题\\n\\n正文","key_takeaways":["要点一"],"meta_description":"描述"}',
    );
    expect(r).toEqual({
      title: "标题", dek: "副标", bodyMarkdown: "## 标题\n\n正文",
      keyTakeaways: ["要点一"], metaDescription: "描述",
    });
  });
  it("defaults optional fields", () => {
    const r = parseNoteTranslation('{"title":"标题","body_markdown":"正文"}');
    expect(r.dek).toBe("");
    expect(r.keyTakeaways).toEqual([]);
    expect(r.metaDescription).toBe("");
  });
  it("throws when title or body is missing", () => {
    expect(() => parseNoteTranslation('{"dek":"x"}')).toThrow();
  });
});
