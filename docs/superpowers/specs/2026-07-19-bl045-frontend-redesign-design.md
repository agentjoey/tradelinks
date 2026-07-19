# BL-045 Frontend Redesign — Systematic Quality Pass (dual theme + mobile nav + design-system convergence) — Design

**Status:** Draft (pending Human Owner approval) · mockups `design/bl045-mockup-v1.html` (layout/tokens) + `design/bl045-mockup-v2.html` (motion — header restoration & Instrument Panel reviewed + approved by Human Owner) · renders `design/shots/bl045-*`
**Brief ID:** BL-045 · **Revision:** 1 · **Date:** 2026-07-19
**Verification Tier:** **Tier 3** — triggers: core navigation (new mobile nav), main brand entry (home), site-wide visual layer (theming). Human Owner approved goal/scope/approach in brainstorm Q&A.
**Human Owner:** xtation · **Primary Agent:** Kimi Code CLI · **Review/Verification:** independent agent sessions (T3)
**Workflow:** `frontend-harness-workflow.md` v3.1 · **Method:** 3-slice progressive rollout (approved over one-shot and fix-only alternatives)

## Goal

Systematic quality upgrade of the five public surfaces (Home `/`, Wire `/wire`, Radar `/trends`, Daily `/daily` + `/daily/[slug]`, Subscribe ×3) on top of the existing dark-editorial "situation room" language — **not** a brand overhaul. Converge the design system (semantic tokens, type/radius scales), add **dark/light theme switching**, add **mobile navigation**, eliminate known design debt, and bring every surface to full state coverage (loading/empty/error) with verified contrast and keyboard access.

## Problems addressed (audit findings)

