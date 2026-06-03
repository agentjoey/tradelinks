import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/** Connection errors worth retrying — Neon scale-to-zero cold start (ADR-003). */
function isRetryable(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code === "P1001" || code === "P1002" || code === "P1017") return true; // unreachable / timed out / closed
  const msg = e instanceof Error ? e.message : String(e);
  return /Can't reach database server|Connection (terminated|closed|refused)|ECONNREFUSED|ETIMEDOUT/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const base = global.__prisma ?? new PrismaClient();

/**
 * Retry all operations on transient connection errors so a Neon cold start
 * (compute resumes in ~1–3s) doesn't surface as a user-facing 500.
 * Backoff: 0.4s, 0.8s, 1.6s, 3.2s (4 attempts).
 */
export const prisma = base.$extends({
  name: "neon-cold-start-retry",
  query: {
    async $allOperations({ args, query }) {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await query(args);
        } catch (e) {
          lastErr = e;
          if (!isRetryable(e)) throw e;
          await sleep(400 * 2 ** attempt);
        }
      }
      throw lastErr;
    },
  },
});

if (process.env.NODE_ENV !== "production") {
  global.__prisma = base;
}
