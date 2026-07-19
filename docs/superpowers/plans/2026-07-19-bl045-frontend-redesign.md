# BL-045 Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematic quality pass on the five public surfaces (Home `/`, Wire `/wire`, Radar `/trends`, Daily `/daily` + `/daily/[slug]`, Subscribe ×3): semantic dual-theme tokens, mobile tab bar, unified components, full state coverage, and the "Instrument Panel" motion system — per spec `docs/superpowers/specs/2026-07-19-bl045-frontend-redesign-design.md`.

**Architecture:** Three slices, each independently testable and revertible. Slice 1: design-system foundation (CSS-var tokens, theme cookie mechanism, chrome, subscribe fix). Slice 2: component & state layer (SignalCard, labels, PageHeader, EmptyState, route states). Slice 3: page-by-page polish + motion. Visual contract: `design/bl045-mockup-v1.html` (layout/tokens) and `design/bl045-mockup-v2.html` (motion).

**Tech Stack:** Next.js 14 App Router (all pages `force-dynamic` SSR), Tailwind 3.4, React 18, Radix DropdownMenu (new dep), vitest, pnpm. No shadcn, no next-themes.

## Global Constraints

- Dark is the **default** theme; light is opt-in. Never read `prefers-color-scheme`.
- All text/background pairs must hold WCAG AA: ≥4.5:1 body, ≥3:1 large text. Token values are pre-verified — do not change them without re-running a contrast check.
- Theme cookie: name `tl-theme`, values `dark` | `light`, `path=/`, `max-age=31536000`, `SameSite=Lax`.
- All new user-visible copy goes through `getDict()` (EN + ZH) — zero hardcoded English in components. EN pages stay zero-CJK.
- **No >1px side-stripe borders** (impeccable absolute ban). Tier = tier chip + 1px hairline border.
- Every animation needs a `prefers-reduced-motion` fallback; no bounce/elastic easing; feedback transitions 100–300ms.
- Project test convention: pages/components are NOT unit-tested; pure logic in `app/lib/**` IS. Keep `pnpm test` (287) green, `pnpm lint` (tsc) clean.
- Don't touch: `app/admin/*` visual design (import swaps allowed), `/trends` URL, backend/worker, Prisma schema.
- Commit after every task. Branch: `feat/frontend-redesign` (create at Task 1, merge after Task 18 human gate).

## File Map

| File | Responsibility |
|---|---|
| `app/globals.css` | Theme vars (dark/light), textures, motion CSS |
| `tailwind.config.ts` | Token colors → CSS vars, named fontSize, radius scale |
| `app/lib/theme.ts` | `parseTheme()`, `THEME_COOKIE` |
| `app/lib/labels.ts` | Single source: `REGION_LABEL`, `REGION_NAME`, `CAT_LABEL` |
| `app/lib/theme.ts` tests → `test/theme.test.ts`; labels → `test/labels.test.ts`; `isFresh` → `test/home-select.test.ts` |
| `app/components/ThemeToggle.tsx` | client: cookie + `data-theme` toggle |
| `app/components/MobileTabBar.tsx` | client: 4-tab bottom bar, `aria-current` |
| `app/components/MainNav.tsx` | desktop nav + Radix More menu |
| `app/components/AccountNav.tsx` | header cluster (Alerts/Upgrade→`/subscribe`, avatar→admin) |
| `app/components/SignalCard.tsx` | unified card (wire/radar/x/mover/daily) |
| `app/components/PageHeader.tsx` | unified page top |
| `app/components/EmptyState.tsx` | unified empty state |
| `app/components/Skeleton.tsx` | skeleton rows for loading.tsx |
| `app/components/WireTape.tsx` | server: ticker tape (2× track for seamless loop) |
| `app/components/UtcClock.tsx` | client: ticking UTC clock |
| `app/components/RadarGlyph.tsx` | server: radar sweep glyph (CSS-only) |
| `app/components/DiffusionArc.tsx` | server: lead-lag arc SVG (CSS-only) |
| `app/components/ui.ts` | shared class strings: buttons, chips, inputs |
| `app/{,wire/,trends/,daily/,subscribe/}loading.tsx`, `app/error.tsx`, `app/not-found.tsx` | route states |

---

# SLICE 1 — Foundation

### Task 1: Semantic tokens — globals.css + tailwind.config.ts

**Files:**
- Modify: `app/globals.css` (full replacement)
- Modify: `tailwind.config.ts` (full replacement)

**Interfaces:**
- Produces: CSS vars `--c-bg/--c-surface/--c-surface2/--c-ink/--c-muted/--c-faint/--c-signal/--c-urgent/--c-calm/--c-chip-bg/--c-chip-ink/--c-eyebrow` (RGB triplets) + `--c-line/--c-linestrong` (full rgba). Tailwind colors: `canvas surface surface2 ink muted faint line linestrong signal urgent calm chipbg chipink eyebrow`. Tailwind fontSize: `label meta body lede title headline`. Radius: `sm=4px md=8px lg=12px`.
- Note: `line`/`linestrong` map to raw vars (no `<alpha-value>`) — opacity modifiers like `border-line/50` are NOT supported on these two (none exist in code today).

- [ ] **Step 1: Replace `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
  --c-bg: 8 9 12;
  --c-surface: 14 16 21;
  --c-surface2: 19 22 29;
  --c-ink: 236 231 219;
  --c-muted: 139 143 154;
  --c-faint: 124 130 144; /* was #5a5f6b (3.1:1) → #7c8290 (5.2:1) */
  --c-line: rgba(233, 228, 217, 0.1);
  --c-linestrong: rgba(233, 228, 217, 0.2);
  --c-signal: 232 180 74;
  --c-urgent: 255 90 77;
  --c-calm: 79 209 197;
  --c-chip-bg: 232 180 74;
  --c-chip-ink: 8 9 12;
  --c-eyebrow: 232 180 74 / 0.8;
  --halo: radial-gradient(120% 80% at 50% -10%, rgba(232, 180, 74, 0.06), transparent 60%);
  --grid-line: rgba(233, 228, 217, 0.025);
  --grain-opacity: 0.04;
}

[data-theme="light"] {
  color-scheme: light;
  --c-bg: 244 241 232;
  --c-surface: 251 249 243;
  --c-surface2: 255 255 255;
  --c-ink: 27 26 22;
  --c-muted: 92 89 82;
  --c-faint: 111 106 92;
  --c-line: rgba(27, 26, 22, 0.12);
  --c-linestrong: rgba(27, 26, 22, 0.22);
  --c-signal: 138 90 11;
  --c-urgent: 198 58 45;
  --c-calm: 14 117 104;
  --c-chip-bg: 138 90 11;
  --c-chip-ink: 255 248 234;
  --c-eyebrow: 138 90 11;
  --halo: radial-gradient(120% 80% at 50% -10%, rgba(138, 90, 11, 0.05), transparent 60%);
  --grid-line: rgba(27, 26, 22, 0.03);
  --grain-opacity: 0.025;
}

@layer base {
  body {
    background-color: rgb(var(--c-bg));
    color: rgb(var(--c-ink));
    background-image: var(--halo), linear-gradient(var(--grid-line) 1px, transparent 1px);
    background-size: auto, 100% 34px;
    background-attachment: fixed;
    -webkit-font-smoothing: antialiased;
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: var(--grain-opacity);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  ::selection {
    background: rgba(232, 180, 74, 0.28);
  }
}

@layer utilities {
  .ticker {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }
}
```

- [ ] **Step 2: Replace `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const rgb = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        canvas: rgb("--c-bg"),
        surface: rgb("--c-surface"),
        surface2: rgb("--c-surface2"),
        ink: rgb("--c-ink"),
        muted: rgb("--c-muted"),
        faint: rgb("--c-faint"),
        line: "var(--c-line)",
        linestrong: "var(--c-linestrong)",
        signal: rgb("--c-signal"),
        urgent: rgb("--c-urgent"),
        calm: rgb("--c-calm"),
        chipbg: rgb("--c-chip-bg"),
        chipink: rgb("--c-chip-ink"),
        eyebrow: "var(--c-eyebrow)",
      },
      fontSize: {
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
        meta: ["0.8125rem", { lineHeight: "1.25rem" }],
        body: ["1rem", { lineHeight: "1.6" }],
        lede: ["1.125rem", { lineHeight: "1.55" }],
        title: ["1.3125rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        headline: ["1.625rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
      },
      borderRadius: { sm: "4px", md: "8px", lg: "12px" },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-bar": {
          "0%,100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 0.55s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-bar": "pulse-bar 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm lint && pnpm test`
