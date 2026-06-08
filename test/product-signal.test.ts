import { describe, it, expect } from "vitest";
import { extractAsin, isCommodity } from "../src/trends/product-signal";

describe("extractAsin", () => {
  it("pulls ASIN from a /dp/ url", () => {
    expect(extractAsin("https://www.amazon.com/dp/B09L7MDNH6")).toBe("B09L7MDNH6");
  });
  it("returns null when no ASIN", () => {
    expect(extractAsin("https://www.amazon.com/gp/bestsellers/beauty/")).toBeNull();
  });
});

describe("isCommodity", () => {
  it("flags commodity titles", () => {
    expect(isCommodity("One Beat 10Ft Extension Cord with Multiple Outlets")).toBe(true);
    expect(isCommodity("Anker Surge Protector Power Strip")).toBe(true);
    expect(isCommodity("Cable Zip Ties 400 Pack")).toBe(true);
  });
  it("does not flag a normal beauty/toy product", () => {
    expect(isCommodity("L'Oreal Paris Telescopic Mascara")).toBe(false);
    expect(isCommodity("LEGO Botanical Collection Orchid")).toBe(false);
  });
});
