import { configDefaults, defineConfig } from "vitest/config";

import { TEST_WORKER_COUNT } from "./test/db-isolation";

export default defineConfig({
  esbuild: {
    // tsconfig keeps jsx: "preserve" for Next; tests need the automatic runtime.
    jsx: "automatic",
  },
  test: {
    // Spread the defaults so the built-in dist/.cache/.git/.idea/.output
    // exclusions survive; only add the Playwright e2e directory on top.
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    // Task 10 — test isolation: fixed worker pool, one Postgres schema per
    // worker (provisioned by globalSetup, selected per worker by
    // test/setup-db-schema.ts). See docs/superpowers/verification/
    // 2026-08-02-phase1-public-intelligence/test-isolation.md.
    maxWorkers: TEST_WORKER_COUNT,
    // minWorkers defaults to maxWorkers, which conflicts with vitest capping
    // workers to the file count on filtered (single-file) runs.
    minWorkers: 1,
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["dotenv/config", "test/setup-db-schema.ts", "test/setup-dom.ts"],
  },
});
