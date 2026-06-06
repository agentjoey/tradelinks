import { describe, it, expect } from "vitest";
import { renderChannelAlert, renderChannelProduct, type ChannelAlert, type ChannelProduct } from "../src/push/channel-render.js";

const ALERT: ChannelAlert = {
  title: "US de minimis exemption ends Monday",
  summary: "Duties now apply to all parcels under $800 entering the US.",
  urgencyScore: 5,
  category: "regulatory",
  regions: ["north_america"],
  actionRequired: "Recalculate landed cost now.",
  sourceUrls: ["https://www.cbp.gov/newsroom"],
};

const ALERT_MEDIUM: ChannelAlert = {
  title: "Amazon raises EU FBA fees",
  summary: "Fulfillment fees increase 3% starting next quarter.",
  urgencyScore: 3,
  category: "platform_policy",
  regions: ["europe"],
  actionRequired: null,
  sourceUrls: ["https://sellercentral.amazon.com/announcements"],
};

const ALERT_LOW: ChannelAlert = {
  title: "Shipping tip: consolidate LCL shipments",
  summary: "Grouping smaller loads can reduce per-unit cost by 15-20%.",
  urgencyScore: 1,
  category: "tip",
  regions: ["southeast_asia", "north_america"],
  sourceUrls: [],
};

const BESTSELLER: ChannelProduct = {
  title: "Portable neck fan, bladeless",
  kind: "bestseller",
  platform: "Amazon",
  rank: 1,
  region: "north_america",
  url: "https://amazon.com/dp/B0XXXXXXX",
};

const VIRAL: ChannelProduct = {
  title: "Mini blender USB-C rechargeable",
  kind: "viral",
  platform: "X",
  likes: 18200,
  url: "https://x.com/i/web/status/123",
};

describe("renderChannelAlert (public channel format)", () => {
  it("uses 🚨 for urgency ≥4 with bold title", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).toContain("🚨");
    expect(t).toContain("<b>US de minimis exemption ends Monday</b>");
  });

  it("uses ⚠️ for urgency 2–3", () => {
    const t = renderChannelAlert(ALERT_MEDIUM);
    expect(t).toContain("⚠️");
    expect(t).not.toContain("🚨");
  });

  it("uses 🔹 for urgency <2", () => {
    const t = renderChannelAlert(ALERT_LOW);
    expect(t).toContain("🔹");
    expect(t).not.toContain("🚨");
    expect(t).not.toContain("⚠️");
  });

  it("renders category + region meta line in italics", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).toContain("<i>Regulation · NA</i>");
  });

  it("renders category label for platform_policy", () => {
    const t = renderChannelAlert(ALERT_MEDIUM);
    expect(t).toContain("<i>Platform · EU</i>");
  });

  it("renders multiple regions comma-joined", () => {
    const t = renderChannelAlert(ALERT_LOW);
    expect(t).toContain("<i>Tip · SEA/NA</i>");
  });

  it("includes summary (trimmed if needed)", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).toContain("Duties now apply");
  });

  it("includes actionRequired as bold ➤ line when present", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).toContain("➤ <b>Recalculate landed cost now.</b>");
  });

  it("omits actionRequired line when null", () => {
    const t = renderChannelAlert(ALERT_MEDIUM);
    expect(t).not.toContain("➤");
  });

  it("includes source hostname as link when sources exist", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).toContain("🔗 www.cbp.gov");
  });

  it("omits source link when no sources", () => {
    const t = renderChannelAlert(ALERT_LOW);
    expect(t).not.toContain("🔗");
  });

  it("includes branded footer with site URL", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).toContain("— via TradeLinks ·");
    expect(t).toContain("tradelinks-mvp.vercel.app");
  });

  it("escapes HTML special characters in title", () => {
    const a = { ...ALERT, title: "EU <bans> & recalls <specific> items" };
    const t = renderChannelAlert(a);
    expect(t).toContain("&lt;bans&gt;");
    expect(t).toContain("&amp;");
  });

  it("does NOT expose internal urgencyScore or raw sourceUrls", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).not.toContain("urgencyScore");
    expect(t).not.toContain("5.0");
    expect(t).not.toContain("https://www.cbp.gov/newsroom");
  });
});

describe("renderChannelProduct (public channel format)", () => {
  it("renders bestseller with BSR rank and region", () => {
    const t = renderChannelProduct(BESTSELLER);
    expect(t).toContain("📈");
    expect(t).toContain("<i>Amazon · BSR #1 · NA</i>");
  });

  it("renders viral with likes and trending label", () => {
    const t = renderChannelProduct(VIRAL);
    expect(t).toContain("📈");
    expect(t).toContain("<i>X · ♥ 18.2k · trending</i>");
  });

  it("includes product URL as link", () => {
    const t = renderChannelProduct(BESTSELLER);
    expect(t).toContain("🔗 https://amazon.com/dp/B0XXXXXXX");
  });

  it("includes Radar-branded footer", () => {
    const t = renderChannelProduct(BESTSELLER);
    expect(t).toContain("— via TradeLinks Radar ·");
    expect(t).toContain("/trends");
  });

  it("escapes HTML in title", () => {
    const p = { ...BESTSELLER, title: "Fan <portable> & lightweight" };
    const t = renderChannelProduct(p);
    expect(t).toContain("&lt;portable&gt;");
    expect(t).toContain("&amp;");
  });

  it("omits rank when null for bestseller", () => {
    const p = { ...BESTSELLER, rank: null };
    const t = renderChannelProduct(p);
    expect(t).not.toContain("BSR");
  });

  it("omits likes section when null for viral", () => {
    const p = { ...VIRAL, likes: null };
    const t = renderChannelProduct(p);
    expect(t).not.toContain("♥");
  });
});

describe("formatLikes helper (via render)", () => {
  it("formats 18.2k correctly", () => {
    const p = { ...VIRAL, likes: 18200 };
    const t = renderChannelProduct(p);
    expect(t).toContain("18.2k");
  });

  it("formats millions correctly", () => {
    const p = { ...VIRAL, likes: 2_300_000 };
    const t = renderChannelProduct(p);
    expect(t).toContain("2.3M");
  });

  it("formats small numbers raw", () => {
    const p = { ...VIRAL, likes: 320 };
    const t = renderChannelProduct(p);
    expect(t).toContain("♥ 320");
  });
});

describe("title clamping (long Amazon titles)", () => {
  it("clamps an overlong product title with an ellipsis", () => {
    const longTitle = "PartyWoo White Balloons 140 pcs Different Sizes of 18 12 10 5 Inch White Balloons Arch Kit Garland for Wedding Baby Shower Birthday Decorations White-Y13";
    const t = renderChannelProduct({ ...BESTSELLER, title: longTitle });
    expect(t).toContain("…");
    expect(longTitle.length).toBeGreaterThan(100);
    expect(t).not.toContain(longTitle); // full title is not emitted verbatim
  });

  it("leaves a short product title intact", () => {
    const t = renderChannelProduct({ ...BESTSELLER, title: "Portable neck fan" });
    expect(t).toContain("Portable neck fan");
    expect(t).not.toContain("…");
  });
});
