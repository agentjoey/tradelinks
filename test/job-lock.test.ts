import { describe, it, expect } from "vitest";
import { bigintFromStableHash, setLockAdapter } from "../src/jobs/lock.js";
import { createPrismaLockAdapter, MAX_JOB_DURATION_MS } from "../src/jobs/prisma-adapter.js";
import { buildSlotKey, runJob } from "../src/jobs/run.js";
import { registerJob } from "../src/jobs/registry.js";
import { DEFAULT_MAX_ATTEMPTS } from "../src/jobs/retry.js";

/* ------------------------------------------------------------------ */
/*  Fake Prisma — models pg_try_advisory_xact_lock lifecycle            */
/* ------------------------------------------------------------------ */

class FakePrisma {
  private locks = new Set<string>();
  private capturedOpts: Array<{ maxWait?: number; timeout?: number }> = [];

  $transaction = async <T>(
    fn: (tx: { $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }) => Promise<T>,
    opts?: { maxWait?: number; timeout?: number },
  ): Promise<T> => {
    this.capturedOpts.push(opts ?? {});
    const txAcquired = new Set<string>();

    const tx = {
      $queryRaw: async (
        _strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<unknown> => {
        const id = (values[0] as bigint).toString();
        if (this.locks.has(id)) return [{ locked: false }];
        this.locks.add(id);
        txAcquired.add(id);
        return [{ locked: true }];
      },
    };
    try {
      return await fn(tx);
    } finally {
      for (const key of txAcquired) this.locks.delete(key);
    }
  };

  getCapturedOpts() {
    return this.capturedOpts;
  }
}

function makeAdapter() {
  const db = new FakePrisma();
  return { db, adapter: createPrismaLockAdapter(db) };
}

function deferredWorkPair() {
  let resolver: (() => void) | undefined;
  const work = () =>
    new Promise<void>((resolve) => {
      resolver = resolve;
    });
  const release = () => resolver?.();
  return { work, release };
}

/* ------------------------------------------------------------------ */
/*  bigintFromStableHash                                               */
/* ------------------------------------------------------------------ */

describe("bigintFromStableHash", () => {
  it("is deterministic", () => {
    const a = bigintFromStableHash("hello");
    const b = bigintFromStableHash("hello");
    expect(a).toBe(b);
  });

  it("produces distinct ids for distinct keys", () => {
    const ids = new Set(
      ["a", "b", "aa", "ab", "hello", "world"].map(bigintFromStableHash),
    );
    expect(ids.size).toBe(6);
  });

  it("always fits in signed-64 positive range", () => {
    for (const key of ["", "a", "hello world", "x".repeat(100), "\u{1f9e3}"]) {
      const id = bigintFromStableHash(key);
      expect(id).toBeGreaterThanOrEqual(0n);
      expect(id).toBeLessThanOrEqual(0x7fffffffffffffffn);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  createPrismaLockAdapter (product lock primitive)                   */
/* ------------------------------------------------------------------ */

describe("createPrismaLockAdapter", () => {
  it("acquires the lock, runs fn, and returns its value", async () => {
    const { adapter } = makeAdapter();
    const result = await adapter.acquire("key-1", async () => 42);
    expect(result).toBe(42);
  });

  it("returns LOCKED when the lock is held (locked:false from try_lock)", async () => {
    const { db, adapter } = makeAdapter();
    const { work, release } = deferredWorkPair();

    const holder = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${bigintFromStableHash("key-2")}) AS locked`;
      return work();
    });

    const result = await adapter.acquire("key-2", async () => "never");
    expect(result).toBe("LOCKED");

    release();
    await holder;
  });

  it("different keys do not conflict", async () => {
    const { db, adapter } = makeAdapter();
    const { work, release } = deferredWorkPair();

    const holder = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${bigintFromStableHash("key-a")}) AS locked`;
      return work();
    });

    const result = await adapter.acquire("key-b", async () => "second");
    expect(result).toBe("second");

    release();
    await holder;
  });

  it("releases lock after fn completes (re-entrant acquire succeeds)", async () => {
    const { adapter } = makeAdapter();
    const a = await adapter.acquire("key-r", async () => "first");
    expect(a).toBe("first");
    const b = await adapter.acquire("key-r", async () => "second");
    expect(b).toBe("second");
  });

  it("releases lock when fn throws (error propagates, next acquire succeeds)", async () => {
    const { adapter } = makeAdapter();
    await expect(
      adapter.acquire("key-e", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const recovered = await adapter.acquire("key-e", async () => "ok");
    expect(recovered).toBe("ok");
  });

  it("never calls fn when the lock is unavailable", async () => {
    const { db, adapter } = makeAdapter();
    const { work, release } = deferredWorkPair();

    const holder = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${bigintFromStableHash("key-nofn")}) AS locked`;
      return work();
    });

    let called = false;
    const result = await adapter.acquire("key-nofn", async () => {
      called = true;
      return "nope";
    });
    expect(result).toBe("LOCKED");
    expect(called).toBe(false);

    release();
    await holder;
  });

  it("regression: denied transaction does not release another transaction's lock", async () => {
    const { db, adapter } = makeAdapter();
    const { work, release } = deferredWorkPair();

    // tx1 holds the lock
    const tx1 = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${bigintFromStableHash("key-x")}) AS locked`;
      return work();
    });

    // tx2 tries the same lock — denied
    const locked = await adapter.acquire("key-x", async () => "no");
    expect(locked).toBe("LOCKED");

    // tx3 tries the same lock — must still be denied (tx1 still holds it)
    const lockedAgain = await adapter.acquire("key-x", async () => "still no");
    expect(lockedAgain).toBe("LOCKED");

    release();
    await tx1;

    // after tx1 releases, acquire succeeds
    const now = await adapter.acquire("key-x", async () => "finally");
    expect(now).toBe("finally");
  });

  it("passes timeout and maxWait to the transaction", async () => {
    const { db, adapter } = makeAdapter();
    await adapter.acquire("key-opts", async () => 42);
    const opts = db.getCapturedOpts();
    expect(opts.length).toBe(1);
    expect(opts[0]!.timeout).toBe(MAX_JOB_DURATION_MS);
    expect(opts[0]!.maxWait).toBe(30_000);
  });
});

describe("MAX_JOB_DURATION_MS", () => {
  it("exceeds the 20-minute Railway job maximum", () => {
    expect(MAX_JOB_DURATION_MS).toBeGreaterThan(1_200_000);
  });
});

/* ------------------------------------------------------------------ */
/*  buildSlotKey                                                        */
/* ------------------------------------------------------------------ */

describe("buildSlotKey", () => {
  it("derives key from name and scheduledFor", () => {
    const d = new Date("2026-07-23T08:00:00.000Z");
    expect(buildSlotKey("collect-fast", d)).toBe("collect-fast:2026-07-23T08:00:00.000Z");
  });

  it("produces distinct keys for different names", () => {
    const d = new Date("2026-07-23T08:00:00.000Z");
    expect(buildSlotKey("collect-fast", d)).not.toBe(buildSlotKey("collect-slow", d));
  });

  it("produces distinct keys for different times", () => {
    expect(
      buildSlotKey("health", new Date("2026-07-23T08:00:00.000Z")),
    ).not.toBe(
      buildSlotKey("health", new Date("2026-07-23T09:00:00.000Z")),
    );
  });

  it("JobName members contain no colons (key delimiter safe)", () => {
    const names: string[] = [
      "collect-fast", "collect-standard", "collect-slow",
      "canonicalize", "publish", "public-briefing",
      "health", "cost-report",
    ];
    for (const n of names) {
      expect(n).not.toContain(":");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  runJob default retry ladder                                        */
/* ------------------------------------------------------------------ */

describe("runJob default retry ladder", () => {
  it("retries up to DEFAULT_MAX_ATTEMPTS when run handler throws", async () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(4);

    let calls = 0;
    registerJob({
      name: "health",
      run: async () => {
        calls++;
        throw new Error("retryable");
      },
      delay: async () => {},
    });

    // Use a memory adapter so no real Prisma needed
    setLockAdapter({
      async acquire<T>(_key: string, fn: () => Promise<T>): Promise<T | "LOCKED"> {
        return fn();
      },
    });

    const result = await runJob("health", {
      scheduledFor: new Date("2026-07-23T08:00:00.000Z"),
      runnerVersion: "test",
      dryRun: false,
    });

    expect(result.status).toBe("FAILED");
    expect(result.exitCode).toBe(2);
    expect(calls).toBe(4);
  });
});
