# BL-026 UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat Wire-as-homepage into an editorial front door (`/`) that orients first-time visitors and funnels them into timeline secondary pages, fixing focus/buttons/text/images/structure.

**Architecture:** `/` becomes a Home composed of `BreakingStrip → masthead → three data-driven StreamBands (Today at a glance) → EarlierFeed → floating SubscribeBar`. Current Wire body moves to `/wire`. A scalable top nav + account cluster replaces the old nav. Pure selection logic (`app/lib/home.ts`) is TDD'd; components/pages follow the approved mockup `design/home-mockup-v4.html` and the existing palette/fonts (unchanged).

**Tech Stack:** Next.js 14 App Router (RSC), Tailwind (brand tokens in `tailwind.config.ts`), vitest (tests in `test/*.test.ts`). Reuses `getAlerts` (`app/lib/alerts.ts`), `getBestsellers` (`src/trends/db.ts`), `getViralX` (`src/social/db.ts`), `getPublishedNotes` (`src/daily/db.ts`), `getDict` (`app/lib/i18n.ts`).

**Scope guard:** This plan touches **`app/` and `test/` only**. Do NOT touch `src/push`, `src/workers`, `prisma`, or `src/config/env.ts` — those belong to BL-039 (running in parallel). Importing existing read helpers from `src/**` is fine; modifying them is not.

**Visual source of truth:** `design/home-mockup-v4.html`. Each UI task ports the exact markup/classes from the named section of that file into a React component. The English surface contains **zero Chinese**; every label is an i18n key.

---

## File structure

- Create `app/lib/home.ts` — pure selection (`pickBreaking`, `topAlerts`, `cardMode`). Tested.
- Create `app/lib/home-data.ts` — server-side candidate assembly (RSC; calls the read helpers, maps to view types).
- Create `app/wire/page.tsx` — the relocated Wire timeline (former `app/page.tsx` body).
- Create `app/components/AccountNav.tsx` — client; avatar + dropdown (Profile/Billing/Settings/Sign out).
- Create `app/components/BreakingStrip.tsx`, `StreamBand.tsx`, `StreamCard.tsx`, `AlertRow.tsx`, `EarlierFeed.tsx` (client), `SubscribeBar.tsx` (client).
- Rewrite `app/page.tsx` — Home composition.
- Modify `app/layout.tsx` — top nav + account cluster; RSS→footer; admin links removed.
- Modify `app/lib/i18n.ts` — add `Dict` keys (EN+ZH) for all new copy.
- Modify `app/trends/page.tsx`, `app/daily/page.tsx` — adopt card standards / timeline rhythm.
- Refactor `app/components/AlertCard.tsx` — keep image card; extract `AlertRow` compact mode.

---

## Phase 1 — Routing + nav shell

### Task 1: Relocate Wire to `/wire`

**Files:**
- Create: `app/wire/page.tsx`
- Create: `app/lib/buckets.ts` (extract `bucketAlerts` + `Bucket` from `app/page.tsx` so Home and Wire share it)
- Modify: `app/page.tsx` (will be replaced in Phase 2; for now leave a stub re-exporting Wire so the site builds)

- [ ] **Step 1: Extract bucketing into `app/lib/buckets.ts`**

Move `dayKey`, `Bucket`, and `bucketAlerts` (currently in `app/page.tsx:9-51`) verbatim into `app/lib/buckets.ts` and `export` `bucketAlerts` + `Bucket`. Import `AlertRow` from `./alerts`, `Dict`/`Lang` from `./i18n`.

- [ ] **Step 2: Create `app/wire/page.tsx`** = the current `app/page.tsx` Home component body (the bucketed timeline + Filters + hero strip), importing `bucketAlerts` from `../lib/buckets`. Rename the default export `Wire`. Keep `export const dynamic = "force-dynamic"`.

- [ ] **Step 3: Verify build**

Run: `pnpm lint && pnpm build`
Expected: compiles; `/wire` renders the old homepage.

- [ ] **Step 4: Commit**

```bash
git add app/wire/page.tsx app/lib/buckets.ts app/page.tsx
git commit -m "refactor(bl026): move Wire timeline to /wire, share bucketAlerts"
```

### Task 2: Top nav + account cluster

**Files:**
- Modify: `app/layout.tsx:46-69` (the `<header>` block)
- Create: `app/components/AccountNav.tsx`
- Modify: `app/lib/i18n.ts` (`Dict.nav` + new account/nav keys)

