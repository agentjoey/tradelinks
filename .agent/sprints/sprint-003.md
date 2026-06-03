# Sprint 003

Goal:      英文网站上线（时间线 + 区域过滤）+ 每日日报生成 + 邮件推送跑通
Period:    2026-07-01 ~ 2026-07-15
Version:   v0.4.0
Assignee:  claude

## Tasks

### T1: Next.js 网站骨架 — Alert 时间线 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-005
**Acceptance:**
- [ ] `/` 页面：Alert 时间线，每条显示 urgencyScore 角标 + region 标签 + platform 标签 + 时间 + 摘要
- [ ] 左侧/顶部过滤器：region（6 区多选）+ category（6 类）+ platform
- [ ] 游标分页（40 条/页），不用 offset
- [ ] 已读置灰（localStorage），移动端响应式
- [ ] Free 用户：24h 延迟（服务端通过 `publishedAt + 24h` 判断，无需登录）

### T2: REST API 公开端点 v1 [MED] [claude]
**Status:** 🔲 Todo
**Epic:** EP-007
**Acceptance:**
- [ ] `GET /api/public/alerts` 支持 `?region=&category=&since=&take=&cursor=`
- [ ] `GET /api/public/daily` 最新日报
- [ ] `GET /api/public/daily/:date` 指定日期日报
- [ ] OpenAPI 3.1 spec 文件生成于 `/api/openapi.json`
- [ ] 限流：600 req/min/IP，强制 browser UA（curl UA → 403）

### T3: 每日日报生成（五段式）+ Resend 邮件 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-006
**Acceptance:**
- [ ] Cron job 每日 00:00 UTC 触发日报生成
- [ ] 五段格式：🚨 Top Alerts / 📋 Regulatory Updates / 🏪 Platform News / 📈 Trend Signals / 🛒 Product Picks
- [ ] 邮件通过 Resend 发送，支持纯文本 + HTML 双格式
- [ ] 测试发送成功，邮件正确渲染

### T4: RSS Feed 输出 [MED] [claude]
**Status:** 🔲 Todo
**Epic:** EP-007
**Acceptance:**
- [ ] `/feed.xml` 输出标准 RSS 2.0，包含最近 50 条 alert
- [ ] `/feed.xml?region=europe` 支持区域过滤
- [ ] 在 Feedly / NetNewsWire 手动验证可订阅

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | UI 设计前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 004
