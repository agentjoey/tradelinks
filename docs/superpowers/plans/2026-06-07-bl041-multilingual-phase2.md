# BL-041 Multilingual — Phase 2 (Daily Note zh + locale-aware navigation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Backlog: BL-041 · Spec: `docs/superpowers/specs/2026-06-07-multilingual-content-design.md`
> Builds on: Phase 1 (merged to main `c18ea8e`) — locale middleware, `Translation` table, glossary, alert translation, read-layer.
> Scope: **Phase 2 only.** Radar/X lazy translation (Phase 3) and Telegram (deferred) are out of scope.

**Goal:** Give Chinese users a coherent `/zh` experience whose internal navigation stays in Chinese, and publish a Chinese version of each Daily Note (translate + reviewer localization) on crawlable `/zh/daily` pages with correct hreflang.

**Architecture:** Part A fixes a Phase-1 gap — internal `<Link>`s are now locale-prefixed via the existing `addLocale` helper so navigating within `/zh` preserves the locale. Part B reads the published English `DailyNote`, translates its fields with a structure-preserving glossary-bound LLM call, runs the existing reviewer pass to de-AI/localize, and persists a `zh` `DailyNote` row (own unique slug, keyed `(date, "zh", kind)`). The `/daily` pages already thread `lang`; we add per-note hreflang via the sibling-language slug and switch the home Daily section to `lang` with English fallback.

**Tech Stack:** Next.js 14 App Router (RSC), Prisma + Neon Postgres, pg-boss, DeepSeek (translate) + the existing daily reviewer client, vitest, zod.

---

## Conventions (same as Phase 1 — re-read if unfamiliar)

- Cross-boundary imports use `.js` suffixes (`import { x } from "../../src/...js"`).
- Dynamic APIs are async: `await headers()`, `await cookies()`.
- TDD on pure functions only; DB/worker/LLM/pages get manual verification.
- Tests in `test/*.test.ts`, run `pnpm test` or `pnpm vitest run test/<f>.test.ts`.
- Commit after each task. **Create a branch first:** `git checkout main && git pull --ff-only origin main && git checkout -b feat/multilingual-phase2`.
- The locale helpers `addLocale`/`stripLocale`/`localeFromPath` already exist and are tested in `app/lib/locale.ts` — reuse them, do NOT re-create.
- `TRANSLATE_ENABLED` / `TRANSLATE_TARGET_LANGS` env already exist (added in Phase 1) — reuse them; no new env.

---

## File Structure

| File | Responsibility | Part |
|---|---|---|
| `app/layout.tsx` (modify) | Locale-prefix the global nav (MainNav items + logo). | A |
| `app/components/MainNav.tsx` (modify) | Active-state compare locale-independently. | A |
| `app/page.tsx`, `app/wire/page.tsx`, `app/daily/page.tsx`, `app/daily/[slug]/page.tsx` (modify) | Locale-prefix in-page internal links. | A |
| `app/components/HeroLead.tsx`, `app/components/StreamCard.tsx` (modify) | Locale-prefix the daily-note links (already receive `lang`). | A |
| `src/ai/prompts/translate-note.ts` (new) | Build the note-translation prompt + parse/validate. | B |
| `src/daily/translate.ts` (new) | `translateNote` + `runDailyNoteTranslate` orchestration. | B |
| `src/daily/db.ts` (modify) | `getEnNote(date,kind)` (full source) + `getNoteSiblingSlug(date,kind,lang)` (hreflang). | B |
| `src/workers/daily-note.ts` (modify) | After the English run, translate to target langs (gated). | B |
| `app/lib/home-data.ts` (modify) | Home Daily section uses `lang` notes with English fallback. | B |
| `app/sitemap.ts` (modify) | List published `zh` daily-note slugs. | B |

---

# PART A — Locale-aware navigation (Phase-1 gap fix)

## Task 1: Locale-prefix the global nav

**Files:**
- Modify: `app/layout.tsx` (the `MainNav` items + logo `Link`)
- Modify: `app/components/MainNav.tsx` (active-state)

No new unit test — `addLocale`/`stripLocale` already tested; verified manually.

