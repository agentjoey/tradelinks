import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(), // Neon pooled (ADR-003)
  DIRECT_URL: z.string().optional(), // Neon direct, for migrations
  REDIS_URL: z.string().default("redis://localhost:6379"), // Upstash rediss:// in prod
  DEEPSEEK_API_KEY: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  SCRAPER_SERVICE_URL: z.string().default("http://localhost:8000"),
  LOG_LEVEL: z.string().default("info"),
});

export const env = EnvSchema.parse(process.env);
