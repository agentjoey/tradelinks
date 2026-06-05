import "dotenv/config"; // load .env into process.env before parsing (workers + scripts)
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(), // Neon pooled (ADR-003), runtime queries
  DIRECT_URL: z.string().optional(), // Neon direct (ADR-003/004): migrations + pg-boss
  // AI providers — MiniMax is primary when set (OpenAI-compatible); DeepSeek/Qwen are fallbacks
  MINIMAX_API_KEY: z.string().optional(), // sk-cp- token-plan key → Anthropic endpoint
  MINIMAX_BASE_URL: z.string().default("https://api.minimax.io/anthropic"),
  MINIMAX_MODEL: z.string().default("MiniMax-M2.7-highspeed"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_STAGE1_MODEL: z.string().default("deepseek-v4-flash"), // Stage-1 primary (ADR-005)
  QWEN_API_KEY: z.string().optional(),
  SCRAPER_SERVICE_URL: z.string().default("http://localhost:8000"),
  // cap items processed per crawl (newest-first) — bounds AI cost on big feeds
  MAX_ITEMS_PER_CRAWL: z.coerce.number().int().positive().default(12),
  // --- X (Twitter) viral-products signal (Radar only) ---
  // app-only Bearer token for GET /2/tweets/search/recent. X is pay-per-read
  // (~$0.005/post), so X_MAX_READS_PER_DAY is a HARD cost cap (≤100 → ≤$0.50/day).
  // X_ENABLED gates the daily worker off until a token is set (zero cost when off).
  X_BEARER_TOKEN: z.string().optional(),
  X_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  X_MAX_READS_PER_DAY: z.coerce.number().int().positive().default(100),
  // engagement pre-filter floor (likes). Spec default 50, but search/recent's
  // 7-day index surfaces low-engagement tweets even under relevancy sort, so
  // this is env-tunable to dial signal vs. coverage without a redeploy.
  X_MIN_LIKES: z.coerce.number().int().nonnegative().default(50),
  RESEND_API_KEY: z.string().optional(), // daily digest email (Sprint 003 T3)
  FROM_EMAIL: z.string().default("alerts@tradelinks.io"),
  TELEGRAM_BOT_TOKEN: z.string().optional(), // instant push (Sprint 004 T3)
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(), // verifies Telegram callback webhook
  SLACK_WEBHOOK_URL: z.string().optional(),
  // auto-push alerts at/above this urgency to Telegram (with in-chat Approve/Reject)
  PUSH_THRESHOLD: z.coerce.number().default(4.5),
  LOG_LEVEL: z.string().default("info"),
});

export const env = EnvSchema.parse(process.env);