- [ ] **Step 1: Prefix the logo + nav item hrefs in `app/layout.tsx`**

The body already computes `lang`, `other`, `curPath`, `toggleHref` (Phase 1). Change the logo link from:

```tsx
                <Link href="/" className="leading-none">
```
to:
```tsx
                <Link href={addLocale("/", lang)} className="leading-none">
```

And change the `MainNav` `items` from:

```tsx
                <MainNav
                  items={[
                    { href: "/", label: t.nav.home },
                    { href: "/wire", label: t.nav.wire },
                    { href: "/trends", label: t.nav.radar },
                    { href: "/daily", label: t.nav.daily },
                  ]}
                  moreLabel={t.nav.more}
                />
```
to:
```tsx
                <MainNav
                  items={[
                    { href: addLocale("/", lang), label: t.nav.home },
                    { href: addLocale("/wire", lang), label: t.nav.wire },
                    { href: addLocale("/trends", lang), label: t.nav.radar },
                    { href: addLocale("/daily", lang), label: t.nav.daily },
                  ]}
                  moreLabel={t.nav.more}
                />
```

(`addLocale` is already imported in `app/layout.tsx` from Phase 1.)

- [ ] **Step 2: Make `MainNav` active-state locale-independent**

In `app/components/MainNav.tsx`, add the import:

```tsx
import { stripLocale } from "../lib/locale";
```

Replace the `active` helper:

```tsx
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
```
with:
```tsx
  const active = (href: string) => {
    const p = stripLocale(path);
    const h = stripLocale(href);
    return h === "/" ? p === "/" : p.startsWith(h);
  };
```

- [ ] **Step 3: Manually verify nav preserves locale**

```bash
pnpm dev
```
On `/zh` (browser): the nav links (首页/情报流/趋势雷达/每日洞察) and the logo all point to `/zh...` (hover to confirm `/zh/wire` etc.); clicking stays in Chinese chrome. On `/` they point to `/wire` etc. (unprefixed). The active item still highlights correctly on both.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/components/MainNav.tsx
git commit -m "fix(i18n): locale-prefix global nav + locale-independent active state (BL-041 P2)"
```

---

## Task 2: Locale-prefix in-page internal links

**Files:**
- Modify: `app/page.tsx`, `app/wire/page.tsx`, `app/daily/page.tsx`, `app/daily/[slug]/page.tsx`
- Modify: `app/components/HeroLead.tsx`, `app/components/StreamCard.tsx`

No new unit test — verified manually.

- [ ] **Step 1: `app/page.tsx` — prefix the section/rail hrefs**

Add the import (top of file):

```tsx
import { addLocale } from "./lib/locale";
```

`app/page.tsx` already has `const { lang, t } = await getDict();`. Change each `href="/wire"` / `href="/trends"` / `href="/daily"` passed to `LatestRail` and `SectionHeader` to the prefixed form. Concretely, replace the four occurrences:

- `href="/wire"` (the `LatestRail` props line) → `href={addLocale("/wire", lang)}`
- `href="/wire"` (the Wire `SectionHeader`) → `href={addLocale("/wire", lang)}`
- `href="/trends"` (Radar `SectionHeader`) → `href={addLocale("/trends", lang)}`
- `href="/trends"` (Hot-on-X `SectionHeader`) → `href={addLocale("/trends", lang)}`
- `href="/daily"` (Daily `SectionHeader`) → `href={addLocale("/daily", lang)}`

- [ ] **Step 2: `app/wire/page.tsx` — prefix the teaser + load-earlier links**

Add the import:

```tsx
import { addLocale } from "../lib/locale";
```

`wire/page.tsx` already has `lang`. Change the trends teaser:

```tsx
          href="/trends"
```
to:
```tsx
          href={addLocale("/trends", lang)}
```

And the load-earlier link:

```tsx
            href={`/wire?${new URLSearchParams({ ...sp, cursor: nextCursor }).toString()}`}
```
to:
```tsx
            href={`${addLocale("/wire", lang)}?${new URLSearchParams({ ...sp, cursor: nextCursor }).toString()}`}
