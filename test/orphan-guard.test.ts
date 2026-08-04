import { describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

import {
  countOrphans,
  listWorkerSchemas,
} from "../scripts/lib/test-orphans.js";

/**
 * Task 10 — orphan safety net. Killed runs leave run-scoped fixtures behind;
 * left unchecked they accumulate until whole-table queries slow past their
 * timeouts (Task 7: 91 orphaned canonical changes removed by hand). This
 * guard makes the suite FAIL LOUDLY on accumulation instead of silently
 * slowing down.
 *
 * Counts prefix-matched rows older than 2h in every vitest_w* worker schema
 * plus public. The age filter keeps the current run's own fixtures (fresh,
 * in other workers' schemas) out of the count; the prefix list keeps real
 * branch data out. Contract rows seeded by coverage-readiness use fixed
 * non-prefixed ids and are never matched.
 *
 * Remediation when this fails:
 *   pnpm tsx scripts/cleanup-test-orphans.ts --include-public          # dry run
 *   pnpm tsx scripts/cleanup-test-orphans.ts --include-public --apply  # delete
 */
const ORPHAN_THRESHOLD = 100;
const OLDER_THAN_HOURS = 2;

describe("test orphan guard", () => {
  it(
    `orphaned test fixtures stay below ${ORPHAN_THRESHOLD} rows across all schemas`,
    async () => {
      const prisma = new PrismaClient();
      try {
        const schemas = [...(await listWorkerSchemas(prisma)), "public"];
        const orphans = await countOrphans(prisma, schemas, OLDER_THAN_HOURS);
        const total = orphans.reduce((sum, o) => sum + o.count, 0);
        const breakdown = orphans.map((o) => `${o.schema}.${o.table}=${o.count}`).join(", ");
        expect(
          total,
          `orphaned test fixtures exceed ${ORPHAN_THRESHOLD} rows: ${breakdown || "none"}. ` +
            `Run: pnpm tsx scripts/cleanup-test-orphans.ts --include-public --apply`,
        ).toBeLessThanOrEqual(ORPHAN_THRESHOLD);
      } finally {
        await prisma.$disconnect();
      }
    },
    120_000,
  );
});
