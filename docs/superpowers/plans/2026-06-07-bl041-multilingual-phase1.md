# BL-041 Multilingual — Phase 1 (Routing Foundation + Wire Alerts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Backlog: BL-041 · Spec: `docs/superpowers/specs/2026-06-07-multilingual-content-design.md`
> Scope: **Phase 1 only** (locale routing/SEO foundation + published Wire alerts localized to `zh`). Daily Note (Phase 2) and Radar/X (Phase 3) are explicitly out of scope here.

**Goal:** Serve Chinese users a crawlable `/zh` site where published Wire alerts (home + `/wire`) appear in Chinese, with `hreflang`/`canonical` SEO wiring; English stays unprefixed at the root.

**Architecture:** A Next.js middleware resolves the locale from the URL path (`/zh/...` → `zh`, else `en`), rewrites `/zh/*` to the underlying route, and injects `x-tl-lang`/`x-tl-path` request headers. `getLang()` reads those headers instead of the cookie. Alert text is pre-translated by a scheduled pg-boss worker into a generic `Translation` table (keyed `alert:<id>`), and the web read-layer overlays the `zh` fields onto each alert with English fallback. Pure logic (path parsing, hreflang, glossary, source-hash, field-merge, JSON parse) is unit-tested; middleware/DB/LLM/pages are verified manually.

**Tech Stack:** Next.js 14 App Router (RSC), Prisma + Neon Postgres, pg-boss workers, DeepSeek (OpenAI-compat) for translation, vitest, zod.

---

## Conventions for this codebase (read before starting)

- **Imports across the `app/` ⇄ `src/` boundary use `.js` suffixes** even for `.ts` files (ESM/NodeNext), e.g. `import { prisma } from "../../src/db/client.js";`. Match the existing files exactly.
- **Dynamic APIs are async here**: this project awaits `cookies()` (`app/lib/i18n.ts:273`), so also `await headers()`.
- **Tests** live in `test/*.test.ts`, run with `pnpm test` (`vitest run`) or a single file `pnpm vitest run test/<file>.test.ts`.
- **TDD applies to pure functions only** (project convention): DB queries, pages, middleware, and LLM calls are NOT unit-tested — they get manual verification steps.
- **Migrations are hand-named sequentially** `000N_name` (see `prisma/migrations/`), applied with `pnpm db:migrate` (`prisma migrate deploy`), not `migrate dev`.
- Commit after each task. Branch is already `feat/multilingual-content`.

---

## File Structure (what each new/changed file is responsible for)

| File | Responsibility |
|---|---|
| `app/lib/locale.ts` (new) | Pure locale URL helpers: detect/strip/add `/zh` prefix, build hreflang alternates. Edge-safe (no node/next deps). |
| `middleware.ts` (modify) | Compose existing `/admin` auth middleware with new locale rewrite + header injection for public routes. |
| `app/lib/i18n.ts` (modify) | `getLang()` reads `x-tl-lang` header (not cookie). |
| `app/layout.tsx` (modify) | `generateMetadata` emits hreflang/canonical/og:locale; language toggle becomes a path swap. |
| `prisma/schema.prisma` + `prisma/migrations/0007_translations/migration.sql` (new) | Generic `Translation` table. |
| `src/i18n/glossary.ts` (new) | Cross-border glossary data + `glossaryBlock(lang)` prompt block (pure). |
| `src/ai/prompts/translate-content.ts` (new) | Build the alert-translation LLM prompt + parse/validate its JSON. |
| `src/i18n/translate-content.ts` (new) | `sourceHashOf` (pure) + `translateAlertFields` orchestrator. |
| `src/i18n/db.ts` (new) | Translation DB queries: find-untranslated, upsert, fetch-for-read. |
| `src/workers/translate.ts` (new) | `translate-content-tick` worker: scan published alerts, translate, store. |
| `src/config/env.ts`, `src/queue/queues.ts`, `src/workers/index.ts` (modify) | Env flags, queue name, registration + schedule. |
| `app/lib/i18n-content.ts` (new) | Read-side: `applyAlertTranslation` (pure) + `localizeAlerts` (fetch+merge). |
| `app/lib/home-data.ts`, `app/wire/page.tsx` (modify) | Localize alert lists before deriving/rendering. |
| `app/sitemap.ts` (modify) | Add `/zh` static entries. |

---

## Task 1: Pure locale URL helpers

**Files:**
- Create: `app/lib/locale.ts`
- Test: `test/locale.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/locale.test.ts
import { describe, it, expect } from "vitest";
import { localeFromPath, stripLocale, addLocale, alternatesFor } from "../app/lib/locale";

describe("localeFromPath", () => {
  it("detects zh for /zh and /zh/*", () => {
    expect(localeFromPath("/zh")).toBe("zh");
    expect(localeFromPath("/zh/wire")).toBe("zh");
  });
  it("defaults to en", () => {
    expect(localeFromPath("/")).toBe("en");
    expect(localeFromPath("/wire")).toBe("en");
  });
  it("does not treat /zhsomething as zh", () => {
    expect(localeFromPath("/zhang")).toBe("en");
  });
});

describe("stripLocale", () => {
  it("removes the zh prefix", () => {
    expect(stripLocale("/zh/wire")).toBe("/wire");
    expect(stripLocale("/zh")).toBe("/");
  });
  it("leaves non-zh paths unchanged", () => {
    expect(stripLocale("/wire")).toBe("/wire");
    expect(stripLocale("/")).toBe("/");
  });
});

describe("addLocale", () => {
  it("prefixes zh, leaves en unprefixed", () => {
    expect(addLocale("/wire", "zh")).toBe("/zh/wire");
    expect(addLocale("/", "zh")).toBe("/zh");
    expect(addLocale("/wire", "en")).toBe("/wire");
    expect(addLocale("/", "en")).toBe("/");
  });
  it("is idempotent against an already-stripped path", () => {
    expect(addLocale(stripLocale("/zh/wire"), "zh")).toBe("/zh/wire");
  });
});

describe("alternatesFor", () => {
  it("builds canonical + hreflang map for a zh path", () => {
    const a = alternatesFor("/zh/wire", "https://x.test");
    expect(a.canonical).toBe("https://x.test/zh/wire");
    expect(a.languages.en).toBe("https://x.test/wire");
    expect(a.languages.zh).toBe("https://x.test/zh/wire");
    expect(a.xDefault).toBe("https://x.test/wire");
  });
  it("builds the same map from the en path", () => {
    const a = alternatesFor("/wire", "https://x.test");
    expect(a.canonical).toBe("https://x.test/wire");
    expect(a.languages.zh).toBe("https://x.test/zh/wire");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/locale.test.ts`
