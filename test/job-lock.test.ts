import { describe, it, expect } from "vitest";
import { withJobLock, setLockAdapter, type LockAdapter } from "../src/jobs/lock.js";

function createInMemoryAdapter(): LockAdapter {
  const locks = new Set<string>();
  return {
    async acquire<T>(key: string, fn: () => Promise<T>): Promise<T | "LOCKED"> {
      if (locks.has(key)) return "LOCKED";
      locks.add(key);
      try {
        return await fn();
      } finally {
        locks.delete(key);
      }
    },
  };
}

setLockAdapter(createInMemoryAdapter());

const prefix = `test-lock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function deferredWorkPair() {
  let resolver: (() => void) | undefined;
  const work = () =>
    new Promise<void>((resolve) => {
      resolver = resolve;
    });
  const release = () => resolver?.();
  return { work, release };
}

describe("withJobLock", () => {
  it("acquires lock and runs fn", async () => {
    const key = `${prefix}-basic`;
    const result = await withJobLock(key, async () => 42);
    expect(result).toBe(42);
  });

  it("returns LOCKED when slot is already taken", async () => {
    const key = `${prefix}-concurrent`;
    const { work, release } = deferredWorkPair();

    const first = withJobLock(key, work);
    const secondResult = await withJobLock(key, work);
    expect(secondResult).toBe("LOCKED");

    release();
    const firstResult = await first;
    expect(firstResult).toBeUndefined();
  });

  it("different keys do not conflict", async () => {
    const key1 = `${prefix}-diff1`;
    const key2 = `${prefix}-diff2`;
    const { work, release } = deferredWorkPair();

    const first = withJobLock(key1, work);
    const secondResult = await withJobLock(key2, async () => "second");
    expect(secondResult).toBe("second");

    release();
    await first;
  });

  it("releases lock after fn completes", async () => {
    const key = `${prefix}-release`;
    const a = await withJobLock(key, async () => "a");
    expect(a).toBe("a");
    const b = await withJobLock(key, async () => "b");
    expect(b).toBe("b");
  });

  it("releases lock when fn throws", async () => {
    const key = `${prefix}-error`;
    await expect(
      withJobLock(key, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const result = await withJobLock(key, async () => "recovered");
    expect(result).toBe("recovered");
  });
});
