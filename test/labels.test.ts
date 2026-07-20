import { describe, expect, it } from "vitest";
import { CAT_LABEL, REGION_LABEL, REGION_NAME } from "../app/lib/labels";

describe("labels single source", () => {
  it("REGION_LABEL covers all 6 regions with short codes", () => {
    expect(Object.keys(REGION_LABEL).sort()).toEqual(
      ["australia_nz", "europe", "latin_america", "middle_east", "north_america", "southeast_asia"].sort(),
    );
    expect(REGION_LABEL.north_america).toBe("NA");
    expect(REGION_LABEL.latin_america).toBe("LATAM");
  });
  it("REGION_NAME has full names for filters", () => {
    expect(REGION_NAME.north_america).toBe("North America");
    expect(REGION_NAME.europe).toBe("Europe");
  });
  it("CAT_LABEL maps categories to short codes", () => {
    expect(CAT_LABEL.regulatory).toBe("REGULATORY");
    expect(CAT_LABEL.platform_policy).toBe("PLATFORM");
    expect(CAT_LABEL.logistics).toBe("LOGISTICS");
  });
});
