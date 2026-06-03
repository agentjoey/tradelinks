# SPEC: AI Processing Pipeline

> Version: 1.0 | 2026-06-03 | Owner: Sprint 001 T4/T5 (Stage 1) + Sprint 002 (Stage 2)
> Two-stage pipeline. Stage 1 (cheap/bulk) in Sprint 001; Stage 2 (scoring) in Sprint 002.

## Models & Routing

| Model | Use | When |
|-------|-----|------|
| **deepseek-v4-flash** (thinking OFF) | all Stage-1 (prefilter/translate/categorize) | **primary** — `DEEPSEEK_API_KEY` set (ADR-005) |
| MiniMax-M2 (Anthropic endpoint) | Sprint-002 urgency scoring (`scoringClient()`) | reasoning task |
| deepseek-chat / Qwen-Plus | fallbacks | when no DeepSeek key |

Provider routing (`pickClient(lang)` in src/ai/client.ts) — ADR-005:
- `DEEPSEEK_API_KEY` set → **deepseek-v4-flash (thinking disabled)** for all Stage-1
- else `MINIMAX_API_KEY` → MiniMax-M2; else `ar`/`id`/`th` → Qwen, otherwise deepseek-chat
- Chosen via bench (4× faster, 5× leaner, equal accuracy, better region precision)

> MiniMax token-plan keys (`sk-cp-`) use the **Anthropic-compatible** endpoint
> `https://api.minimax.io/anthropic` (`AnthropicCompatClient`, x-api-key auth).
> M2 is a **reasoning model**: responses carry a `thinking` block + a `text`
> block; the client reads the text block and floors `max_tokens` ≥2048 so the
> answer isn't truncated by reasoning tokens. Tunable via `MINIMAX_MODEL`.
> DeepSeek (fallback) uses the OpenAI `/v1` path.
>
> **Tuning note (observed 2026-06-03):** the prefilter prompt is somewhat strict
> — it dropped a new-marketplace launch and a creator-GMV milestone as
> "not actionable". Revisit prefilter wording when tuning recall vs. noise.

## Stage 1 — Bulk (Sprint 001 T4)

Input: items with `status=raw`. Output: `status=processed` or `filtered`.

### Step 1.1 Pre-filter (drop noise)
Drop (set `status=filtered`) when:
- pure advertisement / promo with no informational content
- duplicate of an already-processed item (see T5 dedup)
- off-topic (not cross-border commerce / regulation / logistics / product trend)

LLM returns `{ keep: boolean, reason: string }`. Batch 10 items/call to save tokens.

### Step 1.2 Translate (non-EN → EN)
- If `lang != en`: produce `titleEn` + `summaryEn` (2–3 sentence EN summary).
- If `lang == en`: `titleEn = null`, `summaryEn` = extractive 2–3 sentence summary.

### Step 1.3 Categorize + tag
LLM returns:
```json
{ "category": "regulatory|platform_policy|logistics|trend|industry|tip",
  "regions": ["north_america", ...],   // 1..N from the 6-enum set
  "platforms": ["amazon","tiktok-shop"] // 0..N, freeform lowercase-kebab
}
```
- ≥98% of ingested items must get ≥1 region (acceptance criterion).
- Region inference rules: explicit country/market mention → map to region;
  "EU"/"GDPR"/"GPSR" → europe; "FBA"/Amazon.com → north_america (unless other
  marketplace TLD); global/unclear → tag all-applicable, not empty.

### Token budget
- Pre-filter: batched, ~150 tokens/item amortized.
- Translate+categorize: ≤800 tokens/item.
- 7-day total target < ¥100 (≈ AIHOT 5× scale). Log per-call usage.

## Dedup / Clustering (Sprint 001 T5)

Three levels:
1. **URL exact** — `items.url @unique` blocks re-insert at ingest.
2. **Title trigram** — `similarity(title, candidate) > 0.75` within 24h window
   → mark `isDuplicate=true` (kept in DB, excluded from feed/push).
3. **Event cluster** — same event from ≥2 sources in 24h → one `cluster`,
   merge `sourceUrls[]`, pick representative item (highest source priority).
   - Candidate generation: trigram prefilter (cut LLM cost), then LLM
     yes/no "are these the same event?" only for trigram 0.5–0.75 grey zone.

Acceptance: a known policy change reported by Marketplace Pulse + 雨果跨境 +
Reddit on the same day clusters into 1 alert with 3 sourceUrls.

## Stage 2 — Scoring (Sprint 002, spec stub)

- `urgencyScore` 0–5 = f(time-sensitivity, financial impact, breadth).
- `impactScope` text: who is affected.
- `recommendation`: concrete action.
- urgencyScore ≥ 4 → review_queue → push pipeline.

## Prompt files layout
```
src/ai/prompts/
  prefilter.ts      // Stage 1.1
  translate.ts      // Stage 1.2
  categorize.ts     // Stage 1.3
  cluster-judge.ts  // T5 grey-zone judge
  score.ts          // Stage 2 (Sprint 002)
```
All prompts versioned with a header comment `// vN — YYYY-MM-DD`. Prompt
changes are tracked because they are the core IP (see ADR-001 rationale).