1. **Theme break (bug-level):** subscribe pages + `SubscribeForm` use light `text-neutral-*` styles on the dark body — near-unreadable.
2. **Duplicated card markup ×5:** Movers/viralX/diffusion grids in `trends/page.tsx` (~3 copies), `StreamCard.tsx` (WireCard/RadarCard/DailyCard), `HotOnX`.
3. **`REGION_LABEL` copied ×5:** alert-style, trends page, BestsellersBoard, Filters, admin/review.
4. **No state layer:** zero `loading.tsx`/`error.tsx`/`not-found.tsx`, zero Suspense — slow queries render blank pages; ad-hoc empty states.
5. **No mobile navigation:** `MainNav` is `hidden md:flex`; phones have no nav at all.
6. **Dead-link placeholders in production chrome:** MainNav "More ▾", AccountNav Alerts/Upgrade/Profile/Billing/Sign out all `href="#"`.
7. **No type scale:** 10+ arbitrary font sizes (`text-[10px]`…`text-[31px]`); radius mixed `rounded-sm`…`2xl`; tier accent bar implemented 3 different ways.
8. **Contrast risk:** `text-faint` (#5a5f6b) on `bg` (#08090c) ≈ 3.5:1 < 4.5:1.
9. **Hero no-image fallback is a black void** (see `design/app-final-top.png`): the 2:1 TOP STORY slot renders empty when the lead has no image.
10. **Bottom-bar collision:** floating SubscribeBar and cookie-consent banner overlap (visible in same screenshot); neither accounts for a mobile tab bar.
11. **Filters lose locale:** `Filters.hrefFor` hardcodes `/wire?…`, ZH users bounce to EN.
12. **A11y gaps:** no skip-link; AccountNav dropdown lacks Esc/arrow-key handling; all images `alt=""`.

## Confirmed decisions (from Human Owner Q&A)

- **Driver:** systematic quality, keep the dark-editorial direction.
- **Scope:** five public surfaces + mobile nav. Admin untouched.
- **Theme:** full dark/light toggle. Dark remains the **default** (not `prefers-color-scheme`-driven).
- **Tech:** Radix unstyled primitives on demand (Dialog/DropdownMenu…); all styling hand-rolled on project tokens. No full shadcn, no next-themes.
- **Plan:** three slices, each independently verifiable and revertible.

## Slice plan

- **Slice 1 — Foundation:** semantic tokens (light/dark values) + type/radius scales + theme mechanism + global chrome (header, mobile tab bar, theme toggle, dead-link cleanup) + subscribe pages (theme break fix + full form states — smallest surface validates the token system first).
- **Slice 2 — Components & states:** `SignalCard` unification, `labels.ts` single source, `PageHeader`, `EmptyState`, per-page `loading.tsx`/`error.tsx`, global `not-found.tsx`, Filters locale fix, `ui.ts` shared class helpers.
- **Slice 3 — Page-by-page polish:** Home → Wire → Radar → Daily; per-page evidence (mobile+desktop × dark+light screenshots, keyboard pass).

## Design-system foundation

**Tokens.** Two layers:

- Semantic Tailwind colors → CSS vars: `bg`, `surface`, `surface-2`, `ink`, `muted`, `faint`, `line`, `signal`, `urgent`, `calm`, `paper`. Declared as `rgb(var(--bg) / <alpha-value>)` so opacity modifiers (`bg-surface/70`) keep working.
- `:root` carries the current dark values (zero visual regression by default). `[data-theme="light"]` carries light values: paper-toned background, ink text, `signal` deepened toward ~`#9A6B12`, `urgent`/`calm` similarly deepened — every text/background pair ≥ 4.5:1 (large text ≥ 3:1). Noise/grid textures reduced, amber top-glow swapped for a paper gradient in light.
- `color-scheme` follows the active theme (native form controls/scrollbars).

**Theme mechanism (no next-themes dependency).** Choice stored in a 1-year cookie + localStorage mirror. All pages are `force-dynamic` SSR: the server reads the cookie and renders `<html data-theme>` directly → no flash. A ~10-line inline script in the root layout covers the static/cookie-missing path. Helper: `app/lib/theme.ts` (cookie read/write). `next-themes` intentionally not used.

**Scales.**

- **Type:** converge arbitrary sizes to ~7 named steps — `eyebrow 10 / meta 12 / body 15 / lede 17 / title 20 / headline 26 / display 34` (final values derived from actual current usage during implementation; Tailwind `fontSize` extension).
- **Radius:** three steps (`sm/md/lg`) replacing the `rounded-sm`…`2xl` mix.
- **Spacing:** unchanged (Tailwind default scale is already consistent).
- **Tier accent:** the >1px side-stripe is **retired** (mockup v1 decision, aligns with impeccable's absolute ban). Tier is carried by the tier chip (`WORTH KNOWING` / `ACT NOW` / `Discussion`) + 1px hairline card border + `delta`/`rank-badge` markers. Deletes the inline-`style` and absolute-positioned-div variants along with the `border-l-2` class variant.

## Global chrome

- **MainNav "More ▾"** becomes real: Radix `DropdownMenu` linking Subscribe, RSS (`/feed.xml`), Telegram channel — all existing destinations; gains Esc/arrow-key/focus handling for free.
- **AccountNav keeps its original visual cluster** (Human Owner decision, mockup v1): bordered bell **Alerts** pill and solid-amber **Upgrade** now point to the real `/subscribe` destination instead of `#`; the avatar dropdown points to the real admin pages (`/admin/review`, `/admin/sources`) instead of placeholder Profile/Billing/Sign-out. Language toggle unchanged.
- **Theme toggle** added as a matching bordered square button in the same cluster (sun/moon icon), visible on mobile too.
- **skip-link** to main content.
- **Mobile bottom tab bar** (new): Home / Wire / Radar / Daily, icon + label, `signal` active state + `aria-current="page"`, `md:hidden`, fixed bottom. Plain links — no Radix needed. Main content gets matching bottom padding.
- **Bottom-surface stacking rules:** while cookie consent is visible, SubscribeBar yields (hidden or stacked above it); both clear the mobile tab bar height.
- **Footer:** add a small real-links column (Subscribe / RSS / Telegram); copyright line unchanged.

## Component layer

- **`SignalCard`** — one card, variants via `kind: wire | radar | x | mover | daily` props: tier accent bar, ticker-style meta row, headline, optional dek, optional thumbnail, timestamp; variant extras (mover `▲rankDelta`, X discussion counts) as optional props. Replaces the 5 duplicated markups; call sites migrate, visual differences preserved as variant params.
- **`app/lib/labels.ts`** — single source for `REGION_LABEL` / `CAT_LABEL` (Filters' full-name version is canonical); deletes 4 copies (admin/review may keep its own import from the same source).
- **`Filters.hrefFor`** goes through `addLocale` — ZH filter links stay on `/zh`.
- **`PageHeader`** — eyebrow + display title + description + optional right-side action; unifies the five divergent page-header patterns.
- **State layer** — per-page `loading.tsx` (skeletons reusing card frames + pulse), `error.tsx` (explanation + retry), one global `not-found.tsx` (mainly serves `/daily/[slug]`); `EmptyState` component (mono icon + copy + optional action link) replacing hand-rolled empties.
- **`app/components/ui.ts`** — shared className helpers for button/chip/input (hand-rolled, cva-style functions, no dependency).

## Per-page application

- **Home:** hero no-image fallback redesigned — without an image the lead becomes a text-led card (large display headline + dek + meta) instead of the 2:1 void; with image, current 2:1 layout kept. `pickHero` logic unchanged (presentation-only change). Sections migrate to shared components/named type steps.
- **Wire:** keep the progressive time buckets (1h/4h/8h/today/yesterday — approved interaction); card/row modes migrate to `SignalCard`; add empty-filter state and cursor-pagination loading state.
- **Radar:** migrate KPI/movers/viral/hot-X grids; keep #1-leader + grid. **URL stays `/trends`** this round (SEO/backlink risk); internal naming aligned to "Radar" only; URL migration logged to backlog.
- **Daily:** detail page (already strongest: JSON-LD/hreflang/takeaways) gets markdown typography on the type scale + refined quote/list styles; list page adopts `PageHeader` + bucket styling aligned with Wire.
- **Subscribe ×3 (lands in Slice 1):** fix the theme break via semantic tokens (correct in both themes); complete form states: success / already-subscribed / error / invalid-email.

## Motion system (mockup v2 — "Instrument Panel")

- **One orchestrated entrance (~1.3s, once per load; approved on mockup v2 freeze-frames):** masthead line 1 masked rise `700ms ease-out-expo`; line 2 at `+90ms`; the italic brand word ("intelligence.") focus-pulls `blur(6px)→0` + `opacity .15→1` over `900ms @ +380ms`; sub line rises `@ +500ms`; top-cluster cards stagger in `@ +450ms`, `70ms` apart, capped at 4 items. Metaphor: instrument boot → type rises → brand word locks into focus. Tunables recorded: stagger start (450ms vs 250ms) and focus-pull intensity (blur 6px vs 10px) — defaults as built. No per-section fade-and-rise — that reflex is an anti-goal.
- **Live instrumentation (state, not decoration):** UTC clock (1s tick, mono tabular-nums) in the Today header; wire ticker tape under the site header (CSS marquee, edge-masked, pause on hover); radar sweep glyph as the Radar section signature; diffusion arcs on Mover cards (animated dash flow visualizing lead-lag); Latest rail insert animation for newly landed items; hairline scan on card hover (border tints signal/35); 150ms `scale(.97)` press feedback on buttons/chips.
- **Reduced motion:** every animation settles to static; the tape becomes manually scrollable; rail inserts off.

## i18n

All new copy goes through `getDict()` dictionaries (EN + ZH) — zero hardcoded English in components. EN pages stay zero-CJK. CJK line-height/letter-spacing validated against the new type scale.

## Surface behavior (state matrix, applies to all five pages)

- **Loading:** route-level skeletons; no blank white wait.
- **Empty:** `EmptyState` with copy per surface (+ reset-filters action on Wire).
- **Error:** `error.tsx` with retry; DB failure no longer a bare 500.
- **Success/content:** per layouts above.
- **Validation/disabled:** subscribe form four states; buttons have disabled styles.
- **Responsive:** 390px mobile + 1440px desktop verified; tab bar only < `md`.
- **Keyboard/focus:** tab bar, More dropdown, theme toggle, SubscribeBar dismiss, full subscribe form flow; visible focus rings; skip-link.
- **Reduced motion:** `animate-rise` and skeleton pulse disabled under `prefers-reduced-motion`.

## Testing

- Keep `pnpm test` (287) green; add unit tests where pure logic exists (project convention: pages/components not unit-tested):
  - `theme.ts` cookie parse/serialize (dark default, light, invalid → dark).
  - `labels.ts` single source (imported by former copy sites).
  - Hero no-image fallback branch in `test/home-select.test.ts` (presentation selector, if logic added).
  - `SignalCard` variant mapping if it contains non-trivial derivation logic.
- `tsc`, `pnpm lint`, `next build` clean.

## Verification plan (Tier 3 gates)

- **Evidence matrix:** five surfaces (Home, Wire, Radar, Daily list + detail, Subscribe ×3) × (390px + 1440px) × (dark + light) screenshots from the **final target build** (local dev against prod DB, real data).
- **Contrast:** fix `text-faint` on `bg` to ≥ 4.5:1; all light-theme token pairs pass 4.5:1/3:1.
- **Keyboard walkthrough** of the full changed chrome + subscribe flow.
- **Independent review:** separate agent session reviews against the 9-dimension Design Quality Model; independent Verification Run reads the target build and produces its own evidence.
- **a11y checks:** skip-link works, `aria-current` on tabs, dropdown menu semantics, form labels/errors associated.

## Release and rollback

- Branch `feat/frontend-redesign`, per-slice commits → Vercel preview per slice.
- **Human Owner journey walkthrough** (T3 hard gate) before merge: browse five pages, toggle theme, use mobile nav, complete subscribe flow.
- Merge to `main` → Vercel production.
- **Rollback:** `git revert` + Vercel instant rollback to previous deployment. Zero schema/data changes → clean rollback surface.
- **Post-deploy smoke:** five pages 200, `/feed.xml` + sitemap valid, hreflang tags present.
- **Measurement window:** 7 days post-launch — GA bounce rate, subscribe conversion, mobile share; findings fed back per workflow Phase 7.

## Out of scope

Admin pages (`/admin/*`); `/trends` → `/radar` URL migration; real implementation of Alerts/Upgrade/Profile/Billing; any new page/route; full shadcn adoption; `next-themes`; light theme for admin; backend/worker changes.

## Assumptions & open questions

- Light-theme exact palette values (e.g. deepened `signal` ~`#9A6B12`) are starting points, tuned during Slice 1 against the contrast gate — Human Owner reviews the light-theme screenshot evidence.
- "More ▾" contents = Subscribe / RSS / Telegram (all existing destinations); no new pages implied.
- Tab bar carries 4 items; Subscribe stays reachable via More menu, footer, and the floating SubscribeBar.