Expected: FAIL — `Cannot find module '../app/lib/locale'`.

- [ ] **Step 3: Write the implementation**

```typescript
// app/lib/locale.ts
// Pure locale URL helpers. MUST stay dependency-free (imported by edge middleware).

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** The locale a request path belongs to. Only "/zh" and "/zh/..." are zh. */
export function localeFromPath(pathname: string): Locale {
  return pathname === "/zh" || pathname.startsWith("/zh/") ? "zh" : "en";
}

/** Remove the "/zh" prefix, returning the underlying (en) path. "/zh" → "/". */
export function stripLocale(pathname: string): string {
  if (pathname === "/zh") return "/";
  if (pathname.startsWith("/zh/")) return pathname.slice(3); // drop "/zh"
  return pathname;
}

/** Add the locale prefix. en is unprefixed (as-needed scheme). Expects a stripped path. */
export function addLocale(pathname: string, locale: Locale): string {
  if (locale === "en") return pathname;
  return pathname === "/" ? "/zh" : `/zh${pathname}`;
}

export interface Alternates {
  canonical: string;
  languages: Record<Locale, string>;
  xDefault: string;
}

/** hreflang/canonical URL set for any request path. xDefault points at en. */
export function alternatesFor(pathname: string, site: string): Alternates {
  const base = stripLocale(pathname);
  const enUrl = `${site}${addLocale(base, "en")}`;
  const zhUrl = `${site}${addLocale(base, "zh")}`;
  const self = localeFromPath(pathname) === "zh" ? zhUrl : enUrl;
  return { canonical: self, languages: { en: enUrl, zh: zhUrl }, xDefault: enUrl };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/locale.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/lib/locale.ts test/locale.test.ts
git commit -m "feat(i18n): pure locale URL helpers (BL-041 P1)"
```

---

## Task 2: Locale middleware (rewrite + header injection, composed with auth)

**Files:**
- Modify: `middleware.ts` (entire file)

No unit test (middleware) — verified manually in Step 3.

- [ ] **Step 1: Replace `middleware.ts` with the composed middleware**

```typescript
// middleware.ts
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { auth } from "./app/lib/auth";
import { localeFromPath, stripLocale } from "./app/lib/locale";

/**
 * Two concerns in one middleware:
 *  - /admin/*  → Neon Auth (session refresh; allowlist still enforced in the page).
 *  - everything else → locale routing: detect /zh, rewrite to the underlying route,
 *    and inject x-tl-lang / x-tl-path so server components can read the active
 *    locale and the original path (for hreflang + the language toggle).
 */
const authMiddleware = auth ? auth.middleware({ loginUrl: "/auth/sign-in" }) : null;

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    return authMiddleware ? authMiddleware(req, event) : NextResponse.next();
  }

  const lang = localeFromPath(pathname);
  const headers = new Headers(req.headers);
  headers.set("x-tl-lang", lang);
  headers.set("x-tl-path", pathname);

  if (lang === "zh") {
    const url = req.nextUrl.clone();
    url.pathname = stripLocale(pathname);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}

// Run on admin + all public routes; skip Next internals, api, and static files.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/).*)"],
};
```

- [ ] **Step 2: Manually verify routing + admin auth still work**

