# BL-026 Home Editorial v2 (mining-technology layout) — Design

**Status:** Approved (mockup `design/home-mockup-v9.html`, renders v7–v9)
**Supersedes the top half of:** `2026-06-07-bl026-ui-redesign-design.md` (the three-equal-StreamBand "glance" + standalone EarlierFeed).

## Goal

Rework the homepage into a wider, editorial front page modelled on
mining-technology.com: a **lead-hero + 2 secondary highlights + live Latest
rail** cluster on top, then **visually distinct** stream sections (no more three
identical 3-up grids), with the "Earlier" feed **folded into each section**. Also
give the X **hot-topics** track (`getHotTopicsX`) a home on the front page — it
was previously only on `/trends`.

## Problems addressed (from prior rounds)

- Landing on a lone article with no context → top cluster shows lead + secondary + live multi-stream Latest.
- Repetitive/​tiring layout (three identical bands) → each section gets its own layout.
- Too much side whitespace → container widened `max-w-[64rem]` → `max-w-[88rem]`.
- Hero too tall → hero image `2:1`, source line merged into the kicker, text vertically centered.
- X daily intel invisible on home → new **Hot on X** band + X rows mixed into the Latest rail.

## Layout (top → bottom)

1. **Masthead** — h1 + sub (unchanged copy).
2. **Top cluster** `lg:grid-cols-12`, all columns equal height:
   - **Lead hero** `col-span-6` — `2:1` image, `★ Top story` corner, kicker line `Tier · Category · Regions · Source · time`, 27px display headline, 2-line dek.
   - **Secondary highlights** `col-span-3` — 2 stacked cards (`flex-1`), each top image `16:9` + kicker + headline.
   - **Latest rail** `col-span-3` — live header (ping dot), chronological mixed rows (Wire=urgent dot, Radar=signal dot, X=calm dot + `@handle`), `See all` pinned bottom.
3. **Wire** — *featured + list*: featured `col-span-5` image card; list `col-span-7` rows with 16×16 thumb (today + earlier folded in).
4. **Radar** — *#1 leader + grid*: leader `col-span-4` square card (#rank badge); `col-span-8` grid of 6 movers.
5. **Hot on X** — *discussion cards*: `lg:grid-cols-3` text-forward cards, teal left border, `Category · ♥likes`, headline, 2-line whyHot, `@author · 🔁 · X`.
6. **Daily Insight** — asymmetric side-image cards (kept), `lg:grid-cols-3`, 3 notes.
7. **Subscribe bar** — floating (unchanged).

Removed from home: `BreakingStrip` (hero replaces it) and the standalone
`EarlierFeed` (folded into Wire list / Radar grid).

## Data (`getHomeData`)

Parallel fetch adds `getHotTopicsX()` alongside the existing
`getAlerts/getBestsellers/getViralX/getPublishedNotes`. Derivations:

- **hero**: `pickHero(alerts, now)` — top alert by `(hasImage, urgency, recency)` within 48h, **not** limited to urgency≥4 (high-scored news qualifies, not only 预警). Falls back to the latest Daily note when there are zero alerts → `HeroItem = {kind:"alert",alert} | {kind:"note",note}`.
- **secondary**: next 2 alerts by the same order, excluding hero.
- **latest**: `buildLatest(alerts, viral, topics, n=8)` — unified rows from Wire alerts + viral-X products + X hot-topics, sorted by `createdAt` desc. (Amazon bestsellers carry no per-item time → excluded from Latest, still shown in the Radar band.)
- **wireFeatured / wireList**: featured = first hero-eligible alert with image not already used; list = next ~5 alerts.
- **radarLeader / radarGrid**: leader = top product (rank #1 / hottest); grid = next 6.
- **hotTopics**: `getHotTopicsX()` top 6.
- **notes**: top 3.

### Supporting DB change

`recentXItems` already selects the Item row; add `createdAt` to its `select` and
expose `createdAt: Date` on `ViralXRow` and `HotTopicXRow` so `buildLatest` can
sort X items chronologically. No schema change.

## Pure functions (TDD — `app/lib/home.ts`)

- `pickHero(alerts, now, windowMs=48h): AlertRow | null` — `(hasImage desc, urgency desc, recency desc)` within window; null if empty.
- `buildLatest(alerts, viral, topics, n): LatestItem[]` — merge + sort by time desc, take n. `LatestItem = {kind:"wire"|"radar"|"x", time, title, href, author?, tier?}`.
- Keep `cardMode`, `topAlerts`; `pickBreaking` retired from the home (left in file until callers gone).

## Components

- New: `HeroLead`, `SecondaryHighlights`, `LatestRail`, `HotOnX`, `SectionHeader` (shared header: accent tick + title + sublabel + See all).
- Reworked `StreamBand` → replaced by per-section layouts using `SectionHeader`; `WireSection` (featured+list), `RadarSection` (#1+grid). `RadarCard`/`DailyCard` reused; add a compact Wire list-row + secondary-card.
- Delete from home usage: `BreakingStrip`, `EarlierFeed` (+ remove files if no other callers).

## i18n

- Rename EN `streamDaily`/`nav.daily` → "Daily Insight"; ZH → "每日洞察"/"洞察".
- Add: `topStory`, `latest`, `streamX` ("Hot on X" / "X 热议") + `streamXSub`, reuse `hotXEmpty`.
- EN page stays zero-Chinese.

## Width

`app/layout.tsx` header/main/footer `max-w-[64rem]` → `max-w-[88rem]`.

## Testing

- TDD `test/home-select.test.ts`: add `pickHero` (image preference, urgency over recency, window cutoff, empty→null) and `buildLatest` (sort by time desc, kind tagging, take n, empty inputs).
- Pages/components/DB: not unit-tested (project convention). Verify via `tsc`, full `pnpm test`, and dev-server smoke (EN+ZH, EN zero-CJK).

## Out of scope

Monetization/Pro/Reports zone; secondary "highlight" count change (stays 2);
renaming Wire/Radar (kept this round per user).
