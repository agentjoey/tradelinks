// Curated high-signal X accounts (BL-034 — X curated-accounts track). Polled
// daily via the user-timeline endpoint; app-only reads of PUBLIC timelines need
// no following. Handles resolve to user_ids at runtime; unknown/suspended ones
// are skipped. All 18 below verified resolving via scripts/x-accounts-probe.ts
// (2026-06-06). Re-run the probe after edits.
export const X_ACCOUNTS: string[] = [
  // market analysis / retail media
  "juozas", "JungleScout", "ModernRetail", "RetailDive", "2PMinc", "web_smith",
  // viral product / ad-creative signal
  "TrendHunter", "AdSpy",
  // platform official (policy / fees / programs)
  "AmazonNews", "TikTokForBiz", "Shopify", "eBay", "SHEIN_Official", "ShopTemu",
  // logistics
  "freightos", "flexport",
  // DTC / seller community
  "DTCNewsletter", "EcommerceBytes",
];
