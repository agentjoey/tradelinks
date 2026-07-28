import type { JobName, JobArgs, JobResult, JobStatus } from "./types.js";
import { getJob } from "./registry.js";
import { withJobLock } from "./lock.js";
import { retryUnit, DEFAULT_MAX_ATTEMPTS } from "./retry.js";
import { randomUUID } from "node:crypto";

export function buildSlotKey(name: string, scheduledFor: Date): string {
  return `${name}:${scheduledFor.toISOString()}`;
}

export async function runJob(name: JobName, args: JobArgs): Promise<JobResult> {
  const runId = randomUUID();
  const job = getJob(name);

  if (!job) {
    return { runId, status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  if (args.dryRun) {
    if (!job.dryRun) {
      return { runId, status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
    }
    return job.dryRun(args, runId);
  }

  if (!job.run) {
    return { runId, status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  const slotKey = buildSlotKey(name, args.scheduledFor);
  const lockResult = await withJobLock(slotKey, async () => {
    return retryUnit({
      maxAttempts: job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      baseDelayMs: 1000,
      execute: () => job.run!(args),
      delay: job.delay,
    });
  });

  if (lockResult === "LOCKED") {
    return { runId, status: "BLOCKED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  if (lockResult.status !== "OK") {
    return { runId, status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  const { attempted, succeeded, failed, itemCount } = lockResult.value!;
  let status: JobStatus;
  let exitCode: 0 | 1 | 2;

  if (attempted === 0) {
    status = "SUCCEEDED_EMPTY";
    exitCode = 0;
  } else if (failed === 0) {
    status = "SUCCEEDED_ITEMS";
    exitCode = 0;
  } else if (succeeded > 0) {
    status = "PARTIAL";
    exitCode = 1;
  } else {
    status = "FAILED";
    exitCode = 2;
  }

  return { runId, status, attempted, succeeded, failed, itemCount, exitCode };
}
