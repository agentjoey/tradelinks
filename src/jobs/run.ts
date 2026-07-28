import type { JobName, JobArgs, JobResult, JobStatus } from "./types.js";
import { getJob } from "./registry.js";
import { withJobLock } from "./lock.js";
import { retryUnit, DEFAULT_MAX_ATTEMPTS } from "./retry.js";

export function buildSlotKey(name: string, args: JobArgs): string {
  const sorted = Object.keys(args).sort().reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = args[k];
    return acc;
  }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

export async function runJob(
  name: JobName,
  args: JobArgs,
  opts?: { dryRun?: boolean },
): Promise<JobResult> {
  const job = getJob(name);
  if (!job) {
    return { name, status: "UNKNOWN_JOB", exitCode: 1, timestamp: new Date().toISOString() };
  }

  if (opts?.dryRun) {
    if (!job.dryRun) {
      return { name, status: "UNKNOWN_JOB", exitCode: 1, error: "No dry-run handler", timestamp: new Date().toISOString() };
    }
    const result = await job.dryRun(args);
    return { name, status: "DRY_RUN", exitCode: 0, result, dryRun: true, timestamp: new Date().toISOString() };
  }

  if (!job.run) {
    return { name, status: "INVARIANT_FAILURE", exitCode: 1, error: "Job has no run handler", timestamp: new Date().toISOString() };
  }

  const slotKey = buildSlotKey(name, args);
  const lockResult = await withJobLock(slotKey, async () => {
    return retryUnit({
      maxAttempts: job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      baseDelayMs: 1000,
      execute: () => job.run!(args),
    });
  });

  if (lockResult === "LOCKED") {
    return { name, status: "LOCKED", exitCode: 1, timestamp: new Date().toISOString() };
  }

  const retryStatus = lockResult.status;
  let status: JobStatus;
  if (retryStatus === "OK") status = "OK";
  else if (retryStatus === "EXHAUSTED") status = "EXHAUSTED";
  else status = "INVARIANT_FAILURE";

  return {
    name,
    status,
    exitCode: status === "OK" ? 0 : 1,
    attempts: lockResult.attempts,
    error: lockResult.error ? String(lockResult.error) : undefined,
    result: lockResult.value,
    timestamp: new Date().toISOString(),
  };
}
