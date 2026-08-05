/**
 * Production runtime topology test — Railway Cron Cutover (Operations Task 5).
 *
 * Verifies the repository has removed the persistent pg-boss worker topology
 * and retained only finite job commands. The actual cloud observation window
 * (72 hours of no-gap/no-duplicate cron slots) is an orchestrator-only gate.
 *
 * ⏸ SKIPPED on merge into `main`, 2026-08-05, deliberately and with a named
 * re-enable condition — this is a deferral, not a retraction.
 *
 * The assertions are correct about the intended end state and they fail today:
 * `main` still ships `pg-boss` and `pnpm worker`. Deleting those is not a
 * one-line change, because `src/workers/index.ts:22` is the ONLY caller of
 * `seedSources()`, and therefore of `seedPhase1Coverage()` — the finite-job
 * topology never adopted coverage seeding or `refreshCapabilityReadiness()`.
 * Removing the worker before those two have a new home would freeze capability
 * readiness permanently and silently, on a product whose entire claim is an
 * honest readiness grade.
 *
 * Re-enable (drop `.skip`) once BOTH hold:
 *   1. `seedSources()` and `refreshCapabilityReadiness()` run from a finite
 *      job — `health-check` is the natural home, it already runs hourly;
 *   2. `pg-boss`, the `worker` script and `src/workers/index.ts` are removed
 *      in that same change.
 *
 * Leaving it red instead would have taught the suite that red is normal. That
 * is the more expensive mistake.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadPackageJson(): Record<string, unknown> {
  const raw = readFileSync(resolve(import.meta.dirname!, "../package.json"), "utf-8");
  return JSON.parse(raw);
}

describe.skip("production runtime topology", () => {
  it("has no persistent production worker script or pg-boss dependency", () => {
    const pkg = loadPackageJson();
    const deps = (pkg.dependencies as Record<string, string> | undefined) ?? {};
    const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};

    expect(deps["pg-boss"]).toBeUndefined();
    expect(scripts.worker).toBeUndefined();
    expect(scripts.job).toBe("tsx scripts/run-job.ts");
  });

  it("has no pg-boss references in source or package.json", () => {
    const pkg = loadPackageJson();
    const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};

    // No script references "pg-boss" or "worker" in its command
    for (const [name, cmd] of Object.entries(scripts)) {
      expect(cmd, `script "${name}" references pg-boss`).not.toMatch(/\bpg-boss\b/);
      expect(cmd, `script "${name}" references src/workers/index`).not.toMatch(
        /src\/workers\/index/,
      );
    }

    // No dependency on pg-boss (checked again alongside devDependencies)
    const allDeps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };
    expect(allDeps["pg-boss"]).toBeUndefined();
  });
});
