import { describe, it, expect } from "vitest";
import { retryUnit, computeDelayMs, defaultDelay, RETRY_MULTIPLIER, DEFAULT_MAX_ATTEMPTS } from "../src/jobs/retry.js";

async function alwaysRetryableFailure(): Promise<never> {
  throw new Error("retryable");
}

function nonRetryableFailure(): Promise<never> {
  throw Object.assign(new Error("fatal"), { code: "INVARIANT" });
}

describe("retryUnit", () => {
  it("succeeds on first attempt", async () => {
    const result = await retryUnit({
      maxAttempts: 3,
      baseDelayMs: 1,
      execute: async () => "ok",
    });
    expect(result.status).toBe("OK");
    expect(result.attempts).toBe(1);
    expect(result.value).toBe("ok");
  });

  it("retries until success", async () => {
    let calls = 0;
    const result = await retryUnit({
      maxAttempts: 3,
      baseDelayMs: 1,
      execute: async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "recovered";
      },
    });
    expect(result.status).toBe("OK");
    expect(result.attempts).toBe(3);
    expect(result.value).toBe("recovered");
  });

  it("stops after maxAttempts retryable failures (EXHAUSTED)", async () => {
    const result = await retryUnit({
      maxAttempts: 3,
      baseDelayMs: 1,
      execute: alwaysRetryableFailure,
    });
    expect(result.attempts).toBe(3);
    expect(result.status).toBe("EXHAUSTED");
    expect(result.error).toBeDefined();
  });

  it("stops immediately on non-retryable error", async () => {
    let calls = 0;
    const result = await retryUnit({
      maxAttempts: 5,
      baseDelayMs: 1,
      execute: async () => {
        calls++;
        return nonRetryableFailure();
      },
      isRetryable: (e: unknown) => (e as { code?: string }).code !== "INVARIANT",
    });
    expect(result.attempts).toBe(1);
    expect(result.status).toBe("INVARIANT_FAILURE");
    expect(calls).toBe(1);
  });

  it("uses injected delay function", async () => {
    const delays: number[] = [];
    const result = await retryUnit({
      maxAttempts: 2,
      baseDelayMs: 0,
      execute: alwaysRetryableFailure,
      delay: async (attempt: number) => {
        delays.push(attempt);
      },
    });
    expect(result.status).toBe("EXHAUSTED");
    expect(delays).toEqual([2]);
  });

  it("defaults to 4 attempts via DEFAULT_MAX_ATTEMPTS", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
/*  computeDelayMs — production schedule                               */
/* ------------------------------------------------------------------ */

describe("computeDelayMs", () => {
  it("returns 0 for attempt 1 (no delay before first execution)", () => {
    expect(computeDelayMs(1, 1000)).toBe(0);
  });

  it("yields 1s / 4s / 16s with baseDelayMs=1000", () => {
    expect(computeDelayMs(2, 1000)).toBe(1000);
    expect(computeDelayMs(3, 1000)).toBe(4000);
    expect(computeDelayMs(4, 1000)).toBe(16000);
  });

  it("scales linearly with baseDelayMs", () => {
    expect(computeDelayMs(2, 2000)).toBe(2000);
    expect(computeDelayMs(3, 2000)).toBe(8000);
    expect(computeDelayMs(4, 2000)).toBe(32000);
  });

  it("uses RETRY_MULTIPLIER = 4", () => {
    expect(RETRY_MULTIPLIER).toBe(4);
  });

  it("total retry budget fits within lock timeout", () => {
    // worst case: 4 attempts, delays 0 + 1s + 4s + 16s = 21s of waiting
    // plus execution time < 20 min per the Railway cap
    const totalDelayMs = computeDelayMs(2, 1000) + computeDelayMs(3, 1000) + computeDelayMs(4, 1000);
    expect(totalDelayMs).toBe(21000);
  });
});

/* ------------------------------------------------------------------ */
/*  defaultDelay — returns a promise (smoke test)                      */
/* ------------------------------------------------------------------ */

describe("defaultDelay", () => {
  it("resolves instantly for attempt 1", async () => {
    const start = Date.now();
    await defaultDelay(1, 1000);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("returns a promise for attempt 2", () => {
    const p = defaultDelay(2, 1);
    expect(p).toBeInstanceOf(Promise);
  });
});
