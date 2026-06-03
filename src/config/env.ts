import "dotenv/config"; // load .env into process.env before parsing (workers + scripts)
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(), // Neon pooled (ADR-003), runtime queries
  DIRECT_URL: z.string().optional(), // Neon direct (ADR-003/004): migrations + pg-boss
  // AI providers — MiniMax is primary when set (OpenAI-compatible); DeepSeek/Qwen are fallbacks
  MINIMAX_API_KEY: z.string().optional(), // sk-cp- token-plan key → Anthropic endpoint
  MINIMAX_BASE_URL: z.string().default("https://api.minimax.io/anthropic"),
  MINIMAX_MODEL: z.string().default("MiniMax-M2"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_STAGE1_MODEL: z.string().default("deepseek-v4-flash"), // Stage-1 primary (ADR-005)
  QWEN_API_KEY: z.string().optional(),
  SCRAPER_SERVICE_URL: z.string().default("http://localhost:8000"),
  LOG_LEVEL: z.string().default("info"),
});

export const env = EnvSchema.parse(process.env);
