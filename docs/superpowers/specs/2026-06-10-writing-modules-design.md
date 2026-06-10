# BL-033 v2 — Composable Writing Modules

**Date:** 2026-06-10
**Status:** Design approved, pending implementation plan
**Supersedes:** BL-033 v1 (`src/ai/prompts/writing-standard.ts` — inlined `ANALYTICAL_DEPTH` / `HUMAN_VOICE` / `GROUNDING`)

## Problem

The TradeLinks writing standard (depth + anti-AI-slop + grounding) lives as three TS
constants in `writing-standard.ts`, hand-assembled into the system prompt at three call
sites with different shapes:

- `src/daily/compose.ts` — daily note (brief / roundup angles + word count + JSON shape)
- `src/ai/prompts/mover-insight.ts` — Movers insight card (evidence-bound, strong
  "never invent the cause" grounding, field structure)
- `src/daily/review.ts` — reviewer pass that **re-lists the banned-phrase set inline** (a
  second, drifting copy of the `HUMAN_VOICE` ban list)

`src/email/compose-issue.ts` (weekly newsletter) is **assembly-only** — pure HTML/text,
no LLM call; the mover `why` text it renders comes from `mover-insight`.

Three problems:

1. **No reusable units.** The standard is one blob; per-column angle/structure/output is
   inlined in each consumer; the only quality gate (`passesQualityGate`) is daily-only and
   structural (counts items + checks a hook), not a depth-worthiness gate.
2. **Duplication / drift.** The banned-phrase list exists in two places (`writing-standard.ts`
   and `review.ts`) and can diverge.
3. **Not liftable.** Nothing is cleanly separable for later reuse in other scenarios or
   open-sourcing.

This is a **runtime prompt-module library** (decided 2026-06-10), not a Claude Code
`SKILL.md`. The runtime editors (MiniMax / DeepSeek / Gemini) have no Skill tool — they
consume an assembled system-prompt string. khazix-writer
(`github.com/KKKKhazix/khazix-skills`) is **reference only** for patterns (topic-quality
gate, positive techniques, layered self-check); we build our own capability, in our own
grounded B2B-analyst voice — not its personal-creator persona or zh colloquial tics.

## Goals

- Decompose the standard into composable units with clean boundaries, each testable in
  isolation.
- Single-source the banned-phrase list (kill the `review.ts` duplicate).
- Enrich the voice with our own **positive** techniques (today there are only bans).
- Generalize the quality gate so each content type supplies its own config.
- Keep `core.ts` (and the self-check rubric text) **zero-business-dependency** so it can be
  lifted into a standalone package later.

## Non-Goals

- No Claude Code `SKILL.md` / file-loaded skills (explicitly declined — runtime TS modules).
- No LLM-written newsletter (newsletter stays assembly-only; YAGNI).
- No change to the editor→reviewer pipeline shape, the LLM clients, provenance/citation
  trust model, or the DB schema.
- No data-driven config / markdown loader (declined — keep TS).

## Architecture — `src/ai/writing/`

```
src/ai/writing/
  core.ts          ① general writing core (zero business deps, open-sourceable)
  topic-gate.ts    ② topic quality check (code predicate + prompt bar)
  self-check.ts    ③ post-write rubric for the reviewer pass
  columns/
    daily-brief.ts      ④ per-column specs
    daily-roundup.ts
    movers-insight.ts
  index.ts         re-exports + composeSystemPrompt assembler
```

### ① `core.ts` — general writing core

Zero imports from the project (the open-source boundary; documented in a header comment).

Exported text blocks, generalized from the current three constants:

- `DEPTH` — mechanism + second-order effects + non-obvious implication + quantify-with-the-
  given-numbers + connect into ONE argument. **Remove** the e-commerce-specific line (sourcing
  playbook / which market / margin–risk) — that moves into the column specs.
- `VOICE` — take a position; vary sentence length; specific over abstract; **plus our own
  positive techniques** (analyst-grade, not personal-blogger):
  - show the reasoning (phenomenon → why → non-obvious implication), don't just assert;
  - expectation flip *when grounded* ("the obvious read is X; the data says Y"), used sparingly;
  - one through-line that pays off at the end;
  - escalation ordering for multi-item pieces (weakest → strongest);
  - vary rhythm.
  - **Banned phrases/tics** (the single source of truth): "In conclusion", "Moreover",
    "Furthermore", "It's important to note", "In today's fast-paced", "game-changer",
    "navigate the landscape", "a testament to", empty intensifiers ("massive"/"powerful"/
    "robust") without a number; avoid tidy 3-part listicles; no "Let's dive in / Let's take a
    look" throat-clearing openers; open on a concrete fact.
- `GROUNDING` — only the provided facts; never invent numbers/dates/entities/claims; no raw
  URLs in the body.

Assembler:

```ts
export interface WritingOpts { multiItem?: boolean; /* toggles escalation, etc. */ }
export function writingCore(opts?: WritingOpts): string
```

`writingCore()` composes `DEPTH` + `VOICE` (+ technique blocks gated by `opts`) + `GROUNDING`.

Also export the banned list as data (`BANNED_PHRASES: string[]`) so `self-check.ts` reuses it
without re-typing the prose.

### ② `topic-gate.ts` — topic quality check

```ts
export interface TopicGateConfig { minVolume: number; hook: (input: unknown) => boolean }
export function passesTopicGate(input: unknown, config: TopicGateConfig): boolean
export function topicGateBlock(): string   // short prompt "depth bar"
```

- `passesTopicGate` — generalizes the existing `passesQualityGate`: enough substance
  (`minVolume`) AND the column-appropriate `hook`. Each column supplies its `TopicGateConfig`.
