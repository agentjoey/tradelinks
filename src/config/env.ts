import "dotenv/config"; // load .env into process.env before parsing (workers + scripts)
import { z } from "zod";

export const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(), // Neon pooled (ADR-003), runtime queries
  DIRECT_URL: z.string().optional(), // Neon direct (ADR-003/004): migrations + pg-boss
  // AI providers — MiniMax is primary when set (OpenAI-compatible); DeepSeek/Qwen are fallbacks
  MINIMAX_API_KEY: z.string().optional(), // sk-cp- token-plan key → Anthropic endpoint
  MINIMAX_BASE_URL: z.string().default("https://api.minimax.io/anthropic"),
  MINIMAX_MODEL: z.string().default("MiniMax-M2.7-highspeed"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_STAGE1_MODEL: z.string().default("deepseek-v4-flash"), // Stage-1 primary (ADR-005)
  QWEN_API_KEY: z.string().optional(),
  // Google Gemini via its OpenAI-compatible endpoint (BL-027 daily-note candidate).
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().default("https://generativelanguage.googleapis.com/v1beta/openai"),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  // --- Daily Note (BL-027) ---
  // skip a day's note unless this many substantive inputs exist (no thin articles).
  DAILY_NOTE_MIN_ITEMS: z.coerce.number().int().positive().default(4),
  // autopublish reviewed notes. Default ON: there's no admin approval UI yet, so
  // drafts would otherwise never surface. Set DAILY_NOTE_AUTOPUBLISH=false to hold
  // notes as drafts once an approval workflow exists.
  DAILY_NOTE_AUTOPUBLISH: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? true : v === "true" || v === "1")),
  // --- Multilingual content translation (BL-041) ---
  // Gate the translation worker. Off → tick no-ops (zero LLM cost). Needs DEEPSEEK_API_KEY.
  TRANSLATE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // CSV of target locales to materialize, e.g. "zh" (Phase 1) or "zh,pt".
  TRANSLATE_TARGET_LANGS: z.string().default("zh"),
  // only (re)translate published alerts created within this window.
  TRANSLATE_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  // hard cap of alerts translated per run per lang — bounds LLM cost.
  TRANSLATE_MAX_PER_RUN: z.coerce.number().int().positive().default(40),
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
  // curated-accounts track (BL-034): hard daily read cap for polling timelines.
  // ~$0.005/read → 200 ≈ $1/day. Shares the X kill-switch (X_ENABLED + bearer).
  X_ACCOUNTS_MAX_READS: z.coerce.number().int().nonnegative().default(200),
  RESEND_API_KEY: z.string().optional(), // daily digest email (Sprint 003 T3)
  FROM_EMAIL: z.string().default("alerts@tradelinks.io"),
  TELEGRAM_BOT_TOKEN: z.string().optional(), // instant push (Sprint 004 T3)
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(), // verifies Telegram callback webhook
  // --- Curated Telegram channel push (BL-039 slice 1) ---
  TELEGRAM_CHANNEL_ID: z.string().optional(), // public channel @username or -100… id
  CHANNEL_PUSH_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  CHANNEL_PUSH_DAILY_MAX: z.coerce.number().int().positive().default(12),
  CHANNEL_PUSH_RUN_MAX: z.coerce.number().int().positive().default(3),
  CHANNEL_PUSH_MIN_URGENCY: z.coerce.number().min(0).default(2),
  SLACK_WEBHOOK_URL: z.string().optional(),
  // auto-push alerts at/above this urgency to Telegram (with in-chat Approve/Reject)
  PUSH_THRESHOLD: z.coerce.number().default(4.5),
  LOG_LEVEL: z.string().default("info"),
  // --- Public API v1 (Phase 1 Task 7) ---
  // 32-byte HMAC secret signing anonymous-API cursors. Absent → the API fails
  // closed (deterministic 500 CURSOR_NOT_CONFIGURED, never an unsigned cursor).
  PUBLIC_API_CURSOR_SECRET: z.string().optional(),
  // --- Public Intelligence cutover (Phase 1 Task 9a) ---
  // Gates the legacy→public 308 redirects (src/public-intelligence/legacy-redirects.ts).
  // Default OFF. Cutover is a config flip, not a code deploy: rollback is
  // instant, and legacy routes keep serving until the Task 9b decision.
  PUBLIC_CUTOVER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export const env = EnvSchema.parse(process.env);