Expected: tsc clean, 287 tests pass. (Site will look broken until Task 2 codemod — `bg-ink`/`text-paper` no longer exist. Do not screenshot yet.)

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat(BL-045): semantic dual-theme tokens (CSS vars + named type/radius scales)"
```

### Task 2: Class codemod — paper/ink rename + radius converge

**Files:**
- Modify: all `app/**/*.tsx` using `text-paper`, `bg-paper`, `border-paper`, `text-ink`, `bg-ink`, `rounded-xl`, `rounded-2xl` (mechanical rename only — includes admin/auth so nothing breaks; those pages are not otherwise redesigned)

**Interfaces:**
- Consumes: Task 1 token names.
- Produces: codebase free of `paper`/`ink`(old)/`rounded-xl`/`rounded-2xl` classes; chip text uses `text-chipink`.

- [ ] **Step 1: Inventory old `text-ink` usages (they mean "dark text on colored chip")**

Run: `grep -rn "text-ink" app/`
Expected: hits only where text sits on a colored background (active filter chips, signal buttons), e.g. `app/components/Filters.tsx` (`bg-signal text-ink`), `app/components/SubscribeBar.tsx`. Confirm every hit is on `bg-signal`/`bg-urgent`/similar. If a hit is dark-text-on-dark-bg (an invisible bug under the OLD meaning), first edit that spot's `text-ink` → `text-paper` — Step 2's second rename then converts it to the NEW `text-ink` (light text) correctly. All on-colored-bg hits stay `text-ink` for Step 2's first rename.

- [ ] **Step 2: Run the codemod (order matters — text-ink FIRST)**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rl "text-ink" app --include="*.tsx" | xargs sed -i '' 's/text-ink/text-chipink/g'
grep -rl "bg-ink" app --include="*.tsx" | xargs sed -i '' 's/bg-ink/bg-canvas/g'
grep -rl "text-paper" app --include="*.tsx" | xargs sed -i '' 's/text-paper/text-ink/g'
grep -rl "border-paper" app --include="*.tsx" | xargs sed -i '' 's/border-paper/border-ink/g'
grep -rl "rounded-2xl" app --include="*.tsx" | xargs sed -i '' 's/rounded-2xl/rounded-lg/g'
grep -rl "rounded-xl" app --include="*.tsx" | xargs sed -i '' 's/rounded-xl/rounded-lg/g'
```

`bg-paper` needs case-by-case (old paper as a background): run `grep -rn "bg-paper" app/` — for each hit on a dark-theme section replace with `bg-surface2`; on the (to-be-fixed) subscribe pages replace with `bg-canvas`. If zero hits, skip.

- [ ] **Step 3: Verify zero residue + visual smoke**

Run: `grep -rn "text-paper\|bg-paper\|border-paper\|bg-ink\b\|rounded-xl\|rounded-2xl" app/ || echo "CLEAN"`
Expected: `CLEAN`
Run: `pnpm lint && pnpm test` → clean / 287 pass.
Run: `pnpm dev` (background), then:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 --window-size=1440,1350 --screenshot=/tmp/bl045-t2-home.png "http://localhost:3000/"
```
Read the screenshot: home renders identically to current production (dark theme unchanged). Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add -A app/
git commit -m "refactor(BL-045): codemod to semantic token classes (text-paper→text-ink, bg-ink→bg-canvas, radius converge)"
```

### Task 3: Theme mechanism — `app/lib/theme.ts` + layout plumbing (TDD)

**Files:**
- Create: `app/lib/theme.ts`
- Test: `test/theme.test.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `THEME_COOKIE = "tl-theme"`; `type Theme = "dark" | "light"`; `parseTheme(v: string | undefined | null): Theme`. Layout renders `<html data-theme={theme}>` and a beforeInteractive fallback script.

- [ ] **Step 1: Write the failing test**

`test/theme.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseTheme, THEME_COOKIE } from "../app/lib/theme";

