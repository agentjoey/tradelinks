/** Single source of truth for region/category labels (was copied ×5). */

export const CAT_LABEL: Record<string, string> = {
  regulatory: "REGULATORY", platform_policy: "PLATFORM", logistics: "LOGISTICS",
  trend: "TREND", industry: "INDUSTRY", tip: "TIP",
};

/** Short codes — cards, rails, boards. */
export const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LATAM", australia_nz: "ANZ",
};

/** Full names — filter chips. */
export const REGION_NAME: Record<string, string> = {
  north_america: "North America", europe: "Europe", southeast_asia: "SE Asia",
  middle_east: "Middle East", latin_america: "LatAm", australia_nz: "ANZ",
};
