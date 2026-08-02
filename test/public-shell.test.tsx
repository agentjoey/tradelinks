import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// PublicNav is a client component that highlights the active section via
// usePathname; tests control the path through this mock.
let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { PublicShell } from "../app/(public)/layout";
import { PublicNav, PUBLIC_NAV_ITEMS } from "../app/(public)/PublicNav";
import { PublicFooter } from "../app/(public)/PublicFooter";
import { StatePanel } from "../app/(public)/StatePanel";
import { IntelligenceCard } from "../app/(public)/IntelligenceCard";
import Home from "../app/(public)/page";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("PublicShell", () => {
  it("renders skip link → nav → main#main → footer in order", () => {
    const { container } = render(
      <PublicShell initialTheme="light">
        <p>content</p>
      </PublicShell>,
    );
    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip).toHaveAttribute("href", "#main");
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const main = container.querySelector("main#main");
    const footer = screen.getByRole("contentinfo");
    expect(main).not.toBeNull();
    expect(main).toHaveTextContent("content");

    expect(skip.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main!.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("skip link becomes visible on focus", () => {
    render(
      <PublicShell initialTheme="light">
        <p>x</p>
      </PublicShell>,
    );
    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip.className).toMatch(/skip-link/);
  });
});

describe("PublicNav", () => {
  it("exposes the approved eight-item primary navigation", () => {
    render(<PublicNav initialTheme="light" />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "US Market",
      "Amazon US",
      "Shopify US",
      "Categories",
      "Changes",
      "Guides",
      "Briefings",
      "Coverage",
    ]);
    const hrefs = PUBLIC_NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toEqual([
      "/us",
      "/amazon-us",
      "/shopify-us",
      "/categories",
      "/changes",
      "/guides",
      "/briefings",
      "/coverage",
    ]);
  });

  it("marks US Market current on the home page", () => {
    mockPathname = "/";
    render(<PublicNav initialTheme="light" />);
    expect(screen.getByRole("link", { name: "US Market" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Changes" })).not.toHaveAttribute("aria-current");
  });

  it("marks the active hub current on hub pages", () => {
    mockPathname = "/amazon-us";
    render(<PublicNav initialTheme="light" />);
    expect(screen.getByRole("link", { name: "Amazon US" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "US Market" })).not.toHaveAttribute("aria-current");
    mockPathname = "/";
  });

  it("keeps the nav in a horizontally scrollable row instead of a hamburger", () => {
    render(<PublicNav initialTheme="light" />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav.className).toMatch(/overflow-x-auto/);
  });

  it("offers the theme toggle", () => {
    render(<PublicNav initialTheme="light" />);
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
  });
});

describe("PublicFooter", () => {
  it("states the forward-only correction promise and links the machine surfaces", () => {
    render(<PublicFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/forward-only/i);
    expect(within(footer).getByRole("link", { name: /^RSS$/i })).toHaveAttribute("href", "/feeds/changes.xml");
    expect(within(footer).getByRole("link", { name: /API v1/i })).toHaveAttribute("href", "/api/v1/changes");
    expect(within(footer).getByRole("link", { name: /Coverage/i })).toHaveAttribute("href", "/coverage");
    expect(within(footer).getByRole("link", { name: /Agent Skill/i })).toHaveAttribute("href", "/agent/tradelinks/SKILL.md");
  });
});

describe("StatePanel", () => {
  it("loading keeps the section heading and marks the skeleton busy", () => {
    const { container } = render(<StatePanel state="loading" heading="Changes to know now" />);
    expect(screen.getByRole("heading", { level: 2, name: "Changes to know now" })).toBeInTheDocument();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByText(/loading/i, { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("empty teaches the surface instead of saying nothing here", () => {
    render(
      <StatePanel
        state="empty"
        title="No qualified changes in this filter"
        body="Nothing reached Verified for Consumer Electronics in the last 90 days."
        actions={[{ label: "Include Monitored" }, { label: "See what we watch", href: "/coverage" }]}
      />,
    );
    expect(screen.getByRole("heading", { name: /no qualified changes/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing reached verified/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /include monitored/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see what we watch/i })).toHaveAttribute("href", "/coverage");
  });

  it("error explains the cached fallback and offers retry", () => {
    render(
      <StatePanel
        state="error"
        body="We could not reach the live record just now, so this page is served from cache."
        actions={[{ label: "Retry", primary: true }]}
      />,
    );
    expect(screen.getByText(/served from cache/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("stale renders the literal word and the consequence, not just a badge", () => {
    render(
      <StatePanel
        state="stale"
        body="The CPSC feed last succeeded 19 hours ago against a 6-hour SLA. A change published in that window would not appear below yet."
      />,
    );
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText(/would not appear below yet/i)).toBeInTheDocument();
  });

  it("restricted requires explicit selection and never offers drafts", () => {
    render(
      <StatePanel
        state="restricted"
        title="Monitored entries are hidden by default"
        body="The default view shows only records with reviewed primary-official evidence."
        actions={[{ label: "Show All Monitored", primary: true }, { label: "Show drafts", disabled: true }]}
        note="Drafts and rejected records are never public, for anyone."
      />,
    );
    expect(screen.getByRole("button", { name: /show all monitored/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /show drafts/i })).toBeDisabled();
    expect(screen.getByText(/never public/i)).toBeInTheDocument();
  });
});

describe("public home page", () => {
  it("renders exactly one h1", async () => {
    render(await Home());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  }, 60000);

  it("does not carry the BL-045 liveness choreography", async () => {
    const { container } = render(await Home());
    const html = container.innerHTML;
    for (const cls of ["lm", "li", "focus-in", "top-cluster", "tape", "radar-glyph", "live-dot", "insert-row"]) {
      expect(html, `class ${cls} must not appear`).not.toMatch(new RegExp(`\\b${cls}\\b`));
    }
  }, 60000);

  it("shows readiness as literal words with evidence inline", () => {
    // Task 3: Home is now async and wired to the live read model, so its
    // content is not deterministic. The DESIGN.md invariant this test guards
    // — readiness is a literal word, never colour alone, and evidence sits
    // inline with its conclusion rather than behind a disclosure — now lives
    // on IntelligenceCard, the card Home and every hub render. It is asserted
    // here against fixed records, with no dependence on database contents.
    const base = {
      id: "c-1",
      slug: "fixture-rule",
      versionId: "v-1",
      version: 1,
      fingerprint: "f".repeat(64),
      title: "Fixture rule title",
      summary: "Fixture summary",
      signalType: "REGULATORY",
      market: "US",
      regions: ["north_america"],
      platforms: [],
      operatingStages: [],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: "2026-07-15T00:00:00.000Z",
      effectiveAt: null,
      urgency: 60,
      generalImpact: "Hits sellers of covered goods.",
      generalActionTemplate: null,
      permalink: "https://tradelinks.us/changes/fixture-rule",
      reviewedAt: "2026-07-20T00:00:00.000Z",
      evidence: [
        {
          sourceId: "s-1",
          sourceName: "Fixture source",
          url: "https://example.gov/rule",
          role: "PRIMARY_OFFICIAL",
          authorityLevel: "GOVERNMENT_OFFICIAL",
          publishedAt: "2026-07-10T00:00:00.000Z",
          normalizedSummary: "Official fixture evidence summary",
          reviewedAt: "2026-07-19T00:00:00.000Z",
        },
      ],
      correctionHistory: [],
    } as const;
    render(
      <>
        <IntelligenceCard record={{ ...base, readiness: "VERIFIED" } as any} />
        <IntelligenceCard record={{ ...base, versionId: "v-2", readiness: "MONITORED" } as any} />
      </>,
    );
    // The literal readiness words render as text — remove them and this
    // fails loudly, which is what keeps colour from ever carrying the state.
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Monitored")).toBeInTheDocument();
    // Evidence sits inline with the conclusion, not behind a disclosure.
    expect(screen.getAllByText("Evidence").length).toBe(2);
    expect(screen.getAllByText("Official fixture evidence summary").length).toBe(2);
  });
});

describe("theme default inversion", () => {
  it(":root carries the light values and [data-theme='dark'] the dark values", () => {
    const css = read("app/globals.css");
    const rootBlock = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? "";
    const darkBlock = css.match(/\[data-theme="dark"\]\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rootBlock).toContain("color-scheme: light");
    expect(rootBlock).toContain("--c-bg: 244 241 232");
    expect(darkBlock).toContain("color-scheme: dark");
    expect(darkBlock).toContain("--c-bg: 8 9 12");
    expect(css).not.toMatch(/\[data-theme="light"\]\s*\{/);
  });
});

describe("layout ownership", () => {
  it("root layout is providers/metadata only — no nav chrome", () => {
    const root = read("app/layout.tsx");
    expect(root).not.toMatch(/MainNav|AccountNav|MobileTabBar|<header|<footer/);
  });

  it("AccountNav lives in the admin layout", () => {
    expect(read("app/admin/layout.tsx")).toMatch(/AccountNav/);
  });

  it("the legacy (home) route group is gone", () => {
    expect(() => read("app/(home)/page.tsx")).toThrow();
  });
});
