# Daily Note — original daily editorial brief — design spec

> Date: 2026-06-06 · Status: draft (for review) · Scope: new persisted content type + SEO surface
> Backlog: BL-027 — see Obsidian `P026-TradeLinks/Backlog-待办`.

## Goal & business value

Produce **one high-quality, original editorial article per day** ("TradeLinks Daily Brief")
that synthesizes the **previous day's** best signals into genuine analysis. Two goals:

1. **Reader value** — an efficient, high-signal "what mattered yesterday & why" that a
   busy cross-border seller can read in 2 minutes (vs. scanning the raw Wire/Radar).
2. **SEO / discoverability** — a growing corpus of **crawlable, original** pages that
   Google can index and cite, driving organic acquisition (feeds the funnel toward
   BL-029 "find paying users"). This is also the **MVP seed of the industry Bible (BL-032)**.

**This is NOT the existing digest.** `app/lib/digest.ts` produces an *ephemeral, list-shaped*
5-section digest computed at request time, and `app/api/public/daily` *blocks crawler UAs*.
The Daily Note is a **persisted, original-prose, crawler-friendly article** with a thesis and
cross-signal synthesis — a different artifact. The email digest stays as-is.

## The quality bar is the spec (non-negotiable)

The explicit ask is "**ensure a high-quality original article every day**." Because the goal
is SEO, this directly collides with Google's **2024 "scaled content abuse"** policy: bulk,
thin, AI-aggregated pages get demoted or de-indexed. So quality is a *correctness* requirement,
not a nice-to-have. Enforced by design, not trust:

- **No forced daily quota.** If yesterday lacked enough substance, **skip the day** (record a
  `skipped` row, publish nothing). A thin article is worse than no article.
