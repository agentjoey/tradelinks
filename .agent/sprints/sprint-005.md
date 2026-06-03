# Sprint 005

Goal:      物流预警 + Auth + Stripe 付费 + 关键词监控（Pro）→ MVP 公开上线
Period:    2026-08-05 ~ 2026-08-19
Version:   v1.0.0
Assignee:  claude

## Tasks

### T1: 物流运价 + 中断预警 [MED] [claude]
**Status:** 🔲 Todo
**Epic:** EP-003
**Acceptance:**
- [ ] Freightos FBX 每周快照，亚-美 / 亚-欧 / 亚-LatAm 三条航线
- [ ] 运价 7 日涨跌 > 20% → 生成 urgencyScore=3 的 logistics alert
- [ ] Lloyd's List RSS 每 4h 扫描，关键词（Suez / Panama / port strike / congestion）命中 → alert
- [ ] 物流 alert 在时间线中有 🚢 分类标签

### T2: Auth（NextAuth v5）+ 用户订阅设置 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-008
**Acceptance:**
- [ ] Email magic link 登录（Resend）
- [ ] Google OAuth 登录
- [ ] 用户可在 `/settings` 配置：感兴趣区域 / 平台 / 品类 / 推送渠道（email/Telegram/Slack）
- [ ] Free tier：访问延迟 24h alert，无推送
- [ ] Pro tier：实时 alert + 推送 + 关键词监控

### T3: Stripe 付费（Free / Pro / Team） [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-008
**Acceptance:**
- [ ] Stripe Checkout 集成，USD 定价（$0 / $29 / $149 per month）
- [ ] Stripe Webhook → 订阅状态同步到 `users.tier` 字段
- [ ] 付费用户实时访问权限生效，降级（取消订阅）24h 内降到 Free tier
- [ ] `/billing` 页面可查看和管理订阅

### T4: 关键词监控 v1（Pro 功能） [MED] [claude]
**Status:** 🔲 Todo
**Epic:** EP-009
**Acceptance:**
- [ ] Pro 用户可在 `/monitors` 添加最多 3 个关键词（品类/品牌/竞品名）
- [ ] 每次新 alert/item 摄取后，触发关键词匹配（PostgreSQL 全文 + trigram）
- [ ] 命中 → 按用户推送设置发送（email/Telegram/Slack）
- [ ] UI：关键词命中历史列表，可开关/删除监控

### T5: 上线前检查 + SEO + Landing Page [MED] [claude]
**Status:** 🔲 Todo
**Epic:** EP-005
**Acceptance:**
- [ ] Landing page 英文，清晰呈现"6大区预警 + 趋势预测"价值主张
- [ ] OG tags + meta description 完整
- [ ] Core Web Vitals：LCP < 2.5s，CLS < 0.1（Vercel Analytics 验证）
- [ ] 隐私政策 + 服务条款页面（用于 Stripe/OAuth 合规）

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | 付费产品设计前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾（v1.0.0 发版后填写）
**Done:** — ｜ **Deferred:** — → Phase 2
