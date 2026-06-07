import { describe, it, expect } from "vitest";
import { isGoogleNewsUrl, parseBatchExecuteUrl } from "../src/lib/gnews";

describe("isGoogleNewsUrl", () => {
  it("matches news.google.com article/redirect links only", () => {
    expect(isGoogleNewsUrl("https://news.google.com/rss/articles/CBMiABC?oc=5")).toBe(true);
    expect(isGoogleNewsUrl("https://www.practicalecommerce.com/foo")).toBe(false);
    expect(isGoogleNewsUrl("https://finance.yahoo.com/news/x.html")).toBe(false);
    expect(isGoogleNewsUrl("not a url")).toBe(false);
  });
});

describe("parseBatchExecuteUrl", () => {
  it("extracts the real article URL from a batchexecute response", () => {
    const inner = JSON.stringify(["garturlres", "https://example.com/real-article", null]);
    const body = JSON.stringify([["wrb.fr", "Fbv4je", inner, null, null, null, "generic"]]);
    const text = ")]}'\n\n" + body;
    expect(parseBatchExecuteUrl(text)).toBe("https://example.com/real-article");
  });
  it("returns null on malformed / non-http payloads", () => {
    expect(parseBatchExecuteUrl("")).toBeNull();
    expect(parseBatchExecuteUrl(")]}'\n\n[[\"wrb.fr\"]]")).toBeNull();
    const noHttp = ")]}'\n\n" + JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", "ftp://x"]), null]]);
    expect(parseBatchExecuteUrl(noHttp)).toBeNull();
  });
});
