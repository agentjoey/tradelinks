# Design

TradeLinks Phase 1 Public Intelligence — the public, indexable, evidence-traceable surface.

This file records the decided visual system. It is the contract the Public Intelligence
implementation tasks build against. It does not restate PRODUCT.md; read that first for
users, positioning, and promise boundaries.

## Register

`product`. Design serves the product. The reader is in a task — deciding whether a rule is
real and whether it applies to them — not being marketed to. Earned familiarity beats
novelty. The bar: a seller fluent in Stripe/Linear/GOV.UK-class tools should trust this at
a glance and never pause at a subtly-off component.

## Decided direction

**Direction A palette × Direction B3 card structure**, approved by the Human Owner on
2026-08-02 from rendered comparison (`design/phase1-public-intelligence-directions.html`,
screenshots in `design/shots/direction-probe/`).

- **Palette and typographic voice** continue the shipped BL-045 identity. Nothing about the
  colour system is reinvented; the semantic tokens in `app/globals.css` are already
  contrast-verified and stay authoritative.
- **Content structure** follows the Evidence Card lane: a conclusion and the sources it
  rests on are one indivisible unit. Density varies with readiness — a Verified entry opens
  its evidence, a Monitored entry states its own limit in prose rather than quietly ranking
  lower.

Rejected, with reasons recorded so they are not relitigated:

| Lane | Why not |
|---|---|
| A alone | The instrument-desk metaphor implies real-time. Phase 1 explicitly does not promise real-time behaviour. |
| B1 Public Record alone | Best density and citability, but evidence sits one click away from the conclusion, which inverts the product's core principle. |
| B2 Reference Manual | Assumes repeat lookup as the primary behaviour and sheds two of three columns at 390px. Reads as an API manual, not a public record. |

## Default theme

**Light is the default.** Dark remains a first-class alternative behind the existing
`tl-theme` cookie.

This inverts the current implementation. `app/globals.css` today declares dark values on
`:root` and light values on `[data-theme="light"]`. Phase 1 flips this: light values move to
`:root` (`color-scheme: light`), dark values move to `[data-theme="dark"]`. The cookie
mechanism, the SSR `data-theme` attribute, and the localStorage fallback script are
unchanged — only which branch is the default.

Scene sentence that forces it: *a seller finds this page from a search result at their desk
in daylight, needs to judge within seconds whether the rule is real, and may print it or
forward it to a colleague.* Light wins on search-result landing, print, and screenshot
forwarding. `prefers-color-scheme` stays deliberately unread — theme is a user choice, not
an ambient guess.

## Colour

Restrained. The palette is the shipped semantic token set; no new hues are introduced.
Colour is never decorative here — each of the four carries exactly one meaning.

| Token | Meaning | Never used for |
|---|---|---|
| `--c-calm` (teal) | Evidentiary strength: `VERIFIED` readiness, `PRIMARY` evidence marker | Success feedback, decoration |
| `--c-signal` (amber) | Brand and interaction: wordmark, active nav, link underlines, focus ring | Readiness, severity |
| `--c-urgent` (red) | A problem the reader must not miss: correction notice, coverage limit, overdue source, error | Urgency of the change itself |
| `--c-muted` / `--c-faint` | Metadata, `MONITORED` readiness, de-emphasis | Body prose |

Readiness is never encoded by colour alone. Every readiness state renders its literal word
(`Verified`, `Monitored`, `Experimental`, `Stale`), so the distinction survives greyscale,
colour-blindness, and print.

Verified contrast on the light canvas (`244 241 232`) and card surface (`251 249 243`):

| Pair | Ratio |
|---|---|
| `--c-ink` on canvas | 14.8:1 |
| `--c-muted` on canvas | 6.2:1 |
| `--c-faint` on canvas | 5.2:1 |
| `--c-calm` on canvas | 4.96:1 |
| `--c-signal` on canvas | 5.25:1 |
| `--c-urgent` on card surface | 4.72:1 |

Dark-theme equivalents were verified during BL-045 and are unchanged.

## Typography

Three families already loaded by `app/layout.tsx`; no webfont is added.

- **Fraunces** — headlines and canonical change titles only. Carries the editorial voice.
- **Schibsted Grotesk** — all body prose, impact statements, UI labels, buttons.
- **IBM Plex Mono** — dates, versions, readiness words, evidence hostnames, counters,
  coverage figures. Anything a reader compares column-to-column or quotes exactly.

Fixed rem scale from `tailwind.config.ts` (`label` `meta` `body` `lede` `title` `headline`).
No fluid clamp sizing: product UI is read at consistent DPI, and a headline that shrinks
inside a hub column looks worse, not better. Prose caps at 65–75ch; evidence rows and
coverage tables may run denser.

