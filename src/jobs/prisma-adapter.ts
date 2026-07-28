import { bigintFromStableHash } from "./lock-internal.js";
import type { LockAdapter } from "./lock-internal.js";

/**
 * Maximum job duration (5 min) enforced by the Prisma interactive-transaction
 * timeout. A job whose single attempt runs longer than this cap will see the
 * xact lock silently released (P2028 rollback) and a concurrent dispatch can
 * overlap. No Task 2 batch or health scan is expected to approach this ceiling.
 */
export const MAX_JOB_DURATION_MS = 300_000;

/** Create a LockAdapter backed by an injected SQL executor. */
export function createPrismaLockAdapter(
  client: {
    $transaction: <T>(
      fn: (tx: { $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }) => Promise<T>,
      opts?: { maxWait?: number; timeout?: number },
    ) => Promise<T>;
  },
): LockAdapter {
  return {
    async acquire<T>(key: string, fn: () => Promise<T>): Promise<T | "LOCKED"> {
      const lockId = bigintFromStableHash(key);
      return client.$transaction(
        async (tx) => {
          const rows = (await tx.$queryRaw`
            SELECT pg_try_advisory_xact_lock(${lockId}) AS locked
          `) as Array<{ locked: boolean }>;
          if (!rows[0]?.locked) return "LOCKED" as const;
          return fn();
        },
        { maxWait: 30_000, timeout: MAX_JOB_DURATION_MS },
      );
    },
  };
}