```bash
pnpm dev   # http://localhost:3000
```
Verify (browser or curl):
- `curl -sI localhost:3000/zh` → `200` (renders the home route).
- `curl -s localhost:3000/zh/wire | grep -o '<html[^>]*lang="[a-z]*"'` → `lang="zh"` (after Task 3 lands; before Task 3 it will still say `en` — that's expected, this step only checks the page resolves with `200`).
- `curl -sI localhost:3000/admin` → still redirects to `/auth/sign-in` (admin auth unchanged). If auth env isn't configured locally, it passes through — that matches the prior `null` branch.

Expected: `/zh` and `/zh/wire` return `200`; `/admin` behavior identical to before this change.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(i18n): locale middleware rewrites /zh + injects lang headers (BL-041 P1)"
```

---

## Task 3: `getLang()` reads the request header

**Files:**
- Modify: `app/lib/i18n.ts:273-281`

No unit test (reads `next/headers`) — covered by Task 2's manual check + Task 11.

- [ ] **Step 1: Replace the `getLang`/`getDict` tail of `app/lib/i18n.ts`**

Replace the current block:

```typescript
import { cookies } from "next/headers";
```
at the top of the file with:
```typescript
import { headers } from "next/headers";
```

And replace `getLang` (currently reading the cookie):

```typescript
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("tl_lang")?.value;
  return c === "zh" ? "zh" : "en";
}
```
with:
```typescript
export async function getLang(): Promise<Lang> {
  // Locale is resolved from the URL by middleware.ts and passed via x-tl-lang.
  const h = (await headers()).get("x-tl-lang");
  return h === "zh" ? "zh" : "en";
}
```

(Leave `getDict` unchanged — it already calls `getLang()`.)

- [ ] **Step 2: Manually verify the html lang attribute follows the path**

```bash
pnpm dev
curl -s localhost:3000/zh/wire | grep -o 'lang="[a-z][a-z]"' | head -1   # → lang="zh"
curl -s localhost:3000/wire    | grep -o 'lang="[a-z][a-z]"' | head -1   # → lang="en"
```
Expected: `/zh/wire` → `lang="zh"`; `/wire` → `lang="en"`. The Chinese UI chrome (nav labels) now appears on `/zh/*`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/i18n.ts
git commit -m "feat(i18n): getLang reads x-tl-lang header from middleware (BL-041 P1)"
```

---

## Task 4: hreflang/canonical metadata + path-swap language toggle in layout

**Files:**
- Modify: `app/layout.tsx` (the `metadata` export, the imports, and the toggle href)

No unit test (RSC + `next/headers`) — `alternatesFor` is already tested in Task 1; verified manually here.

- [ ] **Step 1: Add imports at the top of `app/layout.tsx`**

After the existing imports (below `import "./globals.css";`), add:

```typescript
import { headers } from "next/headers";
import { alternatesFor, stripLocale, addLocale } from "./lib/locale";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";
```

- [ ] **Step 2: Replace the static `metadata` export with `generateMetadata`**

Replace the whole `export const metadata: Metadata = { ... };` block with:

```typescript
export async function generateMetadata(): Promise<Metadata> {
  const path = (await headers()).get("x-tl-path") ?? "/";
  const lang = (await headers()).get("x-tl-lang") === "zh" ? "zh" : "en";
  const alt = alternatesFor(path, SITE);
  return {
    metadataBase: new URL(SITE),
    title: "TradeLinks — Cross-Border Intelligence Wire",
    description:
      "Real-time regulatory, platform-policy, logistics and trend alerts for cross-border sellers across 6 regions.",
    alternates: {
      canonical: alt.canonical,
      languages: { en: alt.languages.en, "zh-Hans": alt.languages.zh, "x-default": alt.xDefault },
    },
    openGraph: {
      title: "TradeLinks",
      description: "Global cross-border e-commerce alerts & trend signals.",
      type: "website",
      locale: lang === "zh" ? "zh_CN" : "en_US",
    },
  };
}
```

- [ ] **Step 3: Make the language toggle swap the path**

In the `RootLayout` body, the current code computes:

```typescript
  const { lang, t } = await getDict();
  const other: "en" | "zh" = lang === "zh" ? "en" : "zh";
```

Immediately after those two lines, add:

```typescript
  const curPath = (await headers()).get("x-tl-path") ?? "/";
  const toggleHref = addLocale(stripLocale(curPath), other);
```

Then change the `AccountNav` prop from:

```tsx
                langHref={`/api/lang?l=${other}`}
```
to:
```tsx
                langHref={toggleHref}
```

- [ ] **Step 4: Manually verify hreflang + toggle**

```bash
pnpm dev
curl -s localhost:3000/wire | grep -i 'hreflang\|rel="canonical"'
```
Expected output contains:
- `<link rel="canonical" href="https://tradelinks-mvp.vercel.app/wire"/>`
- `hreflang="en"` → `/wire`, `hreflang="zh-Hans"` → `/zh/wire`, `hreflang="x-default"` → `/wire`.

In the browser: on `/wire` the toggle links to `/zh/wire`; on `/zh/wire` it links to `/wire`.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(i18n): hreflang/canonical metadata + path-swap language toggle (BL-041 P1)"
```

---

## Task 5: `Translation` table (schema + migration)

**Files:**
- Modify: `prisma/schema.prisma` (append model)
- Create: `prisma/migrations/0007_translations/migration.sql`

No unit test (schema).

- [ ] **Step 1: Append the model to `prisma/schema.prisma`**

Add at the end of the file:

```prisma
model Translation {
  id         String   @id @default(cuid())
  entityType String   // "alert" | "product" | "xtopic"
  entityId   String   // stable key, e.g. "alert:<id>", "bestseller:<url>", "viral:<link>"
  lang       String   // BCP-47 short code, e.g. "zh"
  fields     Json     // { title?, summary?, actionRequired? } — translatable fields only
  sourceHash String   // hash of the source fields at translation time
  model      String?  // LLM used, for provenance
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([entityType, entityId, lang])
  @@index([entityType, lang])
  @@map("translations")
}
```

- [ ] **Step 2: Create the migration SQL**

```sql
-- prisma/migrations/0007_translations/migration.sql
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "translations_entityType_entityId_lang_key" ON "translations"("entityType", "entityId", "lang");
CREATE INDEX "translations_entityType_lang_idx" ON "translations"("entityType", "lang");
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run:
```bash
pnpm db:migrate   # prisma migrate deploy — applies 0007 to the Neon dev branch
pnpm db:gen       # prisma generate — Translation now on the typed client
```
Expected: migrate reports `0007_translations` applied; generate succeeds. Verify the type exists:
```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -5   # no new errors from Translation usage (none yet)
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0007_translations
git commit -m "feat(i18n): add Translation table (migration 0007) (BL-041 P1)"
```

---

## Task 6: Glossary + `glossaryBlock` (pure)

**Files:**
- Create: `src/i18n/glossary.ts`
- Test: `test/glossary.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/glossary.test.ts
import { describe, it, expect } from "vitest";
import { glossaryBlock, GLOSSARY } from "../src/i18n/glossary";

describe("glossaryBlock", () => {
  it("renders the zh term map as a deterministic prompt block", () => {
    const block = glossaryBlock("zh");
    expect(block).toContain("tariff");
    expect(block).toContain("关税");
    expect(block).toContain("marketplace");
    // every glossary entry appears as a "term -> translation" line
    for (const [term, tr] of Object.entries(GLOSSARY.zh)) {
      expect(block).toContain(`${term} → ${tr}`);
    }
  });
  it("is stable across calls", () => {
    expect(glossaryBlock("zh")).toBe(glossaryBlock("zh"));
  });
  it("returns an empty block for a lang with no glossary", () => {
    expect(glossaryBlock("en")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/glossary.test.ts`
Expected: FAIL — `Cannot find module '../src/i18n/glossary'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/i18n/glossary.ts
// Cross-border e-commerce terminology, enforced for consistent translations.
// Add terms here over time; keys are the canonical English term.

export const GLOSSARY: Record<string, Record<string, string>> = {
  zh: {
    tariff: "关税",
    customs: "海关",
    marketplace: "平台",
    "regulatory": "法规",
    "compliance": "合规",
    "logistics": "物流",
    "fulfillment": "履约",
    "bestseller": "畅销品",
    "cross-border": "跨境",
    "seller": "卖家",
    "listing": "商品页",
    "suspension": "封号",
    "chargeback": "拒付",
  },
};

/** A deterministic prompt block instructing the model to use fixed translations. */
export function glossaryBlock(lang: string): string {
  const map = GLOSSARY[lang];
  if (!map) return "";
  const lines = Object.entries(map)
    .map(([term, tr]) => `- ${term} → ${tr}`)
    .join("\n");
  return `Use these fixed term translations exactly:\n${lines}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/glossary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/glossary.ts test/glossary.test.ts
git commit -m "feat(i18n): cross-border glossary + glossaryBlock (BL-041 P1)"
```

---

## Task 7: Alert-translation prompt + parser (pure)

**Files:**
- Create: `src/ai/prompts/translate-content.ts`
- Test: `test/translate-content-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/translate-content-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildAlertTranslatePrompt, parseAlertTranslation } from "../src/ai/prompts/translate-content";

describe("buildAlertTranslatePrompt", () => {
  it("includes source fields, target lang and the glossary block", () => {
    const opts = buildAlertTranslatePrompt(
      { title: "EU tariff change", summary: "A new customs rule.", actionRequired: "Review listings" },
      "zh",
      "- tariff → 关税",
    );
    expect(opts.json).toBe(true);
    expect(opts.user).toContain("EU tariff change");
    expect(opts.user).toContain("A new customs rule.");
    expect(opts.user).toContain("Review listings");
    expect(opts.system).toContain("zh");
    expect(opts.user).toContain("关税"); // glossary injected
  });
  it("marks actionRequired as null when absent", () => {
    const opts = buildAlertTranslatePrompt(
      { title: "T", summary: "S", actionRequired: null },
      "zh",
      "",
    );
    expect(opts.user).toContain("(none)");
  });
});

describe("parseAlertTranslation", () => {
  it("parses valid JSON", () => {
    const r = parseAlertTranslation('{"title":"标题","summary":"摘要","actionRequired":"行动"}');
    expect(r).toEqual({ title: "标题", summary: "摘要", actionRequired: "行动" });
  });
  it("accepts null actionRequired", () => {
    const r = parseAlertTranslation('{"title":"标题","summary":"摘要","actionRequired":null}');
    expect(r.actionRequired).toBeNull();
  });
  it("throws on missing required field", () => {
    expect(() => parseAlertTranslation('{"summary":"摘要"}')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/translate-content-prompt.test.ts`
Expected: FAIL — `Cannot find module '../src/ai/prompts/translate-content'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/ai/prompts/translate-content.ts
// Translate a published alert's fields into a target language. Structure-preserving,
// glossary-bound. Mirrors the shape of src/ai/prompts/translate.ts.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

export interface AlertFields {
  title: string;
  summary: string;
  actionRequired: string | null;
}

export function buildAlertTranslatePrompt(
  fields: AlertFields,
  lang: string,
  glossary: string,
): LlmCompleteOpts {
  const system =
    `You are a professional cross-border e-commerce translator. Translate the given ` +
    `alert fields into language code "${lang}" (Simplified Chinese for zh). Keep it ` +
    `accurate, natural and concise — no translationese, no added commentary. Preserve ` +
    `proper nouns, brand names and numbers. ` +
    `Respond ONLY with JSON {"title": string, "summary": string, "actionRequired": string|null}. ` +
    `If the source actionRequired is "(none)", return null.`;
  const glossaryPart = glossary ? `\n\n${glossary}` : "";
  const user =
    `Title: ${fields.title}\n` +
    `Summary: ${fields.summary}\n` +
    `ActionRequired: ${fields.actionRequired ?? "(none)"}` +
    glossaryPart;
  return { system, user, json: true, maxTokens: 700 };
}

export const AlertTranslationSchema = z.object({
  title: z.string(),
  summary: z.string(),
  actionRequired: z.string().nullable(),
});
export type AlertTranslation = z.infer<typeof AlertTranslationSchema>;

export function parseAlertTranslation(text: string): AlertTranslation {
  return AlertTranslationSchema.parse(extractJson(text));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/translate-content-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/prompts/translate-content.ts test/translate-content-prompt.test.ts
git commit -m "feat(i18n): alert-translation prompt + parser (BL-041 P1)"
```

---

## Task 8: `sourceHashOf` + `translateAlertFields` orchestrator

**Files:**
- Create: `src/i18n/translate-content.ts`
- Test: `test/source-hash.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/source-hash.test.ts
import { describe, it, expect } from "vitest";
import { sourceHashOf } from "../src/i18n/translate-content";

describe("sourceHashOf", () => {
  const a = { title: "T", summary: "S", actionRequired: "A" };
  it("is stable for the same fields", () => {
    expect(sourceHashOf(a)).toBe(sourceHashOf({ ...a }));
  });
  it("is key-order independent", () => {
    const b = { actionRequired: "A", summary: "S", title: "T" };
    expect(sourceHashOf(a)).toBe(sourceHashOf(b));
  });
  it("changes when any field changes", () => {
    expect(sourceHashOf(a)).not.toBe(sourceHashOf({ ...a, title: "T2" }));
  });
  it("distinguishes null from empty string", () => {
    expect(sourceHashOf({ title: "T", summary: "S", actionRequired: null }))
      .not.toBe(sourceHashOf({ title: "T", summary: "S", actionRequired: "" }));
  });
  it("returns a hex sha256 string", () => {
    expect(sourceHashOf(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/source-hash.test.ts`
Expected: FAIL — `Cannot find module '../src/i18n/translate-content'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/i18n/translate-content.ts
import { createHash } from "node:crypto";
import type { LlmClient } from "../ai/client.js";
import {
  buildAlertTranslatePrompt,
  parseAlertTranslation,
  type AlertFields,
  type AlertTranslation,
} from "../ai/prompts/translate-content.js";
import { glossaryBlock } from "./glossary.js";

/** Stable sha256 of the source fields (sorted keys → order-independent). */
export function sourceHashOf(fields: AlertFields): string {
  const canonical = JSON.stringify({
    title: fields.title,
    summary: fields.summary,
    actionRequired: fields.actionRequired,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Translate one alert's fields with the given client. Throws on parse failure. */
export async function translateAlertFields(
  client: LlmClient,
  fields: AlertFields,
  lang: string,
): Promise<AlertTranslation> {
  const opts = buildAlertTranslatePrompt(fields, lang, glossaryBlock(lang));
  const res = await client.complete(opts);
  return parseAlertTranslation(res.text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/source-hash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/translate-content.ts test/source-hash.test.ts
git commit -m "feat(i18n): sourceHashOf + translateAlertFields orchestrator (BL-041 P1)"
```

---

## Task 9: Translation DB helpers

**Files:**
- Create: `src/i18n/db.ts`

No unit test (DB queries) — exercised by the worker (Task 10) and read layer (Task 11), verified manually.

- [ ] **Step 1: Write the implementation**

```typescript
// src/i18n/db.ts
import { prisma } from "../db/client.js";
import type { AlertFields } from "../ai/prompts/translate-content.js";

export interface UntranslatedAlert extends AlertFields {
  id: string;
}

/** stable Translation key for an alert. */
export function alertEntityId(id: string): string {
  return `alert:${id}`;
}

/**
 * Published alerts from the last `lookbackDays` that have no current `lang`
 * translation (missing row, or stored sourceHash != current source). Capped at
 * `limit`. Returns the source fields the worker needs to translate.
 */
export async function findUntranslatedAlerts(
  lang: string,
  lookbackDays: number,
  limit: number,
  currentHash: (f: AlertFields) => string,
): Promise<UntranslatedAlert[]> {
  const since = new Date(Date.now() - lookbackDays * 864e5);
  const alerts = await prisma.alert.findMany({
    where: { status: "published", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 500, // scan window; we filter then cap to `limit`
    select: { id: true, title: true, summary: true, actionRequired: true },
  });
  const ids = alerts.map((a) => alertEntityId(a.id));
  const existing = await prisma.translation.findMany({
    where: { entityType: "alert", lang, entityId: { in: ids } },
    select: { entityId: true, sourceHash: true },
  });
  const byKey = new Map(existing.map((t) => [t.entityId, t.sourceHash]));
  const out: UntranslatedAlert[] = [];
  for (const a of alerts) {
    const fields = { title: a.title, summary: a.summary, actionRequired: a.actionRequired };
    const stored = byKey.get(alertEntityId(a.id));
    if (stored === undefined || stored !== currentHash(fields)) {
      out.push({ id: a.id, ...fields });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Upsert a translation row (unique on entityType+entityId+lang). */
export async function upsertTranslation(
  entityType: string,
  entityId: string,
  lang: string,
  fields: Record<string, unknown>,
  sourceHash: string,
  model: string | null,
): Promise<void> {
  await prisma.translation.upsert({
    where: { entityType_entityId_lang: { entityType, entityId, lang } },
    create: { entityType, entityId, lang, fields, sourceHash, model },
    update: { fields, sourceHash, model },
  });
}

/** Fetch translations for many alert ids → Map<alertId, fields>. Read path. */
export async function getAlertTranslations(
  ids: string[],
  lang: string,
): Promise<Map<string, Record<string, unknown>>> {
  if (ids.length === 0) return new Map();
  const keys = ids.map(alertEntityId);
  const rows = await prisma.translation.findMany({
    where: { entityType: "alert", lang, entityId: { in: keys } },
    select: { entityId: true, fields: true },
  });
  const out = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    out.set(r.entityId.replace(/^alert:/, ""), r.fields as Record<string, unknown>);
  }
  return out;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit` 
Expected: no errors referencing `src/i18n/db.ts` (the `translation` model + `entityType_entityId_lang` compound key exist from Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/db.ts
git commit -m "feat(i18n): Translation DB helpers (find/upsert/fetch) (BL-041 P1)"
```

---

## Task 10: Translation worker + env + queue + schedule

> **Deviation from spec (intentional):** the spec §3 describes alert translation as
> "event-driven at publish → enqueue". This plan uses a **15-minute reconciliation tick**
> instead. It materializes the same rows (translated text exists at request time, with the
> read layer falling back to English in the ≤15-min gap), avoids hooking the two separate
> publish call sites (`src/alerts/route.ts` auto-publish + `src/alerts/review.ts` manual),
> is idempotent via `sourceHash`, and **backfills existing published alerts for free** on
> first run. Event-on-publish can be layered on later if lower latency is needed.

**Files:**
- Modify: `src/config/env.ts` (add flags)
- Modify: `src/queue/queues.ts` (add queue name)
- Create: `src/workers/translate.ts`
- Modify: `src/workers/index.ts` (register + schedule)

No unit test (worker/DB/LLM) — verified manually in Step 5.

- [ ] **Step 1: Add env flags to `src/config/env.ts`**

Inside the `EnvSchema = z.object({ ... })`, after the `DAILY_NOTE_AUTOPUBLISH` block (around `src/config/env.ts:30`), add:

```typescript
  // --- Multilingual content translation (BL-041) ---
  // Gate the translation worker. Off → tick no-ops (zero LLM cost). Needs DEEPSEEK_API_KEY.
  TRANSLATE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // CSV of target locales to materialize, e.g. "zh" (Phase 1) or "zh,pt".
  TRANSLATE_TARGET_LANGS: z.string().default("zh"),
  // only (re)translate published alerts created within this window.
  TRANSLATE_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  // hard cap of alerts translated per run per lang — bounds LLM cost.
  TRANSLATE_MAX_PER_RUN: z.coerce.number().int().positive().default(40),
```

- [ ] **Step 2: Add the queue name in `src/queue/queues.ts`**

In the `QUEUES` object (after `channelPush: "channel-push-tick",`), add:

```typescript
  translate: "translate-content-tick",
```

- [ ] **Step 3: Create the worker**

```typescript
// src/workers/translate.ts
// translate-content-tick: materialize zh (and any TRANSLATE_TARGET_LANGS) versions
// of recently-published Wire alerts into the Translation table. Idempotent via
// sourceHash; gated off by default (TRANSLATE_ENABLED) for zero cost.
import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { env } from "../config/env.js";
import { deepseekChat } from "../ai/client.js";
import { logger } from "../lib/logger.js";
import {
  findUntranslatedAlerts,
  upsertTranslation,
  alertEntityId,
} from "../i18n/db.js";
import { sourceHashOf, translateAlertFields } from "../i18n/translate-content.js";

export interface TranslateRunResult {
  enabled: boolean;
  perLang: { lang: string; translated: number; failed: number }[];
}

function targetLangs(): string[] {
  return env.TRANSLATE_TARGET_LANGS.split(",").map((s) => s.trim()).filter(Boolean);
}

/** One translation pass over all target langs. Reusable from scripts + worker. */
export async function runTranslate(): Promise<TranslateRunResult> {
  if (!env.TRANSLATE_ENABLED || !env.DEEPSEEK_API_KEY) {
    logger.info("translate-tick: disabled (TRANSLATE_ENABLED off or no DEEPSEEK_API_KEY)");
    return { enabled: false, perLang: [] };
  }
  const client = deepseekChat;
  const perLang: TranslateRunResult["perLang"] = [];

  for (const lang of targetLangs()) {
    const candidates = await findUntranslatedAlerts(
      lang,
      env.TRANSLATE_LOOKBACK_DAYS,
      env.TRANSLATE_MAX_PER_RUN,
      sourceHashOf,
    );
    let translated = 0;
    let failed = 0;
    for (const a of candidates) {
      const fields = { title: a.title, summary: a.summary, actionRequired: a.actionRequired };
      try {
        const tr = await translateAlertFields(client, fields, lang);
        await upsertTranslation(
          "alert",
          alertEntityId(a.id),
          lang,
          tr as unknown as Record<string, unknown>,
          sourceHashOf(fields),
          client.name,
        );
        translated++;
      } catch (err) {
        failed++;
        logger.warn({ err, alertId: a.id, lang }, "translate-tick: alert translation failed");
      }
    }
    logger.info({ lang, translated, failed, candidates: candidates.length }, "translate-tick: lang done");
    perLang.push({ lang, translated, failed });
  }
  return { enabled: true, perLang };
}

export async function registerTranslateWorker(boss: PgBoss): Promise<void> {
  await boss.work(QUEUES.translate, sendOpts, async () => {
    await runTranslate();
  });
}
```

- [ ] **Step 4: Register + schedule in `src/workers/index.ts`**

Add the import alongside the other worker imports (after the `registerChannelPushWorker` import):

```typescript
import { registerTranslateWorker } from "./translate.js";
```

Add the registration after `await registerChannelPushWorker(boss);`:

```typescript
  await registerTranslateWorker(boss);
```

Add the schedule after `await boss.schedule(QUEUES.channelPush, "0 2,10,16 * * *");`:

```typescript
  await boss.schedule(QUEUES.translate, "*/15 * * * *");
```

Update the "workers online" log line to append `+ translate`.

- [ ] **Step 5: Manually verify end-to-end against the dev DB**

Add a temporary script and run it (requires `DEEPSEEK_API_KEY` + `TRANSLATE_ENABLED=true` in `.env`):

```bash
# .env must have DEEPSEEK_API_KEY=... and TRANSLATE_ENABLED=true
cat > scripts/translate-once.ts <<'EOF'
import { runTranslate } from "../src/workers/translate.js";
runTranslate().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); });
EOF
pnpm tsx scripts/translate-once.ts
```
Expected: JSON like `{ "enabled": true, "perLang": [{ "lang": "zh", "translated": N, "failed": 0 }] }` with `N > 0` (existing published alerts get translated). Spot-check one row:
```bash
pnpm exec prisma studio   # open the `translations` table; confirm zh fields look like correct Chinese
```
Then remove the temp script: `rm scripts/translate-once.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts src/queue/queues.ts src/workers/translate.ts src/workers/index.ts
git commit -m "feat(i18n): translate-content-tick worker materializes zh alerts (BL-041 P1)"
```

---

## Task 11: Read-layer localization + wire into home & /wire

**Files:**
- Create: `app/lib/i18n-content.ts`
- Test: `test/i18n-content.test.ts`
- Modify: `app/lib/home-data.ts` (localize alerts; keep notes English in P1)
- Modify: `app/wire/page.tsx` (localize items)

- [ ] **Step 1: Write the failing test (pure merge/fallback)**

```typescript
// test/i18n-content.test.ts
import { describe, it, expect } from "vitest";
import { applyAlertTranslation } from "../app/lib/i18n-content";
import type { AlertRow } from "../app/lib/alerts";

