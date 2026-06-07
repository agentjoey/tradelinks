# TradeLinks Multilingual (i18n) Content — Design

> Status: approved design (2026-06-07). Next step: implementation plan(s) via writing-plans.
> Backlog: BL-041 · [[Backlog-待办#-now--next]]

## Goal

Upgrade TradeLinks from "Chinese UI chrome + English-only content" to a genuinely
multilingual site: Chinese users see **localized alerts, daily notes, and Radar/X items**,
and Chinese pages are **independently crawlable/indexable**. The architecture is designed for
N languages; this phase fills only `zh`.

## Current State (baseline)

- **UI chrome** is already bilingual: `app/lib/i18n.ts` holds `en`/`zh` `Dict`s, selected by
  a `tl_lang` cookie via `getLang()` / `getDict()`.
- **Content is English-only** on the published surface. The pipeline normalizes to English:
  `Item.titleEn/summaryEn` come from `src/ai/prompts/translate.ts`; `Alert.title/summary/
  actionRequired` are generated in English; Radar product titles and X topics are English/original.
- **One model already anticipates per-language content:** `DailyNote` has a `lang` field and
  `@@unique([date, lang, kind])` — it can hold one row per language; only `en` is generated today.
- **Stable identity keys already exist** for derived content (precedent in `ChannelPush`):
  `bestseller:<url>` and `viral:<link>` (`src/push/channel-db.ts`); X topics are `items` rows
  (source `X01`) with an `Item.id`.

## Decisions (locked during brainstorming)

1. **Language scope:** generic N-language data model; fill **zh** content only this phase.
2. **Routing/SEO:** `/zh` subpaths + `hreflang`; English stays **unprefixed at root** (preserves
   existing English SEO weight). "As-needed prefix" model.
3. **Translation materialization:** **pre-translate and store** (crawlable subpaths require the
   translated text to exist at request time), except Radar/X which are lazily cached on read.
4. **Daily Note zh:** **translate + lightweight localization** — translate the published English
   note, then run the existing reviewer pass to de-AI / de-"translationese" the prose.
5. **Content scope this round:** Wire alerts (published) + Daily Note + Radar products/X topics.
   **Telegram channel push is deferred.**

## Architecture

### 1. Locale routing & SEO

Adopt an **as-needed prefix** scheme:

- English at the root: `/`, `/wire`, `/trends`, `/daily`, `/daily/<slug>`.
- Chinese under `/zh`: `/zh`, `/zh/wire`, `/zh/trends`, `/zh/daily`, `/zh/daily/<slug>`.
- A Next.js **middleware** resolves the locale from the pathname and injects it into the request
  (header/param). `getLang()` is changed to read the **request locale** instead of the cookie.
  The `tl_lang` cookie is demoted to a *preference memory* used only to redirect a first-time
  visitor to their preferred locale; it is no longer the source of truth.
- Each page emits `hreflang` alternates (`en`, `zh`, `x-default`) + `canonical` in metadata;
  `og:locale` follows the active locale.
- `app/sitemap.ts` lists both `en` and `zh` URLs for every indexable route (home, wire, trends,
  daily index, each published daily-note slug per available language).

Notes:
- The homepage is `force-dynamic`, so middleware rewrite + per-request locale is sufficient there.
- Daily-note article pages are the SEO assets; they must resolve a real per-locale row (see §4)
  and carry correct `hreflang`/`canonical`.
- Implementation detail (mechanism — middleware rewrite vs `[lang]` route segment per page type)
  is left to the implementation plan; the contract is: distinct URLs per locale, locale resolved
  per request, hreflang/canonical correct.

### 2. Translation storage — generic `Translation` table

A single generic table covers the heterogeneous content (alerts are DB rows, Radar products are
read-time-derived, X topics are `items` rows):

```prisma
model Translation {
  id         String   @id @default(cuid())
  entityType String   // "alert" | "product" | "xtopic"
  entityId   String   // stable key: "alert:<id>" | "bestseller:<url>" | "viral:<link>" | "xtopic:<itemId>"
  lang       String   // "zh" (BCP-47 short code)
  fields     Json     // { title?, summary?, actionRequired?, ... } — only translatable fields
  sourceHash String   // hash of the source fields at translation time (re-translate if source changes)
  model      String?  // LLM used, for provenance
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([entityType, entityId, lang])
  @@index([entityType, lang])
  @@map("translations")
}
```

- `entityId` reuses the **existing stable keys** (no new key scheme to invent).
- `fields` is a per-language JSON map of only the translatable fields → inherently N-language.
- `sourceHash` lets the system detect source edits and re-translate; prevents redundant work.

**Daily Note does NOT use this table** — it keeps its existing per-language rows
(`@@unique([date, lang, kind])`). The Chinese daily note is a new `DailyNote` row with `lang="zh"`.

### 3. Translation timing (three cadences for three content kinds)

- **Wire alerts** — *event-driven*: on publish, enqueue a `translate-content` job →
  write the `alert:<id>` zh row. Volume is bounded by publish rate → cost-predictable.
- **Daily Note** — after the English note is published, enqueue a job → run the
  **editor→reviewer** pipeline to produce the `zh` row (translate + de-translationese). 1–2/day.
- **Radar products / X topics** — *read-through lazy cache*: when a `zh` page renders, batch-look
  up `Translation` rows by key; missing keys are enqueued for background translation and cached.
  Only what a Chinese user actually sees gets translated, once. Avoids eagerly translating the
  large, ephemeral stream of short product titles. (Note: X API is currently paused, so X topics
  have no fresh data until resumed — see memory `x-api-paused`.)

### 4. Translation service & glossary

New module `src/i18n/translate-content.ts`, reusing the existing AI client:

- Alerts / products → **DeepSeek** (cheap, bulk). Daily Note → reuse `editorClient()`/`reviewerClient()`.
- A built-in **cross-border e-commerce glossary** (pure data) enforces consistent terminology
  across the whole site, e.g. `Wire→预警`, `Radar→雷达`, `tariff→关税`, `marketplace→平台`,
  brand/product nouns left untranslated. Glossary application is a **pure function** (testable).
- Prompts must **preserve structure** (markdown, key-takeaway lists) and translate text only.
- Daily-note zh generation reuses the existing quality gate (reviewer de-AI pass) to localize.

### 5. Read / localization layer

New `app/lib/i18n-content.ts`:

- `localizeAlert(alert, translation, lang)`, `localizeProducts(products, translations, lang)`,
  etc. — **return the zh field when present, fall back to the English source when missing**
  (never render blank).
- `zh` pages batch-fetch `Translation` rows in the data layer (`home-data.ts` and the wire/trends
  data fetchers) and pass localized shapes to components. **Components do not gain language logic.**

### 6. Cost control

- Only **published** alerts translated (bounded set) + DeepSeek low unit cost.
- `sourceHash` prevents re-translation of unchanged content.
- Radar/X are lazy/on-demand, not eager.
- Daily Note volume is tiny (1–2/day).
- Net: no runaway cost before Chinese traffic materializes.

## Testing

Per project convention, **TDD on pure functions only**; DB/pages/LLM calls are not unit-tested.
Pure functions to cover with vitest:

- glossary application (term replacement, case/whitespace, untranslated nouns preserved),
- `localizeAlert`/`localizeProducts` fallback logic (zh present → zh; missing → en source),
- `sourceHash` stability (same source → same hash; changed source → different hash),
- path → locale resolution (`/zh/wire` → `zh`, `/wire` → `en`, edge cases),
- `hreflang`/alternate-URL generation for a given route + available locales.

## Phasing (each phase is independently shippable)

- **Phase 1 — Foundation + Wire alerts:** middleware/locale routing + `getLang()` from path +
  `hreflang`/`canonical`/sitemap + `Translation` table + alert translation on publish + localized
  wire/home reads. Ships as: Chinese users get localized alerts on crawlable `/zh` URLs.
- **Phase 2 — Daily Note zh:** zh `DailyNote` generation pipeline (translate + reviewer localize),
  zh daily pages + sitemap/hreflang for slugs.
- **Phase 3 — Radar / X lazy translation:** read-through translation cache for `bestseller:`/
  `viral:`/`xtopic:` keys.
- **(Deferred) — Telegram Chinese push.**

Each phase should get its own implementation plan (one working slice at a time).

## Out of scope (this design)

- Telegram channel localization / a separate Chinese channel.
- Additional languages beyond `zh` (the model supports them; no content this phase).
- Machine-translation of historical/unpublished `Item` rows.
- User-facing language auto-detection beyond a first-visit redirect.
