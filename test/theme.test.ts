import { describe, expect, it } from "vitest";
import { parseTheme, THEME_COOKIE } from "../app/lib/theme";

describe("parseTheme", () => {
  it("defaults to dark for undefined/null", () => {
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
  });
  it("returns light only for exact 'light'", () => {
    expect(parseTheme("light")).toBe("light");
  });
  it("falls back to dark for garbage", () => {
    expect(parseTheme("DARK")).toBe("dark");
    expect(parseTheme("blue")).toBe("dark");
    expect(parseTheme("")).toBe("dark");
  });
  it("uses the documented cookie name", () => {
    expect(THEME_COOKIE).toBe("tl-theme");
  });
});