```

- [ ] **Step 3: `app/daily/page.tsx` — prefix the card links**

Add the import:

```tsx
import { addLocale } from "../lib/locale";
```

`daily/page.tsx` already has `lang`. Change:

```tsx
                    href={`/daily/${n.slug}`}
```
to:
```tsx
                    href={addLocale(`/daily/${n.slug}`, lang)}
```

- [ ] **Step 4: `app/daily/[slug]/page.tsx` — prefix the back link**

Add the import:

```tsx
import { addLocale } from "../../lib/locale";
```

`[slug]/page.tsx` already has `lang`. Change:

```tsx
      <Link href="/daily" className="ticker
```
to:
```tsx
      <Link href={addLocale("/daily", lang)} className="ticker
```

- [ ] **Step 5: `HeroLead.tsx` + `StreamCard.tsx` — prefix daily links**

Both already receive a `lang` prop. In each file add the import:

```tsx
import { addLocale } from "../lib/locale";
```

In `app/components/HeroLead.tsx` change the note link:

```tsx
      <Link href={`/daily/${n.slug}`}
```
to:
```tsx
      <Link href={addLocale(`/daily/${n.slug}`, lang)}
```

In `app/components/StreamCard.tsx` (the `DailyCard` component, which has `lang` in scope) change:

```tsx
    <Link href={`/daily/${note.slug}`}
```
to:
```tsx
    <Link href={addLocale(`/daily/${note.slug}`, lang)}
```

- [ ] **Step 6: Manually verify + type-check**

```bash
pnpm exec tsc --noEmit   # expect exit 0
pnpm dev
```
On `/zh` and `/zh/wire`: every "See all", the Radar/Wire teasers, the load-earlier link, and daily cards point to `/zh/...`. On the English root they remain unprefixed. Navigating around `/zh` never drops back to English chrome.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/wire/page.tsx app/daily/page.tsx "app/daily/[slug]/page.tsx" app/components/HeroLead.tsx app/components/StreamCard.tsx
git commit -m "fix(i18n): locale-prefix in-page internal links (BL-041 P2)"
```

---

# PART B — Daily Note Chinese (translate + localize)

## Task 3: Note-translation prompt + parser (pure)

**Files:**
- Create: `src/ai/prompts/translate-note.ts`
- Test: `test/translate-note-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/translate-note-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildNoteTranslatePrompt, parseNoteTranslation } from "../src/ai/prompts/translate-note";

const en = {
  title: "EU tightens marketplace rules",
  dek: "What sellers must do now",
  bodyMarkdown: "## Heading\n\nA paragraph about tariff changes.\n\n- bullet one\n- bullet two",
  keyTakeaways: ["Check listings", "Review customs"],
  metaDescription: "EU marketplace rule changes and seller actions.",
};

describe("buildNoteTranslatePrompt", () => {
  it("includes all source fields, target lang and the glossary", () => {
    const opts = buildNoteTranslatePrompt(en, "zh", "- tariff → 关税");
    expect(opts.json).toBe(true);
    expect(opts.user).toContain("EU tightens marketplace rules");
    expect(opts.user).toContain("## Heading");
    expect(opts.user).toContain("Check listings");
    expect(opts.system).toContain("zh");
    expect(opts.user).toContain("关税");
  });
  it("instructs preserving markdown structure", () => {
    const opts = buildNoteTranslatePrompt(en, "zh", "");
    expect(opts.system.toLowerCase()).toContain("markdown");
  });
});

describe("parseNoteTranslation", () => {
  it("parses valid JSON into camelCase fields", () => {
    const r = parseNoteTranslation(
      '{"title":"标题","dek":"副标","body_markdown":"## 标题\\n\\n正文","key_takeaways":["要点一"],"meta_description":"描述"}',
    );
    expect(r).toEqual({
      title: "标题", dek: "副标", bodyMarkdown: "## 标题\n\n正文",
      keyTakeaways: ["要点一"], metaDescription: "描述",
    });
  });
  it("defaults optional fields", () => {
    const r = parseNoteTranslation('{"title":"标题","body_markdown":"正文"}');
    expect(r.dek).toBe("");
    expect(r.keyTakeaways).toEqual([]);
    expect(r.metaDescription).toBe("");
  });
  it("throws when title or body is missing", () => {
    expect(() => parseNoteTranslation('{"dek":"x"}')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/translate-note-prompt.test.ts`
