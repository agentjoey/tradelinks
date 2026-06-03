# SPEC: Data Model

> Version: 1.0 | 2026-06-03 | Owner: Sprint 001 T1
> Source of truth for `prisma/schema.prisma`. Postgres 16 + `pg_trgm`.

## Enums

```
Region        = north_america | europe | southeast_asia | middle_east | latin_america | australia_nz
Category      = regulatory | platform_policy | logistics | trend | industry | tip
Adapter       = rss | fetch | scrapling          // scrapling = Python service (ADR-002)
ItemStatus    = raw | processed | filtered | failed
AlertStatus   = pending_review | published | rejected
Tier          = free | pro | team | enterprise
PushChannel   = email | telegram | slack
```

## Tables

### `sources` — source registry
| Field | Type | Notes |
|-------|------|-------|
| id | String @id | slug, e.g. `B01`, `F09` |
| name | String | |
| url | String | |
| adapter | Adapter | rss / fetch / scrapling |
| frequencyCron | String | e.g. `0 */4 * * *` |
| language | String | ISO 639-1, e.g. `en`,`zh`,`pt` |
| regions | Region[] | |
| platforms | String[] | freeform: `amazon`,`tiktok-shop`,… |
| categoryHint | Category? | prior, AI may override |
| isActive | Boolean @default(true) | |
| lastCrawledAt | DateTime? | |
| lastOkAt | DateTime? | last successful (non-blocked) crawl |
| consecutiveFailures | Int @default(0) | for circuit-breaker / alerting |
| createdAt / updatedAt | DateTime | |

### `items` — ingested + processed units
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| sourceId | String | FK → sources |
| url | String @unique | dedup level 1 (exact URL) |
| urlHash | String @unique | sha256(url), faster unique lookups |
| title | String | original-language title |
| titleEn | String? | translated; null if source already EN |
| summaryEn | String? | LLM EN summary (set in T4) |
| rawContent | Json? | adapter raw payload |
| publishedAt | DateTime | from source (fallback crawledAt) |
| crawledAt | DateTime @default(now()) | |
| status | ItemStatus @default(raw) | |
| regions | Region[] | set by AI (T2 of Sprint 002) |
| platforms | String[] | |
| category | Category? | |
| lang | String | detected source language |
| isDuplicate | Boolean @default(false) | dedup level 2 |
| clusterId | String? | FK → clusters (same-event grouping) |
| urgencyScore | Float? | 0.0–5.0, set Sprint 002 |
| impactScope | String? | |
| recommendation | String? | |

Indexes:
- `@@index([sourceId, crawledAt])`
- `@@index([status])`
- `@@index([publishedAt])`
- GIN trigram on `title` and `titleEn` (raw SQL migration; Prisma can't express directly)
- `clusterId` index

### `clusters` — same-event grouping (dedup level 3)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| representativeItemId | String | the "best" item shown |
| sourceUrls | String[] | all source urls merged |
| createdAt | DateTime | |

### `alerts` — classified + scored alert (Sprint 002+)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| clusterId | String? | |
| title | String | |
| summary | String | EN |
| urgencyScore | Float | 0.0–5.0 |
| regions | Region[] | |
| platforms | String[] | |
| category | Category | |
| affectedSkus | String[] | optional |
| actionRequired | String? | "what to do" |
| sourceUrls | String[] | |
| status | AlertStatus @default(pending_review) | |
| publishedAt | DateTime? | |
| reviewedBy | String? | |
| createdAt | DateTime | |

Index: `@@index([status, urgencyScore])`, `@@index([publishedAt])`

### `trend_snapshots` — daily time-series (Sprint 004)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| date | DateTime @db.Date | |
| region | Region | |
| category | Category? | |
| keyword | String | |
| rankAmazonBsr | Int? | |
| trendsScoreGoogle | Int? | 0–100 |
| tiktokMentionCount | Int? | |
| signalStrength | Float? | 0–1 |

Unique: `@@unique([date, region, keyword])`

### `trend_signals` — cross-region diffusion (Sprint 004)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| keyword | String | |
| originRegion | Region | |
| spreadingTo | Region[] | |
| confidence | Float | 0–1 |
| signalBasis | String | human-readable rationale |
| firstSeenAt | DateTime | |

### `users` (Sprint 005)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| email | String @unique | |
| tier | Tier @default(free) | |
| stripeCustomerId | String? | |
| subRegions | Region[] | subscription filter |
| subPlatforms | String[] | |
| subCategories | Category[] | |
| pushChannels | PushChannel[] | |
| telegramChatId | String? | |
| slackWebhookUrl | String? | |
| createdAt | DateTime | |

### `keyword_watches` (Sprint 005)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| userId | String | FK |
| keyword | String | |
| isActive | Boolean @default(true) | |
| createdAt | DateTime | |

## Migration Notes

- `pg_trgm` extension + GIN indexes go in a raw-SQL follow-up migration:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX items_title_trgm ON items USING GIN (title gin_trgm_ops);
  CREATE INDEX items_title_en_trgm ON items USING GIN (title_en gin_trgm_ops);
  ```
- Local dev has no Postgres (no docker). Generate migration SQL offline via
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
  Real `migrate deploy` runs against Railway Postgres at deploy time.
