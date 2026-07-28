import type { JobName, JobArgs, JobResult, JobStatus } from "./types.js";
import { getJob } from "./registry.js";
import { withJobLock } from "./lock.js";
import { retryUnit } from "./retry.js";

export async function runJob(
  name: JobName,
  args: JobArgs,
  opts?: { dryRun?: boolean },
): Promise<JobResult> {
  const job = getJob(name);
  if (!job) {
    return { name, status: "UNKNOWN_JOB", exitCode: 1 };
  }

  if (opts?.dryRun) {
    if (!job.dryRun) {
      return { name, status: "UNKNOWN_JOB", exitCode: 1, error: "No dry-run handler" };
    }
    const result = await job.dryRun(args);
    return { name, status: "DRY_RUN", exitCode: 0, result, dryRun: true };
  }

  if (!job.run) {
    return { name, status: "INVARIANT_FAILURE", exitCode: 1, error: "Job has no run handler" };
  }

  const slotKey = [name, ...Object.values(args)].join(":");
  const lockResult = await withJobLock(slotKey, async () => {
    return retryUnit({
      maxAttempts: job.maxAttempts ?? 1,
      baseDelayMs: 1000,
      execute: () => job.run!(args),
    });
  });

  if (lockResult === "LOCKED") {
    return { name, status: "LOCKED", exitCode: 1 };
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
  };
}