Expected: FAIL — `Cannot find module '../src/ai/prompts/translate-note'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/ai/prompts/translate-note.ts
// Translate a full Daily Note into a target language, preserving markdown structure.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

export interface NoteSource {
  title: string;
  dek: string;
  bodyMarkdown: string;
  keyTakeaways: string[];
  metaDescription: string;
}

export function buildNoteTranslatePrompt(
  src: NoteSource,
  lang: string,
  glossary: string,
): LlmCompleteOpts {
  const system =
    `You are a professional cross-border e-commerce editor translating an article into ` +
    `language code "${lang}" (Simplified Chinese for zh). Produce natural, idiomatic prose — ` +
    `no translationese, no added or removed facts. PRESERVE the markdown structure exactly ` +
    `(headings, lists, links, emphasis); translate only the human-readable text. Keep proper ` +
    `nouns, brand names, URLs and numbers intact. ` +
    `Respond ONLY with JSON {"title": string, "dek": string, "body_markdown": string, ` +
    `"key_takeaways": string[], "meta_description": string}.`;
  const glossaryPart = glossary ? `\n\n${glossary}` : "";
  const user =
    `Title: ${src.title}\n` +
    `Dek: ${src.dek}\n` +
    `KeyTakeaways:\n${src.keyTakeaways.map((k) => `- ${k}`).join("\n")}\n` +
    `MetaDescription: ${src.metaDescription}\n\n` +
    `BodyMarkdown:\n${src.bodyMarkdown}` +
    glossaryPart;
  return { system, user, json: true, maxTokens: 4000 };
}

const NoteTranslationSchema = z.object({
  title: z.string(),
  dek: z.string().default(""),
  body_markdown: z.string(),
  key_takeaways: z.array(z.string()).default([]),
  meta_description: z.string().default(""),
});

export interface NoteTranslation {
  title: string;
  dek: string;
  bodyMarkdown: string;
  keyTakeaways: string[];
  metaDescription: string;
}

export function parseNoteTranslation(text: string): NoteTranslation {
  const p = NoteTranslationSchema.parse(extractJson(text));
  return {
    title: p.title,
    dek: p.dek,
    bodyMarkdown: p.body_markdown,
    keyTakeaways: p.key_takeaways,
    metaDescription: p.meta_description,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/translate-note-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/prompts/translate-note.ts test/translate-note-prompt.test.ts
git commit -m "feat(i18n): daily-note translation prompt + parser (BL-041 P2)"
```

---

## Task 4: DB helpers for source note + sibling slug

**Files:**
- Modify: `src/daily/db.ts` (append two functions)

No unit test (DB) — exercised by Task 5/7, verified manually.

- [ ] **Step 1: Append `getEnNote` and `getNoteSiblingSlug` to `src/daily/db.ts`**

Add at the end of the file:

```typescript
/** Full published English note for (date, kind) — the source for translation. */
export async function getEnNote(
  date: string,
  kind: string,
): Promise<{
  date: string;
  kind: string;
  title: string;
  dek: string;
  bodyMarkdown: string;
  keyTakeaways: string[];
  metaDescription: string;
  tags: string[];
  citations: { title: string; url: string }[];
  sourceAlertIds: string[];
} | null> {
  const d = new Date(`${date}T00:00:00.000Z`);
  const n = await prisma.dailyNote.findUnique({
    where: { date_lang_kind: { date: d, lang: "en", kind } },
    select: {
      title: true, dek: true, bodyMarkdown: true, keyTakeaways: true,
      metaDescription: true, tags: true, citations: true, sourceAlertIds: true, status: true,
    },
  });
  if (!n || n.status !== "published") return null;
  return {
    date,
    kind,
    title: n.title,
    dek: n.dek ?? "",
    bodyMarkdown: n.bodyMarkdown,
    keyTakeaways: n.keyTakeaways,
    metaDescription: n.metaDescription ?? "",
    tags: n.tags,
    citations: (n.citations as { title: string; url: string }[] | null) ?? [],
    sourceAlertIds: n.sourceAlertIds,
  };
}

/** The published slug of the same note in another language (for hreflang). */
export async function getNoteSiblingSlug(
  date: Date,
  kind: string,
  lang: string,
): Promise<string | null> {
  const n = await prisma.dailyNote.findUnique({
    where: { date_lang_kind: { date, lang, kind } },
    select: { slug: true, status: true },
  });
  return n && n.status === "published" ? n.slug : null;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/daily/db.ts
git commit -m "feat(i18n): daily db helpers getEnNote + getNoteSiblingSlug (BL-041 P2)"
```

