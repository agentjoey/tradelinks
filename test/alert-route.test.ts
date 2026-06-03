import { describe, it, expect } from "vitest";
import { routeAlertStatus, pushTier } from "../src/alerts/route.js";

describe("routeAlertStatus", () => {
  it("≥4 → pending_review (needs human sign-off)", () => {
    expect(routeAlertStatus(5)).toBe("pending_review");
    expect(routeAlertStatus(4)).toBe("pending_review");
    expect(routeAlertStatus(4.0)).toBe("pending_review");
  });
  it("<4 → published", () => {
    expect(routeAlertStatus(3.9)).toBe("published");
    expect(routeAlertStatus(2)).toBe("published");
    expect(routeAlertStatus(0)).toBe("published");
  });
});

describe("pushTier", () => {
  it("buckets by urgency", () => {
    expect(pushTier(5)).toBe("immediate");
    expect(pushTier(4)).toBe("immediate");
    expect(pushTier(3)).toBe("digest");
    expect(pushTier(2)).toBe("digest");
    expect(pushTier(1.9)).toBe("web_only");
    expect(pushTier(0)).toBe("web_only");
  });
});
