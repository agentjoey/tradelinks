import { describe, it, expect } from "vitest";
import { isDue } from "../src/workers/scheduler.js";

describe("scheduler isDue (pg-boss fan-out due-check)", () => {
  const now = new Date("2026-06-03T12:00:30Z"); // 12:00:30

  it("is due when never crawled", () => {
    expect(isDue("0 */4 * * *", null, now)).toBe(true);
  });

  it("is due when last crawl predates the most recent scheduled fire", () => {
    // every 4h fires at 12:00; last crawl at 09:00 -> due
    expect(isDue("0 */4 * * *", new Date("2026-06-03T09:00:00Z"), now)).toBe(true);
  });

  it("is NOT due when already crawled after the most recent fire", () => {
    // most recent fire 12:00; last crawl 12:00:10 -> not due
    expect(isDue("0 */4 * * *", new Date("2026-06-03T12:00:10Z"), now)).toBe(false);
  });

  it("hourly source due when last crawl was over an hour ago", () => {
    expect(isDue("0 * * * *", new Date("2026-06-03T10:30:00Z"), now)).toBe(true);
  });

  it("invalid cron is treated as not due (no crash)", () => {
    expect(isDue("not a cron", null, now)).toBe(true); // null short-circuits before parse
    expect(isDue("not a cron", new Date("2026-06-03T11:00:00Z"), now)).toBe(false);
  });
});
