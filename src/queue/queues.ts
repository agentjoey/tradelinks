import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const crawlQueue = new Queue("crawl-queue", { connection });
export const scrapeQueue = new Queue("scrape-queue", { connection });
export const ingestQueue = new Queue("ingest-queue", { connection });
export const processQueue = new Queue("process-queue", { connection });

export const QUEUE_NAMES = {
  crawl: "crawl-queue",
  scrape: "scrape-queue",
  ingest: "ingest-queue",
  process: "process-queue",
} as const;

/** Default job options: 3 retries, exponential backoff (2s, 8s, 32s). */
export const defaultJobOpts = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
