export type JobName =
  | "collect-fast"
  | "collect-standard"
  | "collect-slow"
  | "canonicalize"
  | "publish"
  | "public-briefing"
  | "health"
  | "cost-report";

export interface JobArgs {
  scheduledFor: Date;
  runnerVersion: string;
  dryRun: boolean;
}

export type JobStatus = "SUCCEEDED_EMPTY" | "SUCCEEDED_ITEMS" | "PARTIAL" | "FAILED" | "BLOCKED";

export interface JobResult {
  runId: string;
  status: JobStatus;
  attempted: number;
  succeeded: number;
  failed: number;
  itemCount: number;
  exitCode: 0 | 1 | 2;
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
