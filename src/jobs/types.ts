export type JobName = "health";

export type JobArgs = Record<string, unknown>;

export type JobStatus = "OK" | "DRY_RUN" | "LOCKED" | "EXHAUSTED" | "INVARIANT_FAILURE" | "UNKNOWN_JOB";

export interface JobResult {
  name: JobName;
  status: JobStatus;
  exitCode: number;
  attempts?: number;
  error?: string;
  result?: unknown;
  dryRun?: boolean;
  timestamp?: string;
}

export type RetryStatus = "OK" | "EXHAUSTED" | "INVARIANT_FAILURE";

export interface RetryInput<T> {
  maxAttempts: number;
  baseDelayMs: number;
  execute: () => Promise<T>;
  isRetryable?: (error: unknown) => boolean;
  delay?: (attempt: number, baseDelayMs: number) => Promise<void>;
}

export interface RetryResult<T> {
  status: RetryStatus;
  attempts: number;
  value?: T;
  error?: unknown;
}