- `topicGateBlock()` — a short prompt instruction: commit only if there's a real mechanism +
  a consequential / non-obvious angle; if the inputs are thin, say so plainly rather than pad
  (generalizes mover-insight's "a thin honest card beats a confident fabricated one").
- `passesQualityGate(input, opts)` is kept in `compose.ts` (or re-exported) as a thin wrapper
  over `passesTopicGate` with the daily config, so existing call sites and tests don't break.

The gate is primarily deterministic **code** (testable); the prompt bar enforces the depth
expectation at write time.

### ③ `self-check.ts` — post-write rubric (reviewer)

```ts
export function selfCheckRubric(opts?: { lang?: string }): string
```

Produces the reviewer SYSTEM prompt body (JOB 1 truth-check + JOB 2 de-AI voice), but the
banned-phrase list is pulled from `core` (`BANNED_PHRASES`) — eliminating the `review.ts`
duplicate. Framed as four layers:

- **L1 hard scan** — banned phrases present? raw URLs in body? 3-part listicle? header crutch?
- **L2 voice** — varied rhythm? clear position? specific over abstract?
- **L3 depth + grounding** — every number/date/entity/claim traceable to the source set
  (unsupported → `removed_claims`); no guessed cause stated as fact; mechanism + second-order
  present, not just WHAT.
- **L4 human gut-check** — reads like a sharp human analyst wrote it.

`review.ts`'s inline `SYSTEM` is rebuilt from `selfCheckRubric()`. The output JSON contract is
**unchanged**: `{title, dek, body_markdown, key_takeaways, meta_description, removed_claims}`.

### ④ `columns/` — per-column specs

```ts
export interface ColumnSpec {
  id: string;                 // "daily-brief" | "daily-roundup" | "movers-insight"
  angle: string;              // lead/framing (today inlined as `angle` in compose.ts)
  techniques: WritingOpts;    // which core positive techniques apply
  grounding?: string;         // column-specific extra grounding (movers' anti-cause block)
  lengthHint: string;         // e.g. "600–1000 words" / "2–3 sentences per field"
  outputShape: string;        // the JSON contract line
  gateConfig: TopicGateConfig;
}
export function composeSystemPrompt(col: ColumnSpec): string
// = col.angle + writingCore(col.techniques) + topicGateBlock() + (col.grounding ?? "")
//   + col.lengthHint + col.outputShape
```

Files:

- `daily-brief.ts` — policy/alert interpretation angle; 600–1000 words; brief gate config
  (high-urgency alert hook).
- `daily-roundup.ts` — viral-product / sourcing roundup angle; cross-region diffusion thesis;
  the e-commerce playbook line moved out of `DEPTH` (which market, what lead time, margin–risk)
  lives here; 600–1000 words; roundup gate config (trend/radar hook).
- `movers-insight.ts` — single-product insight card; the "never invent the cause / separate
  SHOWS from MEANS" block as `grounding`; 2–3 sentences/field; `{what_it_is, why_now,
  trajectory, so_what}` output shape; `multiItem: false`.

**Newsletter:** no writing column. `compose-issue.ts` stays assembly-only; its mover `why`
quality improves automatically because `movers-insight` uses the enriched core.

## Data Flow (shape unchanged, recomposed)

- **daily-note worker** (`runDailyNote`): for each kind →
  `passesTopicGate(input, spec.gateConfig)` → `composeSystemPrompt(spec)` + facts block →
  `editorClient()` → `reviewNote()` (SYSTEM now from `selfCheckRubric()`) → `persistNote`.
- **movers**: per mover → `composeSystemPrompt(moversInsight)` + facts → insight card.

## Migration / Back-compat (land in steps, tests green each step)

1. Add `src/ai/writing/` (core, topic-gate, self-check, columns) with tests — nothing wired yet.
2. `writing-standard.ts` → thin re-exports from `core` (`ANALYTICAL_DEPTH` = `DEPTH`, etc.),
   marked `@deprecated`. No consumer breaks.
3. `compose.ts` → use `daily-brief` / `daily-roundup` specs + `passesTopicGate` (keep
   `passesQualityGate` as wrapper).
4. `mover-insight.ts` → rebuild `buildMoverInsightPrompt` from the `movers-insight` spec.
5. `review.ts` → rebuild `SYSTEM` from `selfCheckRubric()`.
6. Optionally drop the deprecated re-exports once no consumer references them.

## Testing (all DB-free, pure strings)

- `core` — all three blocks present; `BANNED_PHRASES` intact; `writingCore` opts toggle the
  technique blocks.
- `topic-gate` — table-driven predicate tests; port existing `passesQualityGate` cases; add
  each column's config.
- `self-check` — all four layers present; verdict/output shape intact; banned list verified to
  come from `core` (no duplicate literal).
- `columns` — each `composeSystemPrompt` contains its angle + core blocks + output shape;
  `movers-insight` retains the anti-cause block.
- Existing `test/daily-note.test.ts` (stub LLM) still passes after migration.

## Open-source Readiness

- `core.ts` (+ the `self-check` rubric text) are zero-business-dependency → liftable into a
  standalone package later.
- `topic-gate` predicate is config-driven (no business types baked in).
- `columns/` stay TradeLinks-specific.
- Header comments mark the boundary on each file.

## Risks / Open Questions

- **Voice regression on enrichment.** Adding positive techniques changes editor output; the
  reviewer's L1–L4 + the existing `daily-note.test.ts` bench guard against AI-slop creeping
  back, but a manual read of one brief + one roundup after step 3 is worth doing.
- **Gate over-tightening.** `topicGateBlock()` telling the model to "say it's thin" must not
  cause it to refuse borderline-but-valid days; keep the code gate (`passesTopicGate`) as the
  real skip decision, the prompt bar only shapes tone/honesty.
