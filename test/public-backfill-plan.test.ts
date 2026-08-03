import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { prisma } from "../src/db/client.js";
import { listStaticLegacyRedirectRows } from "../src/public-intelligence/legacy-redirects.js";
import {
  buildPublicBackfillReport,
  parseCliArgs,
  planPublicBackfill,
} from "../scripts/backfill-public-content.js";

/**
 * Task 9a — planPublicBackfill reconciliation, dry-run only.
 *
 * The reconciliation answers one question honestly: for every legacy row
 * that would disappear when 0014 drops the legacy tables, does its public
 * replacement exist? An empty unmapped array on a database with zero rows
 * proves nothing — so these tests assert accounting against live counts,
 * never absolute numbers.
 */

describe("parseCliArgs — dry-run is the only mode Task 9a ships", () => {
  it("accepts --dry-run", () => {
    expect(parseCliArgs(["--dry-run"])).toEqual({ dryRun: true, output: undefined });
    expect(parseCliArgs(["--dry-run", "--output", "report.json"])).toEqual({
      dryRun: true,
      output: "report.json",
    });
  });

  it("refuses --apply outright — there is no apply path in this task", () => {
    expect(() => parseCliArgs(["--apply"])).toThrow(/dry-run only/i);
    expect(() => parseCliArgs(["--dry-run", "--apply"])).toThrow(/dry-run only/i);
    expect(() => parseCliArgs(["--apply", "--fingerprint", "abc"])).toThrow(/dry-run only/i);
  });

  it("requires --dry-run and rejects unknown flags", () => {
    expect(() => parseCliArgs([])).toThrow(/--dry-run/);
    expect(() => parseCliArgs(["--force"])).toThrow(/unknown flag/i);
  });
});

describe("buildPublicBackfillReport — pure planning core", () => {
  const input = {
    alertIds: ["a1", "a2", "a3"],
    canonicalChangeSlugs: new Set(["legacy-alert:a1"]),
    publishedNotes: [
      { id: "n1", slug: "2026-07-01-brief", date: "2026-07-01", lang: "en" },
      { id: "n2", slug: "2026-07-01-brief-zh", date: "2026-07-01", lang: "zh" },
      { id: "n3", slug: "2026-07-02-roundup", date: "2026-07-02", lang: "en" },
    ],
    dailyBriefingPeriods: new Set(["2026-07-01"]),
  };

  it("maps only rows whose public replacement exists, with reasons for the rest", () => {
    const report = buildPublicBackfillReport(input);
    expect(report.mappedAlerts).toBe(1);
    expect(report.unmappedAlerts).toEqual([
      { id: "a2", reason: expect.stringMatching(/NO_CANONICAL_CHANGE/) },
      { id: "a3", reason: expect.stringMatching(/NO_CANONICAL_CHANGE/) },
    ]);
    expect(report.mappedDailyNotes).toBe(2);
    expect(report.unmappedPublishedDailyNotes).toEqual([
      { id: "n3", reason: expect.stringMatching(/NO_DAILY_BRIEFING/) },
    ]);
    expect(report.redirects).toBe(listStaticLegacyRedirectRows().length + 2);
  });

  it("produces a stable fingerprint for unchanged input", () => {
    const first = buildPublicBackfillReport(input);
    const second = buildPublicBackfillReport(input);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the fingerprint when any input row changes", () => {
    const base = buildPublicBackfillReport(input);
    const canonicalAdded = buildPublicBackfillReport({
      ...input,
      canonicalChangeSlugs: new Set(["legacy-alert:a1", "legacy-alert:a2"]),
    });
    expect(canonicalAdded.fingerprint).not.toBe(base.fingerprint);
    const alertAdded = buildPublicBackfillReport({ ...input, alertIds: ["a1", "a2", "a3", "a4"] });
    expect(alertAdded.fingerprint).not.toBe(base.fingerprint);
  });

  it("is deterministic regardless of input ordering", () => {
    const shuffled = buildPublicBackfillReport({
      alertIds: ["a3", "a1", "a2"],
      canonicalChangeSlugs: input.canonicalChangeSlugs,
      publishedNotes: [input.publishedNotes[2]!, input.publishedNotes[0]!, input.publishedNotes[1]!],
      dailyBriefingPeriods: input.dailyBriefingPeriods,
    });
    expect(shuffled.fingerprint).toBe(buildPublicBackfillReport(input).fingerprint);
  });
});

