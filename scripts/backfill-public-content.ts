#!/usr/bin/env tsx
/**
 * Phase 1 Public Intelligence Task 9a — public-content backfill planner.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-public-content.ts --dry-run [--output path]
 *
 * DRY-RUN IS THE ONLY MODE THIS TASK SHIPS. There is no --apply flag: the
 * CLI refuses it, and no apply function exists here. Writing Briefing drafts
 * and LegacyRedirect rows is Task 9b, on the explicit cutover decision.
 * There is no endpoint allowlist to weaken either — nothing here writes, so
 * nothing needs one.
 *
 * The reconciliation answers one question honestly: for every legacy row
 * that disappears when 0014 drops the legacy tables, does its public
 * replacement exist yet?
 *
 *   - alert a      → mapped iff CanonicalChange slug `legacy-alert:<a.id>`
 *                    exists (the Foundation backfill's own naming), else
 *                    unmapped with reason NO_CANONICAL_CHANGE.
 *   - published    → mapped iff a DAILY Briefing exists for the note's date
 *     daily note     (periodKey = YYYY-MM-DD), else unmapped with reason
 *                    NO_DAILY_BRIEFING. Draft/skipped notes serve no public
 *                    traffic and are not reconciled here.
 *
 * An empty unmapped array on a database with zero rows proves NOTHING —
 * the CLI says so explicitly whenever it reports counts.
 */

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "../src/db/client.js";
import { briefingPath } from "../src/public-intelligence/briefings.js";
import { listStaticLegacyRedirectRows } from "../src/public-intelligence/legacy-redirects.js";

// ---------- report shape (the plan's Task 9 contract) ----------

export type PublicBackfillReport = {
  fingerprint: string;
  mappedAlerts: number;
  mappedDailyNotes: number;
  redirects: number;
  unmappedAlerts: Array<{ id: string; reason: string }>;
  unmappedPublishedDailyNotes: Array<{ id: string; reason: string }>;
};

export type PublicBackfillInput = {
  alertIds: string[];
  /** Slugs of CanonicalChanges already produced by the Foundation backfill. */
  canonicalChangeSlugs: ReadonlySet<string>;
  /** Published daily notes only; date is the ISO YYYY-MM-DD the note covers. */
  publishedNotes: Array<{ id: string; slug: string; date: string; lang: string }>;
  /** periodKeys of existing DAILY briefings. */
  dailyBriefingPeriods: ReadonlySet<string>;
};

/** One planned daily-detail redirect row; also the daily-slug target table
 *  getLegacyRedirect() consumes at cutover time. */
export type DailyRedirectRow = { fromPath: string; toPath: string; status: 308 };

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = sortDeep((v as Record<string, unknown>)[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sortDeep(value));
}

// ---------- pure planning core ----------

