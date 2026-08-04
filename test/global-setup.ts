/**
 * Task 10 — vitest globalSetup: provision one Postgres schema per worker.
 *
 * Runs once per `vitest run` in the main process, before any worker spawns.
 * For each schema in the fixed pool (test/db-isolation.ts):
 *   1. CREATE SCHEMA IF NOT EXISTS vitest_w<N>
 *   2. if its `_prisma_migrations` table is missing or behind the migrations
 *      on disk, run `prisma migrate deploy` against it.
 *
 * Two provisioning subtleties, both learned the hard way:
 *
 * - Migration 0002/0003 create GIN indexes with the unqualified opclass
 *   `gin_trgm_ops`, which lives in `public` (the pg_trgm extension is a
 *   per-database singleton). The migrate engine runs with
 *   search_path=<target schema>, so the unqualified reference fails — and
 *   recreating the opclass per schema needs superuser, which Neon roles do
 *   not have. We therefore deploy from a rewritten COPY of prisma/ (under
 *   node_modules/.cache/test-isolation/) whose only change is
 *   ` gin_trgm_ops` → ` public.gin_trgm_ops`. Migration directory names are
 *   untouched, so `_prisma_migrations` stays compatible. The repo's own
 *   migrations are never modified.
 *
 * - `prisma migrate deploy` takes a global advisory lock, so deploys are
 *   serialized here; and it must go through the DIRECT endpoint (a failed
 *   deploy through the pooler leaks the session-level advisory lock into a
 *   pooled backend and blocks every later deploy).
 *
 * Provisioning is idempotent (marker = applied migration count), so
 * steady-state runs pay only a handful of cheap catalogue queries. A schema
 * with a failed-migration record (P3009) is dropped and rebuilt — the pool
 * schemas contain test data only.
 */
import "dotenv/config";

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { allTestSchemaNames, withSchemaParam } from "./db-isolation.js";

const CACHE_PRISMA_DIR = path.join(
  process.cwd(),
  "node_modules",
  ".cache",
  "test-isolation",
  "prisma",
);

/**
 * Copy prisma/ into the cache dir with the pg_trgm opclass references
 * schema-qualified (see header). Rebuilt every run so new migrations are
 * picked up automatically.
 */
function buildRewrittenPrismaCopy(): string {
  const src = path.join(process.cwd(), "prisma");
  rmSync(path.dirname(CACHE_PRISMA_DIR), { recursive: true, force: true });
  mkdirSync(path.join(CACHE_PRISMA_DIR, "migrations"), { recursive: true });
  copyFileSync(path.join(src, "schema.prisma"), path.join(CACHE_PRISMA_DIR, "schema.prisma"));
  for (const entry of readdirSync(path.join(src, "migrations"), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const targetDir = path.join(CACHE_PRISMA_DIR, "migrations", entry.name);
      mkdirSync(targetDir);
      const sql = readFileSync(path.join(src, "migrations", entry.name, "migration.sql"), "utf8");
      writeFileSync(
        path.join(targetDir, "migration.sql"),
        sql.replaceAll(" gin_trgm_ops", " public.gin_trgm_ops"),
      );
    } else {
      copyFileSync(
        path.join(src, "migrations", entry.name),
        path.join(CACHE_PRISMA_DIR, "migrations", entry.name),
      );
    }
  }
  return path.join(CACHE_PRISMA_DIR, "schema.prisma");
}

function migrationCountOnDisk(): number {
  return readdirSync(path.join(process.cwd(), "prisma", "migrations"), {
    withFileTypes: true,
  }).filter((e) => e.isDirectory() && /^\d+_/.test(e.name)).length;
}

function migrateDeploy(schema: string, rewrittenSchemaPath: string): void {
  const env = { ...process.env };
  env.DATABASE_URL = withSchemaParam(process.env.DATABASE_URL!, schema);
  if (process.env.DIRECT_URL) {
    env.DIRECT_URL = withSchemaParam(process.env.DIRECT_URL, schema);
  }
  const started = Date.now();
  const result = spawnSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--schema", rewrittenSchemaPath],
    { env, encoding: "utf8", timeout: 300_000 },
  );
  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed for schema ${schema}:\n${result.stdout}\n${result.stderr}`,
    );
  }
  console.log(`[test-isolation] migrated schema ${schema} in ${Date.now() - started}ms`);
}

async function appliedMigrationCount(prisma: PrismaClient, schema: string): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int AS c FROM "${schema}"._prisma_migrations WHERE finished_at IS NOT NULL`,
    );
    return rows[0]?.c ?? 0;
  } catch {
    return 0; // schema or marker table does not exist yet
  }
}

async function hasFailedMigration(prisma: PrismaClient, schema: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int AS c FROM "${schema}"._prisma_migrations WHERE finished_at IS NULL`,
    );
    return (rows[0]?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("[test-isolation] DATABASE_URL is not set; cannot provision test schemas");
  }
  const expected = migrationCountOnDisk();
  const rewrittenSchemaPath = buildRewrittenPrismaCopy();
  const prisma = new PrismaClient();
  try {
    // Serialized: migrate deploy takes a database-wide advisory lock.
    for (const schema of allTestSchemaNames()) {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      if (await hasFailedMigration(prisma, schema)) {
        // A previous provisioning attempt died mid-deploy. The pool schemas
        // hold test data only, so rebuild rather than resolve by hand.
        await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      }
      if ((await appliedMigrationCount(prisma, schema)) < expected) {
        migrateDeploy(schema, rewrittenSchemaPath);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
