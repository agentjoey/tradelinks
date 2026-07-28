import { describe, it, expect } from "vitest";
import { retryUnit } from "../src/jobs/retry.js";

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
});
