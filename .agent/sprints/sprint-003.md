# Sprint 003

Goal:      英文网站上线（时间线 + 区域过滤）+ 每日日报生成 + 邮件推送跑通
Period:    2026-07-01 ~ 2026-07-15
Version:   v0.4.0
Assignee:  claude

## Tasks

### T1: Next.js 网站骨架 — Alert 时间线 [HIGH] [claude]
**Status:** ✅ Done（核心；read-state/24h-delay 延后）
**Epic:** EP-005
**Acceptance:**
- [x] `/` 时间线：urgencyScore 角标 + region/platform 标签 + 时间 + 摘要 + action + source（实测渲染 de minimis）
- [x] 过滤器 region + category chips（实测 ?category=regulatory→1、?region=europe→0）；platform 经 API 支持
- [x] 游标分页（take+1/Load more，不用 offset）
- [~] 已读置灰 localStorage → 延后（纯前端小项，非阻塞）
- [~] Free 24h 延迟 → 延后 Sprint 005（依赖 auth）

### T2: REST API 公开端点 v1 [MED] [claude]
**Status:** ✅ Done（核心；openapi/rate-limit/by-date 延后）
**Epic:** EP-007
**Acceptance:**
- [x] `GET /api/public/alerts` 支持 `?region=&category=&platform=&take=&cursor=`（实测返回 2 条）
- [x] `GET /api/public/daily` 最新日报（JSON + `?format=text`）
- [x] 强制 browser UA（bot UA → 403 实测，browser → 200）
- [~] `/api/public/daily/:date` 历史日报 → 延后（需日报快照表）
- [~] OpenAPI `/api/openapi.json` → 延后
- [~] 限流 600/min/IP → 延后（serverless 需 KV/edge 存储）

### T3: 每日日报生成（五段式）+ Resend 邮件 [HIGH] [claude]
**Status:** ✅ Done（生成已验证；真实发信 gated on RESEND key）
**Epic:** EP-006
**Acceptance:**
- [x] `app/lib/digest.ts` buildDigest（Top Alerts + 5 段：Regulatory/Platform/Logistics/Trend/Picks&Tips）+ 7 单测
- [x] `/api/public/daily`(JSON) + `scripts/send-digest.ts` dry-run 实测真实 Neon 数据（de minimis 进 Top Alerts）
- [x] Resend 发送（text + HTML）已实现，无 key 时 dry-run
- [~] cron 每日 00:00 触发 → 延后（部署时挂 pg-boss schedule / 平台 cron）
- [~] 真实发信验证 → gated on RESEND_API_KEY

### T4: RSS Feed 输出 [MED] [claude]
**Status:** ✅ Done
**Epic:** EP-007
**Acceptance:**
- [x] `/feed.xml` 标准 RSS 2.0（最近 50 条，含 urgency/category/action，实测有效 XML）
- [x] `/feed.xml?region=&category=` 过滤（复用 getAlerts）
- [~] Feedly/NetNewsWire 手动订阅验证 → 部署后手动确认

### T5: 审核 UI `/admin/review` [MED] [claude]
**Status:** ✅ Done
**Epic:** EP-005
**Acceptance:**
- [x] `/admin/review` 列出 `pending_review`（实测渲染 "Review queue"/"Queue empty"）
- [x] approve/reject server actions 调用 `alerts/review.ts` + revalidatePath
- [x] approve → published 后从列表消失（实测队列已空）
- [~] 注：管理页暂无鉴权，Sprint 005 加 auth 后限制访问

> 注：T3 邮件发送需 RESEND_API_KEY（未 provision）；日报生成逻辑可建+单测，
> 真实发信留待 key 到位。Sprint 顺延，无固定日期。

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | UI 设计前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 004
