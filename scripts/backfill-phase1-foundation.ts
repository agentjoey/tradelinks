#!/usr/bin/env tsx
/**
 * Phase 1 foundation legacy backfill CLI.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run [--output path]
 *   pnpm tsx scripts/backfill-phase1-foundation.ts --apply --fingerprint <fp>
 *
 * Safety: apply is allowed only on the explicitly approved isolated Neon
 * branch endpoint. There is no force override.
 */

import { writeFile } from "node:fs/promises";

import {
  applyFoundationBackfill,
  isApprovedApplyTarget,
  planFoundationBackfill,
} from "../src/canonicalize/backfill.js";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const dryRun = args.has("--dry-run");
  const apply = args.has("--apply");
  const outputIdx = argv.indexOf("--output");
  const output = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const fingerprintIdx = argv.indexOf("--fingerprint");
  const fingerprint = fingerprintIdx >= 0 ? argv[fingerprintIdx + 1] : undefined;

  if (!dryRun && !apply) {
    throw new Error("Specify --dry-run or --apply");
  }
  if (dryRun && apply) {
    throw new Error("--dry-run and --apply are mutually exclusive");
  }
  if (apply && (!fingerprint || fingerprint.trim() === "")) {
    throw new Error("--apply requires --fingerprint");
  }
  return { dryRun, apply, output, fingerprint: fingerprint?.trim() };
}

function printReport(report: Awaited<ReturnType<typeof planFoundationBackfill>>) {
  console.log(`fingerprint: ${report.fingerprint}`);
  console.log(`sourceItems: ${report.sourceItems}`);
  console.log(`clusters: ${report.clusters}`);
  console.log(`canonicalChanges: ${report.canonicalChanges}`);
  console.log(`versions: ${report.versions}`);
  console.log(`evidenceRecords: ${report.evidenceRecords}`);
  console.log(`rejectedRows: ${report.rejectedRows.length}`);
  if (report.rejectedRows.length > 0) {
    for (const row of report.rejectedRows) {
      console.log(`  - ${row.table}:${row.id} :: ${row.reason}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    const report = await planFoundationBackfill();
    if (args.output) {
      await writeFile(args.output, JSON.stringify(report, null, 2));
      console.log(`Dry-run report written to ${args.output}`);
    } else {
      printReport(report);
    }
    return;
  }

  if (args.apply) {
    if (!isApprovedApplyTarget()) {
      console.error(
        "Refusing to apply backfill: DATABASE_URL/DIRECT_URL do not point to the approved isolated endpoint.",
      );
      process.exit(1);
    }
    const report = await applyFoundationBackfill(args.fingerprint!);
    printReport(report);
    return;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
