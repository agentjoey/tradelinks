/**
 * Phase 1 intelligence taxonomy.
 *
 * Signal Type, Product Category, and Risk Attribute are independent
 * dimensions and must never share one field. Enum values mirror the Data
 * Model Contract in
 * docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md.
 */

export const SIGNAL_TYPES = [
  "REGULATORY",
  "PLATFORM_POLICY",
  "LOGISTICS",
  "DEMAND",
  "INDUSTRY",
  "PRACTICAL_GUIDANCE",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const PRODUCT_CATEGORIES = [
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
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const RISK_ATTRIBUTES = [
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
] as const;
export type RiskAttribute = (typeof RISK_ATTRIBUTES)[number];

export const POLICY_TOPICS = [
  "IMPORT_CUSTOMS",
  "PRODUCT_SAFETY_RECALLS",
  "LABELING_CLAIMS",
  "FEES_PAYMENTS",
  "PRIVACY_CONSUMER_PROTECTION",
  "LISTING_ACCOUNT_HEALTH",
] as const;
export type PolicyTopic = (typeof POLICY_TOPICS)[number];

export const READINESS_LEVELS = [
  "UNAVAILABLE",
  "EXPERIMENTAL",
  "MONITORED",
  "VERIFIED",
  "STALE",
] as const;
export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

/**
 * The six Phase 1 public Category Hubs. The remaining categories exist in
 * the taxonomy but stay private until their coverage reaches Monitored.
 */
export const INITIAL_PUBLIC_CATEGORIES = [
  "CONSUMER_ELECTRONICS",
  "PET_SUPPLIES",
  "BEAUTY_PERSONAL_CARE",
  "TOYS_CHILDRENS_PRODUCTS",
  "HOME_KITCHEN",
  "APPAREL_ACCESSORIES",
] as const satisfies readonly ProductCategory[];

export const SIGNAL_TYPE_LABELS = {
  REGULATORY: "Regulatory",
  PLATFORM_POLICY: "Platform Policy",
  LOGISTICS: "Logistics",
  DEMAND: "Demand",
  INDUSTRY: "Industry",
  PRACTICAL_GUIDANCE: "Practical Guidance",
} as const satisfies Record<SignalType, string>;

export const PRODUCT_CATEGORY_LABELS = {
  ALL_PRODUCTS: "All Products",
  CONSUMER_ELECTRONICS: "Consumer Electronics",
  PET_SUPPLIES: "Pet Supplies",
  BEAUTY_PERSONAL_CARE: "Beauty & Personal Care",
  TOYS_CHILDRENS_PRODUCTS: "Toys & Children's Products",
  HOME_KITCHEN: "Home & Kitchen",
  APPAREL_ACCESSORIES: "Apparel & Accessories",
  HEALTH_SUPPLEMENTS: "Health & Supplements",
  FOOD_BEVERAGE: "Food & Beverage",
  SPORTS_OUTDOORS: "Sports & Outdoors",
  AUTOMOTIVE_TOOLS: "Automotive & Tools",
} as const satisfies Record<ProductCategory, string>;

export const RISK_ATTRIBUTE_LABELS = {
  BATTERY: "Battery",
  WIRELESS_RADIO: "Wireless / Radio",
  CHILDREN: "Children",
  INGESTIBLE: "Ingestible",
  TOPICAL_COSMETIC: "Topical / Cosmetic",
  FOOD_CONTACT: "Food Contact",
  MEDICAL_CLAIM: "Medical Claim",
  ANIMAL_HEALTH: "Animal Health",
  CHEMICAL_HAZMAT: "Chemical / Hazmat",
  TEXTILE_LABELING: "Textile / Labeling",
  ELECTRICAL_SAFETY: "Electrical Safety",
} as const satisfies Record<RiskAttribute, string>;

export const POLICY_TOPIC_LABELS = {
  IMPORT_CUSTOMS: "Import & Customs",
  PRODUCT_SAFETY_RECALLS: "Product Safety & Recalls",
  LABELING_CLAIMS: "Labeling & Claims",
  FEES_PAYMENTS: "Fees & Payments",
  PRIVACY_CONSUMER_PROTECTION: "Privacy & Consumer Protection",
  LISTING_ACCOUNT_HEALTH: "Listing & Account Health",
} as const satisfies Record<PolicyTopic, string>;

export function categorySlug(category: ProductCategory): string {
  return category.toLowerCase().replace(/_/g, "-");
}

/**
 * Parses an enum name, slug, or display label into a ProductCategory.
 * Returns null for values from other dimensions (signal types, risk
 * attributes, policy topics, readiness levels) and unknown strings.
 */
export function parseProductCategory(value: string): ProductCategory | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return null;
  for (const category of PRODUCT_CATEGORIES) {
    if (
      category.toLowerCase() === normalized ||
      categorySlug(category) === normalized ||
      PRODUCT_CATEGORY_LABELS[category].toLowerCase() === normalized
    ) {
      return category;
    }
  }
  return null;
}