- [ ] **Step 1: Add i18n keys.** In `app/lib/i18n.ts`, extend `Dict.nav` to `{ home, wire, radar, daily, more }` and add `navUpgrade`, `navAlerts`. EN: `{ home:"Home", wire:"Wire", radar:"Radar", daily:"Daily", more:"More" }`, `navUpgrade:"Upgrade"`, `navAlerts:"Alerts"`. ZH mirror: `{ home:"首页", wire:"Wire", radar:"Radar", daily:"Daily", more:"更多" }`, `navUpgrade:"升级", navAlerts:"订阅"`. Remove `nav.desk`/`nav.sources` usage from public layout (keep keys or drop — drop to avoid dead code).

- [ ] **Step 2: Create `app/components/AccountNav.tsx`** (client) — the avatar button + dropdown. Port the right-cluster markup from `design/home-mockup-v4.html` (the `Account cluster` in `<header>`): Alerts pill (bell svg), `Upgrade` amber button, `EN/中` toggle (links to `/api/lang?l=…`), avatar circle `AJ` opening a dropdown with Profile / Billing / Settings / Sign out (static links for now). Use `useState` for open/close.

- [ ] **Step 3: Rewrite the header in `app/layout.tsx`** to: wordmark (unchanged) + horizontal content nav `Home · Wire · Radar · Daily · More ▾` (Home→`/`, Wire→`/wire`, Radar→`/trends`, Daily→`/daily`; `More` static) at `text-[14px]`, active state on current route; `<AccountNav/>` on the right. Move RSS into the footer. Remove `/admin/*` links. Match the `<header>` structure/classes in `design/home-mockup-v4.html`.

- [ ] **Step 4: Verify build + visual**

Run: `pnpm lint && pnpm build`
Expected: header shows larger nav + account cluster; admin links gone; RSS in footer.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/components/AccountNav.tsx app/lib/i18n.ts
git commit -m "feat(bl026): scalable top nav + account cluster"
```

---

## Phase 2 — Home: pure logic (TDD) + data + components + page

### Task 3: Pure selection module (TDD)

**Files:**
- Create: `app/lib/home.ts`
- Test: `test/home-select.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/home-select.test.ts
import { describe, it, expect } from "vitest";
import { cardMode, pickBreaking, topAlerts } from "../app/lib/home";
import type { AlertRow } from "../app/lib/alerts";

const H = 3_600_000;
const NOW = Date.UTC(2026, 5, 7, 12, 0, 0);
function a(p: Partial<AlertRow> & { id: string }): AlertRow {
  return {
    id: p.id, title: p.title ?? p.id, summary: "", urgencyScore: p.urgencyScore ?? 1,
    regions: [], platforms: [], category: "regulatory", actionRequired: null,
    imageUrl: p.imageUrl ?? null, sourceUrls: [], publishedAt: p.publishedAt ?? null,
    createdAt: p.createdAt ?? new Date(NOW),
  };
}

describe("cardMode", () => {
  it("image when imageUrl present, compact otherwise", () => {
    expect(cardMode({ imageUrl: "http://x/i.jpg" })).toBe("image");
    expect(cardMode({ imageUrl: null })).toBe("compact");
    expect(cardMode({ imageUrl: "  " })).toBe("compact");
  });
});

describe("pickBreaking", () => {
  it("returns highest urgency>=4 within 24h, else null", () => {
    const within = new Date(NOW - 2 * H);
    const items = [
      a({ id: "old", urgencyScore: 5, createdAt: new Date(NOW - 30 * H) }),
      a({ id: "low", urgencyScore: 3, createdAt: within }),
      a({ id: "hit", urgencyScore: 4.2, createdAt: within }),
      a({ id: "hot", urgencyScore: 4.9, createdAt: new Date(NOW - 1 * H) }),
    ];
    expect(pickBreaking(items, NOW)?.id).toBe("hot");
    expect(pickBreaking([a({ id: "x", urgencyScore: 2 })], NOW)).toBeNull();
  });
});