---

## Task 5: `translateNote` + `runDailyNoteTranslate` orchestration

**Files:**
- Create: `src/daily/translate.ts`

No unit test (orchestration/LLM) — verified live in Task 6.

- [ ] **Step 1: Write the implementation**

```typescript
// src/daily/translate.ts
// Daily Note localization (BL-041 P2): translate a published English note into a
// target language, then run the existing reviewer to de-AI/localize, and persist
// it as its own (date, lang, kind) row with a language-specific slug.
import type { LlmClient } from "../ai/client.js";
import { buildNoteTranslatePrompt, parseNoteTranslation } from "../ai/prompts/translate-note.js";
import { glossaryBlock } from "../i18n/glossary.js";
import { slugify, type ComposedNote } from "./compose.js";
import { reviewNote } from "./review.js";
import { gatherInputs, getEnNote, persistNote } from "./db.js";
import { logger } from "../lib/logger.js";

export interface DailyTranslateResult {
  date: string;
  lang: string;
  translated: { kind: string; slug: string }[];
  skipped: string[];
}

const KINDS = ["brief", "roundup"] as const;

/** Translate one published English note (date, kind) into `lang` → ComposedNote. */
export async function translateNote(
  client: LlmClient,
  lang: string,
  enNote: NonNullable<Awaited<ReturnType<typeof getEnNote>>>,
): Promise<ComposedNote> {
  const opts = buildNoteTranslatePrompt(
    {
      title: enNote.title,
      dek: enNote.dek,
      bodyMarkdown: enNote.bodyMarkdown,
      keyTakeaways: enNote.keyTakeaways,
      metaDescription: enNote.metaDescription,
    },
    lang,
    glossaryBlock(lang),
  );
  const res = await client.complete(opts);
  const tr = parseNoteTranslation(res.text);
  return {
    date: enNote.date,
    lang,
    kind: enNote.kind as ComposedNote["kind"],
    slug: slugify(enNote.date, tr.title, lang),
    title: tr.title,
    dek: tr.dek,
    bodyMarkdown: tr.bodyMarkdown,
    keyTakeaways: tr.keyTakeaways,
    metaDescription: tr.metaDescription,
    tags: enNote.tags, // tags kept as-is (minor; not user-facing prose)
    citations: enNote.citations,
    sourceAlertIds: enNote.sourceAlertIds,
    model: `${client.name} (translate)`,
  };
}

/**
 * For each kind with a published English note on `date`, translate → review →
 * persist a `lang` note. `translateClient` does the translation; `reviewClient`
 * de-AIs/localizes (the existing reviewer). Idempotent via persistNote upsert.
 */
export async function runDailyNoteTranslate(
  date: string,
  lang: string,
  translateClient: LlmClient,
  reviewClient: LlmClient,
  status: "draft" | "published",
): Promise<DailyTranslateResult> {
  const input = await gatherInputs(date, lang);
  const translated: DailyTranslateResult["translated"] = [];
  const skipped: string[] = [];

  for (const kind of KINDS) {
    const enNote = await getEnNote(date, kind);
    if (!enNote) {
      skipped.push(kind);
      continue;
    }
    try {
      const composed = await translateNote(translateClient, lang, enNote);
      const reviewed = await reviewNote(composed, input, reviewClient);
      await persistNote(reviewed, status);
      translated.push({ kind, slug: reviewed.slug });
      logger.info({ date, lang, kind, slug: reviewed.slug }, "daily-note translated");
    } catch (e) {
      skipped.push(kind);
      logger.error({ date, lang, kind, err: String(e) }, "daily-note translation failed");
    }
  }
  return { date, lang, translated, skipped };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0. (Confirms `ComposedNote` fields match what `translateNote` returns.)

- [ ] **Step 3: Commit**

```bash
git add src/daily/translate.ts
git commit -m "feat(i18n): translateNote + runDailyNoteTranslate (translate+review+persist) (BL-041 P2)"
```

---

## Task 6: Wire zh translation into the daily-note worker

**Files:**
- Modify: `src/workers/daily-note.ts`

No unit test (worker/LLM) — verified live in Step 3.

- [ ] **Step 1: Extend `runDailyNote` to translate after the English run**

In `src/workers/daily-note.ts`, add imports near the top (with the other imports):

```typescript
import { env } from "../config/env.js";   // already imported — keep one copy
import { deepseekChat } from "../ai/client.js";
import { runDailyNoteTranslate } from "../daily/translate.js";
```

(If `editorClient`/`reviewerClient`/`env` are already imported, don't duplicate — only add `deepseekChat` and `runDailyNoteTranslate`.)

At the end of `runDailyNote`, right before `logger.info({ date, lang, generated... }, "daily-note run done");`, insert the translation pass:

```typescript
  // Localize the freshly-written English notes into each target language (BL-041 P2).
  // Gated by the same TRANSLATE_ENABLED switch; needs DEEPSEEK_API_KEY.
  if (lang === "en" && env.TRANSLATE_ENABLED && env.DEEPSEEK_API_KEY) {
    const targets = env.TRANSLATE_TARGET_LANGS.split(",").map((s) => s.trim()).filter((l) => l && l !== "en");
    for (const target of targets) {
      const r = await runDailyNoteTranslate(date, target, deepseekChat, reviewerClient(), status);
      logger.info({ date, target, translated: r.translated.length, skipped: r.skipped }, "daily-note translate pass done");
    }
  }
