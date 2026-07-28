import type { JobName, JobArgs } from "./types.js";

export interface JobDefinition {
  name: JobName;
  run?: (args: JobArgs) => Promise<unknown>;
  dryRun?: (args: JobArgs) => Promise<unknown>;
  maxAttempts?: number;
}

async function healthDryRun(_args: JobArgs): Promise<unknown> {
  return {
    checks: [],
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}

const registry = new Map<JobName, JobDefinition>();

registry.set("health", {
  name: "health",
  dryRun: healthDryRun,
});

export function getJob(name: JobName): JobDefinition | undefined {
  return registry.get(name);
}