describe("planPublicBackfill — reconciliation against the branch database", () => {
  // Neon cold-start plus several full-table reads per test: well over the
  // 5s vitest default on a sleeping compute.
  const DB_TIMEOUT = 60_000;

  // Parallel suites (foundation-backfill) seed and delete run-scoped legacy
  // alerts and canonical changes on this shared branch. Any count taken at a
  // different instant than the plan's own read can legitimately disagree, so
  // the accounting assertion runs on a CONSISTENT pair of reads: retry until
  // the plan's accounted set (unmapped ∪ mapped) equals the live alert id
  // set. A real accounting bug never converges; concurrent fixture churn does.
  async function readConsistentAlertState() {
    let lastDiff = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const report = await planPublicBackfill();
      const changes = await prisma.canonicalChange.findMany({
        where: { slug: { startsWith: "legacy-alert:" } },
        select: { slug: true },
      });
      const mappedIds = new Set(changes.map((c) => c.slug.slice("legacy-alert:".length)));
      const accounted = new Set([...report.unmappedAlerts.map((r) => r.id), ...mappedIds]);
      const currentIds = new Set(
        (await prisma.alert.findMany({ select: { id: true } })).map((a) => a.id),
      );
      const unaccounted = [...currentIds].filter((id) => !accounted.has(id));
      const stale = [...accounted].filter((id) => !currentIds.has(id));
      if (unaccounted.length === 0 && stale.length === 0) {
        return { report, mappedIds, currentIds };
      }
      lastDiff = `unaccounted: ${unaccounted.slice(0, 3).join(",")} stale: ${stale.slice(0, 3).join(",")}`;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`alert accounting never converged (concurrent fixture churn?): ${lastDiff}`);
  }

  it("accounts for every legacy alert row: mapped or unmapped with a reason", async () => {
    const { report, mappedIds, currentIds } = await readConsistentAlertState();
    expect(report.mappedAlerts).toBe(mappedIds.size);
    expect(report.mappedAlerts + report.unmappedAlerts.length).toBe(currentIds.size);
    for (const row of report.unmappedAlerts) {
      expect(row.reason.length).toBeGreaterThan(0);
    }
  }, DB_TIMEOUT);

  it("an alert is mapped exactly when its canonical change exists", async () => {
    const { report, mappedIds, currentIds } = await readConsistentAlertState();
    const unmappedIds = new Set(report.unmappedAlerts.map((r) => r.id));
    // No overlap and full coverage of the alerts table.
    for (const id of mappedIds) expect(unmappedIds.has(id)).toBe(false);
    expect(mappedIds.size).toBe(report.mappedAlerts);
    expect(mappedIds.size + unmappedIds.size).toBe(currentIds.size);
  }, DB_TIMEOUT);

  it("accounts for every published daily note: mapped or unmapped with a reason", async () => {
    const report = await planPublicBackfill();
    const published = await prisma.dailyNote.findMany({
      where: { status: "published" },
      select: { id: true, date: true },
    });
    expect(report.mappedDailyNotes + report.unmappedPublishedDailyNotes.length).toBe(
      published.length,
    );
    for (const row of report.unmappedPublishedDailyNotes) {
      expect(row.reason.length).toBeGreaterThan(0);
    }
    // A mapped note has a DAILY briefing for its date; count must agree.
    const briefingDates = new Set(
      (
        await prisma.briefing.findMany({
          where: { kind: "DAILY" },
          select: { periodKey: true },
        })
      ).map((b) => b.periodKey),
    );
    const unmappedIds = new Set(report.unmappedPublishedDailyNotes.map((r) => r.id));
    const expectedMapped = published.filter((n) =>
      briefingDates.has(n.date.toISOString().slice(0, 10)),
    );
    expect(expectedMapped.length).toBe(report.mappedDailyNotes);
    for (const note of expectedMapped) expect(unmappedIds.has(note.id)).toBe(false);
  }, DB_TIMEOUT);

  it("counts one redirect row per static entry plus one per mapped daily note", async () => {
    const report = await planPublicBackfill();
    expect(report.redirects).toBe(
      listStaticLegacyRedirectRows().length + report.mappedDailyNotes,
    );
  }, DB_TIMEOUT);

  it("returns the same fingerprint across consecutive runs on unchanged input", async () => {
    const first = await planPublicBackfill();
    const second = await planPublicBackfill();
    // Parallel suites seed and tear down run-scoped legacy rows on this
    // shared branch; if the row inventory moved between the two reads the
    // comparison is meaningless, so it is guarded — the hard proof of
    // stability is the CLI double-run in the task gates plus the pure-core
    // tests above.
    const inventory = (r: typeof first) =>
      `${r.mappedAlerts}+${r.unmappedAlerts.length}/${r.mappedDailyNotes}+${r.unmappedPublishedDailyNotes.length}`;
    if (inventory(first) === inventory(second)) {
      expect(second.fingerprint).toBe(first.fingerprint);
    }
  }, DB_TIMEOUT);
});

describe("the CLI refuses to apply, end to end", () => {
  it("exits non-zero with a dry-run-only refusal for --apply", () => {
    const result = spawnSync(
      "pnpm",
      ["tsx", "scripts/backfill-public-content.ts", "--apply", "--fingerprint", "deadbeef"],
      { encoding: "utf8", timeout: 120_000 },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/dry-run only/i);
  }, 150_000);
});
