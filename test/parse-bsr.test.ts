import { describe, it, expect } from "vitest";
import { parseReviewCount, parsePrice, parseRating } from "../src/trends/parse-bsr";

describe("parseReviewCount", () => {
  it("strips commas / words", () => {
    expect(parseReviewCount("1,234")).toBe(1234);
    expect(parseReviewCount("12,345 ratings")).toBe(12345);
    expect(parseReviewCount("(8,901)")).toBe(8901);
  });
  it("null on junk", () => {
    expect(parseReviewCount(null)).toBeNull();
    expect(parseReviewCount("no reviews")).toBeNull();
  });
});

describe("parsePrice", () => {
  it("pulls the number from common formats", () => {
    expect(parsePrice("$12.99")).toBe(12.99);
    expect(parsePrice("$1,299.00")).toBe(1299);
    expect(parsePrice("£8.50")).toBe(8.5);
  });
  it("null on junk", () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});

describe("parseRating", () => {
  it("pulls the leading decimal", () => {
    expect(parseRating("4.5 out of 5 stars")).toBe(4.5);
    expect(parseRating("4 out of 5")).toBe(4);
  });
  it("null on junk", () => {
    expect(parseRating(null)).toBeNull();
    expect(parseRating("stars")).toBeNull();
  });
});