describe("parseTheme", () => {
  it("defaults to dark for undefined/null", () => {
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
  });
  it("returns light only for exact 'light'", () => {
    expect(parseTheme("light")).toBe("light");
  });
  it("falls back to dark for garbage", () => {
    expect(parseTheme("DARK")).toBe("dark");
    expect(parseTheme("blue")).toBe("dark");
    expect(parseTheme("")).toBe("dark");
  });
  it("uses the documented cookie name", () => {
    expect(THEME_COOKIE).toBe("tl-theme");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/theme.test.ts`
Expected: FAIL — `Cannot find module '../app/lib/theme'`

- [ ] **Step 3: Implement `app/lib/theme.ts`**

```ts
export type Theme = "dark" | "light";
export const THEME_COOKIE = "tl-theme";

/** Cookie/localStorage value → theme. Dark is the default; anything else → dark. */
export function parseTheme(v: string | undefined | null): Theme {
  return v === "light" ? "light" : "dark";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/theme.test.ts` → 4 pass. Then full `pnpm test` → 291 pass.

- [ ] **Step 5: Wire the root layout (`app/layout.tsx`)**

Add imports at top:
```ts
import { cookies } from "next/headers";
import Script from "next/script";
import { parseTheme, THEME_COOKIE } from "./lib/theme";
```
In `RootLayout`, before `return`:
```ts
const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
```
Change the `<html>` tag:
```tsx
<html lang={lang} data-theme={theme} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
```
Add immediately inside `<body>` as first child:
```tsx
<Script id="theme-init" strategy="beforeInteractive">{`
  try {
    if (!document.cookie.includes("${THEME_COOKIE}=")) {
      var t = localStorage.getItem("${THEME_COOKIE}");
      if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    }
  } catch (e) {}
`}</Script>
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm lint && pnpm test` → clean / 291 pass. (Visual: still dark by default — no toggle yet.)

```bash
git add app/lib/theme.ts test/theme.test.ts app/layout.tsx
git commit -m "feat(BL-045): theme cookie mechanism (SSR data-theme + no-flash fallback)"
```

### Task 4: ThemeToggle + AccountNav rework

**Files:**
- Create: `app/components/ThemeToggle.tsx`
- Modify: `app/components/AccountNav.tsx`
- Modify: `app/layout.tsx` (render toggle, pass label)

**Interfaces:**
- Consumes: `parseTheme`, `THEME_COOKIE`, `Theme` from Task 3.
- Produces: `<ThemeToggle initial: Theme label: string>`; dict key `themeToggle`.

- [ ] **Step 1: Create `app/components/ThemeToggle.tsx`**

```tsx
"use client";
import { useState } from "react";
import { THEME_COOKIE, type Theme } from "../lib/theme";

/** Header theme toggle: flips data-theme, persists cookie (1y) + localStorage mirror. */
export function ThemeToggle({ initial, label }: { initial: Theme; label: string }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=31536000;SameSite=Lax`;
    try { localStorage.setItem(THEME_COOKIE, next); } catch { /* private mode */ }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={theme === "light"}
      className="ticker inline-flex h-[34px] w-[34px] items-center justify-center rounded-md border border-linestrong text-muted transition-colors hover:border-signal/50 hover:text-ink"
    >
      {theme === "dark" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Rework `app/components/AccountNav.tsx`**

Change the Alerts link `href="#subscribe"` → `href="/subscribe"` and the Upgrade link `href="#upgrade"` → `href="/subscribe"` (both are real pages). Replace the avatar dropdown items: delete the `[account.profile, account.billing, account.settings].map(...)` block and the signout `<a>`; insert:
```tsx
<a role="menuitem" href="/admin/review" className="block px-4 py-2 text-[13px] text-muted transition-colors hover:bg-surface hover:text-ink">Admin desk</a>
<a role="menuitem" href="/admin/sources" className="block px-4 py-2 text-[13px] text-muted transition-colors hover:bg-surface hover:text-ink">Source health</a>
```
(Keep the hand-rolled open/close logic — it already has outside-click. The `account` prop and `Account` interface become unused: remove the prop, the interface, and the `account={t.account}` pass in `app/layout.tsx`; remove `account` from Dict later in Task 6 step 3.)
Note: `hover:text-paper` in this file was codemod'd to `hover:text-ink` in Task 2 — keep as-is.

- [ ] **Step 3: Render the toggle in `app/layout.tsx`**

In the header, immediately before `<AccountNav ... />`, add:
```tsx
<ThemeToggle initial={theme} label={t.themeToggle} />
```
Add import: `import { ThemeToggle } from "./components/ThemeToggle";`
(The dict key `t.themeToggle` does not exist yet — add a temporary `// @ts-expect-error added in Task 6` above the line, or do Task 6 step 3's dict addition now. Preferred: do the dict addition now as part of this step — add `themeToggle: string;` to the Dict interface after `navAlerts: string;`, `themeToggle: "Toggle color theme",` to `en` after `navAlerts: "Alerts",`, and `themeToggle: "切换明暗主题",` to `zh` after `navAlerts: "订阅",`.)

- [ ] **Step 4: Verify + commit**

Run: `pnpm lint && pnpm test` → clean / 291 pass.
Dev smoke: `pnpm dev`, screenshot `http://localhost:3000/` and read it — header shows bordered toggle button between ZH and avatar; Alerts/Upgrade hover shows `/subscribe` in status bar (verify hrefs via `curl -s http://localhost:3000/ | grep -o 'href="/subscribe"' | head -2` → 2+ hits).

```bash
git add app/components/ThemeToggle.tsx app/components/AccountNav.tsx app/layout.tsx app/lib/i18n.ts
git commit -m "feat(BL-045): theme toggle in header + AccountNav links to real destinations"
```

### Task 5: Mobile tab bar + floating-bar stacking rules

**Files:**
- Create: `app/components/MobileTabBar.tsx`
- Modify: `app/layout.tsx` (mount + main bottom padding)
- Modify: `app/components/SubscribeBar.tsx` (hide on mobile)
- Modify: `app/components/Analytics.tsx` (consent banner bottom offset on mobile)

**Interfaces:**
- Produces: `<MobileTabBar lang: Lang labels: {home; wire; radar; daily}>` rendered fixed bottom, `md:hidden`.

- [ ] **Step 1: Create `app/components/MobileTabBar.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { addLocale, stripLocale } from "../lib/locale";
import type { Lang } from "../lib/i18n";

const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  wire: "M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z",
  radar: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  daily: "M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4zM8 9h8M8 13h8M8 17h5",
};

/** Mobile bottom tab bar (md:hidden): Home / Wire / Radar / Daily with active state. */
export function MobileTabBar({ lang, labels }: { lang: Lang; labels: { home: string; wire: string; radar: string; daily: string } }) {
  const pathname = usePathname() ?? "/";
  const cur = stripLocale(pathname);
  const tabs = [
    { key: "home", href: "/" },
    { key: "wire", href: "/wire" },
    { key: "radar", href: "/trends" },
    { key: "daily", href: "/daily" },
  ] as const;
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-canvas/90 backdrop-blur md:hidden">
      {tabs.map((t) => {
        const active = t.href === "/" ? cur === "/" : cur.startsWith(t.href);
        return (
          <Link
            key={t.key}
            href={addLocale(t.href, lang)}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-[3px] pb-[env(safe-area-inset-bottom)] font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
              active ? "text-signal" : "text-faint hover:text-ink"
            }`}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[t.key]} /></svg>
            {labels[t.key]}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Mount in `app/layout.tsx` + give main clearance**

Import: `import { MobileTabBar } from "./components/MobileTabBar";`
Immediately after `</footer>` (still inside `.relative.z-10` div), add:
```tsx
<MobileTabBar lang={lang} labels={{ home: t.nav.home, wire: t.nav.wire, radar: t.nav.radar, daily: t.nav.daily }} />
```
Change `<main className="mx-auto max-w-[88rem] px-5 sm:px-8 py-8">` to `<main className="mx-auto max-w-[88rem] px-5 sm:px-8 py-8 pb-24 md:pb-8">`.

- [ ] **Step 3: Stacking rules for floating bars**

In `app/components/SubscribeBar.tsx`: add `hidden md:block` to the outermost fixed container class (mobile users subscribe via More menu / footer / tab context; the bar yields to consent + tab bar on small screens — decision recorded in spec).
In `app/components/Analytics.tsx`: find the consent banner's fixed container and add `bottom-16 md:bottom-4`-style offset so it clears the tab bar on mobile (read the file; the banner is the fixed bottom element — apply `mb-16 md:mb-0` if it's already `bottom-4`, or `bottom-16 md:bottom-4` if `bottom-4`).

- [ ] **Step 4: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke at mobile width:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 --window-size=390,844 --screenshot=/tmp/bl045-t5-mobile.png "http://localhost:3000/"
```
Read it: tab bar pinned at bottom, Home active in signal, no overlap with floating bars. Kill dev server.

```bash
git add app/components/MobileTabBar.tsx app/layout.tsx app/components/SubscribeBar.tsx app/components/Analytics.tsx
git commit -m "feat(BL-045): mobile bottom tab bar + floating-bar stacking rules"
```

### Task 6: MainNav More dropdown (Radix) + dict keys

**Files:**
- Modify: `app/components/MainNav.tsx`
- Modify: `app/lib/i18n.ts` (Dict interface + en + zh)
- Modify: `app/layout.tsx` (pass `lang` to MainNav)
- Run: `pnpm add @radix-ui/react-dropdown-menu`

**Interfaces:**
- Produces: dict keys `navSubscribe navTelegram navRss`; `<MainNav items moreLabel lang menu:{subscribe;telegram;rss}>`; dict no longer contains `account` (removed in this task).

- [ ] **Step 1: Install Radix**

Run: `pnpm add @radix-ui/react-dropdown-menu`
Expected: added to dependencies (React 18 compatible).

- [ ] **Step 2: Rewrite `app/components/MainNav.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { addLocale, stripLocale } from "../lib/locale";
import type { Lang } from "../lib/i18n";

const ITEM_CLS =
  "flex items-center justify-between gap-4 rounded-sm px-3 py-2 text-[13px] text-muted outline-none transition-colors data-[highlighted]:bg-surface data-[highlighted]:text-ink";

/** Desktop content nav with active-route highlight + real More menu (Radix). */
export function MainNav({
  items, moreLabel, lang, menu,
}: {
  items: { href: string; label: string }[];
  moreLabel: string;
  lang: Lang;
  menu: { subscribe: string; telegram: string; rss: string };
}) {
  const path = usePathname() ?? "/";
  const active = (href: string) => {
    const p = stripLocale(path);
    const h = stripLocale(href);
    return h === "/" ? p === "/" : p.startsWith(h);
  };
  return (
    <nav className="hidden items-center gap-6 text-[14px] md:flex">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={active(it.href) ? "font-semibold text-ink" : "text-muted transition-colors hover:text-ink"}
        >
          {it.label}
        </Link>
      ))}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger className="text-faint outline-none transition-colors hover:text-ink data-[state=open]:text-ink">
          {moreLabel} ▾
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="z-50 min-w-[12.5rem] rounded-md border border-linestrong bg-surface2 py-1 shadow-2xl shadow-black/50"
          >
            <DropdownMenu.Item asChild><Link href={addLocale("/subscribe", lang)} className={ITEM_CLS}>{menu.subscribe}<span className="ticker text-label text-faint">email</span></Link></DropdownMenu.Item>
            <DropdownMenu.Item asChild><Link href={addLocale("/subscribe", lang)} className={ITEM_CLS}>{menu.telegram}<span className="ticker text-label text-faint">bot</span></Link></DropdownMenu.Item>
            <DropdownMenu.Item asChild><a href="/feed.xml" className={ITEM_CLS}>{menu.rss}<span className="ticker text-label text-faint">xml</span></a></DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </nav>
  );
}
```

- [ ] **Step 3: Dict additions + cleanup in `app/lib/i18n.ts`**

In the `Dict` interface, after `navAlerts: string;` add:
```ts
navSubscribe: string;
navTelegram: string;
navRss: string;
```
Delete the line `account: { profile: string; billing: string; settings: string; signout: string };` from the interface, the line `account: { profile: "Profile", billing: "Billing", settings: "Settings", signout: "Sign out" },` from `en`, and the line `account: { profile: "个人", billing: "账单", settings: "设置", signout: "退出" },` from `zh`.
In `en`, after `navAlerts: "Alerts",` add:
```ts
navSubscribe: "Subscribe",
navTelegram: "Telegram alerts",
navRss: "RSS feed",
```
In `zh`, after `navAlerts: "订阅",` add:
```ts
navSubscribe: "订阅",
navTelegram: "Telegram 推送",
navRss: "RSS 订阅",
```

- [ ] **Step 4: Update `app/layout.tsx` MainNav usage**

Change the `<MainNav ... />` call to pass the new props:
```tsx
<MainNav
  items={[...unchanged...]}
  moreLabel={t.nav.more}
  lang={lang}
  menu={{ subscribe: t.navSubscribe, telegram: t.navTelegram, rss: t.navRss }}
/>
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm lint && pnpm test` → clean / 291 pass.
Dev smoke: open home, click More ▾ — menu opens, links point to `/subscribe` ×2 + `/feed.xml`; Esc closes; arrow keys move through items (Radix built-in). On `/zh`, menu links carry `/zh/subscribe`.

```bash
git add app/components/MainNav.tsx app/lib/i18n.ts app/layout.tsx package.json pnpm-lock.yaml
git commit -m "feat(BL-045): real More menu via Radix DropdownMenu + nav dict keys"
```

### Task 7: Subscribe pages — theme-break fix + form states

**Files:**
- Modify: `app/subscribe/page.tsx`
- Modify: `app/components/SubscribeForm.tsx`
- Modify: `app/subscribe/confirmed/page.tsx`, `app/subscribe/unsubscribed/page.tsx` (same token swap)

**Interfaces:**
- Consumes: token classes from Task 1.
- Produces: subscribe surfaces correct in both themes; form states `idle | loading | done | already | error`.

- [ ] **Step 1: Rewrite `app/subscribe/page.tsx` body classes**

Replace the three `text-neutral-*` / `bg-neutral-*` spots:
- `text-2xl font-bold text-neutral-900` → `font-display text-headline font-semibold text-ink`
- `mt-3 text-neutral-600` → `mt-3 text-lede text-muted`
- `mt-3 text-xs text-neutral-400` → `ticker mt-3 text-label text-faint`

- [ ] **Step 2: Rewrite `app/components/SubscribeForm.tsx` with full states**

```tsx
"use client";
import { useState, type FormEvent } from "react";

