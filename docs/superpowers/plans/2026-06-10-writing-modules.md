# Composable Writing Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the inlined TradeLinks writing standard into a runtime prompt-module library (`src/ai/writing/`): a domain-agnostic writing core, a generalized topic-quality gate, a reviewer self-check rubric, and per-column specs — then migrate the three consumers onto it without changing behavior.

**Architecture:** New `src/ai/writing/` folder with four units. `core.ts` is zero-business-dependency (open-sourceable) and is the single source of truth for the banned-phrase list. `topic-gate.ts` and `self-check.ts` build on it. `columns/` holds TradeLinks-specific per-column specs assembled by `composeSystemPrompt`. The existing `writing-standard.ts` becomes thin deprecated re-exports during migration, then is deleted. Migrations are guarded by the existing test suite (refactor-under-test).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-10-writing-modules-design.md`

**Conventions to follow (from the existing code):**
- ESM imports use `.js` specifiers even for `.ts` files (e.g. `import { x } from "./core.js"`).
- Tests live in `test/` at repo root, named `<topic>.test.ts`, run with `vitest run`.
- Single-file test run: `pnpm exec vitest run test/<file>.test.ts`.
- Full suite: `pnpm test`.

**Substrings existing tests assert on — these MUST survive every migration:**
- `mover-insight-prompt.test.ts`: `p.system` contains `"ANALYTICAL DEPTH"`.
- `daily-note.test.ts` editor prompt: lowercased system matches `/depth|non-obvious|second-order|mechanism/` AND `/in conclusion|moreover|cliché|filler/`; roundup system contains `"sourc"` and matches `/trend|product|viral/`; brief system matches `/alert|affected|policy/`.
- `daily-note-review.test.ts`: lowercased system contains `"fact"` and matches `/fact|ground|unsupported/` AND `/voice|cliché|human|ai-/`.
- `daily-note.test.ts` gate: `passesQualityGate` behavior unchanged (brief needs an urgency≥3 alert; roundup needs ≥1 signal or ≥2 radar; both need volume ≥ minItems, default 4).

---

## Task 1: `core.ts` — general writing core

**Files:**
- Create: `src/ai/writing/core.ts`
- Test: `test/writing-core.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/writing-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEPTH, VOICE, GROUNDING, BANNED_PHRASES, writingCore } from "../src/ai/writing/core.js";

