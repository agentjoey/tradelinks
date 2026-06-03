import { describe, it, expect } from "vitest";
import { buildDigest, renderDigestText } from "../app/lib/digest";
import type { AlertRow } from "../app/lib/alerts";

let n = 0;
function a(p: Partial<AlertRow> & { title: string; category: string; urgencyScore: number }): AlertRow {
  return {
    id: `id${n++}`, summary: "", regions: ["north_america"], platforms: [],
    actionRequired: null, sourceUrls: ["https://x"], publishedAt: new Date(), createdAt: new Date(),
    ...p,
  };
}

const ALERTS: AlertRow[] = [
  a({ title: "de minimis ends Monday", category: "regulatory", urgencyScore: 5 }),
  a({ title: "GPSR responsible person", category: "regulatory", urgencyScore: 4 }),
  a({ title: "Amazon fee tweak", category: "platform_policy", urgencyScore: 3 }),
  a({ title: "Ocean freight up", category: "logistics", urgencyScore: 2 }),
  a({ title: "Hot category: mini fans", category: "trend", urgencyScore: 2 }),
  a({ title: "Photo tips", category: "tip", urgencyScore: 1 }),
];

describe("buildDigest", () => {
  const d = buildDigest(ALERTS, "2026-06-03");

  it("puts high-urgency (≥3) items in topAlerts, sorted desc, max 5", () => {
    expect(d.topAlerts.map((x) => x.urgencyScore)).toEqual([5, 4, 3]);
  });

  it("does not duplicate top alerts into category sections", () => {
    const reg = d.sections.find((s) => s.key === "regulatory");
    // both regulatory items are urgency≥3 → in topAlerts, so section is absent/empty
    expect(reg).toBeUndefined();
  });

  it("includes low-urgency items in their category sections", () => {
    expect(d.sections.find((s) => s.key === "logistics")?.items[0]?.title).toBe("Ocean freight up");
    expect(d.sections.find((s) => s.key === "picks")?.items.some((i) => i.title === "Photo tips")).toBe(true);
  });

  it("omits empty sections", () => {
    expect(d.sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it("lead summarizes top alert", () => {
    expect(d.lead).toContain("de minimis ends Monday");
  });

  it("renders text with sections", () => {
    const txt = renderDigestText(d);
    expect(txt).toContain("TradeLinks Daily — 2026-06-03");
    expect(txt).toContain("🚨 Top Alerts");
    expect(txt).toContain("[5.0] de minimis ends Monday");
  });
});

describe("buildDigest empty", () => {
  it("handles no alerts", () => {
    const d = buildDigest([], "2026-06-03");
    expect(d.lead).toBeNull();
    expect(d.topAlerts).toHaveLength(0);
    expect(d.sections).toHaveLength(0);
  });
});