- **Editorial increment required.** The article must *synthesize* ("why these signals matter
  together", "who's affected + what to do"), not list. The generator prompt forbids
  list-rehashing and forbids fabricating any fact not in the provided source set.
- **Review gate before publish** (default). Generated as `draft` → admin approves → `published`.
  Mirrors the existing Alert `pending_review → published` flow. Toggle `DAILY_NOTE_AUTOPUBLISH`
  for hands-off operation once trust is established.
- **Originality & attribution.** Original prose; cite every source via outbound links +
  `NewsArticle` JSON-LD; named author byline (E-E-A-T). De-dup against prior days so notes
  don't rehash the same alerts.

## Inputs (yesterday's signal set)

Gathered for the UTC date `D-1` at generation time:

- **Published `Alert`s** with `publishedAt` in `D-1` (title, summary, urgencyScore, category,
  regions, actionRequired, sourceUrls) — the editorial backbone.
- **Top `TrendSignal`s** (cross-region diffusion) active that day — the "trend prediction" angle.
- **Notable Radar `Item`s**: X viral products / cross-border hot topics (source `X01`), Amazon
  bestseller movers — the "early signal" colour.
- A **recap of the last few days' notes** (titles only) so the model avoids repetition.

## Model selection (benchmarked 2026-06-06)

`scripts/bench-daily-note.ts` ran the same real-ish input set (5 alerts + 2 trend signals +
3 radar items) through 4 models, EN + ZH. All output is quality-reviewable in `bench-out/`.

| Model | EN lat | ZH lat | tokens (p+c) | Quality (read) | Notes |
|---|---|---|---|---|---|
| **gemini-3.5-flash** | **~9s** | **~9s** | ~675+1350 | strong; **best native ZH**; clean section structure | needs `reasoning_effort:"none"` (else thinking truncates JSON) |
| **gemini-3.5-flash (flex)** | ~8s | ~10s | ~675+1300 | same quality as standard | `service_tier:"flex"` → **~50% cheaper**, best-effort latency (may queue; use long timeout). Best value |
| **deepseek-v4-flash** | 15s | 12s | ~655+1100 | very good; punchy, concrete, actionable | current Stage-1 model; cheapest standard tier |
| **minimax-m2.7-highspeed** | 39s | 36s | ~640+1450 | **best analytical depth** ("designed to close the loophole from both ends") | slow; reasoning always on |
| **minimax-m3 (thinking off)** | 60s | 57s | ~670+1275 | strong, vivid headlines | `thinking:{type:"disabled"}` works (M2.x ignores it), but **still ~1min** even with thinking off → too slow for a comfortable daily job |

**Decision:** default composer = **gemini-3.5-flash on the Flex tier** (`reasoning_effort:"none"` +
`service_tier:"flex"`) — same quality as standard at ~50% cost, fastest, leanest, best multilingual
(matters for the BL-032 bilingual vision). Because Flex is best-effort (may queue), use a long timeout
and fall back to **standard gemini** then **deepseek-v4-flash** on failure. **Multimodal** is not
exercised by this task — the hero image is a passthrough URL, not generated/understood — so it is not a
selection axis here.

⚠️ **Quality caveat → why a reviewer role exists:** *every* editor model injected at least one fact
**not in the inputs** (Gemini "€22 old threshold", DeepSeek "duty eats 20–30%", M2.7 "€15"). Plausible,
often real-world-correct, but they violate "use only provided facts." So composition is **two roles**,
not one.

## Roles & models (locked 2026-06-06)

| Role | Job | Model | Fallback |
|---|---|---|---|
| **editor** | Own **content & analytical depth**: thesis, mechanism, second-order effects, a non-consensus take, concrete sourcing/margin playbook. Fetches richer related data **at write time** (lever A) rather than us pre-storing everything. | **gemini-3.5-flash, Flex tier** (`reasoning_effort:"none"` + `service_tier:"flex"`) | standard gemini → deepseek-v4-flash |
| **reviewer** | Two jobs: (1) **truth** — strip any claim not in the source set (`removedClaims[]`); (2) **voice** — rewrite generic AI prose into a concrete human-analyst voice (cut clichés/filler/empty intensifiers). Never adds facts. | **deepseek-v4-flash** | — (required) |

- **Editor depth (lever A):** the editor's job is depth, not summary. The biggest lever is feeding it
  the *actual* substrate (tweet text, price/FOB, rank-delta size, historical diffusion lag, competition).
  Design: the worker's gather step retrieves the **full related content on demand** for the items being
  written about — not a giant pre-stored blob. A dedicated **"how to write a good article" editor skill**
  is backlogged (BL-033); v1 of those rules lives inline in the editor prompt now.
- **Every note passes editor → reviewer before it can be published** (`reviewNote`). The reviewer
  removes/neutralizes unsupported assertions (`removedClaims[]`) and de-AIs the prose — never adds facts.
- Then the **human review gate** approves the reviewed draft (default; `DAILY_NOTE_AUTOPUBLISH` to skip).
- Clients: `editorClient()` / `reviewerClient()` in `src/ai/client.ts`. Provenance (citations, source
  ids, editor model, tags) is carried through both stages, never sourced from a model.
- Verified end-to-end via `scripts/daily-note-pipeline.ts`: on the sample set the reviewer stripped 3
  ungrounded timing claims (EN) / 0 (ZH) while preserving narrative — output in `bench-out/`.
- **Multimodal** is not exercised by this task (hero image is a passthrough URL), so not a selection axis.

## Article kinds (user decision 2026-06-06)

Two distinct article shapes, each with its own prompt template + quality-gate hook, mapping to the
product's two pillars (预警 + 趋势):

| `kind` | Shape | Leads with | Gate hook |
|---|---|---|---|
| **brief** | policy/alert interpretation — "who's affected + what to do" | the consequential alerts | ≥1 alert with urgency ≥ 3 |
| **roundup** | viral-product / sourcing playbook — cross-region diffusion as an early sourcing signal | trend signals + radar (viral tweets, bestseller movers) | ≥1 trend signal OR ≥2 radar items |

The worker assesses the day's signal mix and emits **whichever kinds pass their gate — both on a rich
day** (distinct slugs/pages → doubles the SEO surface, distinct search intent). Each kind runs the same
editor→reviewer→human-gate pipeline. `composeDailyNote(input, client, kind)` and `passesQualityGate(input,
{kind})` are implemented + tested; demo both via `scripts/daily-note-pipeline.ts {policy|product}`.

## Processing pipeline

New worker on a new queue `QUEUES.dailyNote = "daily-note-tick"`, scheduled ~`30 3 * * *` UTC
(after trends/health/x so all of `D-1` is settled). Reusable as `runDailyNote()` (script-callable).

1. **Gather** the input set above for `D-1`.
2. **Per kind** (`brief`, `roundup`): **quality gate** — require ≥ `DAILY_NOTE_MIN_ITEMS` (default 4)
   substantive inputs *and* the kind's hook (above). Fail → skip that kind (optionally record `skipped`).
   A rich day passes both and produces two notes; a quiet day may produce one or none.
3. **Editor — compose** (`composeDailyNote`, `editorClient()` = gemini Flex). Structured prompt →
   strict JSON `{ title, dek, bodyMarkdown, keyTakeaways[], metaDescription, tags[] }`. Guardrails:
   600–1000 words; thesis-led; synthesize not list; **only provided facts**; "What to do" where an
   alert has `actionRequired`.
4. **Reviewer — fact-check** (`reviewNote`, `reviewerClient()` = deepseek). Re-reads the draft
   against the source set, strips ungrounded claims, records `removedClaims[]`, rewrites around them.
5. **Store** the reviewed note as `DailyNote{status:"draft"}` (or `published` if `DAILY_NOTE_AUTOPUBLISH`),
   persisting the review audit (`reviewModel`, `removedClaims`).
6. **Human gate** (admin) → `published`, sets `publishedAt`, `reviewedBy`. Triggers revalidation.

**Cost:** 2 LLM calls/day (editor Flex + reviewer flash) → still negligible (<$0.02/day). No image
generation (reuse a source `Item.imageUrl` as hero, or none).

## Storage — new `DailyNote` model

```prisma
model DailyNote {
  id              String    @id @default(cuid())
  date            DateTime  @db.Date          // D-1 the note covers
  slug            String    @unique           // e.g. 2026-06-05-eu-import-rules-temu
  lang            String    @default("en")
  kind            String    @default("brief")  // brief (policy) | roundup (viral-product)
  title           String
  dek             String?                      // sub-headline / lede
  bodyMarkdown    String
  keyTakeaways    String[]
  metaDescription String?                      // <meta description> / OG
  heroImageUrl    String?
  tags            String[]
  sourceAlertIds  String[]                     // provenance (for JSON-LD citations + dedupe)
  sourceItemIds   String[]
  status          String    @default("draft")  // draft | published | skipped
  model           String?                      // editor LLM that composed it
  reviewModel     String?                      // reviewer LLM that fact-checked it
  removedClaims   String[]                     // claims the reviewer stripped (audit)
  publishedAt     DateTime?
  reviewedBy      String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([date, lang, kind])                  // one note per day, per language, per kind
  @@index([status, publishedAt])
  @@map("daily_notes")
}
```

Migration `0005_daily_notes` (additive, no change to existing tables — safe for prod).

## SEO surface (the point of the feature)

- **Routes:** `/daily` (paginated index of published notes) + `/daily/[slug]` (article).
  Server-rendered, **statically friendly** (`generateStaticParams` + ISR `revalidate`), and
  **crawlable** — no `force-dynamic`, no bot-UA blocking (the opposite of `/api/public/daily`).
- **`app/sitemap.ts`** (new): all published `/daily/*` slugs + core pages. **`app/robots.ts`**
  (new): allow crawl, point to sitemap. (Neither exists today.)
- **Structured data:** `NewsArticle` JSON-LD per note (headline, datePublished, author, image,
  articleBody, citations) + canonical URL + OpenGraph/Twitter cards.
- **Feeds & internal links:** add published notes to a feed (extend `app/feed.xml` or a dedicated
  `/daily/feed.xml`); link the latest note from the homepage and cross-link notes ↔ Radar/alerts.

## i18n

EN-first (matches PRD's English briefing). `lang` + `@@unique([date, lang])` make a **ZH edition
additive later** — that ties into BL-025 (multilingual) and the BL-032 "overseas → China" vision.
Out of scope here; the schema just doesn't block it.

## Implementation map

| Piece | Where | Notes |
|---|---|---|
| compose (editor) | `src/daily/compose.ts` | `composeDailyNote(inputs, client)` → JSON; testable with stub LLM |
| review (reviewer) | `src/daily/review.ts` | `reviewNote(draft, inputs, client)` → strips ungrounded claims; testable with stub |
| quality gate (pure) | `src/daily/compose.ts` | `passesQualityGate(inputs)` → bool; testable, DB-free |
| role clients | `src/ai/client.ts` | `editorClient()` (gemini Flex), `reviewerClient()` (deepseek) |
| pipeline demo | `scripts/daily-note-pipeline.ts` | editor→reviewer end-to-end → `bench-out/` |
| gather + persist | `src/workers/daily-note.ts` | `runDailyNote()`, `registerDailyNoteWorker(boss)` |
| queue | `src/queue/queues.ts` | `dailyNote: "daily-note-tick"` + schedule in `workers/index.ts` |
| read | `src/daily/db.ts` | `getPublishedNotes()`, `getNoteBySlug()` |
| pages | `app/daily/page.tsx`, `app/daily/[slug]/page.tsx` | SSR + ISR + JSON-LD |
| SEO | `app/sitemap.ts`, `app/robots.ts` | new |
| review | `app/admin/...` | approve draft → published (reuse admin auth, ADR-006) |
| env | `DAILY_NOTE_AUTOPUBLISH`, `DAILY_NOTE_MIN_ITEMS` | config-gated |

## Testing / acceptance (TDD)

- **Quality gate**: skips on a thin day (returns `skipped`, no LLM call); passes on a rich day.
- **compose**: with a stub LLM, returns structured note; carries provenance ids; never invents a
  `sourceUrl` not in inputs.
- **dedupe**: a note doesn't reuse alerts already covered by the prior day's note.
- **slug/date uniqueness** enforced.
- **SEO**: `sitemap.ts` lists published notes only; `/daily/[slug]` renders valid `NewsArticle`
  JSON-LD; page returns 200 to a crawler UA (no bot block).
- `pnpm lint` + `pnpm build` clean.

## Non-goals

- Not replacing the email digest or the Wire/Radar.
- No per-user personalization, no auto-publish without the quality gate (unless toggled).
- No image generation; no ZH edition in this iteration.

## Open decisions (flag for sign-off)

1. **Review gate vs auto-publish** — default = review gate (safer for the quality bar). Auto via
   `DAILY_NOTE_AUTOPUBLISH`. Recommend starting gated, flip after a week of good output.
2. **Brand/author identity** for the byline (E-E-A-T) — needs a real author persona.
3. **Cadence** — daily, or skip weekends (lower signal volume)? Default: daily with quality gate
   (weekends self-skip when thin).

## Follow-ups (backlog)

- ZH edition (→ BL-025) and the broader bilingual Bible/Wiki (→ BL-032).
- Auto-generated hero images; topic-cluster landing pages for SEO depth.
- **Multi-model generate + cross-review** (user-requested): compose with 2 models, a third
  critiques/merges + flags any ungrounded claim, human approves. Raises quality + catches the
  "invented fact" failure mode the bench surfaced. Re-run `scripts/bench-daily-note.ts` when new
  model versions ship.