## Card anatomy

The evidence card is the primary unit across home, hubs, `/changes`, and briefings.

```
readiness word · effective date · countdown        ← mono, one line
Canonical change title                             ← Fraunces, text-wrap: balance
Who it hits, in one sentence, with the category    ← Schibsted, ≤2 lines
and platform named in bold

[ coverage-limit note, only when it applies ]      ← urgent, bordered, prose not badge

EVIDENCE                                           ← mono label
PRIMARY      Source title  host · date             ← teal marker, amber underline
PRIMARY      Source title  host · date
SUPPORTING   Source title  host · date
v3 · published … · corrected … — what changed · version history
```

Rules:

- A Verified card opens its evidence list inline. It is not behind a disclosure.
- A Monitored card states its limit in a full sentence beginning with what we cannot do
  ("We cannot verify this. Amazon's official policy page requires a seller login…"). Never a
  bare badge, never omission.
- Correction notices name what changed, not just that something changed.
- Experimental demand never renders in the same stream as canonical changes. It lives below
  a rule, under its own heading, with the non-promise restated in prose.
- No card is nested inside another card.
- No side stripe. Readiness is carried by the word plus a 1px full border. Any
  `border-left`/`border-right` above 1px is banned.

## Layout

- Public shell: skip link → `PublicNav` → `<main id="main">` → `PublicFooter`. Admin and
  public navigation never render together; each route group owns its own.
- Content column caps at `max-w-[64rem]` for reading surfaces, `max-w-[88rem]` for coverage
  and index tables.
- Responsive behaviour is structural, not fluid: nav collapses to a horizontally scrollable
  row, evidence rows wrap their kind marker, coverage tables become stacked rows. No
  horizontal page scroll at 390px, ever.
- Semantic z-index scale: `dropdown → sticky → modal-backdrop → modal → toast → tooltip`.
  No arbitrary values.

## States

Every surface ships all applicable states. Skeletons preserve heading structure so the page
does not reflow when data lands.

| Surface | Loading | Empty | Error | Stale | Restricted |
|---|---|---|---|---|---|
| Hub | skeleton preserving headings | hub hidden below Monitored | cached shell + retry | last-updated warning | n/a |
| Changes | card skeletons | "No qualified changes in this filter" | cached prior page | coverage banner | Monitored view requires explicit selection |
| Change detail | title/evidence skeleton | 404 | cached version | source-stale warning | inaccessible evidence labeled |
| Guides/Briefings | list skeleton | honest absence copy | cached list | last-review warning | draft never public |
| Coverage | row skeletons | configuration error | cached matrix | Stale badge + implication | admin details omitted |

Empty states teach the surface rather than saying "nothing here". An honest absence
("no qualified changes") is a product statement and is never padded with manufactured
volume.

## Motion

Deliberate departure from BL-045: the orchestrated masthead entrance, the scrolling wire
tape, the radar sweep glyph, and the live blip do **not** carry into the Phase 1 public IA.
They animate liveness, and liveness is the one thing Phase 1 does not promise.

What remains:

- 150–250 ms CSS state transitions on hover, focus, selection, and disclosure.
- Skeleton-to-content crossfade on data arrival.
- Nothing else. No page-load choreography, no scroll-triggered reveals.

Content is visible by default; no reveal is gated on a class-triggered transition. Every
transition has a `prefers-reduced-motion: reduce` alternative. Phase 1 adds neither React
Bits nor anime.js.

## Components

UI primitives come from the official shadcn registry: Button, Badge, Card, Tabs, Select,
Sheet, Skeleton, Tooltip, Separator. They are used as accessible unstyled primitives and
restyled with the semantic tokens above. No parallel component system is invented, and
shadcn's default palette never leaks in.

Every interactive component ships default, hover, focus, active, disabled, loading, and
error. Focus is always visible: 2px `--c-signal` outline, 2px offset.

## Language

English only for Phase 1. Existing `/zh` routes receive permanent 308 redirects to their
English equivalents. Translation data is retained for a later full-locale milestone and is
not deleted. New public copy is authored in English only; `getDict()` bilingual authoring
does not apply to the Phase 1 public IA.

## Accessibility floor

WCAG AA, and these are not negotiable at review:

- One `<h1>` per page; heading order never skips a level.
- Keyboard-operable everything; skip link is the first tab stop and visibly focuses.
- Every visual encoding has a text or `sr-only` equivalent.
- Pages remain useful with JavaScript disabled.
- No horizontal scroll at 390px.
- `prefers-reduced-motion` honoured on every transition.
