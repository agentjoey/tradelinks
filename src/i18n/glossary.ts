// src/i18n/glossary.ts
// Cross-border e-commerce terminology, enforced for consistent translations.
// Add terms here over time; keys are the canonical English term.

export const GLOSSARY: Record<string, Record<string, string>> = {
  zh: {
    tariff: "关税",
    customs: "海关",
    marketplace: "平台",
    "regulatory": "法规",
    "compliance": "合规",
    "logistics": "物流",
    "fulfillment": "履约",
    "bestseller": "畅销品",
    "cross-border": "跨境",
    "seller": "卖家",
    "listing": "商品页",
    "suspension": "封号",
    "chargeback": "拒付",
  },
};

/** A deterministic prompt block instructing the model to use fixed translations. */
export function glossaryBlock(lang: string): string {
  const map = GLOSSARY[lang];
  if (!map) return "";
  const lines = Object.entries(map)
    .map(([term, tr]) => `- ${term} → ${tr}`)
    .join("\n");
  return `Use these fixed term translations exactly:\n${lines}`;
}
