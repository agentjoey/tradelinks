/**
 * Say the limit once per page, not once per card.
 *
 * MONITORED_LIMIT_NOTE rendered on every Monitored record, and readiness is
 * inherited from the source contract — both live sources are graded Monitored,
 * so it fired on 100% of rows. A signal that never varies carries no
 * information, twenty identical red blocks read as breakage rather than as
 * honesty, and on a 390px screen the notice took five lines, making each card
 * roughly half disclaimer.
 *
 * Nothing is hidden by removing it: the card already renders the literal
 * readiness word through ReadinessBadge, and the prose was layered on top.
 * Now that VERIFIED is reachable (the review desk gained a confirm-evidence
 * action on 2026-08-07), the chip does the work the prose was pretending to.
 *
 * Approved at the Mockup Gate by the Human Owner, 2026-08-07.
 * Record: .agent/frontend-design/2026-08-07-monitored-limit-note.md
 */

import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { MonitoredPageNote } from "../app/(public)/MonitoredPageNote";

const MON = { readiness: "MONITORED" as const };
const VER = { readiness: "VERIFIED" as const };

describe("MonitoredPageNote", () => {
  it("says every entry when the whole page is Monitored", () => {
    render(<MonitoredPageNote records={[MON, MON, MON]} />);
    expect(screen.getByText(/Every entry here is/i)).toBeVisible();
    cleanup();
  });

  it("qualifies the claim when the page is mixed", () => {
    // "Every entry here" would be false the moment one is Verified, and a
    // caveat that misstates its own scope is worse than no caveat.
    render(<MonitoredPageNote records={[VER, MON]} />);
    expect(screen.getByText(/Entries marked/i)).toBeVisible();
    expect(screen.queryByText(/Every entry here is/i)).toBeNull();
    cleanup();
  });

  it("renders nothing when no entry is Monitored", () => {
    // A caveat that renders where it does not apply is the same failure as one
    // that never varies.
    const { container } = render(<MonitoredPageNote records={[VER, VER]} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<MonitoredPageNote records={[]} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  });

  it("states the actual limit, not just the word", () => {
    render(<MonitoredPageNote records={[MON]} />);
    expect(screen.getByText(/primary-official evidence/i)).toBeVisible();
    cleanup();
  });

  it("links to the page that explains the grading", () => {
    render(<MonitoredPageNote records={[MON]} />);
    expect(screen.getByRole("link", { name: /grade coverage/i })).toHaveAttribute(
      "href",
      "/coverage",
    );
    cleanup();
  });

  it("is not set in the uppercase ticker style", () => {
    // Thirty words of uppercase mono is harder to read than the block it
    // replaces. Moving a wall of text and then making it painful is not a fix.
    const { container } = render(<MonitoredPageNote records={[MON]} />);
    const el = container.firstElementChild!;
    expect(el.className).not.toMatch(/uppercase/);
    expect(el.className).not.toMatch(/\bticker\b/);
    cleanup();
  });
});