export function buildPublicBackfillReport(input: PublicBackfillInput): PublicBackfillReport {
  const unmappedAlerts: PublicBackfillReport["unmappedAlerts"] = [];
  let mappedAlerts = 0;
  for (const id of [...input.alertIds].sort()) {
    if (input.canonicalChangeSlugs.has(`legacy-alert:${id}`)) {
      mappedAlerts++;
    } else {
      unmappedAlerts.push({
        id,
        reason:
          "NO_CANONICAL_CHANGE: no CanonicalChange slug legacy-alert:" +
          `${id} exists — the Foundation backfill has not produced a canonical change for this alert`,
      });
    }
  }

  const unmappedPublishedDailyNotes: PublicBackfillReport["unmappedPublishedDailyNotes"] = [];
  const dailyRows: DailyRedirectRow[] = [];
  for (const note of [...input.publishedNotes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (input.dailyBriefingPeriods.has(note.date)) {
      dailyRows.push({
        fromPath: note.lang === "zh" ? `/zh/daily/${note.slug}` : `/daily/${note.slug}`,
        toPath: briefingPath("DAILY", note.date),
        status: 308,
      });
    } else {
      unmappedPublishedDailyNotes.push({
        id: note.id,
        reason:
          `NO_DAILY_BRIEFING: no DAILY briefing exists for period ${note.date} — ` +
          "Owner Decision 5 gates daily briefings on qualified, human-reviewed content",
      });
    }
  }

  const staticRows = listStaticLegacyRedirectRows();

  // The fingerprint covers the full reconciliation outcome: change the row
  // inventory or the mapped/unmapped determination of any row and it moves.
  const fingerprint = sha256(
    stableJson({
      alerts: [...input.alertIds]
        .sort()
        .map((id) => ({ id, mapped: input.canonicalChangeSlugs.has(`legacy-alert:${id}`) })),
      notes: [...input.publishedNotes]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((n) => ({
          id: n.id,
          slug: n.slug,
          lang: n.lang,
          date: n.date,
          mapped: input.dailyBriefingPeriods.has(n.date),
        })),
      staticRows,
      dailyRows,
    }),
  );

  return {
    fingerprint,
    mappedAlerts,
    mappedDailyNotes: dailyRows.length,
    redirects: staticRows.length + dailyRows.length,
    unmappedAlerts,
    unmappedPublishedDailyNotes,
  };
}

// ---------- DB-backed plan (read-only) ----------

export async function planPublicBackfill(): Promise<PublicBackfillReport> {
  const [alerts, changes, notes, dailyBriefings] = await Promise.all([
    prisma.alert.findMany({ select: { id: true } }),
    prisma.canonicalChange.findMany({
      where: { slug: { startsWith: "legacy-alert:" } },
      select: { slug: true },
    }),
    prisma.dailyNote.findMany({
      where: { status: "published" },
      select: { id: true, slug: true, date: true, lang: true },
    }),
    prisma.briefing.findMany({ where: { kind: "DAILY" }, select: { periodKey: true } }),
  ]);

  return buildPublicBackfillReport({
    alertIds: alerts.map((a) => a.id),
    canonicalChangeSlugs: new Set(changes.map((c) => c.slug)),
    publishedNotes: notes.map((n) => ({
      id: n.id,
      slug: n.slug,
      date: n.date.toISOString().slice(0, 10),
      lang: n.lang,
    })),
    dailyBriefingPeriods: new Set(dailyBriefings.map((b) => b.periodKey)),
  });
}

// ---------- CLI: dry-run only ----------

export function parseCliArgs(argv: string[]): { dryRun: true; output?: string } {
  if (argv.includes("--apply")) {
    throw new Error(
      "Refusing to apply: Task 9a ships planPublicBackfill as DRY-RUN ONLY. " +
        "There is no --apply flag in this task; writing Briefing drafts and " +
        "LegacyRedirect rows is Task 9b, on the explicit cutover decision.",
    );
  }
  const outputIdx = argv.indexOf("--output");
  const known = new Set(["--dry-run", "--output"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("-") && !known.has(arg)) {
      throw new Error(`unknown flag: ${arg} (only --dry-run [--output path] is accepted)`);
    }
    if (arg === "--output" && (outputIdx === argv.length - 1 || argv[outputIdx + 1]!.startsWith("-"))) {
      throw new Error("--output requires a path");
    }
  }
  if (!argv.includes("--dry-run")) {
    throw new Error("Specify --dry-run (the only mode Task 9a ships)");
  }
  return { dryRun: true, output: outputIdx >= 0 ? argv[outputIdx + 1] : undefined };
}

function printReport(report: PublicBackfillReport, totals: { alerts: number; notes: number }) {
  console.log(`fingerprint: ${report.fingerprint}`);
  console.log(`mappedAlerts: ${report.mappedAlerts}`);
  console.log(`mappedDailyNotes: ${report.mappedDailyNotes}`);
  console.log(`redirects: ${report.redirects}`);
  console.log(`unmappedAlerts: ${report.unmappedAlerts.length}`);
  for (const row of report.unmappedAlerts) console.log(`  - ${row.id} :: ${row.reason}`);
  console.log(`unmappedPublishedDailyNotes: ${report.unmappedPublishedDailyNotes.length}`);
  for (const row of report.unmappedPublishedDailyNotes) {
    console.log(`  - ${row.id} :: ${row.reason}`);
  }
  console.log("");
  console.log(
    `Reconciliation basis: this database holds ${totals.alerts} legacy alerts and ` +
      `${totals.notes} published daily notes.`,
  );
  if (totals.alerts === 0 && totals.notes === 0) {
    console.log(
      "WARNING: zero legacy rows here — empty unmapped arrays on an empty database " +
        "prove NOTHING about production (570 alerts / 22 daily notes / 3,743 items).",
    );
  }
  if (report.unmappedAlerts.length > 0 || report.unmappedPublishedDailyNotes.length > 0) {
    console.log(
      "NOTE: unmapped rows are a pre-condition failure for cutover, not a bug in this " +
        "report. And even MAPPED rows are not publishable content: backfilled canonical " +
        "versions are EXPERIMENTAL / IN_REVIEW / non-current and fail the public read " +
        "contract (isCurrent + PUBLISHED + reviewedAt + MONITORED|VERIFIED). Cutover " +
        "today replaces a working site with an empty one.",
    );
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const [report, alertTotal, noteTotal] = await Promise.all([
    planPublicBackfill(),
    prisma.alert.count(),
    prisma.dailyNote.count({ where: { status: "published" } }),
  ]);
  if (args.output) {
    await writeFile(args.output, JSON.stringify(report, null, 2));
    console.log(`Dry-run report written to ${args.output}`);
  } else {
    printReport(report, { alerts: alertTotal, notes: noteTotal });
  }
  await prisma.$disconnect();
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
