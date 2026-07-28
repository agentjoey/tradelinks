import type { JobName, JobArgs, JobResult } from "./types.js";

export interface JobDefinition {
  name: JobName;
  run?: (args: JobArgs) => Promise<JobResult>;
  dryRun?: (args: JobArgs) => Promise<JobResult>;
  maxAttempts?: number;
  delay?: (attempt: number, baseDelayMs: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
}

const HEALTH_DEFAULTS = {
  name: "health" as const,
  dryRun: async (_args: JobArgs): Promise<JobResult> => ({
    runId: crypto.randomUUID(),
    status: "SUCCEEDED_EMPTY" as const,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    itemCount: 0,
    exitCode: 0 as const,
  }),
};

const registry = new Map<JobName, JobDefinition>();

registry.set("health", { ...HEALTH_DEFAULTS });

export function getJob(name: JobName): JobDefinition | undefined {
  return registry.get(name);
}

export function registerJob(def: JobDefinition): void {
  const existing = registry.get(def.name);
  registry.set(def.name, { ...existing, ...def } as JobDefinition);
}

export function unregisterJob(name: JobName): void {
  if (name === "health") {
    registry.set("health", { ...HEALTH_DEFAULTS });
  } else {
    registry.delete(name);
  }
}
