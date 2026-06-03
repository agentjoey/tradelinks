import { describe, it, expect } from "vitest";
import { parseFederalRegister, parseReddit } from "../src/adapters/json.js";

describe("parseFederalRegister", () => {
  const json = {
    results: [
      { title: "Raw Honey From Brazil: AD Duty", html_url: "https://fr.gov/doc/1", publication_date: "2026-06-03", abstract: "Final results." },
      { title: "No url", publication_date: "2026-06-02" }, // skipped (no html_url)
    ],
  };
  it("maps results to RawItem[] and skips entries without url", () => {
    const items = parseFederalRegister(json);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ url: "https://fr.gov/doc/1", title: "Raw Honey From Brazil: AD Duty", lang: "en" });
    expect(items[0]?.publishedAt).toBe("2026-06-03T00:00:00.000Z");
  });
  it("handles empty/missing results", () => {
    expect(parseFederalRegister({})).toEqual([]);
    expect(parseFederalRegister(null)).toEqual([]);
  });
});

describe("parseReddit", () => {
  const json = {
    data: {
      children: [
        { data: { title: "FBA fee change", permalink: "/r/x/comments/1/abc/", created_utc: 1780000000, selftext: "body", score: 42 } },
        { data: { title: "no permalink" } }, // skipped
      ],
    },
  };
  it("maps children to RawItem[] with absolute reddit url", () => {
    const items = parseReddit(json);
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://www.reddit.com/r/x/comments/1/abc/");
    expect(items[0]?.title).toBe("FBA fee change");
    expect(items[0]?.publishedAt).toBeDefined();
  });
  it("handles empty", () => {
    expect(parseReddit({})).toEqual([]);
  });
});
