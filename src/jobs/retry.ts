import type { RetryInput, RetryResult } from "./types.js";

const RETRY_MULTIPLIER = 4;

function defaultDelay(attempt: number, baseDelayMs: number): Promise<void> {
  if (attempt <= 1) return Promise.resolve();
  const ms = baseDelayMs * Math.pow(RETRY_MULTIPLIER, attempt - 2);
  return new Promise((r) => setTimeout(r, ms));
}

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