describe("writing core blocks", () => {
  it("DEPTH keeps the canonical header and depth demands", () => {
    expect(DEPTH).toContain("ANALYTICAL DEPTH");
    expect(DEPTH.toLowerCase()).toMatch(/mechanism|second-order|non-obvious/);
  });

  it("VOICE lists the banned phrases and reads as anti-AI-filler", () => {
    expect(VOICE).toContain("In conclusion");
    expect(VOICE).toContain("Moreover");
    expect(VOICE.toLowerCase()).toMatch(/cliché|filler/);
  });

  it("BANNED_PHRASES is the single source and is embedded in VOICE", () => {
    expect(BANNED_PHRASES).toContain("In conclusion");
    expect(BANNED_PHRASES).toContain("game-changer");
    for (const p of BANNED_PHRASES) expect(VOICE).toContain(p);
  });

  it("GROUNDING forbids invented facts and raw URLs", () => {
    expect(GROUNDING.toLowerCase()).toMatch(/never invent|only the facts|only the provided/);
    expect(GROUNDING.toLowerCase()).toContain("url");
  });

  it("writingCore composes the three blocks; multiItem adds escalation ordering", () => {
    const base = writingCore();
    expect(base).toContain("ANALYTICAL DEPTH");
    expect(base).toContain("In conclusion");
    expect(base).toContain(GROUNDING);
    expect(base.toLowerCase()).not.toContain("strongest");

    const multi = writingCore({ multiItem: true });
    expect(multi.toLowerCase()).toContain("strongest");
  });

  it("core imports nothing from the rest of the project (open-source boundary)", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync("src/ai/writing/core.ts", "utf8"));
    expect(src).not.toMatch(/from\s+["']\.\.\//); // no parent-dir imports
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/writing-core.test.ts`
Expected: FAIL — cannot find module `../src/ai/writing/core.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ai/writing/core.ts`:

```ts
// General writing core — depth + human voice + grounding.
// OPEN-SOURCE BOUNDARY: this file MUST NOT import anything from the rest of the
// project. It is domain-agnostic and can be lifted into a standalone package.
// Single source of truth for the banned-phrase list (see BANNED_PHRASES).

export const DEPTH = `ANALYTICAL DEPTH (this is the whole job — a shallow summary is a failure):
- Don't stop at WHAT happened. Explain the MECHANISM (why it's happening), the SECOND-ORDER effects
  (what it forces next), and the NON-OBVIOUS implication a casual reader would miss.
- Quantify with the specific figures in the source set. Tie every number to a concrete consequence.
- Show the reasoning — phenomenon → why → the non-obvious implication — don't just assert a conclusion.
- Connect the items into ONE argument with a through-line that pays off by the end. If two facts
  interact, say how. No item-by-item recap.`;

/** The banned phrases/tics, as data so other modules reuse the exact list. */
export const BANNED_PHRASES = [
  "In conclusion",
  "Moreover",
  "Furthermore",
  "It's important to note",
  "In today's fast-paced",
  "game-changer",
  "navigate the landscape",
  "a testament to",
  "Let's dive in",
  "Let's take a look",
];

export const VOICE = `VOICE (write like a sharp human analyst, not an AI):
- Take a clear position. Vary sentence length. Be specific over abstract.
- Where the data warrants it, flip the obvious read ("the obvious read is X; the data says Y") —
  sparingly, and only when grounded.
- Open on a concrete fact, never a throat-clearing intro.
- BANNED phrases/tics: ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}, and empty intensifiers
  ("massive", "powerful", "robust") used without a number. Avoid tidy 3-part listicles and clichés —
  they read like AI filler.`;

export const ESCALATION = `ORDERING (multi-item pieces):
- When comparing or listing several items, order them weakest → strongest so the piece builds.
  Don't dump conclusions up front; let the strongest finding land last.`;

export const GROUNDING = `GROUNDING:
- Use ONLY the facts provided below. Never invent numbers, dates, companies, thresholds, or claims.
- Do NOT paste raw URLs in the body; citations are rendered separately.`;

export interface WritingOpts {
  /** true for pieces that compare/list several items (adds escalation ordering). */
  multiItem?: boolean;
}

/** Compose the general writing standard. Append column-specific length/output at the call site. */
export function writingCore(opts: WritingOpts = {}): string {
  const blocks = [DEPTH, VOICE];
  if (opts.multiItem) blocks.push(ESCALATION);
  blocks.push(GROUNDING);
  return blocks.join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/writing-core.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/writing/core.ts test/writing-core.test.ts
git commit -m "feat(BL-033): writing core module (depth + voice + grounding, banned list single-sourced)"
```

---

## Task 2: `topic-gate.ts` — topic quality check

**Files:**
- Create: `src/ai/writing/topic-gate.ts`
- Test: `test/writing-topic-gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/writing-topic-gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { passesTopicGate, topicGateBlock, type TopicGateConfig } from "../src/ai/writing/topic-gate.js";

describe("passesTopicGate", () => {
  const volumeOf = (i: { n: number }) => i.n;
  const cfg: TopicGateConfig<{ n: number; hot: boolean }> = {
    minVolume: 4,
    measure: (i) => i.n,
    hook: (i) => i.hot,
  };

  it("fails when volume is below minVolume", () => {
    expect(passesTopicGate({ n: 2, hot: true }, cfg)).toBe(false);
  });
  it("fails when volume clears but the hook is absent", () => {
    expect(passesTopicGate({ n: 6, hot: false }, cfg)).toBe(false);
  });
  it("passes when volume clears AND the hook is present", () => {
    expect(passesTopicGate({ n: 6, hot: true }, cfg)).toBe(true);
    void volumeOf;
  });
});

describe("topicGateBlock", () => {
  it("tells the model to commit only with real depth and to be honest when thin", () => {
    const b = topicGateBlock().toLowerCase();
    expect(b).toMatch(/mechanism|consequential|non-obvious/);
    expect(b).toMatch(/thin|honest|don'?t pad/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/writing-topic-gate.test.ts`
Expected: FAIL — cannot find module `topic-gate.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ai/writing/topic-gate.ts`:

```ts
// Topic quality gate — is this worth a deep piece? Two parts:
//  - passesTopicGate: a deterministic, config-driven predicate (the real skip decision).
//  - topicGateBlock: a short prompt "depth bar" that shapes tone/honesty at write time.
// Generic over the input type so it carries no business types (open-source-friendly).

export interface TopicGateConfig<T> {
  /** minimum substantive-input count to be worth writing. */
  minVolume: number;
  /** how to count substance from the input. */
  measure: (input: T) => number;
  /** a column-appropriate hook that must be present (e.g. a high-urgency item). */
  hook: (input: T) => boolean;
}

/** Enough substance AND the right hook. */
export function passesTopicGate<T>(input: T, config: TopicGateConfig<T>): boolean {
  if (config.measure(input) < config.minVolume) return false;
  return config.hook(input);
}

/** Short prompt bar appended to a column's system prompt. */
export function topicGateBlock(): string {
  return `DEPTH BAR:
- Commit to a real argument only if there is a genuine MECHANISM and a consequential or non-obvious
  angle. If the inputs are thin, say so plainly and name what to watch next — don't pad. A short,
  honest piece beats a padded, confident one.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/writing-topic-gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/writing/topic-gate.ts test/writing-topic-gate.test.ts
git commit -m "feat(BL-033): generalized topic-quality gate (config predicate + depth-bar prompt)"
```

---

## Task 3: `self-check.ts` — reviewer rubric

**Files:**
- Create: `src/ai/writing/self-check.ts`
- Test: `test/writing-self-check.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/writing-self-check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selfCheckRubric } from "../src/ai/writing/self-check.js";
import { BANNED_PHRASES } from "../src/ai/writing/core.js";

describe("selfCheckRubric", () => {
  const rubric = selfCheckRubric();

  it("covers truth-check (JOB 1) and voice/de-AI (JOB 2)", () => {
    const r = rubric.toLowerCase();
    expect(r).toContain("fact");
    expect(r).toMatch(/fact|ground|unsupported/);
    expect(r).toMatch(/voice|cliché|human|ai-/);
  });

  it("reuses the banned phrases from core (no second copy)", () => {
    for (const p of BANNED_PHRASES) expect(rubric).toContain(p);
  });

  it("asks for the unchanged JSON contract including removed_claims", () => {
    expect(rubric).toContain("removed_claims");
    expect(rubric).toContain("body_markdown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/writing-self-check.test.ts`
Expected: FAIL — cannot find module `self-check.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ai/writing/self-check.ts`:

```ts
// Post-write rubric for the reviewer pass. Single-sources the banned-phrase list
// from core (kills the former duplicate in daily/review.ts). Domain-light: the only
// project import is the banned-phrase data from core.
import { BANNED_PHRASES } from "./core.js";

export interface SelfCheckOpts {
  /** outlet name shown in the reviewer role line. */
  brand?: string;
}

/** The reviewer SYSTEM prompt body (JOB 1 truth-check + JOB 2 de-AI voice). */
export function selfCheckRubric(opts: SelfCheckOpts = {}): string {
  const brand = opts.brand ?? "TradeLinks";
  const banned = BANNED_PHRASES.map((p) => `"${p}"`).join(", ");
  return `You are the managing editor / fact-checker for ${brand}, a cross-border e-commerce outlet.
You are given a SOURCE SET (the only ground truth) and a DRAFT written by an editor. You have TWO jobs:

JOB 1 — TRUTH (grounding): Remove or neutralize any statement that asserts a specific fact (a number,
percentage, date, threshold, company, statistic, or named event) NOT supported by the SOURCE SET.
Never soften a grounded fact. Never state a guessed cause as fact. List each removed/unsupported claim
in removed_claims.

JOB 2 — VOICE (de-AI the prose): Rewrite anything that reads like generic AI writing into the concrete,
confident voice of a human analyst. Cut clichés and filler tics (${banned}), empty intensifiers used
without a number, hedging, and tidy 3-part listicles. Vary sentence rhythm. Keep it specific. Do NOT
add any new facts while doing this — rephrase, don't embellish. Preserve the draft's language and
overall structure.

Respond ONLY with JSON:
{"title","dek","body_markdown","key_takeaways":[..],"meta_description","removed_claims":[..]}
where removed_claims lists each ungrounded claim you removed (empty array if none).`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/writing-self-check.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/writing/self-check.ts test/writing-self-check.test.ts
git commit -m "feat(BL-033): reviewer self-check rubric (banned list sourced from core)"
```

---

## Task 4: `columns/` specs + `composeSystemPrompt` + `index.ts`

**Files:**
- Create: `src/ai/writing/columns/types.ts`
- Create: `src/ai/writing/columns/daily-brief.ts`
- Create: `src/ai/writing/columns/daily-roundup.ts`
- Create: `src/ai/writing/columns/movers-insight.ts`
- Create: `src/ai/writing/index.ts`
- Test: `test/writing-columns.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/writing-columns.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeSystemPrompt } from "../src/ai/writing/index.js";
import { dailyBrief } from "../src/ai/writing/columns/daily-brief.js";
import { dailyRoundup } from "../src/ai/writing/columns/daily-roundup.js";
import { moversInsight } from "../src/ai/writing/columns/movers-insight.js";
import type { DailyNoteInput } from "../src/daily/compose.js";

function dailyInput(over: Partial<DailyNoteInput> = {}): DailyNoteInput {
  return {
    date: "2026-06-05", lang: "en",
    alerts: [{ id: "a1", title: "t", summary: "", category: "regulatory", regions: ["europe"], urgencyScore: 4, actionRequired: null, sourceUrl: null }],
    signals: [{ keyword: "k", originRegion: "north_america", spreadingTo: ["southeast_asia"], confidence: 0.7 }],
    radar: [{ kind: "product", title: "p", link: "l" }, { kind: "product", title: "q", link: "m" }],
    recentTitles: [],
    ...over,
  };
}

describe("composeSystemPrompt", () => {
  it("daily-brief carries its angle, the core blocks, the depth bar, and the output shape", () => {
    const sys = composeSystemPrompt(dailyBrief).toLowerCase();
    expect(sys).toMatch(/alert|affected|policy/);
    expect(sys).toContain("analytical depth");
    expect(sys).toMatch(/in conclusion|moreover/);
    expect(sys).toMatch(/thin|honest/);        // depth bar
    expect(sys).toContain("body_markdown");      // output shape
  });

  it("daily-roundup carries the sourcing angle and the moved-in playbook line", () => {
    const sys = composeSystemPrompt(dailyRoundup).toLowerCase();
    expect(sys).toContain("sourc");
    expect(sys).toMatch(/trend|product|viral/);
    expect(sys).toMatch(/lead time|pre-position|margin/); // playbook line moved out of core DEPTH
  });

  it("movers-insight carries the anti-cause grounding and its own output shape", () => {
    const sys = composeSystemPrompt(moversInsight);
    expect(sys).toContain("ANALYTICAL DEPTH");
    expect(sys.toLowerCase()).toMatch(/do not invent the cause|never claim/);
    expect(sys).toContain("what_it_is");
  });
});

describe("column gate configs", () => {
  it("daily-brief requires a high-urgency alert; daily-roundup requires trend/radar", () => {
    expect(dailyBrief.gateConfig.hook(dailyInput())).toBe(true);
    const noUrgent = dailyInput({ alerts: [{ id: "x", title: "t", summary: "", category: "industry", regions: [], urgencyScore: 1, actionRequired: null, sourceUrl: null }] });
    expect(dailyBrief.gateConfig.hook(noUrgent)).toBe(false);
    expect(dailyRoundup.gateConfig.hook(noUrgent)).toBe(true); // has 1 signal + 2 radar
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/writing-columns.test.ts`
Expected: FAIL — cannot find module `index.js` / column modules.

- [ ] **Step 3a: Create the ColumnSpec type**

Create `src/ai/writing/columns/types.ts`:

```ts
import type { WritingOpts } from "../core.js";
import type { TopicGateConfig } from "../topic-gate.js";

/** A per-content-type writing spec. `angle`/`grounding`/`outputShape` are prompt text. */
export interface ColumnSpec<TInput = unknown> {
  id: string;
  /** lead/framing instruction (the column's editorial angle). */
  angle: string;
  /** which core positive techniques apply. */
  techniques: WritingOpts;
  /** optional column-specific extra grounding (e.g. movers' anti-cause block). */
  grounding?: string;
  /** e.g. "- 600–1000 words." */
  lengthHint: string;
  /** the JSON output contract line. */
  outputShape: string;
  /** the deterministic quality gate for this column. */
  gateConfig: TopicGateConfig<TInput>;
}
```

- [ ] **Step 3b: Create the daily-brief spec**

Create `src/ai/writing/columns/daily-brief.ts`:

```ts
import type { ColumnSpec } from "./types.js";
import type { DailyNoteInput } from "../../daily/compose.js";

const DAILY_OUTPUT = `Respond ONLY with JSON:
{"title","dek","body_markdown","key_takeaways":[..],"meta_description","tags":[..]}`;

/** brief hook: a high-urgency alert is present (highUrgency default 3). */
export const briefHook = (i: DailyNoteInput, highUrgency = 3): boolean =>
  i.alerts.some((a) => a.urgencyScore >= highUrgency);

export const dailyVolume = (i: DailyNoteInput): number =>
  i.alerts.length + i.signals.length + i.radar.length;

export const dailyBrief: ColumnSpec<DailyNoteInput> = {
  id: "daily-brief",
  angle: `Write a POLICY / ALERT interpretation brief. Lead with the most consequential alerts and
synthesize across regulatory, platform and logistics changes. Tell the reader who is affected and
what to do. Trend/radar signals are secondary colour.`,
  techniques: { multiItem: true },
  lengthHint: "- 600–1000 words.",
  outputShape: DAILY_OUTPUT,
  gateConfig: { minVolume: 4, measure: dailyVolume, hook: (i) => briefHook(i) },
};
```

- [ ] **Step 3c: Create the daily-roundup spec**

Create `src/ai/writing/columns/daily-roundup.ts`:

```ts
import type { ColumnSpec } from "./types.js";
import type { DailyNoteInput } from "../../daily/compose.js";
import { dailyVolume } from "./daily-brief.js";

const DAILY_OUTPUT = `Respond ONLY with JSON:
{"title","dek","body_markdown","key_takeaways":[..],"meta_description","tags":[..]}`;

/** roundup hook: at least one trend signal, or at least two radar items. */
export const roundupHook = (i: DailyNoteInput): boolean => i.signals.length >= 1 || i.radar.length >= 2;

export const dailyRoundup: ColumnSpec<DailyNoteInput> = {
  id: "daily-roundup",
  angle: `Write a VIRAL-PRODUCT / sourcing roundup. Lead with what is trending and WHY, framed as an
EARLY SOURCING SIGNAL for cross-border sellers. Make cross-region diffusion the core thesis — a
product rising in one region is an advance signal for the markets it is spreading to; tell sellers
what to source and which secondary markets to pre-position inventory for. Center the trend signals
and radar (viral tweets, bestseller movers); alerts are supporting context.
- Give the actual playbook: which market, what lead time, why now, and the margin/risk trade-off.
  Name at least one non-consensus take or a risk most sellers will miss.`,
  techniques: { multiItem: true },
  lengthHint: "- 600–1000 words.",
  outputShape: DAILY_OUTPUT,
  gateConfig: { minVolume: 4, measure: dailyVolume, hook: roundupHook },
};
```

- [ ] **Step 3d: Create the movers-insight spec**

Create `src/ai/writing/columns/movers-insight.ts`:

```ts
import type { ColumnSpec } from "./types.js";
import type { MoverEvidence } from "../../movers/evidence.js";

const ANTI_CAUSE = `- CRITICAL — do not invent the CAUSE. The facts above are ALL that is known. Never claim a "viral push", "coordinated marketing", "restock", "social spike", "pent-up demand", or any reason the data does not show. If the only signal is a fresh appearance with no rank/review change yet, say plainly: it is an early, not-yet-explained entry, and name what to watch next (rank holding? reviews accelerating? spreading to other regions?).
- Separate what the data SHOWS from what it might MEAN. Hedge interpretation ("could", "worth watching", "if it holds"); never state a guessed cause as fact. A thin, honest card beats a confident fabricated one.`;

export const moversInsight: ColumnSpec<MoverEvidence> = {
  id: "movers-insight",
  angle: `You are the lead analyst of TradeLinks. Write a SHORT insight card for ONE product that is moving on Amazon, for cross-border sellers.`,
  techniques: { multiItem: false },
  grounding: ANTI_CAUSE,
  lengthHint: "- 2–3 sentences per field. No headers inside the values.",
  outputShape: `Respond ONLY with JSON: {"what_it_is","why_now","trajectory","so_what"}`,
  // movers are pre-filtered upstream; the gate is permissive (always worth a card).
  gateConfig: { minVolume: 0, measure: () => 1, hook: () => true },
};
```

- [ ] **Step 3e: Create the assembler + barrel**

Create `src/ai/writing/index.ts`:

```ts
// Writing-modules barrel + system-prompt assembler.
import { writingCore } from "./core.js";
import { topicGateBlock } from "./topic-gate.js";
import type { ColumnSpec } from "./columns/types.js";

export * from "./core.js";
export * from "./topic-gate.js";
export * from "./self-check.js";
export type { ColumnSpec } from "./columns/types.js";

/**
 * Assemble a column's system-prompt body:
 *   angle + writingCore(techniques) + depth-bar + [grounding] + lengthHint + outputShape
 * A consumer may prepend a role/preamble (e.g. the daily editor's byline + language line).
 */
export function composeSystemPrompt(col: ColumnSpec<never>): string {
  const parts = [
    col.angle,
    writingCore(col.techniques),
    topicGateBlock(),
    ...(col.grounding ? [col.grounding] : []),
    col.lengthHint,
    "",
    col.outputShape,
  ];
  return parts.join("\n\n");
}
```

Note: `composeSystemPrompt` takes `ColumnSpec<never>` so any concrete `ColumnSpec<T>` is assignable (the function never touches `gateConfig`/`measure`, only the prompt-text fields).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/writing-columns.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/writing/columns/ src/ai/writing/index.ts test/writing-columns.test.ts
git commit -m "feat(BL-033): per-column specs + composeSystemPrompt assembler"
```

---

## Task 5: Re-point `writing-standard.ts` at core (deprecated shim)

**Files:**
- Modify: `src/ai/prompts/writing-standard.ts`

This keeps the old names working while consumers migrate (Tasks 6–8). It is a pure refactor — guarded by the full existing suite.

- [ ] **Step 1: Replace the file body with re-exports**

Replace the entire contents of `src/ai/prompts/writing-standard.ts` with:

```ts
// BL-033 — DEPRECATED shim. The writing standard now lives in src/ai/writing/.
// These re-exports keep existing imports working during migration; remove once
// all consumers import from ../writing/* directly (see Task 9).
import { DEPTH, VOICE, GROUNDING, writingCore } from "../writing/core.js";

/** @deprecated import { DEPTH } from "../writing/core.js" */
export const ANALYTICAL_DEPTH = DEPTH;
/** @deprecated import { VOICE } from "../writing/core.js" */
export const HUMAN_VOICE = VOICE;
/** @deprecated import { GROUNDING } from "../writing/core.js" */
export { GROUNDING };
/** @deprecated import { writingCore } from "../writing/core.js" */
export function writingStandardBlock(): string {
  return writingCore();
}
```

- [ ] **Step 2: Run the full suite to verify nothing broke**

Run: `pnpm test`
Expected: PASS — all existing tests, including `daily-note.test.ts`, `mover-insight-prompt.test.ts`, `daily-note-review.test.ts`.

Note: `writingStandardBlock()` now emits DEPTH+VOICE+GROUNDING **without** the e-commerce playbook line (it moved to the roundup spec). No current consumer asserts on that line, so the suite stays green; the line returns to the roundup output in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/ai/prompts/writing-standard.ts
git commit -m "refactor(BL-033): writing-standard.ts becomes a deprecated shim over writing/core"
```

---

## Task 6: Migrate `compose.ts` (daily note) onto the column specs

**Files:**
- Modify: `src/daily/compose.ts`
- Test (guard): `test/daily-note.test.ts` (unchanged)

- [ ] **Step 1: Swap the imports**

In `src/daily/compose.ts`, replace this import:

```ts
import { ANALYTICAL_DEPTH, HUMAN_VOICE, GROUNDING } from "../ai/prompts/writing-standard.js";
```

with:

```ts
import { composeSystemPrompt } from "../ai/writing/index.js";
import { passesTopicGate } from "../ai/writing/topic-gate.js";
import { dailyBrief, dailyVolume, briefHook } from "../ai/writing/columns/daily-brief.js";
import { dailyRoundup, roundupHook } from "../ai/writing/columns/daily-roundup.js";
```

- [ ] **Step 2: Reimplement `passesQualityGate` via the gate primitive**

Replace the whole `passesQualityGate` function (currently lines ~81–92) with:

```ts
export function passesQualityGate(input: DailyNoteInput, opts: QualityGateOpts = {}): boolean {
  const kind = opts.kind ?? "brief";
  const minVolume = opts.minItems ?? 4;
  const highUrgency = opts.highUrgency ?? 3;
  return passesTopicGate(input, {
    minVolume,
    measure: dailyVolume,
    hook: kind === "roundup" ? roundupHook : (i) => briefHook(i, highUrgency),
  });
}
```

- [ ] **Step 3: Reimplement `systemPrompt` via `composeSystemPrompt`**

Replace the whole `systemPrompt` function (currently lines ~102–128) with:

```ts
function systemPrompt(lang: string, kind: DailyNoteKind): string {
  const spec = kind === "roundup" ? dailyRoundup : dailyBrief;
  const preamble = `You are the lead editor of ${BRAND}, a cross-border e-commerce intelligence outlet.
Your byline is "${AUTHOR}". Write ONE original daily article in ${langName(lang)}.`;
  return `${preamble}\n\n${composeSystemPrompt(spec)}`;
}
```

- [ ] **Step 4: Run the daily-note test to verify behavior is preserved**

Run: `pnpm exec vitest run test/daily-note.test.ts`
Expected: PASS — gate cases, roundup/brief angle tokens, depth+banned tokens, parsing.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/daily/compose.ts
git commit -m "refactor(BL-033): daily note composes from column specs + topic gate"
```

---

## Task 7: Migrate `mover-insight.ts` onto the movers column spec

**Files:**
- Modify: `src/ai/prompts/mover-insight.ts`
- Test (guard): `test/mover-insight-prompt.test.ts` (unchanged)

- [ ] **Step 1: Rebuild the prompt from the spec**

Replace the whole contents of `src/ai/prompts/mover-insight.ts` with:

```ts
// BL-042 P2b — Movers 洞察卡 prompt + 解析。System prompt built from the movers column spec.
import { composeSystemPrompt } from "../writing/index.js";
import { moversInsight } from "../writing/columns/movers-insight.js";
import { extractJson } from "../json.js";
import type { MoverEvidence } from "../../movers/evidence.js";

export interface InsightCard {
  whatItIs: string;
  whyNow: string;
  trajectory: string;
  soWhat: string;
}

export function buildMoverInsightPrompt(ev: MoverEvidence): { system: string; user: string } {
  const system = composeSystemPrompt(moversInsight);

  const facts: string[] = [
    `Product: ${ev.title}`,
    `Category / region: ${ev.category} · ${ev.region}`,
    ev.currentRank != null ? `Current BSR rank: #${ev.currentRank}` : "",
    ev.rankDelta != null ? `Rank change: ${ev.rankDelta >= 0 ? "+" : ""}${ev.rankDelta} (positive = climbing)` : "",
    ev.rankTrajectory.length ? `Rank trajectory: ${ev.rankTrajectory.join(" → ")}` : "",
    ev.reviewDelta != null ? `Review-count change: +${ev.reviewDelta} (a sales proxy)` : "",
    ev.reviewCount != null ? `Reviews: ${ev.reviewCount}` : "",
    ev.rating != null ? `Rating: ${ev.rating}` : "",
    ev.price != null ? `Price: $${ev.price}` : "",
    ev.isNewEntrant ? "New entrant to the top list (not present a day earlier)." : "",
    ev.spreadingTo.length ? `Strong here, absent in: ${ev.spreadingTo.join(", ")} (possible diffusion target).` : "",
    `Days tracked so far: ${ev.daysTracked}`,
  ].filter(Boolean);

  const user = `FACTS (use only these — do not invent any number, date, or claim):\n${facts.map((f) => `- ${f}`).join("\n")}`;
  return { system, user };
}

export function parseMoverInsight(raw: string): InsightCard {
  const j = extractJson(raw) as Record<string, unknown>;
  return {
    whatItIs: String(j.what_it_is ?? ""),
    whyNow: String(j.why_now ?? ""),
    trajectory: String(j.trajectory ?? ""),
    soWhat: String(j.so_what ?? ""),
  };
}
```

- [ ] **Step 2: Run the mover-insight test**

Run: `pnpm exec vitest run test/mover-insight-prompt.test.ts`
Expected: PASS — `system` contains "ANALYTICAL DEPTH"; `user` contains "Glow Serum", "+22", "200"; parse works.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ai/prompts/mover-insight.ts
git commit -m "refactor(BL-033): mover insight prompt built from movers column spec"
```

---

## Task 8: Migrate `review.ts` onto the self-check rubric

**Files:**
- Modify: `src/daily/review.ts`
- Test (guard): `test/daily-note-review.test.ts` (unchanged)

- [ ] **Step 1: Replace the inline SYSTEM with the rubric**

In `src/daily/review.ts`, add the import near the top (after the existing imports):

```ts
import { selfCheckRubric } from "../ai/writing/self-check.js";
```

Then replace the whole `const SYSTEM = \`...\`;` block (currently lines ~19–36) with:

```ts
const SYSTEM = selfCheckRubric();
```

Leave `ReviewSchema`, `sourceFacts`, `draftBlock`, and `reviewNote` unchanged.

- [ ] **Step 2: Run the review test**

Run: `pnpm exec vitest run test/daily-note-review.test.ts`
Expected: PASS — system contains "fact" and matches `/fact|ground|unsupported/` and `/voice|cliché|human|ai-/`; ungrounded claim stripped; provenance carried through.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/daily/review.ts
git commit -m "refactor(BL-033): reviewer SYSTEM built from self-check rubric (banned list single-sourced)"
```

---

## Task 9: Delete the deprecated shim

**Files:**
- Delete: `src/ai/prompts/writing-standard.ts`

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `grep -rn "writing-standard\|ANALYTICAL_DEPTH\|HUMAN_VOICE\|writingStandardBlock" src/ test/`
Expected: no matches (Tasks 6–8 removed them all). If any remain, repoint them at `../writing/*` first.

- [ ] **Step 2: Delete the file**

Run: `git rm src/ai/prompts/writing-standard.ts`

- [ ] **Step 3: Run the full suite + typecheck**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm exec tsc --noEmit` (if the project has a typecheck; otherwise skip)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(BL-033): drop deprecated writing-standard shim; all consumers on writing/*"
```

---

## Post-implementation manual check (not a code step)

After Task 6 lands, do one manual read of a freshly composed brief and roundup (or run the daily-note script against a recent date) to confirm the enriched voice reads like a sharp analyst and the gate didn't tighten — per the spec's two risks. This is a human eyeball, not an automated test.

## Self-Review (done while writing this plan)

- **Spec coverage:** core ✓(T1), topic-gate ✓(T2), self-check ✓(T3), columns+assembler ✓(T4), single-sourced banned list ✓(T3, verified T8), generalized gate ✓(T2, wired T6), migration steps 1–6 ✓(T5–T9), newsletter untouched ✓(no task, by design), open-source boundary ✓(T1 enforced by test). 
- **Placeholder scan:** none — every code step has full code; every run step has a command + expected result.
- **Type consistency:** `DEPTH/VOICE/GROUNDING/ESCALATION/BANNED_PHRASES/WritingOpts/writingCore` (core) reused verbatim downstream; `TopicGateConfig<T>` is generic, consumed by `ColumnSpec<T>.gateConfig` and `passesTopicGate`; `composeSystemPrompt(ColumnSpec<never>)` accepts all concrete specs; `dailyVolume/briefHook/roundupHook` defined in T4 columns, imported in T6; `selfCheckRubric` signature stable across T3/T8.
