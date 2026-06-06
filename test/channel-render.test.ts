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

describe("renderChannelAlert (news-card format)", () => {
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
    expect(renderChannelAlert(ALERT)).toContain("<i>Regulation · NA</i>");
  });

  it("renders category label for platform_policy", () => {
    expect(renderChannelAlert(ALERT_MEDIUM)).toContain("<i>Platform · EU</i>");
  });

  it("renders multiple regions slash-joined", () => {
    expect(renderChannelAlert(ALERT_LOW)).toContain("<i>Tip · SEA/NA</i>");
  });

  it("includes summary (trimmed if needed)", () => {
    expect(renderChannelAlert(ALERT)).toContain("Duties now apply");
  });

  it("includes actionRequired as bold ➤ line when present", () => {
    expect(renderChannelAlert(ALERT)).toContain("➤ <b>Recalculate landed cost now.</b>");
  });

  it("omits actionRequired line when null", () => {
    expect(renderChannelAlert(ALERT_MEDIUM)).not.toContain("➤");
  });

  it("leads with a beautified source name as a bold clickable link", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).toContain('<a href="https://www.cbp.gov/newsroom"><b>U.S. CBP</b></a>');
  });

  it("uses the publisher from a Google News title and strips the suffix", () => {
    const t = renderChannelAlert({
      ...ALERT,
      sourceUrls: ["https://news.google.com/rss/articles/XYZ"],
      title: "Brazil bans crypto for cross-border payments - Phemex",
    });
    expect(t).toContain("<b>Phemex</b>");
    expect(t).toContain("Brazil bans crypto for cross-border payments");
    expect(t).not.toContain("- Phemex");
  });

  it("omits the source link when there are no sources", () => {
    expect(renderChannelAlert(ALERT_LOW)).not.toContain("<a href");
  });

  it("does NOT expose internal urgencyScore", () => {
    const t = renderChannelAlert(ALERT);
    expect(t).not.toContain("urgencyScore");
    expect(t).not.toContain("5.0");
  });

  it("escapes HTML special characters in title", () => {
    const t = renderChannelAlert({ ...ALERT, title: "EU <bans> & recalls <specific> items" });
    expect(t).toContain("&lt;bans&gt;");
    expect(t).toContain("&amp;");
  });
});

describe("renderChannelProduct (news-card format)", () => {
  it("leads with platform as a bold clickable link", () => {
    expect(renderChannelProduct(BESTSELLER)).toContain('<a href="https://amazon.com/dp/B0XXXXXXX"><b>Amazon</b></a>');
  });

  it("renders bestseller BSR rank + region in the italic meta", () => {
    const t = renderChannelProduct(BESTSELLER);
    expect(t).toContain("📈");
    expect(t).toContain("<i>BSR #1 · NA</i>");
  });

  it("renders viral likes + trending in the italic meta", () => {
    const t = renderChannelProduct(VIRAL);
    expect(t).toContain('<a href="https://x.com/i/web/status/123"><b>X</b></a>');
    expect(t).toContain("<i>♥ 18.2k · trending</i>");
  });

  it("escapes HTML in title", () => {
    const t = renderChannelProduct({ ...BESTSELLER, title: "Fan <portable> & lightweight" });
    expect(t).toContain("&lt;portable&gt;");
    expect(t).toContain("&amp;");
  });

  it("omits BSR when rank is null for bestseller", () => {
    expect(renderChannelProduct({ ...BESTSELLER, rank: null })).not.toContain("BSR");
  });

  it("omits likes when null for viral (still 'trending')", () => {
    const t = renderChannelProduct({ ...VIRAL, likes: null });
    expect(t).not.toContain("♥");
    expect(t).toContain("trending");
  });
});

describe("formatLikes helper (via render)", () => {
  it("formats 18.2k correctly", () => {
    expect(renderChannelProduct({ ...VIRAL, likes: 18200 })).toContain("18.2k");
  });
  it("formats millions correctly", () => {
    expect(renderChannelProduct({ ...VIRAL, likes: 2_300_000 })).toContain("2.3M");
  });
  it("formats small numbers raw", () => {
    expect(renderChannelProduct({ ...VIRAL, likes: 320 })).toContain("♥ 320");
  });
});

describe("title clamping (long Amazon titles)", () => {
  it("clamps an overlong product title with an ellipsis", () => {
    const longTitle = "PartyWoo White Balloons 140 pcs Different Sizes of 18 12 10 5 Inch White Balloons Arch Kit Garland for Wedding Baby Shower Birthday Decorations White-Y13";
    const t = renderChannelProduct({ ...BESTSELLER, title: longTitle });
    expect(t).toContain("…");
    expect(longTitle.length).toBeGreaterThan(110);
    expect(t).not.toContain(longTitle);
  });

  it("leaves a short product title intact", () => {
    const t = renderChannelProduct({ ...BESTSELLER, title: "Portable neck fan" });
    expect(t).toContain("Portable neck fan");
    expect(t).not.toContain("…");
  });
});
