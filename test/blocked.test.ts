import { describe, it, expect } from "vitest";
import { isBlocked } from "../src/adapters/blocked.js";

describe("isBlocked", () => {
  it("flags Cloudflare challenge pages", () => {
    expect(isBlocked({ body: "<html><body>Just a moment...</body></html>" })).toBe(true);
    expect(
      isBlocked({ body: "<div class='cf-browser-verification'>checking</div>" }),
    ).toBe(true);
  });

  it("flags captcha pages", () => {
    expect(isBlocked({ body: "<div class='g-recaptcha'></div>" })).toBe(true);
    expect(isBlocked({ body: "<script>turnstile.render()</script>" })).toBe(true);
  });

  it("flags access-denied titles", () => {
    expect(isBlocked({ body: "<title>Access Denied</title><body>x</body>" })).toBe(true);
    expect(isBlocked({ body: "<title>Attention Required! | Cloudflare</title>" })).toBe(true);
  });

  it("flags tiny bodies missing expected markers", () => {
    expect(isBlocked({ body: "<html></html>", expectedSelectors: ["article"] })).toBe(true);
  });

  it("passes healthy pages", () => {
    const healthy =
      "<html><head><title>Seller News</title></head><body>" +
      "<article><h2>New FBA fee changes for 2026</h2></article>".repeat(5) +
      "</body></html>";
    expect(isBlocked({ body: healthy, expectedSelectors: ["article"] })).toBe(false);
  });

  it("does not flag tiny body that contains an expected marker", () => {
    expect(
      isBlocked({ body: "<article>ok</article>", expectedSelectors: ["article"] }),
    ).toBe(false);
  });
});
