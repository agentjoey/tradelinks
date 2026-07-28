import { describe, it, expect } from "vitest";
import { bigintFromStableHash } from "../src/jobs/lock.js";
import { createPrismaLockAdapter } from "../src/jobs/prisma-adapter.js";
import type { LockAdapter } from "../src/jobs/lock.js";
import { buildSlotKey } from "../src/jobs/run.js";

/* ------------------------------------------------------------------ */
/*  Fake Prisma — mimics $transaction + $queryRaw + xact-lock lifecycle  */
/* ------------------------------------------------------------------ */

class FakePrisma {
  private locks = new Set<string>();
  private txAcquired = new Set<string>();

  $transaction = async <T>(
    fn: (tx: { $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }) => Promise<T>,
    _opts?: { maxWait?: number; timeout?: number },
  ): Promise<T> => {
    const tx = {
      $queryRaw: async (
        _strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<unknown> => {
        const id = (values[0] as bigint).toString();
        if (this.locks.has(id)) return [{ locked: false }];
        this.locks.add(id);
        this.txAcquired.add(id);
        return [{ locked: true }];
      },
    };
    try {
      return await fn(tx);
    } finally {
      for (const key of this.txAcquired) this.locks.delete(key);
      this.txAcquired.clear();
    }
  };
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
    for (const key of ["", "a", "hello world", "x".repeat(100), "🪣"]) {
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
  function makeAdapter(): { db: FakePrisma; adapter: LockAdapter } {
    const db = new FakePrisma();
    return { db, adapter: createPrismaLockAdapter(db) };
  }

  it("acquires the lock, runs fn, and returns its value", async () => {
    const { adapter } = makeAdapter();
    const result = await adapter.acquire("key-1", async () => 42);
    expect(result).toBe(42);
  });

  it("returns LOCKED when the lock is held by another transaction", async () => {
    const { db, adapter } = makeAdapter();
    const { work, release } = deferredWorkPair();

    const holder = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${bigintFromStableHash("key-2")}) AS locked`;
      return work();
    });

    const result = await adapter.acquire("key-2", async () => "SHOULD NOT RUN");
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

  it("releases lock after fn completes (re-entrant)", async () => {
    const { adapter } = makeAdapter();
    const a = await adapter.acquire("key-r", async () => "first");
    expect(a).toBe("first");
    const b = await adapter.acquire("key-r", async () => "second");
    expect(b).toBe("second");
  });

  it("releases lock when fn throws (error propagates)", async () => {
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
});

/* ------------------------------------------------------------------ */
/*  buildSlotKey                                                        */
/* ------------------------------------------------------------------ */

describe("buildSlotKey", () => {
  it("is order-independent (sorted keys)", () => {
    const a = buildSlotKey("collect", { region: "eu", hour: 8 });
    const b = buildSlotKey("collect", { hour: 8, region: "eu" });
    expect(a).toBe(b);
  });

  it("does not collide on delimiter", () => {
    const k1 = buildSlotKey("job", { a: "x:y" });
    const k2 = buildSlotKey("job", { a: "x", b: "y" });
    expect(k1).not.toBe(k2);
  });

  it("uses the job name as the key prefix", () => {
    const k1 = buildSlotKey("alpha", { x: 1 });
    const k2 = buildSlotKey("beta", { x: 1 });
    expect(k1).not.toBe(k2);
    expect(k1.startsWith("alpha:")).toBe(true);
    expect(k2.startsWith("beta:")).toBe(true);
  });
});
