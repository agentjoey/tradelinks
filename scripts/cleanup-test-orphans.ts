/**
 * Task 10 — prefix-scoped cleanup of orphaned test fixtures.
 *
 * Killed test runs leave run-scoped rows behind (91 orphaned canonical
 * changes were removed by hand during the Task 7 review). This script is the
 * documented remediation; test/orphan-guard.test.ts fails the suite loudly
 * when accumulation exceeds the threshold.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-test-orphans.ts                 # dry run, all vitest_w* schemas
 *   pnpm tsx scripts/cleanup-test-orphans.ts --include-public
 *   pnpm tsx scripts/cleanup-test-orphans.ts --apply         # actually delete
 *   pnpm tsx scripts/cleanup-test-orphans.ts --schema vitest_w3 --apply
 *   pnpm tsx scripts/cleanup-test-orphans.ts --older-than-hours 0.05 --apply
 *
 * Safety:
 *   - dry run by default; --apply is required to delete anything
 *   - only schemas matching ^vitest_w[0-9]+$ or `public` are accepted
 *   - matching is prefix-scoped (scripts/lib/test-orphans.ts) and limited to
 *     rows older than --older-than-hours (default 2), so real branch data and
 *     a concurrently running suite's fresh fixtures are never touched
 */

import { PrismaClient } from "@prisma/client";

import {
  countOrphans,
  deleteOrphans,
  listWorkerSchemas,
  previewOrphanDeletes,
} from "./lib/test-orphans.js";

function parseArgs(argv: string[]) {
  const args = {
    apply: argv.includes("--apply"),
    includePublic: argv.includes("--include-public"),
    schema: undefined as string | undefined,
    olderThanHours: 2,
  };
  const schemaIdx = argv.indexOf("--schema");
  if (schemaIdx !== -1) args.schema = argv[schemaIdx + 1];
  const ageIdx = argv.indexOf("--older-than-hours");
  if (ageIdx !== -1) args.olderThanHours = Number(argv[ageIdx + 1]);
  if (!Number.isFinite(args.olderThanHours) || args.olderThanHours < 0) {
    throw new Error("--older-than-hours must be a non-negative number");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const schemas = args.schema
      ? [args.schema]
      : [...(await listWorkerSchemas(prisma)), ...(args.includePublic ? ["public"] : [])];
    for (const schema of schemas) {
      if (!/^(vitest_w[0-9]+|public)$/.test(schema)) {
        throw new Error(`refusing to touch schema "${schema}": not a test schema or public`);
      }
    }

    let total = 0;
    for (const schema of schemas) {
      const rows = args.apply
        ? await deleteOrphans(prisma, schema, args.olderThanHours)
        : await previewOrphanDeletes(prisma, schema, args.olderThanHours);
      for (const row of rows) {
        console.log(`${args.apply ? "deleted" : "would delete"} ${row.count}\t${row.schema}.${row.table}`);
        total += row.count;
      }
    }
    console.log(
      `${args.apply ? "Deleted" : "Dry run — would delete"} ${total} orphaned test row(s) ` +
        `older than ${args.olderThanHours}h across ${schemas.length} schema(s).` +
        (args.apply ? "" : " Re-run with --apply to delete."),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