```

(`reviewerClient` and `status` are already in scope in `runDailyNote`.)

- [ ] **Step 2: Type-check + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Manually verify zh note generation against the dev DB**

Requires `.env`: `DEEPSEEK_API_KEY=...`, `TRANSLATE_ENABLED=true`. Pick a UTC date that already has a published English note (find one in `prisma studio` → `daily_notes`, `lang=en`, `status=published`; use its `date`).

```bash
cat > scripts/daily-translate-once.ts <<'EOF'
import { deepseekChat, reviewerClient } from "../src/ai/client.js";
import { runDailyNoteTranslate } from "../src/daily/translate.js";
const date = process.argv[2]; // YYYY-MM-DD
runDailyNoteTranslate(date, "zh", deepseekChat, reviewerClient(), "published")
  .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); });
EOF
TRANSLATE_ENABLED=true pnpm tsx scripts/daily-translate-once.ts 2026-06-06
rm -f scripts/daily-translate-once.ts
```
Expected: JSON `{ "date": "...", "lang": "zh", "translated": [{ "kind": "brief", "slug": "..." }, ...], "skipped": [...] }`. In `prisma studio` the new `lang=zh` row(s) have Chinese `title`/`bodyMarkdown` with preserved markdown headings/lists, and a distinct slug.

- [ ] **Step 4: Commit**

```bash
git add src/workers/daily-note.ts
git commit -m "feat(i18n): daily-note worker translates English notes to target langs (BL-041 P2)"
```

---

## Task 7: Home Daily section uses `lang` notes (English fallback)

**Files:**
- Modify: `app/lib/home-data.ts`

No unit test (DB) — verified manually.

- [ ] **Step 1: Switch the notes fetch to `lang` with English fallback**

In `app/lib/home-data.ts`, the Phase-1 code fetches `getPublishedNotes(4, "en")`. Replace that line inside the `Promise.all`:

```typescript
    // Daily notes stay English in Phase 1 (localized in Phase 2 / BL-041).
    getPublishedNotes(4, "en"),
