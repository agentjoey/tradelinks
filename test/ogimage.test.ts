import { describe, it, expect } from "vitest";
import { parseOgImage, isGenericBanner } from "../src/lib/ogimage.js";

describe("isGenericBanner", () => {
  it("flags generic banners/logos/social-share", () => {
    expect(isGenericBanner("https://gov.uk/assets/frontend/govuk-opengraph-image-x.png")).toBe(true);
    expect(isGenericBanner("https://federalregister.gov/assets/open_graph_site_banner.png")).toBe(true);
    expect(isGenericBanner("https://ustr.gov/sites/default/files/Meta%20Tag_5.png")).toBe(true);
    expect(isGenericBanner("https://cbp.gov/cbp-seal-1200-630.png")).toBe(true);
    expect(isGenericBanner("https://lh3.googleusercontent.com/J6_coFbogxhRI9iM864NL_liGXvsQp2Aup=s0-w300-rw")).toBe(true);
  });
  it("passes real article images", () => {
    expect(isGenericBanner("https://imgproxy.divecdn.com/abc123.jpg")).toBe(false);
    expect(isGenericBanner("https://productsafety.gov.au/system/files/pool-noodles.jpg")).toBe(false);
  });
});

describe("parseOgImage", () => {
  it("returns real og:image", () => {
    const html = '<meta property="og:image" content="https://x.com/photo.jpg">';
    expect(parseOgImage(html, "https://x.com")).toBe("https://x.com/photo.jpg");
  });
  it("skips a generic banner og:image", () => {
    const html = '<meta property="og:image" content="https://x.com/assets/og-default.png">';
    expect(parseOgImage(html, "https://x.com")).toBeNull();
  });
  it("null when no og:image", () => {
    expect(parseOgImage("<html></html>", "https://x.com")).toBeNull();
  });
});
