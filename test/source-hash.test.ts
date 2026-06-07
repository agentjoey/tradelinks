import { describe, it, expect } from "vitest";
import { sourceHashOf } from "../src/i18n/translate-content";

describe("sourceHashOf", () => {
  const a = { title: "T", summary: "S", actionRequired: "A" };
  it("is stable for the same fields", () => {
    expect(sourceHashOf(a)).toBe(sourceHashOf({ ...a }));
  });
  it("is key-order independent", () => {
    const b = { actionRequired: "A", summary: "S", title: "T" };
    expect(sourceHashOf(a)).toBe(sourceHashOf(b));
  });
  it("changes when any field changes", () => {
    expect(sourceHashOf(a)).not.toBe(sourceHashOf({ ...a, title: "T2" }));
  });
  it("distinguishes null from empty string", () => {
    expect(sourceHashOf({ title: "T", summary: "S", actionRequired: null }))
      .not.toBe(sourceHashOf({ title: "T", summary: "S", actionRequired: "" }));
  });
  it("returns a hex sha256 string", () => {
    expect(sourceHashOf(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
