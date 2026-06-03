import PgBoss from "pg-boss";
import { env } from "../config/env.js";

// Queue backend = pg-boss on Neon Postgres (ADR-004). No Redis.
// pg-boss uses the DIRECT (unpooled) Neon connection — its maintenance and
// notify do not play well with the transaction pooler.

export const QUEUES = {
  scheduler: "scheduler-tick",
  crawl: "crawl-queue",
  scrape: "scrape-queue",
  ingest: "ingest-queue",
  process: "process-queue",
  score: "score-queue",
  trends: "trends-tick",
} as const;

/** Per-queue defaults: 3 retries, 2s base delay, exponential backoff. */
const RETRY: PgBoss.RetryOptions = {
  retryLimit: 3,
  retryDelay: 2,
  retryBackoff: true,
};

let _boss: PgBoss | null = null;

/** Lazily construct pg-boss so importing this module never requires env/DB. */
export function getBoss(): PgBoss {
  if (!_boss) {
    const cs = env.DIRECT_URL ?? env.DATABASE_URL;
    if (!cs) {
      throw new Error("pg-boss needs DIRECT_URL (or DATABASE_URL). See .env.example");
    }
    _boss = new PgBoss({ connectionString: cs });
  }
  return _boss;
}

/** Create all queues with retry policy. Idempotent. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name, { name, ...RETRY });
  }
}

/** Send options applied per-job (mirrors queue retry policy). */
export const sendOpts: PgBoss.SendOptions = { ...RETRY };
