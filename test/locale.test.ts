import { describe, it, expect } from "vitest";
import { localeFromPath, stripLocale, addLocale, alternatesFor } from "../app/lib/locale";

describe("localeFromPath", () => {
  it("detects zh for /zh and /zh/*", () => {
    expect(localeFromPath("/zh")).toBe("zh");
    expect(localeFromPath("/zh/wire")).toBe("zh");
  });
  it("defaults to en", () => {
    expect(localeFromPath("/")).toBe("en");
    expect(localeFromPath("/wire")).toBe("en");
  });
  it("does not treat /zhsomething as zh", () => {
    expect(localeFromPath("/zhang")).toBe("en");
  });
});

describe("stripLocale", () => {
  it("removes the zh prefix", () => {
    expect(stripLocale("/zh/wire")).toBe("/wire");
    expect(stripLocale("/zh")).toBe("/");
  });
  it("leaves non-zh paths unchanged", () => {
    expect(stripLocale("/wire")).toBe("/wire");
    expect(stripLocale("/")).toBe("/");
  });
});

describe("addLocale", () => {
  it("prefixes zh, leaves en unprefixed", () => {
    expect(addLocale("/wire", "zh")).toBe("/zh/wire");
    expect(addLocale("/", "zh")).toBe("/zh");
    expect(addLocale("/wire", "en")).toBe("/wire");
    expect(addLocale("/", "en")).toBe("/");
  });
  it("is idempotent against an already-stripped path", () => {
    expect(addLocale(stripLocale("/zh/wire"), "zh")).toBe("/zh/wire");
  });
});

describe("alternatesFor", () => {
  it("builds canonical + hreflang map for a zh path", () => {
    const a = alternatesFor("/zh/wire", "https://x.test");
    expect(a.canonical).toBe("https://x.test/zh/wire");
    expect(a.languages.en).toBe("https://x.test/wire");
    expect(a.languages.zh).toBe("https://x.test/zh/wire");
    expect(a.xDefault).toBe("https://x.test/wire");
  });
  it("builds the same map from the en path", () => {
    const a = alternatesFor("/wire", "https://x.test");
    expect(a.canonical).toBe("https://x.test/wire");
    expect(a.languages.zh).toBe("https://x.test/zh/wire");
  });
});
