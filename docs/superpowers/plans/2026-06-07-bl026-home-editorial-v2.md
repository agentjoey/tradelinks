# BL-026 Home Editorial v2 — Implementation Plan

> **For agentic workers:** use superpowers:executing-plans. Steps use `- [ ]` tracking.

**Goal:** Rebuild the homepage as a wide editorial front (lead hero + 2 secondary + live Latest cluster, varied sections, Earlier folded in, new Hot-on-X band) per `design/home-mockup-v9.html`.

**Architecture:** RSC page composes server-fetched data (`getHomeData`) into client-safe presentational components. Pure selection logic in `app/lib/home.ts` (TDD). X rows gain `createdAt` so Latest is truly chronological.

**Tech:** Next 14 App Router, Tailwind (brand tokens), vitest. Pages/DB/components not unit-tested (project convention); pure fns are.

---

### Task 1: Expose `createdAt` on X rows
**Files:** Modify `src/social/db.ts`
- [ ] Add `createdAt: true` to the `recentXItems` `select`.
- [ ] Add `createdAt: Date` to `ViralXRow` and `HotTopicXRow`; map `createdAt: it.createdAt` in both `getViralX` and `getHotTopicsX`.
- [ ] `pnpm exec tsc --noEmit` clean for `src/social/db.ts`.

### Task 2: `pickHero` (TDD)
**Files:** `app/lib/home.ts`, `test/home-select.test.ts`
- [ ] Test: prefers an alert with image over a higher-urgency one without; within window picks urgency desc then recency; ignores alerts older than window; `[]`→null.
- [ ] Run → fail.
- [ ] Implement `pickHero(alerts, now, windowMs=48*3_600_000)`: filter to window, sort by `(hasImage desc, urgency desc, recency desc)`, return `[0] ?? null`.
- [ ] Run → pass.

### Task 3: `buildLatest` (TDD)
**Files:** `app/lib/home.ts`, `test/home-select.test.ts`
- [ ] Define `LatestItem = { kind:"wire"|"radar"|"x"; time:number; title:string; href:string; author?:string; tier?:number }`.
- [ ] Test: merges wire+radar+x, sorts by time desc, tags kind, respects `take n`, empty inputs→`[]`.
- [ ] Run → fail.
- [ ] Implement `buildLatest(alerts, viral, topics, n)`: map each source to `LatestItem` (wire time=createdAt, tier=urgency, href=sourceUrls[0]; radar=viral createdAt, href=link; x=topic createdAt, href=link, author), concat, sort time desc, slice n.
- [ ] Run → pass; full `pnpm test` green.

### Task 4: Rewrite `getHomeData`
**Files:** `app/lib/home-data.ts`
- [ ] Add `getHotTopicsX` import + to `Promise.all`.
- [ ] New `HomeData`: `hero: HeroItem`, `secondary: AlertRow[]`, `latest: LatestItem[]`, `wireFeatured: AlertRow|null`, `wireList: AlertRow[]`, `radarLeader: ProductCard|null`, `radarGrid: ProductCard[]`, `hotTopics: HotTopicXRow[]`, `notes`.
- [ ] `HeroItem = {kind:"alert";alert:AlertRow} | {kind:"note";note:DailyNoteCard}`; build via `pickHero`; fallback to `notes[0]` when null.
- [ ] secondary = `topAlerts(alerts,2,heroId)`; wireFeatured = first remaining alert with image; wireList = next 5 remaining; radarLeader = products[0]; radarGrid = products.slice(1,7); latest = `buildLatest(alerts, viral, topics, 8)`; hotTopics = topics.slice(0,6); notes = top 3.
- [ ] `tsc` clean.

### Task 5: i18n
**Files:** `app/lib/i18n.ts`
- [ ] EN: `streamDaily`→"Daily Insight", `nav.daily`→"Daily Insight"; add `topStory:"Top story"`, `latest:"Latest"`, `streamX:"Hot on X"`, `streamXSub:"What sellers & operators are discussing"`.
- [ ] ZH: `streamDaily`→"每日洞察", `nav.daily`→"洞察"; `topStory:"头条"`, `latest:"最新"`, `streamX:"X 热议"`, `streamXSub:"卖家与从业者正在讨论什么"`.
- [ ] Add the new keys to the `Dict` type. `tsc` clean.

### Task 6: Shared + new components
**Files:** create under `app/components/`
- [ ] `SectionHeader.tsx` — accent tick + title + sublabel + `See all →` (server component).
- [ ] `HeroLead.tsx` — renders `HeroItem` (alert: 2:1 image, Top-story corner, kicker w/ source+time merged, headline, dek; note: brief/roundup variant). Uses `tierStyle`, `CAT_LABEL`, `REGION_LABEL`, `hhmm`, `domainOf`, img-proxy.
- [ ] `SecondaryHighlights.tsx` — 2 stacked top-image cards from `AlertRow[]`.
- [ ] `LatestRail.tsx` — live header + `LatestItem[]` rows (dot color by kind, x shows author) + See-all.
- [ ] `WireSection.tsx` — `SectionHeader` + featured card + list rows (thumb).
- [ ] `RadarSection.tsx` — `SectionHeader` + leader square card + 6-grid (reuse `RadarCard`).
- [ ] `HotOnX.tsx` — `SectionHeader` + discussion cards from `HotTopicXRow[]`.
- [ ] `tsc` clean. Keep all props plain-string/serializable (no functions to client islands).

### Task 7: Rewrite `app/page.tsx`
**Files:** `app/page.tsx`
- [ ] Compose: masthead → top cluster grid (HeroLead + SecondaryHighlights + LatestRail) → WireSection → RadarSection → HotOnX → Daily Insight band → SubscribeBar.
- [ ] Drop `BreakingStrip`, `EarlierFeed`, `StreamBand` imports.
- [ ] `tsc` clean.

### Task 8: Widen layout
**Files:** `app/layout.tsx`
- [ ] header/main/footer `max-w-[64rem]` → `max-w-[88rem]` (3 occurrences).

### Task 9: Cleanup
**Files:** delete `app/components/BreakingStrip.tsx`, `app/components/EarlierFeed.tsx` (confirm no other importers via grep first); keep `StreamBand.tsx` only if still imported elsewhere else delete.
- [ ] grep importers; remove unused files.

### Task 10: Verify
- [ ] `pnpm exec tsc --noEmit` clean.
- [ ] `pnpm test` all green.
- [ ] `pnpm dev` smoke: `/` EN+ZH 200; EN page zero CJK; nav/sections render.
