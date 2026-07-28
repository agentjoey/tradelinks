import type { JobName, JobArgs, JobResult } from "./types.js";

export interface RunCounts {
  attempted: number;
  succeeded: number;
  failed: number;
  itemCount: number;
}

export interface JobDefinition {
  name: JobName;
  run?: (args: JobArgs) => Promise<RunCounts>;
  dryRun?: (args: JobArgs, runId: string) => Promise<JobResult>;
  maxAttempts?: number;
  delay?: (attempt: number, baseDelayMs: number) => Promise<void>;
}

async function healthDryRun(_args: JobArgs, runId: string): Promise<JobResult> {
  return {
    runId,
    status: "SUCCEEDED_EMPTY",
    attempted: 0,
    succeeded: 0,
    failed: 0,
    itemCount: 0,
    exitCode: 0,
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

export function registerJob(def: JobDefinition): void {
  const existing = registry.get(def.name);
  registry.set(def.name, { ...existing, ...def } as JobDefinition);
}
