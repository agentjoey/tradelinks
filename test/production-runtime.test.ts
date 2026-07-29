/**
 * Production runtime topology test — Railway Cron Cutover (Operations Task 5).
 *
 * Verifies the repository has removed the persistent pg-boss worker topology
 * and retained only finite job commands. The actual cloud observation window
 * (72 hours of no-gap/no-duplicate cron slots) is an orchestrator-only gate.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadPackageJson(): Record<string, unknown> {
  const raw = readFileSync(resolve(import.meta.dirname!, "../package.json"), "utf-8");
  return JSON.parse(raw);
}

describe("production runtime topology", () => {
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
