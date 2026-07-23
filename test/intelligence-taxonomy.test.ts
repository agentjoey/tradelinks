import { describe, it, expect } from "vitest";
import {
  SIGNAL_TYPES,
  PRODUCT_CATEGORIES,
  RISK_ATTRIBUTES,
  POLICY_TOPICS,
  READINESS_LEVELS,
  INITIAL_PUBLIC_CATEGORIES,
  SIGNAL_TYPE_LABELS,
  PRODUCT_CATEGORY_LABELS,
  RISK_ATTRIBUTE_LABELS,
  POLICY_TOPIC_LABELS,
  parseProductCategory,
  categorySlug,
  type ProductCategory,
} from "../src/domain/intelligence/taxonomy.js";

describe("intelligence taxonomy", () => {
  it("keeps signal, category, and risk dimensions independent", () => {
    expect(categorySlug("TOYS_CHILDRENS_PRODUCTS")).toBe("toys-childrens-products");
    expect(parseProductCategory("regulatory")).toBeNull();
  });

  it("locks the full signal type set", () => {
    expect(SIGNAL_TYPES).toEqual([
      "REGULATORY",
      "PLATFORM_POLICY",
      "LOGISTICS",
      "DEMAND",
      "INDUSTRY",
      "PRACTICAL_GUIDANCE",
    ]);
  });

  it("locks the eleven stable product categories", () => {
    expect(PRODUCT_CATEGORIES).toEqual([
      "ALL_PRODUCTS",
      "CONSUMER_ELECTRONICS",
      "PET_SUPPLIES",
      "BEAUTY_PERSONAL_CARE",
      "TOYS_CHILDRENS_PRODUCTS",
      "HOME_KITCHEN",
      "APPAREL_ACCESSORIES",
      "HEALTH_SUPPLEMENTS",
      "FOOD_BEVERAGE",
      "SPORTS_OUTDOORS",
      "AUTOMOTIVE_TOOLS",
    ]);
  });

  it("locks the risk attribute set", () => {
    expect(RISK_ATTRIBUTES).toEqual([
      "BATTERY",
      "WIRELESS_RADIO",
      "CHILDREN",
      "INGESTIBLE",
      "TOPICAL_COSMETIC",
      "FOOD_CONTACT",
      "MEDICAL_CLAIM",
      "ANIMAL_HEALTH",
      "CHEMICAL_HAZMAT",
      "TEXTILE_LABELING",
      "ELECTRICAL_SAFETY",
    ]);
  });

  it("locks the six policy topic aggregation tags", () => {
    expect(POLICY_TOPICS).toEqual([
      "IMPORT_CUSTOMS",
      "PRODUCT_SAFETY_RECALLS",
      "LABELING_CLAIMS",
      "FEES_PAYMENTS",
      "PRIVACY_CONSUMER_PROTECTION",
      "LISTING_ACCOUNT_HEALTH",
    ]);
  });

  it("locks the readiness level set", () => {
    expect(READINESS_LEVELS).toEqual([
      "UNAVAILABLE",
      "EXPERIMENTAL",
      "MONITORED",
      "VERIFIED",
      "STALE",
    ]);
  });

  it("exposes the six initial public categories as an explicit subset", () => {
    expect(INITIAL_PUBLIC_CATEGORIES).toEqual([
      "CONSUMER_ELECTRONICS",
      "PET_SUPPLIES",
      "BEAUTY_PERSONAL_CARE",
      "TOYS_CHILDRENS_PRODUCTS",
      "HOME_KITCHEN",
      "APPAREL_ACCESSORIES",
    ]);
    for (const category of INITIAL_PUBLIC_CATEGORIES) {
      expect(PRODUCT_CATEGORIES).toContain(category);
    }
    expect(INITIAL_PUBLIC_CATEGORIES).not.toContain("ALL_PRODUCTS");
  });

  it("labels every taxonomy value exhaustively", () => {
    expect(Object.keys(SIGNAL_TYPE_LABELS).sort()).toEqual([...SIGNAL_TYPES].sort());
    expect(Object.keys(PRODUCT_CATEGORY_LABELS).sort()).toEqual([...PRODUCT_CATEGORIES].sort());
    expect(Object.keys(RISK_ATTRIBUTE_LABELS).sort()).toEqual([...RISK_ATTRIBUTES].sort());
    expect(Object.keys(POLICY_TOPIC_LABELS).sort()).toEqual([...POLICY_TOPICS].sort());
    expect(PRODUCT_CATEGORY_LABELS.TOYS_CHILDRENS_PRODUCTS).toBe("Toys & Children's Products");
    expect(RISK_ATTRIBUTE_LABELS.WIRELESS_RADIO).toBe("Wireless / Radio");
    expect(POLICY_TOPIC_LABELS.IMPORT_CUSTOMS).toBe("Import & Customs");
  });

  it("slugs every product category", () => {
    for (const category of PRODUCT_CATEGORIES) {
      expect(categorySlug(category)).toBe(category.toLowerCase().replace(/_/g, "-"));
    }
    expect(categorySlug("ALL_PRODUCTS")).toBe("all-products");
    expect(categorySlug("BEAUTY_PERSONAL_CARE")).toBe("beauty-personal-care");
  });

  it("parses enum names, slugs, and labels into categories", () => {
    expect(parseProductCategory("HOME_KITCHEN")).toBe("HOME_KITCHEN");
    expect(parseProductCategory("home-kitchen")).toBe("HOME_KITCHEN");
    expect(parseProductCategory("Home & Kitchen")).toBe("HOME_KITCHEN");
  });

  it("returns null for values from other dimensions or unknown strings", () => {
    const nonCategories = [
      "regulatory",
      "REGULATORY",
      "BATTERY",
      "battery",
      "IMPORT_CUSTOMS",
      "Import & Customs",
      "VERIFIED",
      "",
      "electronics",
      "CONSUMER_ELECTRONICS_EXTRA",
    ];
    for (const value of nonCategories) {
      expect(parseProductCategory(value)).toBeNull();
    }
  });

  it("round-trips every category through slug and label parsing", () => {
    for (const category of PRODUCT_CATEGORIES) {
      const parsed: ProductCategory | null = parseProductCategory(categorySlug(category));
      expect(parsed).toBe(category);
      expect(parseProductCategory(PRODUCT_CATEGORY_LABELS[category])).toBe(category);
    }
  });
});
