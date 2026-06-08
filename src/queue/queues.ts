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
  health: "source-health-tick",
  x: "x-tick",
  dailyNote: "daily-note-tick",
  channelPush: "channel-push-tick",
  translate: "translate-content-tick",
  radarReview: "radar-review-tick",
} as const;

/** Per-queue defaults: 3 retries, 2s base delay, exponential backoff. */
const RETRY: PgBoss.RetryOptions = {
  retryLimit: 3,
  retryDelay: 2,
  retryBackoff: true,
};

/**
 * Queue policy = retry + SHORT retention. ingest jobs carry the full scraped
 * items array (big JSONB); at pg-boss's long default retention, finished jobs
 * bloated storage to ~300MB and nearly filled Neon's 0.5GB. Keep finished jobs
 * only 30min, and expire stuck-active jobs after 15min (the slowest job —
 * stealth scrape — has a 120s client timeout, well under 15min).
 */
const QUEUE_POLICY: PgBoss.Queue = {
  name: "", // set per-queue below
  ...RETRY,
  retentionMinutes: 30,
  expireInMinutes: 15,
};

let _boss: PgBoss | null = null;

/**
 * `pg` (used by pg-boss) warns that `sslmode=require` will stop meaning
 * verify-full in pg v9. Pin the current secure behavior explicitly so the
 * warning goes away and the semantics don't silently change on upgrade.
 */
function pinSslMode(cs: string): string {
  return /[?&]sslmode=/.test(cs) ? cs.replace(/([?&])sslmode=[^&]*/i, "$1sslmode=verify-full") : cs;
}

/** Lazily construct pg-boss so importing this module never requires env/DB. */
export function getBoss(): PgBoss {
  if (!_boss) {
    const raw = env.DIRECT_URL ?? env.DATABASE_URL;
    if (!raw) {
      throw new Error("pg-boss needs DIRECT_URL (or DATABASE_URL). See .env.example");
    }
    const cs = pinSslMode(raw);
    // Maintenance every 5min + delete finished jobs after 30min so the job
    // tables can't bloat storage again (see QUEUE_POLICY).
    _boss = new PgBoss({ connectionString: cs, maintenanceIntervalMinutes: 5, deleteAfterMinutes: 30 });
  }
  return _boss;
}

/** Create all queues with retry + retention policy. Idempotent. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    const policy = { ...QUEUE_POLICY, name };
    await boss.createQueue(name, policy);
    // createQueue no-ops on existing queues, so push the policy explicitly to
    // apply the new short retention to queues created before this change.
    await boss.updateQueue(name, policy).catch(() => undefined);
  }
}

/** Send options applied per-job (mirrors queue retry policy). */
export const sendOpts: PgBoss.SendOptions = { ...RETRY };