const base: AlertRow = {
  id: "a1", title: "EN title", summary: "EN summary", urgencyScore: 3,
  regions: [], platforms: [], category: "regulatory", actionRequired: "EN action",
  imageUrl: null, sourceUrls: [], publishedAt: null, createdAt: new Date(),
};

describe("applyAlertTranslation", () => {
  it("overlays zh fields when present", () => {
    const r = applyAlertTranslation(base, { title: "中文标题", summary: "中文摘要", actionRequired: "中文行动" });
    expect(r.title).toBe("中文标题");
    expect(r.summary).toBe("中文摘要");
    expect(r.actionRequired).toBe("中文行动");
  });
  it("falls back to English per-field when a field is missing", () => {
    const r = applyAlertTranslation(base, { title: "中文标题" });
    expect(r.title).toBe("中文标题");
    expect(r.summary).toBe("EN summary");
    expect(r.actionRequired).toBe("EN action");
  });
  it("returns the original alert when there is no translation", () => {
    expect(applyAlertTranslation(base, undefined)).toEqual(base);
  });
  it("does not mutate non-text fields", () => {
    const r = applyAlertTranslation(base, { title: "X" });
    expect(r.id).toBe("a1");
    expect(r.urgencyScore).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/i18n-content.test.ts`
Expected: FAIL — `Cannot find module '../app/lib/i18n-content'`.

- [ ] **Step 3: Write the read layer**

```typescript
// app/lib/i18n-content.ts
import type { AlertRow } from "./alerts";
import type { Lang } from "./i18n";
import { getAlertTranslations } from "../../src/i18n/db.js";

type AlertFieldsT = { title?: unknown; summary?: unknown; actionRequired?: unknown };

/** Overlay translated fields onto an alert; per-field English fallback. Pure. */
export function applyAlertTranslation(a: AlertRow, t: AlertFieldsT | undefined): AlertRow {
  if (!t) return a;
  return {
    ...a,
    title: typeof t.title === "string" && t.title ? t.title : a.title,
    summary: typeof t.summary === "string" && t.summary ? t.summary : a.summary,
    actionRequired:
      typeof t.actionRequired === "string" && t.actionRequired ? t.actionRequired : a.actionRequired,
  };
}

/** Localize a list of alerts for `lang`. en → unchanged; zh → fetch + overlay. */
export async function localizeAlerts(alerts: AlertRow[], lang: Lang): Promise<AlertRow[]> {
  if (lang === "en" || alerts.length === 0) return alerts;
  const map = await getAlertTranslations(alerts.map((a) => a.id), lang);
  return alerts.map((a) => applyAlertTranslation(a, map.get(a.id) as AlertFieldsT | undefined));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/i18n-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire localization into `app/lib/home-data.ts`**

Add the import after the existing imports:

```typescript
import { localizeAlerts } from "./i18n-content";
```

Change the parallel fetch so alerts are localized before any derivation. Replace:

```typescript
  const [{ items: alerts }, bestsellers, viral, topics, notes] = await Promise.all([
    getAlerts({ take: 60 }),
    getBestsellers(),
    getViralX(),
    getHotTopicsX(),
    getPublishedNotes(4, lang),
  ]);
```
with:
```typescript
  const [{ items: rawAlerts }, bestsellers, viral, topics, notes] = await Promise.all([
    getAlerts({ take: 60 }),
    getBestsellers(),
    getViralX(),
    getHotTopicsX(),
    // Daily notes stay English in Phase 1 (localized in Phase 2 / BL-041).
    getPublishedNotes(4, "en"),
  ]);
  const alerts = await localizeAlerts(rawAlerts, lang);
```

(Everything downstream already uses `alerts`, so hero/secondary/wire/latest all inherit the localized text.)

- [ ] **Step 6: Wire localization into `app/wire/page.tsx`**

Add the import after the existing imports:

```typescript
import { localizeAlerts } from "../lib/i18n-content";
```

Replace:

```typescript
  const { items, nextCursor } = await getAlerts(sp);
```
with:
```typescript
  const { items: rawItems, nextCursor } = await getAlerts(sp);
  const items = await localizeAlerts(rawItems, lang);
```

- [ ] **Step 7: Manually verify localized content on /zh**

Prereq: Task 10's manual run populated `zh` translations.
```bash
pnpm dev
# Pick one translated alert id from prisma studio, then confirm its zh title appears
# only on the /zh page. Replace 中文标题片段 with an actual phrase from a zh row:
curl -s localhost:3000/zh/wire | grep -c '中文标题片段'   # → ≥1
curl -s localhost:3000/wire    | grep -c '中文标题片段'   # → 0
```
Best confirmed visually in the browser: open `/wire` (English) and `/zh/wire` side by side —
alert titles/summaries are Chinese on `/zh/wire` where a translation exists, English where it
doesn't; `/wire` is unchanged. Same for the home hero/wire section on `/zh` vs `/`.

- [ ] **Step 8: Commit**

```bash
git add app/lib/i18n-content.ts test/i18n-content.test.ts app/lib/home-data.ts app/wire/page.tsx
git commit -m "feat(i18n): localize Wire alerts on home + /wire with en fallback (BL-041 P1)"
```

---

## Task 12: Sitemap `/zh` entries

**Files:**
- Modify: `app/sitemap.ts`

No unit test (data).

- [ ] **Step 1: Add zh static entries**

Add the imports at the top:

```typescript
import { addLocale } from "./lib/locale";
```

Replace the `staticEntries` block:

```typescript
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/trends`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/daily`, changeFrequency: "daily", priority: 0.9 },
  ];
```
with:
```typescript
  const paths: { p: string; cf: "hourly" | "daily"; pr: number }[] = [
    { p: "/", cf: "hourly", pr: 1 },
    { p: "/wire", cf: "hourly", pr: 0.9 },
    { p: "/trends", cf: "daily", pr: 0.8 },
    { p: "/daily", cf: "daily", pr: 0.9 },
  ];
  // en (root) + zh (/zh) for each. Daily-note slugs are en-only until Phase 2.
  const staticEntries: MetadataRoute.Sitemap = paths.flatMap(({ p, cf, pr }) => [
    { url: `${SITE}${addLocale(p, "en")}`, changeFrequency: cf, priority: pr },
    { url: `${SITE}${addLocale(p, "zh")}`, changeFrequency: cf, priority: pr },
  ]);
```

- [ ] **Step 2: Verify**

```bash
pnpm dev
curl -s localhost:3000/sitemap.xml | grep -o '<loc>[^<]*</loc>' | grep zh
```
Expected: lines for `https://.../zh`, `https://.../zh/wire`, `https://.../zh/trends`, `https://.../zh/daily`.

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(i18n): sitemap lists /zh routes (BL-041 P1)"
```

---

## Task 13: Full-suite green + acceptance gate (for reviewer sign-off)

**Files:** none (verification only)

- [ ] **Step 1: Whole test suite passes**

Run: `pnpm test`
Expected: all tests green, including the new `locale`, `glossary`, `translate-content-prompt`, `source-hash`, `i18n-content` files. No pre-existing tests broken (especially `home-select`, `alert-route`).

- [ ] **Step 2: Type check + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; Next build succeeds.

- [ ] **Step 3: Reviewer acceptance checklist** (Claude verifies before merge)

- [ ] `/zh`, `/zh/wire`, `/zh/trends`, `/zh/daily` all return `200`; `/admin` auth unchanged.
- [ ] `<html lang>` = `zh` on `/zh/*`, `en` on root paths.
- [ ] `/wire` and `/zh/wire` both emit `rel="canonical"` (self) + `hreflang` en/zh-Hans/x-default pointing at the correct URLs.
- [ ] Language toggle swaps path (`/wire` ↔ `/zh/wire`) and preserves the rest of the path.
- [ ] Published Wire alerts render in Chinese on `/zh` (home hero/wire + `/wire`), English where no translation exists; English surface (`/`, `/wire`) unchanged.
- [ ] `translations` table has zh rows with plausible Chinese; re-running `runTranslate` translates 0 new (idempotent via sourceHash).
- [ ] `TRANSLATE_ENABLED=false` (or unset) → worker no-ops, pages fall back to English with no errors.
- [ ] `sitemap.xml` includes the `/zh` routes.
- [ ] Radar products, X topics, and Daily notes remain English on `/zh` (correct — they are Phase 2/3 scope).

- [ ] **Step 4: Final commit (if any checklist fixups were needed)**

```bash
git add -A
git commit -m "chore(i18n): Phase 1 acceptance fixups (BL-041 P1)"
```

---

## Out of scope (Phase 1) — do NOT implement here

- Daily Note Chinese generation (Phase 2 / BL-041).
- Radar product + X topic translation / lazy read-through cache (Phase 3 / BL-041).
- First-visit Accept-Language / cookie auto-redirect to `/zh` (follow-up; the toggle + crawlable `/zh` is sufficient for Phase 1).
- Telegram channel localization (deferred).
- Production env flip (`TRANSLATE_ENABLED=true` on Railway) and Railway/Vercel deploy — operator action after merge.