type State = "idle" | "loading" | "done" | "already" | "error";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 409) setState("already");
      else if (res.ok) setState("done");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-meta text-calm">✓ Check your inbox to confirm your subscription.</p>;
  }
  if (state === "already") {
    return <p className="text-meta text-muted">You&apos;re already on the list — the next brief lands as scheduled.</p>;
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address"
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "sub-err" : undefined}
          className="min-h-[44px] flex-1 rounded-md border border-linestrong bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="min-h-[44px] rounded-md bg-chipbg px-4 py-2 text-[15px] font-semibold text-chipink transition hover:brightness-110 disabled:opacity-50"
        >
          {state === "loading" ? "…" : "Get the brief"}
        </button>
      </div>
      {state === "error" && (
        <p id="sub-err" className="text-meta text-urgent">
          Something went wrong on our end — try again in a moment.
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Swap tokens on `confirmed` / `unsubscribed` pages**

Read both files. Apply the same mapping to every neutral class: `text-neutral-900` → `text-ink`, `text-neutral-600` → `text-muted`, `text-neutral-400` → `text-faint`, `border-neutral-300` → `border-linestrong`, `bg-neutral-900` → `bg-chipbg` (+ `text-white` → `text-chipink` on the same element). No structural changes.

- [ ] **Step 4: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: screenshot `/subscribe` dark AND light (light via clicking the toggle, or temporarily set localStorage `tl-theme=light` in devtools — for headless: `curl -s -H "Cookie: tl-theme=light" http://localhost:3000/subscribe` only proves HTML; take the light screenshot via the toggle flow manually later in Task 18). Dark headless:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 --window-size=1440,900 --screenshot=/tmp/bl045-t7-sub.png "http://localhost:3000/subscribe"
```
Read it: page uses dark tokens, form readable, no white-on-dark breakage.

```bash
git add app/subscribe/ app/components/SubscribeForm.tsx
git commit -m "fix(BL-045): subscribe pages theme break + full form states"
```

---
# SLICE 2 — Components & states

### Task 8: `app/lib/labels.ts` single source (TDD)

**Files:**
- Create: `app/lib/labels.ts`
- Test: `test/labels.test.ts`
- Modify: `app/components/alert-style.ts` (re-export), `app/components/Filters.tsx`, `app/trends/page.tsx`, `app/trends/BestsellersBoard.tsx`, `app/admin/review/page.tsx` (import instead of local copies)

**Interfaces:**
- Produces: `CAT_LABEL: Record<string,string>` (short codes), `REGION_LABEL: Record<string,string>` (short codes: NA/EU/SEA/ME/LATAM/ANZ), `REGION_NAME: Record<string,string>` (full names, from current Filters).

- [ ] **Step 1: Write the failing test**

`test/labels.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CAT_LABEL, REGION_LABEL, REGION_NAME } from "../app/lib/labels";

describe("labels single source", () => {
  it("REGION_LABEL covers all 6 regions with short codes", () => {
    expect(Object.keys(REGION_LABEL).sort()).toEqual(
      ["australia_nz", "europe", "latin_america", "middle_east", "north_america", "southeast_asia"].sort(),
    );
    expect(REGION_LABEL.north_america).toBe("NA");
    expect(REGION_LABEL.latin_america).toBe("LATAM");
  });
  it("REGION_NAME has full names for filters", () => {
    expect(REGION_NAME.north_america).toBe("North America");
    expect(REGION_NAME.europe).toBe("Europe");
  });
  it("CAT_LABEL maps categories to short codes", () => {
    expect(CAT_LABEL.regulatory).toBe("REGULATORY");
    expect(CAT_LABEL.platform_policy).toBe("PLATFORM");
    expect(CAT_LABEL.logistics).toBe("LOGISTICS");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/labels.test.ts` → FAIL (module not found).

- [ ] **Step 3: Create `app/lib/labels.ts`**

```ts
/** Single source of truth for region/category labels (was copied ×5). */

export const CAT_LABEL: Record<string, string> = {
  regulatory: "REGULATORY", platform_policy: "PLATFORM", logistics: "LOGISTICS",
  trend: "TREND", industry: "INDUSTRY", tip: "TIP",
};

/** Short codes — cards, rails, boards. */
export const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LATAM", australia_nz: "ANZ",
};

/** Full names — filter chips. */
export const REGION_NAME: Record<string, string> = {
  north_america: "North America", europe: "Europe", southeast_asia: "SE Asia",
  middle_east: "Middle East", latin_america: "LatAm", australia_nz: "ANZ",
};
```

- [ ] **Step 4: Migrate the 5 copies**

- `app/components/alert-style.ts`: delete local `CAT_LABEL`/`REGION_LABEL` definitions (lines 9–16), add `export { CAT_LABEL, REGION_LABEL } from "../lib/labels";` (re-export keeps existing imports working).
- `app/components/Filters.tsx`: delete local `REGION_LABEL`, import `{ REGION_NAME } from "../lib/labels"`, and use `REGION_NAME[r]` in the chip label.
- `app/trends/page.tsx`: delete local `REGION_LABEL`, add `import { REGION_LABEL } from "../lib/labels";`.
- `app/trends/BestsellersBoard.tsx`: same import swap (read file to confirm the local definition's values match — if it has extra keys, flag before deleting).
- `app/admin/review/page.tsx`: same import swap (import-only change; no visual edit).

- [ ] **Step 5: Verify + commit**

Run: `pnpm vitest run test/labels.test.ts` → 3 pass; `pnpm lint && pnpm test` → clean / 294 pass.
Run: `grep -rn "REGION_LABEL\s*[:=]" app/ | grep -v "lib/labels" || echo "CLEAN"` → CLEAN (only the re-export line may match in alert-style, which uses `export {`, not `=`.

```bash
git add app/lib/labels.ts test/labels.test.ts app/components/alert-style.ts app/components/Filters.tsx app/trends/ app/admin/review/page.tsx
git commit -m "refactor(BL-045): labels single source (REGION_LABEL/REGION_NAME/CAT_LABEL)"
```

### Task 9: `SignalCard` — unify the 5 duplicated card markups

**Files:**
- Create: `app/components/SignalCard.tsx`
- Modify: `app/components/StreamCard.tsx` (re-export thin wrappers; delete duplicated markup)
- Modify: `app/components/HotOnX.tsx` (use SignalCard)
- Modify: `app/trends/page.tsx` (movers/viralX/diffusion grids → SignalCard; DiffusionArc wired in Task 16)

**Interfaces:**
- Produces: `<SignalCard href external? tierLabel? tone? meta title dek? imageUrl? foot?/>` with `tone: "urgent" | "signal" | "calm" | "neutral"`.

- [ ] **Step 1: Create `app/components/SignalCard.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export type SignalTone = "urgent" | "signal" | "calm" | "neutral";

const TONE_CHIP: Record<SignalTone, string> = {
  urgent: "bg-urgent text-white",
  signal: "bg-chipbg text-chipink",
  calm: "bg-calm text-canvas",
  neutral: "bg-faint/15 text-muted",
};

/**
 * The unified signal card: tier chip + ticker meta + title + optional dek,
 * thumbnail and foot slot. Replaces the StreamCard variants, the trends-page
 * grid markups and HotOnX one-offs. Tier is carried by chip + hairline border
 * (no side-stripe — impeccable absolute ban).
 */
export function SignalCard({
  href, external, tierLabel, tone = "signal", meta, title, dek, imageUrl, foot,
}: {
  href: string;
  external?: boolean;
  tierLabel?: string;
  tone?: SignalTone;
  meta: string;
  title: string;
  dek?: string;
  imageUrl?: string | null;
  foot?: ReactNode;
}) {
  const inner = (
    <>
      {imageUrl ? (
        <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          {tierLabel ? (
            <span className={`ticker rounded-full px-2 py-0.5 text-label uppercase ${TONE_CHIP[tone]}`}>{tierLabel}</span>
          ) : null}
          <span className="ticker text-meta text-faint">{meta}</span>
        </span>
        <span className="text-[0.9375rem] font-semibold leading-snug text-ink">{title}</span>
        {dek ? <span className="line-clamp-2 text-meta text-muted">{dek}</span> : null}
        {foot}
      </span>
    </>
  );
  const cls =
    "card-scan flex gap-3 rounded-md border border-line bg-surface p-4 transition-colors hover:border-signal/40";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  ) : (
    <Link href={href} className={cls}>{inner}</Link>
  );
}
```

(The `card-scan` hover class is added to globals.css in Task 14; until then it is a harmless no-op class.)

- [ ] **Step 2: Rewrite `app/components/StreamCard.tsx` as thin wrappers**

Read the current file first. Replace the three card implementations with wrappers that delegate to `SignalCard`, keeping the existing exported names and prop types so callers don't change:
```tsx
import { SignalCard, type SignalTone } from "./SignalCard";
import { domainOf, hhmm, tierStyle } from "./alert-style";
// WireCard/RadarCard/DailyCard: same props as before, now one-line SignalCard
// mappings. tierStyle(score, tiers).label → tierLabel; tone from urgency
// (≥4 urgent, ≥2 signal, else neutral). Radar/Daily keep their current accents.
```
Preserve each card's current visual accents (thumb presence, dek lines, meta composition) — the point is one markup, not a visual redesign of these variants.

- [ ] **Step 3: Migrate `app/components/HotOnX.tsx`**

Replace its hand-rolled discussion card markup with `<SignalCard tone="calm" external ...>`, passing the existing `hotX` item fields (headline→title, whyHot→dek, `@{author} · ♥{likes}`→meta, category label → tierLabel via dict). Keep the section grid and empty-state markup as-is (empty handled in Task 11).

- [ ] **Step 4: Migrate the three grids in `app/trends/page.tsx`**

Replace the movers grid card markup with `<SignalCard tone="signal">` (title=formula title, meta=`${CAT_LABEL[cat]} · #${rank}`, foot = whyNow/soWhat block — keep the existing why/so-what markup as the `foot` slot), the viralX grid with `tone="signal"`, and the diffusion-signals grid with `tone="signal"`. Delete the three near-identical inline markups. Keep KPI/sparkline components untouched.

- [ ] **Step 5: Verify + commit**

Run: `pnpm lint && pnpm test` → clean / 294 pass.
Dev smoke: screenshot `/` and `/trends`, read both — cards render with chip + meta + title; no layout regressions; no `border-l-2`/`border-l-4` anywhere:
Run: `grep -rn "border-l-[24]\|border-l-signal\|border-l-urgent" app/ || echo "CLEAN"` → CLEAN (or list remaining for Task 15/16).

```bash
git add app/components/SignalCard.tsx app/components/StreamCard.tsx app/components/HotOnX.tsx app/trends/page.tsx
git commit -m "feat(BL-045): SignalCard unifies wire/radar/x/mover/daily card markups"
```

### Task 10: `PageHeader` — unified page tops

**Files:**
- Create: `app/components/PageHeader.tsx`
- Modify: `app/wire/page.tsx`, `app/trends/page.tsx`, `app/daily/page.tsx`, `app/subscribe/page.tsx`

**Interfaces:**
- Produces: `<PageHeader eyebrow title sub? children?/>`.

- [ ] **Step 1: Create `app/components/PageHeader.tsx`**

```tsx
import type { ReactNode } from "react";

/** Unified page top: signal eyebrow + display headline + optional lede + actions. */
export function PageHeader({ eyebrow, title, sub, children }: { eyebrow: string; title: ReactNode; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <p className="ticker text-label uppercase text-signal">{eyebrow}</p>
      <h1 className="mt-2 max-w-[24ch] text-balance font-display text-headline font-semibold text-ink">{title}</h1>
      {sub ? <p className="mt-2 max-w-[56ch] text-lede text-muted">{sub}</p> : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Apply to the four page tops**

- `app/wire/page.tsx`: replace the custom eyebrow + 4xl header block with `<PageHeader eyebrow={t.eyebrow} title={<>current title fragments (pre/em/post) kept verbatim as JSX</>} sub={t.heroSub} />` — `PageHeader.title` is typed `ReactNode` precisely so the existing roman+italic title markup can be passed through unchanged. Only the wrapper markup changes; copy stays byte-identical.
- `app/trends/page.tsx`: same — existing radarEyebrow/radarPre/radarEm/radarSub map to eyebrow/title/sub.
- `app/daily/page.tsx`: dailyEyebrow/dailyPre/dailyEm/dailySub.
- `app/subscribe/page.tsx`: eyebrow `◆ Subscribe` — add dict keys? The page currently has no dict usage (hardcoded EN, and `/zh/subscribe` exists via middleware). Keep current hardcoded copy (out of i18n scope for this page today), apply PageHeader with current strings.

- [ ] **Step 3: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: screenshots of `/wire`, `/trends`, `/daily`, `/subscribe` — all four tops share the same rhythm (eyebrow 11px signal mono → 26px display → muted lede).

```bash
git add app/components/PageHeader.tsx app/wire/page.tsx app/trends/page.tsx app/daily/page.tsx app/subscribe/page.tsx
git commit -m "feat(BL-045): PageHeader unifies the five page tops"
```

### Task 11: `EmptyState` — unified empty states

**Files:**
- Create: `app/components/EmptyState.tsx`
- Modify: `app/wire/page.tsx` (filter-empty), `app/components/HotOnX.tsx`, `app/trends/page.tsx` (viralXEmpty/bestsellersEmpty), `app/daily/page.tsx` (dailyEmpty)

**Interfaces:**
- Produces: `<EmptyState glyph? title copy? action?/>`; dict key `emptyReset`.

- [ ] **Step 1: Dict key `emptyReset`**

In `app/lib/i18n.ts` interface, after `empty: string;` add `emptyReset: string;`. In `en` after `empty: "no dispatches match this filter",` add `emptyReset: "Reset filters",`. In `zh` after `empty: "没有符合该筛选的情报",` add `emptyReset: "重置筛选",`.

- [ ] **Step 2: Create `app/components/EmptyState.tsx`**

```tsx
import type { ReactNode } from "react";

/** Unified empty state: mono glyph + title + optional copy + optional action. */
export function EmptyState({ glyph = "◇", title, copy, action }: { glyph?: string; title: string; copy?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-md border border-dashed border-linestrong px-6 py-12 text-center">
      <span className="font-mono text-2xl text-faint" aria-hidden="true">{glyph}</span>
      <p className="font-semibold text-ink">{title}</p>
      {copy ? <p className="max-w-[42ch] text-meta text-muted">{copy}</p> : null}
      {action}
    </div>
  );
}
```

- [ ] **Step 3: Apply to the five empty spots**

- `app/wire/page.tsx`: replace the plain empty `<p>` with `<EmptyState title={t.empty} copy={...hint...} action={<Link className={chipGhost} href={addLocale("/wire", lang)}>{t.emptyReset}</Link>} />` (chipGhost from ui.ts — Task 13; if doing this before Task 13, inline `ticker rounded-full border border-linestrong px-3 py-1.5 text-label uppercase text-muted hover:border-signal hover:text-signal`).
- `HotOnX.tsx` / `trends/page.tsx` viral + bestsellers / `daily/page.tsx`: replace each hand-rolled empty with `<EmptyState title={t.xxxEmpty} />` (no action). Remove any per-spot custom classes.

- [ ] **Step 4: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: `/wire?region=australia_nz&category=tip` (an empty combo) shows the EmptyState with reset link; `/zh/wire?...` shows Chinese copy and the reset link stays on `/zh/wire`.

```bash
git add app/components/EmptyState.tsx app/lib/i18n.ts app/wire/page.tsx app/components/HotOnX.tsx app/trends/page.tsx app/daily/page.tsx
git commit -m "feat(BL-045): EmptyState unifies empty states + reset-filters action"
```

### Task 12: Route states — loading / error / not-found

**Files:**
- Create: `app/components/Skeleton.tsx`
- Create: `app/loading.tsx`, `app/wire/loading.tsx`, `app/trends/loading.tsx`, `app/daily/loading.tsx`
- Create: `app/error.tsx` (global pattern reused per segment), `app/wire/error.tsx`, `app/trends/error.tsx`, `app/daily/error.tsx`
- Create: `app/not-found.tsx`

**Interfaces:**
- Produces: `<SkeletonRow withThumb?/>`; `RouteError({error, reset})` pattern per segment.

- [ ] **Step 1: Create `app/components/Skeleton.tsx`**

```tsx
/** Skeleton rows for route loading states (pulse disabled under reduced-motion via .sk in globals? — uses animate-pulse core utility). */
export function SkeletonRow({ withThumb = true }: { withThumb?: boolean }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-surface p-4">
      {withThumb ? <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-sm bg-surface2" /> : null}
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="h-3 w-3/5 animate-pulse rounded-sm bg-surface2" />
        <div className="h-3 w-1/3 animate-pulse rounded-sm bg-surface2" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the four `loading.tsx` files**

`app/loading.tsx`:
```tsx
import { SkeletonRow } from "./components/Skeleton";
export default function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="h-[340px] animate-pulse rounded-lg bg-surface lg:col-span-6" />
      <div className="flex flex-col gap-4 lg:col-span-3"><SkeletonRow withThumb={false} /><SkeletonRow withThumb={false} /></div>
      <div className="flex flex-col gap-2 lg:col-span-3"><SkeletonRow withThumb={false} /><SkeletonRow withThumb={false} /><SkeletonRow withThumb={false} /></div>
    </div>
  );
}
```
`app/wire/loading.tsx`, `app/trends/loading.tsx`, `app/daily/loading.tsx`:
```tsx
import { SkeletonRow } from "../components/Skeleton";
export default function Loading() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-8 w-1/4 animate-pulse rounded-sm bg-surface2" />
      <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
    </div>
  );
}
```

- [ ] **Step 3: Create the `error.tsx` files**

`app/error.tsx` (and identically-shaped per-segment files with adjusted copy only if the segment warrants it — otherwise copy this file to `wire/`, `trends/`, `daily/`):
```tsx
"use client";
export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-urgent bg-surface p-5">
      <div className="flex-1">
        <p className="font-semibold text-ink">The wire went quiet on our end.</p>
        <p className="mt-1 text-meta text-muted">Couldn&apos;t reach the database. Your filters are intact — retry in a moment.</p>
      </div>
      <button onClick={reset} className="min-h-[40px] shrink-0 rounded-full border border-linestrong px-4 text-meta text-ink transition-colors hover:border-signal hover:text-signal">
        Retry
      </button>
    </div>
  );
}
```
(English-only error copy is acceptable for MVP error boundaries; note as a known i18n gap in the verification record.)

- [ ] **Step 4: Create `app/not-found.tsx`**

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-24 text-center">
      <span className="font-mono text-2xl text-faint" aria-hidden="true">◇</span>
      <p className="font-display text-headline font-semibold text-ink">This signal never reached the wire.</p>
      <p className="max-w-[42ch] text-meta text-muted">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
      <Link href="/" className="ticker mt-2 rounded-full border border-linestrong px-4 py-2 text-label uppercase text-muted transition-colors hover:border-signal hover:text-signal">← Back to the front page</Link>
    </div>
  );
}
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: `/daily/definitely-not-a-slug` renders not-found; throttle network in devtools to see loading skeletons (or trust the files); temporarily throw in a page to see error.tsx, then revert.

```bash
git add app/components/Skeleton.tsx app/loading.tsx app/error.tsx app/not-found.tsx app/wire/ app/trends/ app/daily/
git commit -m "feat(BL-045): route loading/error/not-found states on all public segments"
```

### Task 13: `ui.ts` shared classes + Filters locale fix

**Files:**
- Create: `app/components/ui.ts`
- Modify: `app/components/Filters.tsx` (locale-aware hrefs + shared chip class)
- Modify: `app/wire/page.tsx` (pass `lang` to Filters)
- Modify: `app/components/SubscribeForm.tsx` (use shared classes)

**Interfaces:**
- Produces: `btnPrimary`, `btnGhost`, `chipFilter(active: boolean)`, `inputField` class strings.
- Produces: `<Filters region? category? t lang/>` — hrefs now locale-prefixed.

- [ ] **Step 1: Create `app/components/ui.ts`**

```ts
/** Shared hand-rolled control classes (no component lib — cva-style functions). */

export const btnPrimary =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-chipbg px-5 py-2.5 text-[0.9375rem] font-semibold text-chipink transition hover:brightness-110 active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-linestrong px-5 py-2.5 text-[0.9375rem] font-semibold text-ink transition hover:border-signal hover:text-signal active:scale-[0.97]";

export const chipFilter = (active: boolean) =>
  `ticker rounded-full px-3 py-1.5 text-label uppercase transition-colors active:scale-[0.97] ${
    active ? "bg-chipbg text-chipink" : "border border-line text-muted hover:border-linestrong hover:text-ink"
  }`;

export const inputField =
  "min-h-[44px] w-full rounded-md border border-linestrong bg-surface px-3 py-2 text-[0.9375rem] text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal";
```

- [ ] **Step 2: Fix Filters locale + use shared chip**

In `app/components/Filters.tsx`:
- Add `lang: Lang` to props (import type from `../lib/i18n`) and import `{ addLocale }` from `../lib/locale`.
- Change `hrefFor` return: `return addLocale(qs ? `/wire?${qs}` : "/wire", lang);`
- Replace the local `chip()` function body with `chipFilter(active)` from `./ui` (delete local `chip`).
- Import `{ chipFilter }` from `./ui`.

In `app/wire/page.tsx`: pass `lang={lang}` to `<Filters ... />` (the page already has `lang` from `getDict()` — if not destructured, do so).

- [ ] **Step 3: SubscribeForm uses shared classes**

In `app/components/SubscribeForm.tsx`: replace the input's class string with `inputField` (keep its `flex-1`), the button's with `btnPrimary` (drop the old `min-h/bg-chipbg/...` inline string). Import from `./ui`.

- [ ] **Step 4: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: on `/zh/wire`, click a region chip — URL stays `/zh/wire?region=...` (was the locale-loss bug). EN unchanged. `curl -s "http://localhost:3000/zh/wire" | grep -o 'href="/zh/wire?[^"]*"' | head -3` → hits.

```bash
git add app/components/ui.ts app/components/Filters.tsx app/wire/page.tsx app/components/SubscribeForm.tsx
git commit -m "fix(BL-045): Filters keep locale + shared ui.ts control classes"
```

---
# SLICE 3 — Pages & motion

### Task 14: Motion system — CSS layer + tape/clock/glyph/arc components + hero fallback + fresh-insert (TDD where pure)

**Files:**
- Modify: `app/globals.css` (append motion layer)
- Create: `app/components/UtcClock.tsx`, `app/components/WireTape.tsx`, `app/components/RadarGlyph.tsx`, `app/components/DiffusionArc.tsx`
- Modify: `app/lib/home.ts` (`isFresh`) + `test/home-select.test.ts` (tests)
- Modify: `app/page.tsx` (tape, masthead masks, clock, glyph)
- Modify: `app/components/LatestRail.tsx` (fresh-insert class)
- Modify: `app/components/HeroLead.tsx` (text-led no-image fallback)

**Interfaces:**
- Consumes: `LatestItem` from `app/lib/home.ts`.
- Produces: `isFresh(time: number, now: number, windowMs?): boolean`; `<UtcClock className?/>`; `<WireTape items liveLabel/>`; `<RadarGlyph/>`; `<DiffusionArc/>`; CSS classes `.tape/.tape-viewport/.tape-track/.tp/.sep/.tape-live`, `.live-dot`, `.radar-glyph`, `.arc-flow`, `.insert-row`, `.card-scan` (+`::after`), `.lm/.li/.li-d2`, `.focus-in`.

- [ ] **Step 1: Failing test for `isFresh`**

Append to `test/home-select.test.ts` a new describe block:
```ts
describe("isFresh", () => {
  const now = 1_800_000_000_000;
  it("true within the window", () => {
    expect(isFresh(now - 5 * 60_000, now)).toBe(true);
    expect(isFresh(now, now)).toBe(true);
  });
  it("false outside the window or in the future", () => {
    expect(isFresh(now - 16 * 60_000, now)).toBe(false);
    expect(isFresh(now + 60_000, now)).toBe(false);
  });
  it("respects a custom window", () => {
    expect(isFresh(now - 2 * 3_600_000, now, 3_600_000)).toBe(false);
  });
});
```
Import `isFresh` from `../app/lib/home`.
Run: `pnpm vitest run test/home-select.test.ts` → FAIL (isFresh not exported).

- [ ] **Step 2: Implement `isFresh` in `app/lib/home.ts`**

```ts
/** Item landed within `windowMs` (default 15 min) — drives the rail insert animation. */
export function isFresh(time: number, now: number, windowMs = 15 * 60_000): boolean {
  return now - time >= 0 && now - time <= windowMs;
}
```
Run: `pnpm vitest run test/home-select.test.ts` → all pass.

- [ ] **Step 3: Append the motion layer to `app/globals.css`**

Append inside a new `@layer components` block at the end of the file:
```css
@layer components {
  /* ① masthead entrance — masked lines + focus pull (once per load) */
  .lm { display: inline-block; overflow: hidden; vertical-align: bottom; }
  .li { display: inline-block; animation: line-up 0.7s cubic-bezier(0.16,1,0.3,1) both; }
  .li-d2 { animation-delay: 0.09s; }
  .focus-in { animation: focus-in 0.9s cubic-bezier(0.25,1,0.5,1) 0.38s both; }

  /* ② wire tape */
  .tape { border-top: 1px solid var(--c-line); border-bottom: 1px solid var(--c-line); background: color-mix(in srgb, rgb(var(--c-surface)) 72%, transparent); }
  .tape-live { flex: none; display: inline-flex; align-items: center; gap: 0.375rem; font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.12em; color: rgb(var(--c-urgent)); font-weight: 500; text-transform: uppercase; }
  .tape-viewport { overflow: hidden; flex: 1; mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
  .tape-track { display: inline-flex; white-space: nowrap; animation: tape-scroll 38s linear infinite; }
  .tape:hover .tape-track { animation-play-state: paused; }
  .tp { font-family: var(--font-mono); font-size: 0.8125rem; color: rgb(var(--c-faint)); letter-spacing: 0.02em; padding-right: 2.75rem; }
  .tp b { color: rgb(var(--c-ink)); font-weight: 500; }
  .sep { color: rgb(var(--c-signal)); margin-right: 0.75rem; font-size: 0.6em; }

  /* live dot (shared: tape + latest rail) */
  .live-dot { width: 7px; height: 7px; border-radius: 999px; background: rgb(var(--c-urgent)); animation: blip-dot 2.4s ease-in-out infinite; }

  /* ③ radar sweep glyph */
  .radar-glyph { position: relative; width: 15px; height: 15px; border-radius: 999px; border: 1px solid rgb(var(--c-signal)); flex: none; overflow: hidden; }
  .radar-glyph::before { content: ""; position: absolute; inset: 0; border-radius: 999px; background: conic-gradient(from 0deg, transparent 0 295deg, rgb(var(--c-signal) / 0.6) 345deg, rgb(var(--c-signal)) 360deg); animation: sweep 3.6s linear infinite; }
  .radar-glyph::after { content: ""; position: absolute; top: 3px; left: 8px; width: 3px; height: 3px; border-radius: 999px; background: rgb(var(--c-signal)); animation: blip 3.6s ease-out infinite; }

  /* ④ diffusion arc */
  .arc-flow { stroke-dasharray: 3 4; animation: arc-flow 1.6s linear infinite; }

  /* ⑤ latest rail fresh insert */
  .insert-row { animation: insert-row 0.5s cubic-bezier(0.16,1,0.3,1) both; }

  /* ⑥ card hover scan */
  .card-scan { position: relative; overflow: hidden; }
  .card-scan::after { content: ""; position: absolute; top: 0; left: -45%; width: 45%; height: 1px; background: linear-gradient(90deg, transparent, rgb(var(--c-signal)), transparent); opacity: 0; pointer-events: none; }
  .card-scan:hover::after { animation: scan 0.7s cubic-bezier(0.25,1,0.5,1); }
}

@keyframes line-up { 0% { transform: translateY(112%); } 100% { transform: translateY(0); } }
@keyframes focus-in { 0% { opacity: 0.15; filter: blur(6px); } 100% { opacity: 1; filter: blur(0); } }
@keyframes tape-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
@keyframes blip-dot { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes sweep { 0% { transform: rotate(0); } 100% { transform: rotate(360deg); } }
@keyframes blip { 0%, 55%, 100% { opacity: 0.2; } 12% { opacity: 1; } }
@keyframes arc-flow { 0% { stroke-dashoffset: 7; } 100% { stroke-dashoffset: 0; } }
@keyframes insert-row { 0% { opacity: 0; transform: translateY(-8px); background: rgb(var(--c-signal) / 0.14); } 100% { opacity: 1; transform: translateY(0); background: transparent; } }
@keyframes scan { 0% { left: -45%; opacity: 0; } 15% { opacity: 1; } 100% { left: 105%; opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .li, .focus-in, .live-dot, .tape-track, .radar-glyph::before, .radar-glyph::after,
  .arc-flow, .insert-row, .card-scan:hover::after, .animate-pulse, .animate-rise, .animate-pulse-bar {
    animation: none !important;
  }
  .tape-viewport { overflow-x: auto; }
}
```

- [ ] **Step 4: Create the four components**

`app/components/UtcClock.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";

/** Ticking UTC clock (1s). Renders placeholders on SSR to avoid hydration mismatch. */
export function UtcClock({ className }: { className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const f = () => setNow(Date.now());
    f();
    const id = setInterval(f, 1000);
    return () => clearInterval(id);
  }, []);
  const d = new Date(now ?? 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={className}>
      {now === null
        ? "··:··:··"
        : `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`}
    </span>
  );
}
```

`app/components/WireTape.tsx`:
```tsx
import type { LatestItem } from "../lib/home";
import { hhmm } from "./alert-style";

function Seq({ items, hidden, prefix }: { items: LatestItem[]; hidden?: boolean; prefix: string }) {
  return (
    <>
      {items.map((it, i) => (
        <span key={`${prefix}:${i}`} className="tp" aria-hidden={hidden || undefined}>
          <span className="sep">◆</span>
          {hhmm(new Date(it.time))} <b>{it.title}</b>
        </span>
      ))}
    </>
  );
}

/** The wire ticker tape: latest stream rows scrolling seamlessly (track ×2). */
export function WireTape({ items, liveLabel }: { items: LatestItem[]; liveLabel: string }) {
  if (items.length === 0) return null;
  return (
    <div className="tape">
      <div className="mx-auto flex h-[34px] max-w-[88rem] items-center gap-3.5 px-5 sm:px-8">
        <span className="tape-live"><span className="live-dot" aria-hidden="true" />{liveLabel}</span>
        <div className="tape-viewport">
          <div className="tape-track">
            <Seq items={items} prefix="a" />
            <Seq items={items} hidden prefix="b" />
          </div>
        </div>
      </div>
    </div>
  );
}
```

`app/components/RadarGlyph.tsx`:
```tsx
/** Radar sweep glyph — the Radar section signature (CSS-only). */
export function RadarGlyph() {
  return <span className="radar-glyph" aria-hidden="true" />;
}
```

`app/components/DiffusionArc.tsx`:
```tsx
/** Lead-lag diffusion arc between two region chips (CSS-only animation). */
export function DiffusionArc() {
  return (
    <svg width="36" height="12" viewBox="0 0 36 12" aria-hidden="true" style={{ flex: "none" }}>
      <path className="arc-flow" d="M2 10 Q 18 -3 34 10" fill="none" stroke="rgb(var(--c-signal))" strokeWidth="1.5" />
    </svg>
  );
}
```

- [ ] **Step 5: Home page wiring (`app/page.tsx` + `LatestRail` + `HeroLead`)**

- Masthead: wrap the h1 fragments in masks:
```tsx
<h1 className="...existing classes...">
  <span className="lm"><span className="li">{t.homeMastheadPre}</span></span>
  <span className="lm"><span className="li li-d2"><em className="focus-in italic text-signal">{t.homeMastheadEm}</em>{t.homeMastheadPost}</span></span>
</h1>
```
(Keep the existing h1 class list; remove any old italic/em duplication so `em` carries the focus-in.)
- "Today at a glance" header: replace the static date span with `<UtcClock className="ticker text-meta text-faint" />` (import it).
- Tape: immediately after the site `</header>` in `app/layout.tsx`? No — the tape belongs to the home page only (spec/mockup place it on the front page under the header). In `app/page.tsx`, render `<WireTape items={latest} liveLabel={t.live} />` as the first element inside the page's top section (before the masthead), where `latest` is the existing `buildLatest(...)` result already computed in the page. If the page's `latest` variable is scoped inside `getHomeData`, reuse the same value the LatestRail receives.
- `LatestRail.tsx`: import `isFresh` from `../lib/home`; in the row map, compute `const fresh = isFresh(it.time, Date.now());` and append `insert-row` to the anchor's className when `fresh` — e.g. `className={\`group flex gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface2/60 ${fresh ? "insert-row" : ""}\`}`. (Server-rendered once per request — honest "just landed" signal, no fake JS rotation.)
- `HeroLead.tsx`: read the file; where it renders the image hero for an alert **without** `imageUrl` (currently an empty/black slot), render the text-led fallback instead:
```tsx
<div className="relative flex min-h-[340px] flex-col justify-end rounded-lg border border-line bg-gradient-to-br from-surface2 to-surface p-7">
  <span className="mb-auto h-[3px] w-12 rounded-full bg-signal" aria-hidden="true" />
  <div className="mt-5">
    <div className="mb-2.5 flex flex-wrap items-center gap-2">
      {/* existing tier chip + meta row, reused verbatim */}
    </div>
    <h3 className="max-w-[22ch] text-balance font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.125rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-ink">
      {alert.title}
    </h3>
    {dek ? <p className="mt-2 line-clamp-3 max-w-[60ch] text-body text-muted">{dek}</p> : null}
  </div>
</div>
```
(Use the component's existing tier chip/meta/dek variables; keep the `★ Top story` corner badge if the current implementation has one on the no-image path.)

- [ ] **Step 6: Verify + commit**

Run: `pnpm lint && pnpm test` → clean / 297 pass.
Dev smoke (home):
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 --window-size=1440,1350 --screenshot=/tmp/bl045-t14-home.png "http://localhost:3000/"
```
Read it: tape renders under the header (mid-scroll position), clock shows a real UTC time, masthead settled (no hidden text), Latest rail renders. Compare against `design/shots/bl045-v2-desktop-dark-top.png`.

```bash
git add app/globals.css app/components/{UtcClock,WireTape,RadarGlyph,DiffusionArc}.tsx app/lib/home.ts test/home-select.test.ts app/page.tsx app/components/LatestRail.tsx app/components/HeroLead.tsx
git commit -m "feat(BL-045): Instrument Panel motion system (tape/clock/glyph/arc/entrance) + hero text fallback"
```

### Task 15: Wire page polish

**Files:**
- Modify: `app/wire/page.tsx`
- Modify: `app/components/AlertCard.tsx`, `app/components/AlertRow.tsx` (or fold into SignalCard usage)

**Interfaces:**
- Consumes: `SignalCard` (Task 9), `PageHeader` (Task 10), `EmptyState` (Task 11).

- [ ] **Step 1: Migrate card/row rendering**

Read `app/wire/page.tsx` and the two card components. Keep the progressive time buckets (1h/4h/8h/today/yesterday/date — approved interaction) and `cardMode()` image/compact split. Replace `AlertCard`/`AlertRow` internals with `SignalCard` (same props mapping as StreamCard wrappers) OR have the page render `SignalCard` directly and delete `AlertCard`/`AlertRow` if they have no other callers (`grep -rn "AlertCard\|AlertRow" app/` — if only wire uses them, delete; otherwise keep wrappers).

- [ ] **Step 2: Pagination state**

The "load earlier" link: add `aria-label` and keep as plain Link (cursor pagination). No infinite scroll in this slice. Ensure it keeps locale: if it builds `/wire?cursor=...` manually, wrap with `addLocale(..., lang)` the same way as Filters.

- [ ] **Step 3: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: `/wire` desktop + mobile screenshots; `/zh/wire` filters + load-earlier keep `/zh` prefix; empty combo shows EmptyState.

```bash
git add app/wire/ app/components/
git commit -m "feat(BL-045): wire page on SignalCard + locale-safe pagination"
```

### Task 16: Radar (`/trends`) page polish + mover arcs

**Files:**
- Modify: `app/trends/page.tsx`
- Modify: `app/trends/BestsellersBoard.tsx`

**Interfaces:**
- Consumes: `SignalCard`, `PageHeader`, `EmptyState`, `RadarGlyph`, `DiffusionArc`, labels.

- [ ] **Step 1: Section headers + glyph**

Replace the page's custom section-header markups with the home-style `SectionHeader` (read `app/components/SectionHeader.tsx` and reuse it) — for the Radar/bestsellers section, pass the `RadarGlyph` as the tick slot if SectionHeader supports a custom tick node; if it doesn't, widen SectionHeader's props with `tick?: ReactNode` (default: current colored dot) and pass `<RadarGlyph />` on the radar sections only.

- [ ] **Step 2: Mover cards get the diffusion arc**

In the movers grid (SignalCard `foot` slot from Task 9): where a mover has distinct origin/destination regions, render `[region-chip origin] <DiffusionArc /> [region-chip dest]` + `▲ rankDelta` in the meta row:
```tsx
<span className="delta ticker text-meta font-medium text-signal">▲ {m.rankDelta}</span>
<span className="rounded-full border border-line px-2 py-0.5 font-mono text-label text-muted">{REGION_LABEL[m.originRegion]}</span>
<DiffusionArc />
<span className="rounded-full border border-line px-2 py-0.5 font-mono text-label text-muted">{REGION_LABEL[m.destRegion]}</span>
```
Single-region movers (NEW/fading): render the one chip + `NEW`/`fading` meta, no arc. Read the actual MoverInsight field names from the radar data layer (`src/` movers query — `grep -rn "rankDelta\|originRegion\|destRegion\|regions" app/trends/ src/` to find exact field names) and adapt; if the model carries only a `regions: string[]`, use first/last as origin/dest when length ≥ 2, single chip otherwise.

- [ ] **Step 3: KPI row + bestsellers board tidy**

Keep the KPI component as-is. `BestsellersBoard.tsx`: replace remaining hand-rolled product cards with the shared product-card pattern used by `RadarSection` (read `app/components/RadarSection.tsx`; if both define product cards, extract nothing — just align classes: `rounded-md border border-line bg-surface`, rank badge `bg-chipbg text-chipink`). Keep it minimal — this task is visual consistency, not restructuring.

- [ ] **Step 4: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: `/trends` screenshot — movers show arc between region chips; radar glyph sweeps in section header; no duplicated markup left:
Run: `grep -n "border-l" app/trends/page.tsx || echo "CLEAN"` → CLEAN.

```bash
git add app/trends/
git commit -m "feat(BL-045): radar page polish (glyph, mover diffusion arcs, board consistency)"
```

### Task 17: Daily pages polish

**Files:**
- Modify: `app/daily/page.tsx`
- Modify: `app/daily/[slug]/page.tsx`
- Modify: `app/daily/Markdown.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `EmptyState`, named fontSize tokens.

- [ ] **Step 1: List page**

PageHeader is already applied (Task 10). Align the date-bucket sticky headers with the Wire bucket style (read `app/wire/page.tsx` bucket header classes; apply the same `ticker text-label uppercase text-faint` + sticky classes). Replace any remaining arbitrary `text-[Npx]` with `text-label/meta/body/title`.

- [ ] **Step 2: Detail page typography**

In `app/daily/[slug]/page.tsx`: replace arbitrary sizes with named steps (title→`text-headline`, meta→`text-meta`/`text-label`, body stays `text-body`). Keep JSON-LD/hreflang/takeaways/citations untouched. Keep `max-w-[42rem]` measure.

- [ ] **Step 3: Markdown component**

In `app/daily/Markdown.tsx`: h2 → `text-title`, h3 → `text-lede font-semibold`, lists → `text-body`, bold → `font-semibold text-ink`. Replace the three `text-[Npx]` hits. Verify a real note renders (pick a slug from the list page).

- [ ] **Step 4: Verify + commit**

Run: `pnpm lint && pnpm test` → clean.
Dev smoke: `/daily` + one `/daily/[slug]` screenshots, EN + ZH pair (hreflang intact: `curl -s http://localhost:3000/daily/<slug> | grep -o 'hreflang="[^"]*"' | sort -u` → en, zh-Hans, x-default).

```bash
git add app/daily/
git commit -m "feat(BL-045): daily pages on PageHeader + named type scale"
```

### Task 18: Evidence matrix + Verification Record + release gate

**Files:**
- Create: `docs/superpowers/verification/2026-07-19-bl045-verification.md`
- Modify: `.agent/CURRENT.md` (Version History row + BL-045 section — done after merge, not in this task's commit)

**Interfaces:**
- Consumes: everything above.
- Produces: T3 Verification Record per `frontend-harness-workflow.md` §9; Human Owner walkthrough; merge decision.

- [ ] **Step 1: Full automated checks**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: tsc clean, all tests pass (297), `next build` succeeds with no type/route errors.

- [ ] **Step 2: Dark evidence matrix (automated)**

Start `pnpm dev`, then:
```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; OUT=design/shots/bl045-final; mkdir -p $OUT
for route in "" "wire" "trends" "daily" "subscribe"; do
  name=${route:-home}; name=${name//\//_}
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 --window-size=1440,1600 --screenshot=$OUT/${name}-desktop-dark.png "http://localhost:3000/$route" 2>/dev/null
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=9000 --window-size=390,1600 --screenshot=$OUT/${name}-mobile-dark.png "http://localhost:3000/$route" 2>/dev/null
done
```
Plus one daily article page (grab a real slug from `/daily`). Read every screenshot; log defects.

- [ ] **Step 3: Light matrix + keyboard/a11y walkthrough (human-assisted)**

Light theme can't be forced via headless query param (cookie-only) — capture during the Human Owner walkthrough (Step 5) with the toggle, or temporarily verify via devtools. Checklist:
- Tab through: skip-link → nav → More menu (opens, arrows, Esc) → theme toggle → cards → tab bar; focus ring visible everywhere.
- 200% zoom at 390px: no horizontal overflow; tab bar reachable.
- `prefers-reduced-motion` (devtools rendering tab): tape static-scrollable, no sweep/arc/insert animations, masthead settled.
- Contrast spot-check: meta text on cards (faint), chip text, footer — all token-derived (pre-verified values); confirm no page uses raw hex outside tokens: `grep -rn "#[0-9a-fA-F]\{6\}" app/ --include="*.tsx" | grep -v "//" || echo "CLEAN"` → CLEAN (tierStyle rail hexes in `alert-style.ts` are the known exception — flag if still used for side-stripes; they should be gone after Task 9).

- [ ] **Step 4: Write the Verification Record**

Create `docs/superpowers/verification/2026-07-19-bl045-verification.md` using the workflow §9 template (change/brief/tier/agents + the 12-row check table + findings/disposition + human decisions + post-deploy plan). Fill every row with evidence links to `design/shots/bl045-final/*`; N/A rows get a one-line reason.

- [ ] **Step 5: Human Owner walkthrough (T3 hard gate)**

Ask the Human Owner to walk: five pages × dark/light × desktop/mobile (responsive mode), More menu, theme toggle persistence across navigation, mobile tab bar, subscribe form (submit a test email → done state), one daily article. Collect findings; fix blockers; non-blockers become backlog entries.

- [ ] **Step 6: Merge + post-deploy smoke**

After Human Owner approves:
```bash
git checkout main && git merge feat/frontend-redesign
git push origin main
```
Vercel auto-deploys. Post-deploy smoke on `https://tradelinks-mvp.vercel.app`:
- 5 pages return 200 (`curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" ...` each of `/ /wire /trends /daily /subscribe /zh /zh/wire`).
- `/feed.xml` valid XML; home HTML contains `hreflang` and `data-theme="dark"`.
- Toggle theme on production, navigate, confirm persistence.
Rollback if smoke fails: `git revert -m 1 <merge-sha> && git push` or Vercel instant-rollback to previous deployment.

- [ ] **Step 7: Update `.agent/CURRENT.md`**

Add the BL-045 entry + Version History row (tests count, merge sha) and bump the UI-debt TODO list (mobile nav/theme/states/cards done). Commit separately: `docs: update CURRENT.md for BL-045 frontend redesign`.

---

## Self-Review Notes (completed during planning)

- Spec coverage: tokens(1,2), theme mechanism(3,4), chrome(4,5,6), subscribe fix(7), labels(8), SignalCard(9), PageHeader(10), EmptyState(11), route states(12), Filters+ui.ts(13), motion(14), wire(15), radar(16), daily(17), T3 gates(18). Out-of-scope honored (admin visuals, URL migration, real Alerts/Upgrade features).
- Type consistency: `parseTheme/Theme/THEME_COOKIE` (T3↔T4); `SignalTone` (T9↔T15/16); `isFresh` (T14 steps 1↔2); dict keys `themeToggle/navSubscribe/navTelegram/navRss/emptyReset` (T4/6/11 ↔ usage); `chipFilter/inputField/btnPrimary` (T13 ↔ T11 ghost-chip fallback noted inline).
- Known accepted gaps: error.tsx EN-only copy (flagged in T12); light-theme screenshots captured at human walkthrough (T18 step 3); SubscribeBar hidden on mobile (spec stacking-rule simplification, T5).
