import { describe, it, expect } from "vitest";
import { normalizeEmail, isValidEmail, newToken } from "../src/email/subscriber-util";

describe("normalizeEmail", () => {
  it("lowercases + trims", () => {
    expect(normalizeEmail("  Joey@Example.COM ")).toBe("joey@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts valid, rejects junk", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("newToken", () => {
  it("url-safe, >=32 chars, unique", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(a).not.toBe(b);
  });
});
