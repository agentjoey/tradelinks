import { describe, it, expect } from "vitest";
import { selfCheckRubric } from "../src/ai/writing/self-check.js";
import { BANNED_PHRASES } from "../src/ai/writing/core.js";

describe("selfCheckRubric", () => {
  const rubric = selfCheckRubric();

  it("covers truth-check (JOB 1) and voice/de-AI (JOB 2)", () => {
    const r = rubric.toLowerCase();
    expect(r).toContain("fact");
    expect(r).toMatch(/fact|ground|unsupported/);
    expect(r).toMatch(/voice|cliché|human|ai-/);
  });

  it("reuses the banned phrases from core (no second copy)", () => {
    for (const p of BANNED_PHRASES) expect(rubric).toContain(p);
  });

  it("asks for the unchanged JSON contract including removed_claims", () => {
    expect(rubric).toContain("removed_claims");
    expect(rubric).toContain("body_markdown");
  });
});
