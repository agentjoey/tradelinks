# BL-026 — UI Redesign: Editorial Home + Timeline Secondary Pages

> Backlog: BL-026 · [[Backlog-待办#-now--next]]
> Status: design approved (2026-06-07) — visual source of truth: `design/home-mockup-v4.html`
> Predecessor: BL-009 (Radar UI). Related: BL-039 (Telegram push), BL-027 (Daily), BL-013/036 (X/Radar).

## Problem

The site is a flat pile of equal-weight content across three pages (Wire `/`, Radar
`/trends`, Daily `/daily`). Five concrete failures drive bounce:

1. **No focus** — every card has equal visual weight; the eye has nowhere to land.
2. **Interaction points too small** — nav, filters, language toggle render as 9–11px
   mono "labels"; users don't read them as clickable.
3. **Too much text per card** — list cards carry the full summary; nothing is tuned for
   fast scanning.
4. **Images too small** — thumbnails (56–96px, `hidden sm:block`) never grab attention.
5. **Flat structure, no orientation** — a first-time visitor lands with no context and is
   dropped straight into a news item, never grasping what TradeLinks is.

## Goals

- A first-time visitor understands **what TradeLinks is and how it's organized within
  seconds**, then is funneled into depth.
- One clear focal layer per surface; honest visual hierarchy.
- Interaction points that read as interactive; images that earn their place.
- A structure (global nav + homepage) that **scales** to future sections, account/profile,
  subscription push, and paid tiers without a rewrite.
- Keep the existing palette and type (user is satisfied): ink/surface, paper, amber
  `signal`, `urgent`, `calm`; Fraunces (display) / Schibsted Grotesk (sans) / IBM Plex
  Mono (`.ticker`).

Out of scope: the push/subscription **backend** (BL-039 + a future per-user subscription
epic). This spec ships the surfaces and the entry points only.

## Information architecture

### Routing

| Path | Before | After |
|------|--------|-------|
| `/` | Wire (alert firehose) | **Home** (editorial front door) |
| `/wire` | — | Wire timeline (the former `/` content) |
| `/trends` | Radar | Radar (unchanged path) |
| `/daily` | Daily | Daily (unchanged path) |
| `/admin/*` | in public nav | removed from public nav (internal entry only) |

### Global navigation — scalable top bar + account cluster

A sticky top bar, not a sidebar (sidebar was prototyped and rejected as heavier/less
refined). Two zones:

- **Content nav** (left, after wordmark): `Home · Wire · Radar · Daily · More ▾`. New
  content sections append here; overflow collapses into `More`.
- **Account cluster** (right): `Upgrade` (amber, monetization) · `Alerts`/subscribe (bell)
  · `EN/中` · **avatar** → dropdown for Profile / Billing / Settings / Sign out.

This keeps the editorial surface clean while giving SaaS features (billing, profile, push
config) an infinitely extensible home in the avatar dropdown. RSS moves to the footer.

## Home `/` — "intelligence briefing", not a lone article

Top to bottom (see `design/home-mockup-v4.html`):

1. **Breaking strip** (conditional) — a slim full-width urgent bar: the single top
   `urgency ≥ 4` alert from the last 24h. If none qualifies, the strip is omitted. This
   preserves "breaking-first" without a full-screen hero burying orientation.
2. **Masthead** — one display headline + one sentence stating the value proposition and
   naming the three streams. This is the orientation anchor.
3. **Today at a glance** — three stream **bands**, each = section header (name + sublabel +
   count + `See all →`) over the stream's top items:
   - **Wire** (real-time alerts): top 3 as **image-forward cards** *where an image exists*;
     an item with no usable image falls back to a **compact row inside the band** (decision
     C — never a placeholder/fake image). Meta shows urgency tag, category, region, and the
     **source** (e.g. Federal Register, FreightWaves).
   - **Radar** (bestsellers & social): top 3 as **image-forward cards**; image carries the
     rank badge and the **platform** label (Amazon / TikTok / X); body shows BSR/likes.
   - **The Daily**: latest 1–2 original briefs (image + kind tag + title + date).
4. **Earlier** — the page continues past today. A filterable, date-bucketed feed
   (`All · Wire · Radar · Daily` chips; sticky `Yesterday / <date>` headers; `Load
   earlier`). Items here use the **compact row** treatment (dense, scannable). This is what
   makes the home a real scrollable surface rather than a one-screen dashboard.
5. **Floating subscribe bar** — for non-subscribed users only, a dismissible bar pinned to
   the bottom inviting push setup (links to the same destination as the nav `Alerts`).

The three bands are **data-driven** (render N streams from a config), so adding a fourth
section or slotting a promo is additive, not structural.

### Home selection logic (pure, unit-tested)

- `pickBreaking(alerts, now)` → the top `urgency ≥ 4` alert within 24h, else `null`
  (urgency desc, then recency).
- `topPerStream(items, n)` → first `n` after sorting (urgency/recency for Wire, rank for
  Radar, recency for Daily). Excludes the breaking item from Wire's band to avoid dupes.
- `cardMode(item)` → `"image"` when the item has a usable image, else `"compact"`.
- Earlier feed reuses the existing `bucketAlerts` date-bucketing (extended to accept a
  stream filter) — no new bucketing logic.

## Secondary pages — timeline design

Wire / Radar / Daily detail pages keep a **chronological timeline**: the existing Wire
date-bucket pattern (`Last 1h / 4h / 8h / Today / Yesterday / <date>`, sticky bucket
headers) is the shared template.

- **Wire `/wire`** — already this pattern; gains the component-craft standards below.
- **The Daily `/daily`** — articles laid out as a dated timeline (newest first).
- **Radar `/trends`** — keeps its boards, but the feed/movement view adopts the same
  bucketed-timeline rhythm and card standards for consistency.

## Component-craft standards (apply across all surfaces)

- **Interaction points** — min hit height ~36–40px; nav/filters/toggles render as buttons
  or pills with visible border/background, ≥12–14px text, clear active (filled amber) and
  hover states. `See all` / `Load earlier` / language toggle are obvious buttons.
- **Cards — dual mode**:
  - *Image card* (has image): 16:10 lead image, display title, one-line dek max, compact
    meta. Full summary lives on the destination/detail, not the list.
  - *Compact row* (no image — most regulatory alerts): urgency rail + tag + title + meta +
    optional one-line; `actionRequired` collapses to a single amber line. Used in the
    Earlier feed and secondary timelines.
  - No-image items **never** render an empty/placeholder image box. (Open question below
    on image fallback for image-forward bands.)
- **Images** — list thumbnails grow; image-forward band/Radar cards use a top 16:10 image;
  images show on mobile too (drop `hidden sm:block` for card mode).
- **i18n** — the English surface contains **zero Chinese**; every label (`Today at a
  glance`, `See all`, `Breaking`, `Earlier`, `Upgrade`, stream sublabels) is an i18n key,
  with the Chinese surface mirroring. No mixed-language UI.

## Affected code

- `app/layout.tsx` — top nav rebuild (content nav + account cluster), admin links removed,
  RSS → footer.
- `app/page.tsx` — becomes Home (breaking strip + masthead + three bands + Earlier feed +
  floating bar); current Wire body moves to **`app/wire/page.tsx`** (+ `bucketAlerts`
  relocated/shared).
- `app/components/` — new: `BreakingStrip`, `StreamBand`, `StreamCard` (image mode),
  `AlertRow` (compact mode), `EarlierFeed` (filter + buckets), `SubscribeBar`, `AccountNav`.
  Refactor `AlertCard` into the dual-mode pair.
- `app/trends/*`, `app/daily/*` — adopt timeline rhythm + card standards.
- `app/lib/i18n.ts` — new keys for all of the above (EN + ZH).
- New pure module (e.g. `app/lib/home.ts` or `src/home/select.ts`) for `pickBreaking` /
  `topPerStream` / `cardMode`.

## Testing

Per project convention: pure functions get TDD (red-green-refactor); pages/layout are not
unit-tested.

- `pickBreaking` — picks top urgency≥4 within 24h; returns null when none; dedupe vs Wire band.
- `topPerStream` — correct ordering and count per stream.
- `cardMode` — image vs compact based on presence of a usable image.
- Earlier feed filter + bucketing — reuse/extend `bucketAlerts` tests with a stream filter.

## Rollout

1. Routing + nav shell (`/`→Home shell, Wire→`/wire`, account cluster, admin out of nav).
2. Home content: breaking strip, masthead, three bands, Earlier feed, floating subscribe bar.
3. Component-standards retrofit on Wire/Radar/Daily + timeline alignment.
4. i18n keys (EN/ZH) throughout. Palette/type unchanged.

## Open questions / follow-ups

- ~~Image fallback for image-forward Wire band~~ — **resolved (C, 2026-06-07)**: a Wire
  item with no usable image renders as a compact row inside the band; no placeholder/fake
  image. The band is therefore a mix of image cards and compact rows.
- Per-user subscription persistence + the push backend are **BL-039** and a future
  subscription epic — this spec only wires the entry points (nav `Alerts`, floating bar,
  `Upgrade`).
