import { describe, it, expect } from "vitest";
import { composeWeeklyIssue, type IssueInput } from "../src/email/compose-issue";

const base: IssueInput = {
  date: "2026-06-09",
  unsubUrl: "https://x/unsub?token=T",
  movers: [{ title: "Mascara X", region: "north_america", category: "Beauty", why: "rank +22 · now #8" }],
  policyText: "POLICY\n- de minimis ends Monday",
};

describe("composeWeeklyIssue", () => {
  it("renders subject + movers + policy + unsub link", () => {
    const o = composeWeeklyIssue(base);
    expect(o.subject).toContain("Mascara X");
    expect(o.text).toContain("Mascara X");
    expect(o.text).toContain("de minimis");
    expect(o.html).toContain("https://x/unsub?token=T");
    expect(o.text).toContain("https://x/unsub?token=T");
  });
  it("no movers → policy-only, still valid", () => {
    const o = composeWeeklyIssue({ ...base, movers: [] });
    expect(o.text).toContain("de minimis");
    expect(o.subject.length).toBeGreaterThan(0);
  });
  it("escapes HTML in fields", () => {
    const o = composeWeeklyIssue({ ...base, movers: [{ title: "A<b>", region: "r", category: "c", why: "w" }] });
    expect(o.html).toContain("A&lt;b&gt;");
  });
});
