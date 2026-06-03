// Seed keyword watchlist for Google Trends ingestion (Sprint 004 T1).
// Cross-border-relevant consumer product terms; tracked per region over time.
// Keep ~12 to stay within pytrends rate limits (5/req, ≤5/min).

import type { Region } from "./sources.js";

export const TREND_KEYWORDS: string[] = [
  "portable blender",
  "neck fan",
  "led strip lights",
  "phone case",
  "smart water bottle",
  "car vacuum",
  "posture corrector",
  "mini projector",
  "resistance bands",
  "electric scooter",
  "air fryer",
  "sunscreen stick",
];

// Regions we pull Google Trends for, mapped to Google geo codes (one anchor
// country per region for v1; multi-country averaging is a later enhancement).
export const REGION_GEO: { region: Region; geo: string }[] = [
  { region: "north_america", geo: "US" },
  { region: "europe", geo: "GB" },
  { region: "southeast_asia", geo: "ID" },
  { region: "middle_east", geo: "AE" },
  { region: "latin_america", geo: "BR" },
  { region: "australia_nz", geo: "AU" },
];

// "Mature" markets lead; "emerging" markets lag — used by diffusion to decide
// origin vs. spreading-to direction.
export const MATURE_REGIONS: Region[] = ["north_america", "europe", "australia_nz"];
export const EMERGING_REGIONS: Region[] = ["southeast_asia", "middle_east", "latin_america"];
