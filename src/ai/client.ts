// LLM client abstraction. DeepSeek + Qwen are OpenAI-compatible chat APIs.
// Calls go through fetch (no SDK dep). Token usage is logged for cost tracking.
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmCompleteOpts {
  system?: string;
  user: string;
  /** request JSON object output (response_format) */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResult {
  text: string;
  usage: LlmUsage;
  model: string;
}

export interface LlmClient {
  readonly name: string;
  complete(opts: LlmCompleteOpts): Promise<LlmResult>;
}

// ---- module-level token accounting (cost monitoring) ----
const usageTotals = { promptTokens: 0, completionTokens: 0, calls: 0 };
export function getUsageTotals() {
  return { ...usageTotals };
}
function recordUsage(model: string, usage: LlmUsage, step: string) {
  usageTotals.promptTokens += usage.promptTokens;
  usageTotals.completionTokens += usage.completionTokens;
  usageTotals.calls += 1;
  logger.debug({ model, step, ...usage, cumulative: { ...usageTotals } }, "llm usage");
}

interface OpenAiCompatConfig {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

class OpenAiCompatClient implements LlmClient {
  readonly name: string;
  constructor(private readonly cfg: OpenAiCompatConfig) {
    this.name = cfg.name;
  }

  async complete(opts: LlmCompleteOpts): Promise<LlmResult> {
    if (!this.cfg.apiKey) {
      throw new Error(`${this.name}: API key not configured`);
    }
    const messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: opts.user });

    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
    };
    if (opts.json) body.response_format = { type: "json_object" };

    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`${this.name} HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const usage: LlmUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
    recordUsage(this.cfg.model, usage, opts.system?.slice(0, 16) ?? "?");
    return {
      text: data.choices[0]?.message.content ?? "",
      usage,
      model: this.cfg.model,
    };
  }
}

export const minimax = new OpenAiCompatClient({
  name: `minimax:${env.MINIMAX_MODEL}`,
  baseUrl: env.MINIMAX_BASE_URL, // https://api.minimax.io/v1 (OpenAI-compatible)
  apiKey: env.MINIMAX_API_KEY,
  model: env.MINIMAX_MODEL, // MiniMax-M2
});

export const deepseekChat = new OpenAiCompatClient({
  name: "deepseek-v3.2",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: env.DEEPSEEK_API_KEY,
  model: "deepseek-chat",
});

export const qwenPlus = new OpenAiCompatClient({
  name: "qwen-plus",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: env.QWEN_API_KEY,
  model: "qwen-plus",
});

/**
 * Provider routing — see docs/specs/ai-pipeline.md.
 * If MINIMAX_API_KEY is set, MiniMax-M2 (multilingual) handles everything — one
 * provider, simplest. Otherwise fall back to the DeepSeek + Qwen(AR/ID/TH) split.
 */
const QWEN_LANGS = new Set(["ar", "id", "th"]);
export function pickClient(lang: string): LlmClient {
  if (env.MINIMAX_API_KEY) return minimax;
  return QWEN_LANGS.has(lang.toLowerCase()) ? qwenPlus : deepseekChat;
}
