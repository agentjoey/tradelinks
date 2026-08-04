/**
 * Task 10 — test isolation: one Postgres schema per vitest worker.
 *
 * Every DB-backed test file used to target the shared `public` schema of the
 * Neon dev branch, so parallel workers raced each other (whole-table reads
 * vs FK-safe teardowns, whole-table recomputes flipping other suites'
 * fixtures). Each vitest worker now gets its own schema (`vitest_w<N>`,
 * N = VITEST_POOL_ID — the 1-based pool slot, NOT VITEST_WORKER_ID, which
 * increments on every worker-process recycle), provisioned once by
 * test/global-setup.ts and reused across runs. Product code is untouched: the schema is selected purely by
 * rewriting the `schema` query parameter of DATABASE_URL/DIRECT_URL in test
 * setup, before any PrismaClient is constructed.
 *
 * This module is the single source of truth shared by vitest.config.ts
 * (worker count), test/global-setup.ts (provisioning) and
 * test/setup-db-schema.ts (per-worker env rewrite).
 */

/** Fixed worker pool so the schema set is bounded and provisioned up front. */
export const TEST_WORKER_COUNT = 9;

/** Schema name for a 1-based vitest worker id. */
export function testSchemaName(workerId: number): string {
  return `vitest_w${workerId}`;
}

/** All schema names this suite may use. */
export function allTestSchemaNames(): string[] {
  return Array.from({ length: TEST_WORKER_COUNT }, (_, i) => testSchemaName(i + 1));
}

/**
 * Return `url` with its `schema` query parameter set to `schema`, preserving
 * every other parameter (sslmode, connect_timeout, ...). Prisma reads the
 * `schema` parameter and qualifies every generated query with it; the server
 * never sees it.
 */
export function withSchemaParam(url: string, schema: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

/**
 * The worker's own schema name, resolved from VITEST_POOL_ID (1-based pool
 * slot, bounded by maxWorkers). VITEST_WORKER_ID is NOT usable here: it
 * increments every time vitest recycles a worker process and quickly exceeds
 * the pool size. Falls back to worker 1 for non-vitest callers (e.g. `tsx`
 * scripts).
 */
export function currentWorkerSchema(): string {
  const raw = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1 || id > TEST_WORKER_COUNT) {
    throw new Error(
      `VITEST_POOL_ID "${raw}" is outside the provisioned schema pool (1..${TEST_WORKER_COUNT})`,
    );
  }
  return testSchemaName(id);
}
