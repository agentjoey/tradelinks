import { prisma } from "../db/client.js";
import { bigintFromStableHash } from "./lock-internal.js";
import type { LockAdapter } from "./lock-internal.js";

export const prismaLockAdapter: LockAdapter = {
  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T | "LOCKED"> {
    const lockId = bigintFromStableHash(key);
    return prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${lockId}) AS locked
        `;
        if (!row?.locked) return "LOCKED" as const;
        return fn();
      },
      { maxWait: 30000, timeout: 300000 },
    );
  },
};
