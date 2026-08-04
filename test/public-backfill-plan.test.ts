import { spawnSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

describe("planPublicBackfill — reconciliation against the worker schema", () => {
  // Neon cold-start plus several full-table reads per test: well over the
  // 5s vitest default on a sleeping compute.
  const DB_TIMEOUT = 60_000;

  // Task 10: this file runs against its worker's own schema (no concurrent
  // writers), so the consistent-read retry loop that guarded against
  // foundation-backfill's parallel fixture churn is retired. To keep the
  // reconciliation non-vacuous — accounting over an empty table proves
  // nothing — we seed a deterministic legacy inventory: one mapped and one
  // unmapped alert, one mapped and one unmapped published daily note. The
  // assertions are the same accounting equalities as before, plus presence
  // checks on the seeded rows so both outcomes are always exercised.
  const runId = `testpbp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const MAPPED_ALERT_ID = `${runId}-alert-mapped`;
  const UNMAPPED_ALERT_ID = `${runId}-alert-unmapped`;
  const MAPPED_NOTE_ID = `${runId}-note-mapped`;
  const UNMAPPED_NOTE_ID = `${runId}-note-unmapped`;
  const CLUSTER_ID = `${runId}-cluster`;
  const MAPPED_NOTE_DATE = "2026-07-01";

  beforeAll(async () => {
    await prisma.alert.createMany({
      data: [
        {
          id: MAPPED_ALERT_ID,
          title: "mapped legacy alert",
          summary: "has a canonical change",
          urgencyScore: 3,
          category: "regulatory",
          status: "published",
        },
        {
          id: UNMAPPED_ALERT_ID,
          title: "unmapped legacy alert",
          summary: "no canonical change",
          urgencyScore: 2,
          category: "regulatory",
          status: "published",
        },
      ],
    });
    await prisma.evidenceCluster.create({ data: { id: CLUSTER_ID, fingerprint: CLUSTER_ID } });
    await prisma.canonicalChange.create({
      data: { slug: `legacy-alert:${MAPPED_ALERT_ID}`, clusterId: CLUSTER_ID },
    });
    await prisma.dailyNote.createMany({
      data: [
        {
          id: MAPPED_NOTE_ID,
          date: new Date(`${MAPPED_NOTE_DATE}T00:00:00Z`),
          slug: MAPPED_NOTE_ID,
          title: "mapped note",
          bodyMarkdown: "body",
          keyTakeaways: [],
          tags: [],
          sourceAlertIds: [],
          status: "published",
        },
        {
          id: UNMAPPED_NOTE_ID,
          date: new Date("2026-07-02T00:00:00Z"),
          slug: UNMAPPED_NOTE_ID,
          title: "unmapped note",
          bodyMarkdown: "body",
          keyTakeaways: [],
          tags: [],
          sourceAlertIds: [],
          status: "published",
        },
      ],
    });
    await prisma.briefing.create({
      data: {
        kind: "DAILY",
        periodKey: MAPPED_NOTE_DATE,
        slug: `${runId}-daily-briefing`,
        title: "daily briefing",
        summary: "summary",
        bodyMarkdown: "body",
        readiness: "EXPERIMENTAL",
        fingerprint: `${runId}-fingerprint`,
      },
    });
  }, DB_TIMEOUT);

  afterAll(async () => {
    await prisma.canonicalChange.deleteMany({ where: { clusterId: CLUSTER_ID } });
    await prisma.evidenceCluster.deleteMany({ where: { id: CLUSTER_ID } });
    await prisma.alert.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.dailyNote.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.briefing.deleteMany({ where: { slug: { startsWith: runId } } });
    await prisma.$disconnect();
  }, DB_TIMEOUT);

  async function readAlertState() {
    const report = await planPublicBackfill();
    const changes = await prisma.canonicalChange.findMany({
      where: { slug: { startsWith: "legacy-alert:" } },
      select: { slug: true },
    });
    const mappedIds = new Set(changes.map((c) => c.slug.slice("legacy-alert:".length)));
    const currentIds = new Set(
      (await prisma.alert.findMany({ select: { id: true } })).map((a) => a.id),
    );
    return { report, mappedIds, currentIds };
  }

  it("accounts for every legacy alert row: mapped or unmapped with a reason", async () => {
    const { report, mappedIds, currentIds } = await readAlertState();
    expect(report.mappedAlerts).toBe(mappedIds.size);
    expect(report.mappedAlerts + report.unmappedAlerts.length).toBe(currentIds.size);
    for (const row of report.unmappedAlerts) {
      expect(row.reason.length).toBeGreaterThan(0);
    }
    // Non-vacuous: the seeded rows force both outcomes.
    expect(mappedIds.has(MAPPED_ALERT_ID)).toBe(true);
    expect(report.unmappedAlerts.some((r) => r.id === UNMAPPED_ALERT_ID)).toBe(true);
  }, DB_TIMEOUT);

  it("an alert is mapped exactly when its canonical change exists", async () => {
    const { report, mappedIds, currentIds } = await readAlertState();
    const unmappedIds = new Set(report.unmappedAlerts.map((r) => r.id));
    // No overlap and full coverage of the alerts table.
    for (const id of mappedIds) expect(unmappedIds.has(id)).toBe(false);
    expect(mappedIds.size).toBe(report.mappedAlerts);
    expect(mappedIds.size + unmappedIds.size).toBe(currentIds.size);
    // The seeded unmapped alert carries the explicit reason.
    const seeded = report.unmappedAlerts.find((r) => r.id === UNMAPPED_ALERT_ID);
    expect(seeded?.reason).toMatch(/NO_CANONICAL_CHANGE/);
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
    // Non-vacuous: the seeded notes force both outcomes.
    expect(expectedMapped.some((n) => n.id === MAPPED_NOTE_ID)).toBe(true);
    const seededUnmapped = report.unmappedPublishedDailyNotes.find(
      (r) => r.id === UNMAPPED_NOTE_ID,
    );
    expect(seededUnmapped?.reason).toMatch(/NO_DAILY_BRIEFING/);
  }, DB_TIMEOUT);

  it("counts one redirect row per static entry plus one per mapped daily note", async () => {
    const report = await planPublicBackfill();
    expect(report.redirects).toBe(
      listStaticLegacyRedirectRows().length + report.mappedDailyNotes,
    );
  }, DB_TIMEOUT);

  it("returns the same fingerprint across consecutive runs on unchanged input", async () => {
    // Quiet worker schema: the inventory cannot move between the two reads,
    // so fingerprint stability is asserted unconditionally (it used to be
    // guarded against parallel-suite churn).
    const first = await planPublicBackfill();
    const second = await planPublicBackfill();
    expect(second.fingerprint).toBe(first.fingerprint);
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
