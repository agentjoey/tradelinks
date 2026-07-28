import type { JobName, JobArgs, JobResult } from "./types.js";
import { getJob } from "./registry.js";
import { withJobLock } from "./lock.js";
import { retryUnit, DEFAULT_MAX_ATTEMPTS } from "./retry.js";
import { randomUUID } from "node:crypto";

export function buildSlotKey(name: string, scheduledFor: Date): string {
  return `${name}:${scheduledFor.toISOString()}`;
}

export async function runJob(name: JobName, args: JobArgs): Promise<JobResult> {
  const job = getJob(name);

  if (!job) {
    return { runId: randomUUID(), status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  if (args.dryRun) {
    if (!job.dryRun) {
      return { runId: randomUUID(), status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
    }
    return job.dryRun(args);
  }

  if (!job.run) {
    return { runId: randomUUID(), status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  const slotKey = buildSlotKey(name, args.scheduledFor);
  const lockResult = await withJobLock(slotKey, async () => {
    return retryUnit({
      maxAttempts: job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      baseDelayMs: 1000,
      execute: () => job.run!(args),
      isRetryable: job.isRetryable,
      delay: job.delay,
    });
  });

  if (lockResult === "LOCKED") {
    return { runId: randomUUID(), status: "BLOCKED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  if (lockResult.status === "EXHAUSTED") {
    return { runId: randomUUID(), status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 1 };
  }

  if (lockResult.status === "INVARIANT_FAILURE") {
    return { runId: randomUUID(), status: "FAILED", attempted: 0, succeeded: 0, failed: 0, itemCount: 0, exitCode: 2 };
  }

  // OK — handler produced a JobResult, pass through unchanged
  return lockResult.value!;
}