```
with:
```typescript
    getPublishedNotes(4, lang),
```

Then, immediately after the `Promise.all` destructuring and the `const alerts = await localizeAlerts(rawAlerts, lang);` line, add a fallback so a Chinese page with no zh notes yet still shows the English ones:

```typescript
  const notesLocalized = notes.length > 0 ? notes : lang === "en" ? notes : await getPublishedNotes(4, "en");
```

Then replace every later use of `notes` in this function with `notesLocalized`. Concretely:
- the hero fallback `notes[0]` → `notesLocalized[0]`
- the return `notes: notes.slice(0, 3)` → `notes: notesLocalized.slice(0, 3)`

- [ ] **Step 2: Type-check + verify**

```bash
pnpm exec tsc --noEmit   # exit 0
pnpm dev
```
On `/zh` the Daily section shows Chinese note cards once zh notes exist (from Task 6); if none exist for the latest day it falls back to English cards (no empty section). The card links go to `/zh/daily/<zh-slug>` (Part A).

- [ ] **Step 3: Commit**

```bash
git add app/lib/home-data.ts
git commit -m "feat(i18n): home Daily section uses lang notes with English fallback (BL-041 P2)"
```

---

## Task 8: Per-note hreflang + localized canonical on the article page

**Files:**
- Modify: `app/daily/[slug]/page.tsx` (`generateMetadata` + the in-page `url`)

No unit test (page) — verified manually.

- [ ] **Step 1: Localize canonical + add sibling hreflang in `generateMetadata`**

In `app/daily/[slug]/page.tsx` add imports:

```tsx
import { addLocale } from "../../lib/locale";
import { getNoteSiblingSlug } from "../../../src/daily/db.js";
```

Replace the body of `generateMetadata` (after `if (!n) return ...`) so the canonical reflects the note's own language and an alternate points at the sibling-language note when it exists:

```tsx
  const selfPath = addLocale(`/daily/${n.slug}`, n.lang as "en" | "zh");
  const url = `${SITE}${selfPath}`;
  const otherLang = n.lang === "zh" ? "en" : "zh";
  const siblingSlug = await getNoteSiblingSlug(n.date, n.kind, otherLang);
  const languages: Record<string, string> = {
    [n.lang === "zh" ? "zh-Hans" : "en"]: url,
  };
  if (siblingSlug) {
    const siblingPath = addLocale(`/daily/${siblingSlug}`, otherLang as "en" | "zh");
    languages[otherLang === "zh" ? "zh-Hans" : "en"] = `${SITE}${siblingPath}`;
    languages["x-default"] = otherLang === "en" ? `${SITE}${siblingPath}` : url;
  }
  const desc = n.metaDescription ?? n.dek ?? n.title;
  return {
    title: `${n.title} — TradeLinks`,
    description: desc,
    alternates: { canonical: url, languages },
    openGraph: { title: n.title, description: desc, type: "article", url, publishedTime: (n.publishedAt ?? n.date).toISOString(), authors: [AUTHOR], ...(n.heroImageUrl ? { images: [n.heroImageUrl] } : {}) },
    twitter: { card: "summary_large_image", title: n.title, description: desc },
  };
```

- [ ] **Step 2: Localize the in-page JSON-LD `url`**

In the default `DailyNotePage` component, the `url` used by JSON-LD is `${SITE}/daily/${n.slug}`. Change it to reflect the note's language:

```tsx
  const url = `${SITE}${addLocale(`/daily/${n.slug}`, n.lang as "en" | "zh")}`;
