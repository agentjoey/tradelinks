import type { RetryInput, RetryResult } from "./types.js";

export const RETRY_MULTIPLIER = 4;

/** Compute the delay in ms for a given attempt number (1-indexed). */
export function computeDelayMs(attempt: number, baseDelayMs: number): number {
  if (attempt <= 1) return 0;
  return baseDelayMs * Math.pow(RETRY_MULTIPLIER, attempt - 2);
}

/**
 * Production retry delay schedule: attempt 1→0ms, 2→1s, 3→4s, 4→16s.
 * Exported for verification.
 */
export function defaultDelay(attempt: number, baseDelayMs: number): Promise<void> {
  const ms = computeDelayMs(attempt, baseDelayMs);
  if (ms === 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Every job retries up to 4 times (initial + 3 retries) with
 * 1 s / 4 s / 16 s backoff. The retry budget (21 s) fits within
 * the 21-minute transaction timeout (MAX_JOB_DURATION_MS).
 */
export const DEFAULT_MAX_ATTEMPTS = 4;

export async function retryUnit<T>(input: RetryInput<T>): Promise<RetryResult<T>> {
  const { maxAttempts, baseDelayMs, execute, isRetryable, delay } = input;
  const wait = delay ?? ((attempt: number, ms: number) => defaultDelay(attempt, ms));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await wait(attempt, baseDelayMs);
    }
    try {
      const value = await execute();
      return { status: "OK", attempts: attempt, value };
    } catch (error) {
      lastError = error;
      if (isRetryable && !isRetryable(error)) {
        return { status: "INVARIANT_FAILURE", attempts: attempt, error };
      }
    }
  }

  return { status: "EXHAUSTED", attempts: maxAttempts, error: lastError };
}
