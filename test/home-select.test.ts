import { describe, it, expect } from "vitest";
import { cardMode, pickBreaking, topAlerts, pickHero, buildLatest } from "../app/lib/home";
import type { AlertRow } from "../app/lib/alerts";

const H = 3_600_000;
const NOW = Date.UTC(2026, 5, 7, 12, 0, 0);

function a(p: Partial<AlertRow> & { id: string }): AlertRow {
  return {
    id: p.id, title: p.title ?? p.id, summary: "", urgencyScore: p.urgencyScore ?? 1,
    regions: [], platforms: [], category: "regulatory", actionRequired: null,
    imageUrl: p.imageUrl ?? null, sourceUrls: p.sourceUrls ?? [], publishedAt: p.publishedAt ?? null,
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

describe("pickHero", () => {
  it("prefers an alert with an image over a higher-urgency one without", () => {
    const items = [
      a({ id: "noimg", urgencyScore: 5, createdAt: new Date(NOW - 1 * H) }),
      a({ id: "img", urgencyScore: 3, imageUrl: "http://x/i.jpg", createdAt: new Date(NOW - 2 * H) }),
    ];
    expect(pickHero(items, NOW)?.id).toBe("img");
  });
  it("among same image-state, urgency desc then recency; ignores out-of-window; []→null", () => {
    const img = (id: string, u: number, hoursAgo: number) =>
      a({ id, urgencyScore: u, imageUrl: "http://x/i.jpg", createdAt: new Date(NOW - hoursAgo * H) });
    const items = [img("a", 2, 3), img("b", 5, 10), img("c", 5, 1), img("stale", 9, 100)];
    expect(pickHero(items, NOW)?.id).toBe("c");
    expect(pickHero([], NOW)).toBeNull();
  });
  it("is not limited to urgency>=4 (high-scored news, not only alerts)", () => {
    expect(pickHero([a({ id: "low", urgencyScore: 2 })], NOW)?.id).toBe("low");
  });
});

describe("buildLatest", () => {
  const viral = [{ product: "Neck fan", link: "http://x/p", likes: 9, createdAt: new Date(NOW - 2 * H), author: "@s" }] as never[];
  const topics = [{ headline: "De-minimis leak", link: "http://x/t", createdAt: new Date(NOW - 1 * H), author: "@cbecpulse" }] as never[];
  const alerts = [a({ id: "w", title: "Red Sea reroute", urgencyScore: 4, sourceUrls: ["http://x/w"], createdAt: new Date(NOW - 3 * H) })];

  it("merges all three sources, tags kind, sorts by time desc", () => {
    const out = buildLatest(alerts, viral, topics, 8);
    expect(out.map((i) => i.kind)).toEqual(["x", "radar", "wire"]);
    expect(out[0]?.title).toBe("De-minimis leak");
    expect(out[2]?.href).toBe("http://x/w");
  });
  it("respects take n and handles empty inputs", () => {
    expect(buildLatest(alerts, viral, topics, 2).length).toBe(2);
    expect(buildLatest([], [], [], 8)).toEqual([]);
  });
});
