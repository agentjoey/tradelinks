/**
 * Task 10 — per-worker schema selection. Runs (via setupFiles) before every
 * test file's imports, i.e. before any test module constructs its
 * PrismaClient. It rewrites DATABASE_URL/DIRECT_URL in-place to point at this
 * worker's schema (see test/db-isolation.ts). Pure string surgery, no I/O.
 *
 * Schemas are created and migrated by test/global-setup.ts; nothing here
 * touches the database.
 */
import { currentWorkerSchema, withSchemaParam } from "./db-isolation.js";

if (process.env.DATABASE_URL) {
  const schema = currentWorkerSchema();
  process.env.DATABASE_URL = withSchemaParam(process.env.DATABASE_URL, schema);
  if (process.env.DIRECT_URL) {
    process.env.DIRECT_URL = withSchemaParam(process.env.DIRECT_URL, schema);
  }
}
