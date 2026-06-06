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

export interface OpenAiCompatConfig {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  /** extra top-level body params, e.g. { thinking: { type: "disabled" } } for DeepSeek V4 */
  extraBody?: Record<string, unknown>;
  /** request timeout (ms). Default 60s; raise for slow reasoning models. */
  timeoutMs?: number;
}

export class OpenAiCompatClient implements LlmClient {
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
      ...this.cfg.extraBody,
    };
    if (opts.json) body.response_format = { type: "json_object" };

    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 60_000),
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

export interface AnthropicCompatConfig {
  name: string;
  baseUrl: string; // e.g. https://api.minimax.io/anthropic
  apiKey: string | undefined;
  model: string;
  /** extra top-level body params, e.g. { thinking: { type: "disabled" } } for MiniMax-M3 */
  extraBody?: Record<string, unknown>;
  /** request timeout (ms). Default 60s; raise for slow reasoning models. */
  timeoutMs?: number;
}

/**
 * Anthropic Messages API client (for MiniMax token-plan `sk-cp-` keys, which
 * only work on the /anthropic endpoint). No native JSON mode — our prompts ask
 * for JSON and extractJson() is tolerant.
 */
export class AnthropicCompatClient implements LlmClient {
  readonly name: string;
  constructor(private readonly cfg: AnthropicCompatConfig) {
    this.name = cfg.name;
  }

  async complete(opts: LlmCompleteOpts): Promise<LlmResult> {
    if (!this.cfg.apiKey) throw new Error(`${this.name}: API key not configured`);

    const body: Record<string, unknown> = {
      model: this.cfg.model,
      // MiniMax-M2 is a reasoning model: it emits a `thinking` block before the
      // answer, so max_tokens must cover reasoning + answer. Floor at 2048 to
      // avoid truncating the answer away (the answer is in the `text` block).
      max_tokens: Math.max(opts.maxTokens ?? 1024, 2048),
      temperature: opts.temperature ?? 0.2,
      messages: [{ role: "user", content: opts.user }],
      ...this.cfg.extraBody,
    };
    if (opts.system) body.system = opts.system;

    const res = await fetch(`${this.cfg.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 60_000),
    });
    if (!res.ok) {
      throw new Error(`${this.name} HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    const usage: LlmUsage = {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
    };
    recordUsage(this.cfg.model, usage, opts.system?.slice(0, 16) ?? "?");
    return { text, usage, model: this.cfg.model };
  }
}

// MiniMax token-plan key (sk-cp-) → Anthropic-compatible endpoint (ADR + token-plan docs)
export const minimax = new AnthropicCompatClient({
  name: `minimax:${env.MINIMAX_MODEL}`,
  baseUrl: env.MINIMAX_BASE_URL, // https://api.minimax.io/anthropic
  apiKey: env.MINIMAX_API_KEY,
  model: env.MINIMAX_MODEL, // MiniMax-M2
});

export const deepseekChat = new OpenAiCompatClient({
  name: "deepseek-v3.2",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: env.DEEPSEEK_API_KEY,
  model: "deepseek-chat",
});

// Stage-1 primary (ADR-005): deepseek-v4-flash with thinking OFF — fast, lean,
// precise region tags. Benchmarked 4× faster / 5× leaner vs MiniMax-M2.7-hs at
// equal accuracy.
export const deepseekFlash = new OpenAiCompatClient({
  name: `deepseek:${env.DEEPSEEK_STAGE1_MODEL}`,
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: env.DEEPSEEK_API_KEY,
  model: env.DEEPSEEK_STAGE1_MODEL,
  extraBody: { thinking: { type: "disabled" } },
});

export const qwenPlus = new OpenAiCompatClient({
  name: "qwen-plus",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: env.QWEN_API_KEY,
  model: "qwen-plus",
});

// Google Gemini via its OpenAI-compatible surface (BL-027 daily-note candidate).
// Same chat/completions shape + Bearer auth, so OpenAiCompatClient just works.
// reasoning_effort:"none" turns thinking OFF — Gemini 2.5+ otherwise spends the
// token budget on reasoning and truncates the answer (finish_reason=length). For
// fact-synthesis (not problem-solving) thinking adds latency/cost with no gain —
// same rationale as deepseek-v4-flash's thinking:disabled (ADR-005).
export const gemini = new OpenAiCompatClient({
  name: `gemini:${env.GEMINI_MODEL}`,
  baseUrl: env.GEMINI_BASE_URL,
  apiKey: env.GEMINI_API_KEY,
  model: env.GEMINI_MODEL,
  extraBody: { reasoning_effort: "none" },
});

// Gemini on the FLEX service tier (BL-027 daily-note editor default): ~50% cheaper,
// best-effort latency (may queue) → long timeout. reasoning off (synthesis task).
export const geminiFlex = new OpenAiCompatClient({
  name: `gemini-flex:${env.GEMINI_MODEL}`,
  baseUrl: env.GEMINI_BASE_URL,
  apiKey: env.GEMINI_API_KEY,
  model: env.GEMINI_MODEL,
  extraBody: { reasoning_effort: "none", service_tier: "flex" },
  timeoutMs: 600_000,
});

/**
 * Stage-1 provider routing (ADR-005). Primary = deepseek-v4-flash (thinking off):
 * fast, lean, precise region tags. Falls back to MiniMax, then deepseek-chat/Qwen.
 */
const QWEN_LANGS = new Set(["ar", "id", "th"]);
export function pickClient(lang: string): LlmClient {
  if (env.DEEPSEEK_API_KEY) return deepseekFlash;
  if (env.MINIMAX_API_KEY) return minimax;
  return QWEN_LANGS.has(lang.toLowerCase()) ? qwenPlus : deepseekChat;
}

/**
 * Scoring client for Sprint-002 urgency scoring — low-frequency, benefits from
 * reasoning depth, so prefer the MiniMax reasoning model (ADR-005).
 */
export function scoringClient(): LlmClient {
  return env.MINIMAX_API_KEY ? minimax : deepseekChat;
}

/**
 * Daily-note EDITOR (BL-027) — writes the original brief. Default = gemini flash
 * on the Flex tier (cheap, fast, best multilingual); deepseek-v4-flash fallback.
 */
export function editorClient(): LlmClient {
  return env.GEMINI_API_KEY ? geminiFlex : deepseekFlash;
}

/**
 * Daily-note REVIEWER (BL-027) — fact-checks the draft against the grounded
 * source set and strips unsupported claims before publish. Model = deepseek.
 */
export function reviewerClient(): LlmClient {
  return deepseekFlash;
}