```

- [ ] **Step 3: Manually verify hreflang on a note that has both languages**

```bash
pnpm dev
# en slug (from Task 6 you know the date; find both slugs in prisma studio):
curl -s "http://localhost:3000/daily/<EN_SLUG>"    | grep -iE 'canonical|hreflang'
curl -s "http://localhost:3000/zh/daily/<ZH_SLUG>" | grep -iE 'canonical|hreflang'
```
Expected: the en page canonical = `/daily/<EN_SLUG>` with an alternate `zh-Hans` → `/zh/daily/<ZH_SLUG>`; the zh page canonical = `/zh/daily/<ZH_SLUG>` with alternate `en` → `/daily/<EN_SLUG>`, plus `x-default` → the en URL.

- [ ] **Step 4: Commit**

```bash
git add "app/daily/[slug]/page.tsx"
git commit -m "feat(i18n): per-note hreflang + localized canonical on daily article (BL-041 P2)"
```

---

## Task 9: Sitemap — published zh daily slugs

**Files:**
- Modify: `app/sitemap.ts`

No unit test (data) — verified manually.

- [ ] **Step 1: Add zh note entries**

In `app/sitemap.ts`, the existing `noteEntries` lists English notes via `getPublishedNotes(1000)`. Make it cover both languages and prefix the zh ones. Replace:

```typescript
  const notes = await getPublishedNotes(1000).catch(() => []);
  const noteEntries: MetadataRoute.Sitemap = notes.map((n) => ({
    url: `${SITE}/daily/${n.slug}`,
    lastModified: n.publishedAt ?? n.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
```
with:
```typescript
  const notes = await getPublishedNotes(1000).catch(() => []);
  const noteEntries: MetadataRoute.Sitemap = notes.map((n) => ({
    url: `${SITE}${addLocale(`/daily/${n.slug}`, n.lang === "zh" ? "zh" : "en")}`,
    lastModified: n.publishedAt ?? n.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
```

(`addLocale` is already imported in `app/sitemap.ts` from Phase 1; `getPublishedNotes` returns `lang` on each card.)

- [ ] **Step 2: Verify**

```bash
pnpm dev
curl -s http://localhost:3000/sitemap.xml | grep -oE '<loc>[^<]*zh/daily[^<]*</loc>'
```
Expected: one `…/zh/daily/<zh-slug>` entry per published zh note (after Task 6 created some).

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(i18n): sitemap lists zh daily-note slugs (BL-041 P2)"
```

---

## Task 10: Full-suite green + acceptance gate (reviewer sign-off)

**Files:** none (verification only)

- [ ] **Step 1: Whole test suite + type-check + build**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build`
Expected: all tests green (including the new `translate-note-prompt`), tsc exit 0, build succeeds. No pre-existing test broken.

- [ ] **Step 2: Reviewer acceptance checklist** (Claude verifies before merge)

- [ ] Navigating within `/zh` (nav, logo, See-all, teasers, daily cards, back link) always stays under `/zh` and in Chinese chrome; English root unaffected; active nav state correct in both.
- [ ] A published English Daily Note produces a `zh` `DailyNote` row (own slug) with natural Chinese and **preserved markdown** (headings/lists/links intact); glossary terms applied.
- [ ] `/zh/daily` lists the zh notes; `/zh/daily/<zh-slug>` renders the Chinese article with Chinese chrome; `/daily` + English notes unchanged.
- [ ] Article hreflang pairs en↔zh by **sibling slug** (not naive path swap); canonical is self/locale-correct; JSON-LD `inLanguage` matches.
- [ ] Home Daily section shows zh cards on `/zh` (English fallback when no zh note yet) — never an empty section.
- [ ] Re-running the translate pass for the same date upserts (no duplicate rows; `(date, "zh", kind)` unique respected).
- [ ] `TRANSLATE_ENABLED=false` → no zh notes generated, daily pipeline unaffected, `/zh/daily` falls back to English with no errors.
- [ ] `sitemap.xml` includes `/zh/daily/<zh-slug>` entries.
- [ ] Radar products + X topics remain English on `/zh` (correct — Phase 3 scope).

- [ ] **Step 3: Final commit (if fixups needed)**

```bash
git add -A
git commit -m "chore(i18n): Phase 2 acceptance fixups (BL-041 P2)"
```

---

## Out of scope (Phase 2)

- Radar product + X topic translation / lazy read-through cache (Phase 3).
- Translating Daily Note `tags` and citation titles (kept English; minor, revisit if needed).
- First-visit Accept-Language auto-redirect (follow-up).
- Telegram channel localization (deferred).
- Production env flip (`TRANSLATE_ENABLED=true` on Railway) — operator action after merge.