describe("topAlerts", () => {
  it("sorts by urgency desc then recency, drops excludeId, caps at n", () => {
    const items = [
      a({ id: "a", urgencyScore: 2, createdAt: new Date(NOW - 5 * H) }),
      a({ id: "b", urgencyScore: 5, createdAt: new Date(NOW - 9 * H) }),
      a({ id: "c", urgencyScore: 5, createdAt: new Date(NOW - 1 * H) }),
      a({ id: "d", urgencyScore: 4, createdAt: new Date(NOW) }),
    ];
    expect(topAlerts(items, 2, "c").map((x) => x.id)).toEqual(["b", "d"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test home-select`
Expected: FAIL — "cardMode is not a function" / module not found.

- [ ] **Step 3: Implement `app/lib/home.ts`**

```ts
import type { AlertRow } from "./alerts";

export type CardMode = "image" | "compact";

export function cardMode(item: { imageUrl?: string | null }): CardMode {
  return item.imageUrl && item.imageUrl.trim() !== "" ? "image" : "compact";
}

const tsOf = (a: AlertRow) => new Date(a.publishedAt ?? a.createdAt).getTime();
const byUrgencyThenRecency = (x: AlertRow, y: AlertRow) =>
  (y.urgencyScore - x.urgencyScore) || (tsOf(y) - tsOf(x));

export function pickBreaking(alerts: AlertRow[], now: number, windowMs = 24 * 3_600_000): AlertRow | null {
  const fresh = alerts.filter((a) => a.urgencyScore >= 4 && now - tsOf(a) <= windowMs);
  return fresh.length ? [...fresh].sort(byUrgencyThenRecency)[0] : null;
}

export function topAlerts(alerts: AlertRow[], n: number, excludeId?: string): AlertRow[] {
  return [...alerts].filter((a) => a.id !== excludeId).sort(byUrgencyThenRecency).slice(0, n);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test home-select`
Expected: PASS (3 describes green).

- [ ] **Step 5: Commit**

```bash
git add app/lib/home.ts test/home-select.test.ts
git commit -m "feat(bl026): home selection logic (pickBreaking/topAlerts/cardMode) + tests"
```

### Task 4: Home data layer

**Files:**
- Create: `app/lib/home-data.ts`

- [ ] **Step 1: Implement `getHomeData(lang)`** (RSC, no test — DB orchestration). It runs in parallel: `getAlerts({ take: 60 })`, `getBestsellers()`, `getViralX()`, `getPublishedNotes(4, lang)`. Returns a typed object:

```ts
import { getAlerts, type AlertRow } from "./alerts";
import { getBestsellers } from "../../src/trends/db.js";
import { getViralX } from "../../src/social/db.js";
import { getPublishedNotes } from "../../src/daily/db.js";
import { pickBreaking, topAlerts } from "./home";
import type { Lang } from "./i18n";

export interface ProductCard {
  key: string; title: string; platform: string; metric: string;
  region: string | null; url: string; imageUrl: string | null;
}

export async function getHomeData(lang: Lang, now = Date.now()) {
  const [{ items: alerts }, bestsellers, viral, notes] = await Promise.all([
    getAlerts({ take: 60 }), getBestsellers(), getViralX(), getPublishedNotes(4, lang),
  ]);
  const breaking = pickBreaking(alerts, now);
  const wireTop = topAlerts(alerts, 3, breaking?.id);

  const products: ProductCard[] = [
    ...bestsellers.slice(0, 6).map((b) => ({
      key: `bestseller:${b.url}`, title: b.title, platform: "Amazon",
      metric: b.rank != null ? `BSR #${b.rank}` : "Bestseller",
      region: b.region, url: b.url, imageUrl: b.imageUrl,
    })),
    ...viral.slice(0, 6).map((v) => ({
      key: `viral:${v.link}`, title: v.product, platform: v.platform ?? "X",
      metric: `♥ ${v.likes.toLocaleString()}`, region: null, url: v.link, imageUrl: v.imageUrl,
    })),
  ];
  const radarTop = products.filter((p) => p.imageUrl).slice(0, 3).length >= 3
    ? products.filter((p) => p.imageUrl).slice(0, 3)
    : products.slice(0, 3);

  // earlier = alerts not in the top bands, kept for the EarlierFeed (client buckets)
  const usedIds = new Set([breaking?.id, ...wireTop.map((a) => a.id)].filter(Boolean) as string[]);
  const earlierAlerts = alerts.filter((a) => !usedIds.has(a.id));

  return { breaking, wireTop, radarTop, notes, earlierAlerts };
}
```

Note: `ViralXRow` has no `platform`/`region` fields — use `v.platform ?? "X"` only if present; otherwise hardcode `"X"`. Confirm against `src/social/db.ts` and adjust (likely just `"X"`).

- [ ] **Step 2: Verify typecheck**

Run: `pnpm lint`
Expected: no type errors (fix the `platform`/`region` access per actual `ViralXRow`).

- [ ] **Step 3: Commit**

```bash
git add app/lib/home-data.ts
git commit -m "feat(bl026): home data assembly (breaking + wire/radar/daily top + earlier)"
```

### Task 5: Home components

**Files:** Create each in `app/components/`. Port markup/classes from the matching section of `design/home-mockup-v4.html`.

- [ ] **Step 1: `BreakingStrip.tsx`** — props `{ alert: AlertRow | null, t }`. Renders the slim urgent bar (mockup `BREAKING` block) or `null`. Links to `alert.sourceUrls[0]`.

- [ ] **Step 2: `StreamCard.tsx`** — the image-forward card. Props (discriminated): `wire` (image + urgency tag + category + region + source label + title) and `radar` (image + rank badge + platform tag + title + metric) and `daily` (image + kind tag + title + date). Port from mockup Wire/Radar/Daily band cards. Source label for wire = domain of `sourceUrls[0]` (reuse `domainOf` pattern from `AlertCard.tsx`).

- [ ] **Step 3: `AlertRow.tsx`** — the compact row (left urgency border, urgency pill, category, region, source, time, title). Port from mockup `Earlier` rows. Props `{ a: AlertRow, t }`. Reuses `urgency()`/`CAT_LABEL`/`REGION_LABEL` (move these from `AlertCard.tsx` into a shared `app/components/alert-style.ts`).

- [ ] **Step 4: `StreamBand.tsx`** — props `{ accent, title, sublabel, count, href, children }`. Renders the band header (tick + display title + sublabel + count + `See all →`) over a grid of children. Used 3× on Home.

- [ ] **Step 5: `EarlierFeed.tsx`** (client) — props `{ alerts: AlertRow[], t, lang }`. Filter chips `[All · Wire · Radar · Daily]` (state), date-bucketed via `bucketAlerts` from `../lib/buckets` (sticky headers), rows via `AlertRow`, `Load earlier` button (static for v1). For slice 1, Radar/Daily filters can show an empty-state line ("see the Radar/Daily page") since the feed source is alerts; All/Wire show the rows.

- [ ] **Step 6: `SubscribeBar.tsx`** (client) — fixed bottom dismissible bar (mockup floating bar). `useState`+`localStorage("tl_sub_dismissed")` to hide after `×`. Links to the same destination as nav `Alerts`.

- [ ] **Step 7: Verify build**

Run: `pnpm lint && pnpm build`
Expected: components compile (not yet mounted).

- [ ] **Step 8: Commit**

```bash
git add app/components/BreakingStrip.tsx app/components/StreamCard.tsx app/components/AlertRow.tsx app/components/StreamBand.tsx app/components/EarlierFeed.tsx app/components/SubscribeBar.tsx app/components/alert-style.ts
git commit -m "feat(bl026): home components (breaking/band/card/row/earlier/subscribe)"
```

### Task 6: Assemble Home `app/page.tsx` + i18n copy

**Files:**
- Rewrite: `app/page.tsx`
- Modify: `app/lib/i18n.ts` (home keys)

- [ ] **Step 1: Add home i18n keys** to `Dict` (EN + ZH): `homeMastheadPre/Em/Post`, `homeMastheadSub`, `glance` ("Today at a glance" / "今日速览"), `seeAll` ("See all"/"全部"), `breaking` ("Breaking"/"突发"), `earlier` ("Earlier"/"更早"), `streamWire/streamWireSub`, `streamRadar/streamRadarSub`, `streamDaily/streamDailySub`, `subscribeTitle/subscribeSub/subscribeCta`, `loadEarlier` (exists). Copy strings from `design/home-mockup-v4.html` (EN) and write ZH mirrors. **English values must contain no Chinese.**

- [ ] **Step 2: Rewrite `app/page.tsx`** as the Home RSC:

```tsx
import { getDict } from "./lib/i18n";
import { getHomeData } from "./lib/home-data";
import { BreakingStrip } from "./components/BreakingStrip";
import { StreamBand } from "./components/StreamBand";
import { StreamCard } from "./components/StreamCard";
import { EarlierFeed } from "./components/EarlierFeed";
import { SubscribeBar } from "./components/SubscribeBar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { lang, t } = await getDict();
  const { breaking, wireTop, radarTop, notes, earlierAlerts } = await getHomeData(lang);
  // compose: BreakingStrip → masthead → StreamBand(Wire wireTop) → StreamBand(Radar radarTop)
  //          → StreamBand(Daily notes) → EarlierFeed(earlierAlerts) → SubscribeBar
  // (markup + classes per design/home-mockup-v4.html; cards via <StreamCard variant=…>)
  // Wire band: cardMode(a)==="image" ? <StreamCard variant="wire"…/> : <AlertRow…/>  (decision C)
}
```

Implement the full JSX following the mockup. Use `cardMode` to pick image card vs compact row inside the Wire band (decision C — no fake images).

- [ ] **Step 3: Verify build + visual review**

Run: `pnpm lint && pnpm build && pnpm dev`
Expected: `/` shows breaking strip (if a ≥4 alert exists) + masthead + three bands + Earlier feed + bottom subscribe bar; matches `home-mockup-v4.html`. Toggle `EN/中` — EN page shows no Chinese.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/lib/i18n.ts
git commit -m "feat(bl026): editorial Home (today-at-a-glance + earlier feed + subscribe bar)"
```

---

## Phase 3 — Component standards + secondary-page timelines

### Task 7: Refactor `AlertCard` into dual-mode

**Files:**
- Modify: `app/components/AlertCard.tsx`
- Modify: `app/wire/page.tsx`

- [ ] **Step 1:** Have `AlertCard` delegate: `cardMode(a) === "compact"` → render `<AlertRow a={a} t={t}/>`; else render the existing image-card body (apply the larger-image + dual-mode standards from the spec). Move shared `urgency`/`CAT_LABEL`/`REGION_LABEL`/`domainOf` to `app/components/alert-style.ts` (created in Task 5) and import in both.

- [ ] **Step 2: Verify** `pnpm lint && pnpm build`; `/wire` timeline now uses dual-mode cards (compact rows for no-image alerts, larger images where present).

- [ ] **Step 3: Commit**

```bash
git add app/components/AlertCard.tsx app/components/alert-style.ts app/wire/page.tsx
git commit -m "refactor(bl026): AlertCard dual-mode (image card / compact row)"
```

### Task 8: Apply card/interaction standards to `/trends` and `/daily`

**Files:**
- Modify: `app/trends/page.tsx`, `app/trends/BestsellersBoard.tsx`, `app/daily/page.tsx`

- [ ] **Step 1: `/daily`** — render the published notes as a dated timeline (newest first) reusing the bucket-header rhythm (sticky date headers) and the larger card standard (image + kind tag + title + dek). Keep existing data (`getPublishedNotes`).

- [ ] **Step 2: `/trends`** — bump Radar product images to the larger standard (top 16:10 image card), platform label on the image, keep boards; align section headers to the new `StreamBand`-style headers (display title + tick) and button sizing (filters/chips ≥36px, visible borders — per spec component standards).

- [ ] **Step 3: Verify** `pnpm lint && pnpm build`; visual check both pages.

- [ ] **Step 4: Commit**

```bash
git add app/trends/page.tsx app/trends/BestsellersBoard.tsx app/daily/page.tsx
git commit -m "feat(bl026): card + interaction standards on Radar & Daily; Daily timeline"
```

---

## Phase 4 — i18n completeness + final verification

### Task 9: i18n audit + final pass

**Files:** `app/lib/i18n.ts` and any component with a literal string.

- [ ] **Step 1:** Grep new components for hardcoded user-facing strings: `grep -rnE '>[A-Za-z]{3,}' app/components app/page.tsx`. Route every one through `Dict`. Confirm the EN dict has **no Chinese characters**: `grep -P "[\x{4e00}-\x{9fff}]" <(node -e "…print en dict…")` — simpler: visually confirm the `en` object. Confirm ZH mirrors exist for every new key.

- [ ] **Step 2: Full verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: lint clean, all tests green (incl. `home-select`), build succeeds.

- [ ] **Step 3:** Manual pass per spec "Goals": (1) focus — breaking+masthead+bands give a clear top; (2) buttons ≥36px and look clickable; (3) Earlier rows are scannable; (4) Wire/Radar top images are large; (5) a first-time EN visitor sees product context, no Chinese.

- [ ] **Step 4: Commit**

```bash
git add app/lib/i18n.ts app/components app/page.tsx
git commit -m "chore(bl026): i18n audit (EN zero-Chinese) + final verification"
```

---

## Self-review notes (coverage)

- Routing `/`→Home, Wire→`/wire`, admin out of nav → Task 1, 2.
- Scalable top nav + account cluster → Task 2.
- Breaking strip / masthead / three bands / earlier feed / subscribe bar → Task 5, 6.
- Image-forward Wire+Radar top 3 with source/platform labels; decision C fallback → Task 5 (`StreamCard`), Task 6 (cardMode branch).
- Earlier feed (filter + date buckets + load more) → Task 5 (`EarlierFeed`), reuses `bucketAlerts` (Task 1).
- Secondary timeline pages → Task 7 (`/wire`), Task 8 (`/daily`, `/trends`).
- Component-craft standards (buttons ≥36px, dual-mode cards, bigger images) → Task 2, 5, 7, 8.
- i18n EN zero-Chinese → Task 6, 9.
- Pure-fn TDD (`pickBreaking`/`topAlerts`/`cardMode`) → Task 3.
- Out of scope (push backend, per-user subscription) → only entry points wired (nav Alerts, SubscribeBar, Upgrade).
