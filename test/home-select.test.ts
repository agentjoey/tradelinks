import { describe, it, expect } from "vitest";
import { cardMode, pickBreaking, topAlerts } from "../app/lib/home";
import type { AlertRow } from "../app/lib/alerts";

const H = 3_600_000;
const NOW = Date.UTC(2026, 5, 7, 12, 0, 0);

function a(p: Partial<AlertRow> & { id: string }): AlertRow {
  return {
    id: p.id, title: p.title ?? p.id, summary: "", urgencyScore: p.urgencyScore ?? 1,
    regions: [], platforms: [], category: "regulatory", actionRequired: null,
    imageUrl: p.imageUrl ?? null, sourceUrls: [], publishedAt: p.publishedAt ?? null,
    createdAt: p.createdAt ?? new Date(NOW),
  };
}

describe("cardMode", () => {
  it("image when imageUrl present, compact otherwise", () => {
    expect(cardMode({ imageUrl: "http://x/i.jpg" })).toBe("image");
    expect(cardMode({ imageUrl: null })).toBe("compact");
    expect(cardMode({ imageUrl: "  " })).toBe("compact");
  });
});

describe("pickBreaking", () => {
  it("returns highest urgency>=4 within 24h, else null", () => {
    const within = new Date(NOW - 2 * H);
    const items = [
      a({ id: "old", urgencyScore: 5, createdAt: new Date(NOW - 30 * H) }),
      a({ id: "low", urgencyScore: 3, createdAt: within }),
      a({ id: "hit", urgencyScore: 4.2, createdAt: within }),
      a({ id: "hot", urgencyScore: 4.9, createdAt: new Date(NOW - 1 * H) }),
    ];
    expect(pickBreaking(items, NOW)?.id).toBe("hot");
    expect(pickBreaking([a({ id: "x", urgencyScore: 2 })], NOW)).toBeNull();
  });
});

describe("topAlerts", () => {
  it("sorts by urgency desc then recency, drops excludeId, caps at n", () => {
    const items = [
      a({ id: "a", urgencyScore: 2, createdAt: new Date(NOW - 5 * H) }),
      a({ id: "b", urgencyScore: 5, createdAt: new Date(NOW - 9 * H) }),
      a({ id: "c", urgencyScore: 5, createdAt: new Date(NOW - 1 * H) }),
      a({ id: "d", urgencyScore: 4, createdAt: new Date(NOW) }),
    ];
    expect(topAlerts(items, 2, "c").map((x) => x.id)).toEqual(["b", "d"]);
  });
});
