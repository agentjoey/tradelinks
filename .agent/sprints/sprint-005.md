# Sprint 005

Goal:      MVP 上线 Vercel + Web 端体验优化（时间线/紧急度标识/标题跳转/原文配图）
Period:    2026-06-04 ~
Version:   v0.6.0
Assignee:  claude

> 前序已完成（未单列 sprint）：Vercel 部署上线、5 死源修复、Amazon BSR 多区+多品类、
> JsonAdapter(B03)、Temu/Ali 反爬评估、MAX_ITEMS_PER_CRAWL cap、本地 worker 实跑(12→31 alerts)。

## Tasks（Web 体验优化，用户反馈）

### T1: 时间线分段展示 [HIGH] [claude]
**Status:** 🔲 Todo
**Acceptance:**
- [ ] feed 按日期分组（Today / Yesterday / 具体日期 分隔头），信息流按时间切割
- [ ] 组内按发布时间倒序

### T2: 重设紧急度标识 [HIGH] [claude]
**Status:** 🔲 Todo
**Acceptance:**
- [ ] 替换含义不清的 "2.0 Watch"/"1.0 Note"
- [ ] 用面向卖家、语义清晰的三档：Act now(≥4,红) / Worth knowing(2-4,琥珀) / FYI(<2,灰)
- [ ] 数字分作为次要信息或去除

### T3: 标题点击直达 source [MED] [claude]
**Status:** 🔲 Todo
**Acceptance:**
- [ ] 卡片标题即链接（新窗口打开 sourceUrls[0]），去掉单独的 source 按钮
- [ ] 多源时附 "+N sources" 次要标注

### T4: 原文标题配图 [HIGH] [claude]
**Status:** 🔲 Todo
**Acceptance:**
- [ ] Item/Alert 增 `imageUrl`（迁移）；og:image 提取器（文章页 meta）
- [ ] processor 抓 og:image 存 item；alert 生成时拷贝；正文下展示
- [ ] `/api/img-proxy` 代理外链图（绕 hotlink/referer + 失败优雅降级）
- [ ] 回填现有 31 条 alert 的图

## Next Sprint Candidates
- [ ] [EP-008] Auth(NextAuth)+`/admin/review` 鉴权 + Stripe 变现
- [ ] worker 常驻部署（GCP e2-micro / Fly / Railway）

## Sprint 回顾
**Done:** — ｜ **Deferred:** —
