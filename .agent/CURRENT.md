# Current Status — TradeLinks

Version:        v0.11.0
Sprint:         006 (Ops hardening + Source-health monitoring)
Sprint Status:  ✅ 全链路稳定化 + 内容再平衡 + 源监控页上线
Last Updated:   2026-06-07 by claude-opus-4-8 (BL-026 home v2 + BL-040 GN/channelId, v0.11.0)
Sprint File:    .agent/sprints/sprint-005.md

## 🆕 本轮新增（2026-06-07）：编辑式首页 v2 (BL-026) + Google News/channelId (BL-040)

- **BL-026 编辑式首页 v2（已上线）** — 借鉴 mining-technology 的版式重做首页。
  - 顶部簇：**lead hero**(高分要闻,图为主,无则回退最新日报) + **2 张次级 highlight** + 实时 **Latest 列**(Wire+Radar+X 按时间混排)。
  - 板块差异化:Wire(featured+列表)、Radar(#1 大卡+网格)、**Hot on X**(讨论卡,给 `getHotTopicsX` 首页落点)、Daily Insight;原"Earlier"并入各板块。
  - 容器加宽 `max-w-[64rem]→[88rem]`;Daily→**Daily Insight**;纯函数 `pickHero`/`buildLatest`(TDD);X 行暴露 `createdAt`;删 `BreakingStrip`/`EarlierFeed`/`StreamBand`。
  - spec/plan：`docs/superpowers/{specs,plans}/2026-06-07-bl026-home-editorial-v2*`;mockup `design/home-mockup-v5…v9.html`。
- **BL-040 Google News 源处理 + channelId 归一化（已上线）**
  - **GN(③)**：`news.google.com/rss/articles/CBMi…` 跳转链在 **ingest** 经 Google `batchexecute` 解析为真实媒体 URL → url/urlHash、点击目标、og:image 都取真文(不再是 Google "G" logo)。`ogimage` 兜底过滤该 logo。`scripts/backfill-gnews.ts` 已修 **54/54** 现有预警(44 条拿到真图)。
  - **channelId(②)**：`resolveChannelId`(@username→数字 chat id) 稳定去重键;`alreadyPushedKeys/pushedTodayCount` 支持新旧键并集,过渡不重推。
  - 测试 **189 绿**;`tsc` 干净。
  - **待 worker 部署生效**：新抓取的 GN 文需 Railway worker 带上本次代码后才走解析(旧文已 backfill)。

## 🆕 上一轮（2026-06-07）：Telegram 频道精选推送 (BL-039 slice 1)

- **BL-039 Curated Telegram Channel Push（已完成开发，待部署）** — 每日精选 6–8 条 Wire 预警 + Radar 爆品推送到公开 Telegram 频道。
  - **纯函数**：`channel-render.ts`(HTML 渲染) + `channel-select.ts`(排序+混合+预算控制)，42 单测全覆盖。
  - **DB**：`ChannelPush` 模型(migration 0006) + `channel-db.ts`(候选收集/已推跟踪/记录)。
  - **Worker**：`channel-push-tick`(3×/天，02:00/10:00/16:00 UTC)，与 admin review 完全分离。
  - **配置**：`TELEGRAM_CHANNEL_ID`、`CHANNEL_PUSH_ENABLED`、`CHANNEL_PUSH_DAILY_MAX`(8)、`CHANNEL_PUSH_RUN_MAX`(3)、`CHANNEL_PUSH_MIN_URGENCY`(2)。
  - **待上线**：设置 `TELEGRAM_CHANNEL_ID` + `CHANNEL_PUSH_ENABLED=true` 后运行 migration 即可。

## 🆕 本轮新增（2026-06-06）：Daily Note 原创日报 + X 信源扩展

- **BL-027 Daily Note（原创日报，已上生产）** — 每日基于前一天信号生成原创编辑文章，主打 SEO 内容资产。
  - **双角色**：editor=`gemini-3.5-flash` **Flex 档**（deepseek 兜底，写深度+反 AI 腔）→ reviewer=`deepseek-v4-flash`（核事实+去 AI 腔）。
  - **两类**：`brief`(政策解读) + `roundup`(爆品选品)，各有 prompt+质量门；富信号日各出一篇。
  - **页面**：`/daily` + `/daily/[slug]` 可爬页 + `NewsArticle` JSON-LD/canonical/OG + 新增 `app/sitemap.ts`/`app/robots.ts`。署名 Agent Joey。
  - **worker**：`daily-note-tick` @ **03:30 UTC**；`DAILY_NOTE_AUTOPUBLISH` **默认 ON**(暂无审批 UI)。migration `0005_daily_notes` 已上生产。
  - 脚本：`bench-daily-note`(4 模型对比)、`daily-note-pipeline`、`daily-note-seed`。
- **X 信源扩展（已上生产 + 已 X_ENABLED）**
  - BL-013 viral/topic 两 search 轨已启用；**BL-036 curated-accounts 第 3 轨**：18 个核验账号时间线(since-cursor 增量、`X_ACCOUNTS_MAX_READS=200≈$1/天`)，**存推文原文**(BL-035 料仓雏形)。
  - 修：`extractProducts/Topics` 批量化(25/批)防 JSON 截断；`scripts/{x-accounts-probe,x-run-once,x-report}.ts`。
  - 实测：**accounts 轨信号远强于 search**(真·关税/海关/平台动向)。
- **加固**：`extractJson` 容错(尾部多余括号 + 字符串内裸控制符)；AI client 加 `editorClient()`/`reviewerClient()` + 可配超时 + Gemini OpenAI-compat(reasoning_effort:none / Flex)。
- 总测试 135 绿 / lint 0。spec：`docs/superpowers/specs/2026-06-06-daily-note-design.md`。
- **待办线**：BL-034(editor 按需检索)·BL-035(料仓+检索索引)·BL-037(账号评分→高分优先)·BL-038(products 去重 + search 降权)。明天拉 `x-report` 看首批跑批数据。

## 🚀 LIVE
- **生产**: https://tradelinks-mvp.vercel.app （Wire `/` · Radar `/trends` · **每日 `/daily`** · 审核台 `/admin/review` · 源监控 `/admin/sources`）
- **GitHub**: agentjoey/tradelinks-mvp（main）
- **DB**: Neon **production** branch `ep-mute-base-aotkza3n` / `neondb`
  - `DIRECT_URL` 也用 **pooled host**；pg-boss 连接已 pin `sslmode=verify-full`
  - **History retention 调低（~0–1h）** 控制计费存储；**勿在 Neon 上 VACUUM FULL**（会增 history/WAL）
  - schema 已加 `source_health_snapshots`（migration 0004）+ `daily_notes`（migration 0005，BL-027），均已上生产
- **部署分工**: Vercel=只读前端+API；worker + Python scraper → Railway
  - scraper 12h 才用一次，闲时 Serverless **休眠＝正常**（非崩溃）；Wire 内容不依赖 scraper

## 数据源现状（25 active / 16 disabled）— 详见 docs/specs/sources.md（live registry）
- **法规 B(5)**：B01/B02/B03/B06/B16 —— 已 4–6h→**12h** 限流降占比
- **平台 A(4)**：A02 Shopify、**A04 TikTok Shop(Google News RSS,新增)**、F04 Tamebay、A01 eBay(选择器已修)
- **物流 E(2,新增)**：E01 Supply Chain Dive、E02 FreightWaves（此前物流类目为空）
- **行业/媒体 F(4)**：**F11 EcommerceBytes(新增,平台政策主力)**、F12 Practical Ecommerce(新增)、F02、F03、F01(选择器已修)
- **爆品 D(10,BSR)**：D02/D04/D05/D06 + D30-34 —— **不进 Wire，进 Radar**；URL 按 /dp/ASIN 规范化去重（18330→268）
- **停用**：A03(消费PR非卖家政策)、D03(Movers&Shakers 无头渲染不出网格)、D01(trends-tick 专管)、反爬/死源若干
- **Wire 占比**：法规 61%→**48%**，物流 7%→12%(真源)，平台 7%→13%，行业 14%→18%

## Open Bugs（P0/P1）
🟢 无 P0/P1。
- ⚠️ `/admin/*`（review + sources）**无鉴权**，待加 Auth
- TikTok Shop 官方卖家中心需登录态（A04 用 Google News 兜底）

## 本轮硬化要点（2026-06-05）
- **稳定性**：scraper 串行(单 Chromium) + disable_resources + --disable-dev-shm-usage + 队列 batchSize=1 → 修复 driver 崩溃与日志洪水
- **成本/存储**：bestsellers 移出 Wire；BSR 12h 错峰；pg-boss 短保留(30min) → 存储 325MB→29MB
- **监控**：`/admin/sources` 源健康评分(0–100/五档) + 每日快照 + 转🔴/💀 Telegram 告警
- 工具脚本：`scripts/{health,db-size,db-cleanup,dedup-amazon}.ts`

## Next TODOs（优先级）
1. ✅ **F01/A01 恢复验证**：scraper 00:00 UTC 唤醒正常,F01 已恢复(选择器修复生效);A01 06:00 UTC cron(低频)
2. ✅ **/admin/* 鉴权已上线**（ADR-006，Neon Auth=Better Auth + Google OAuth + `ADMIN_EMAILS` 白名单 + 邀请制）
   - 踩坑沉淀（**关键**）：① 自定义域名必须加进 Neon Auth **trusted_origins**（否则 CSRF 403）② 会话 cookie 必须 **`sameSite:"lax"`**（默认 strict 会在 OAuth 跨站跳回时丢 cookie→死循环）③ **必须挂 `auth.middleware()`**(scoped `/admin`)来校验/刷新会话并喂给 server component,否则 session 建了但页面读不到→循环 ④ Vercel 偶发漏触发 webhook→空提交重推或手动 Redeploy
2b. **UI 深度优化**：
   - ✅ Wire 时间线改为「最近1h/4h/8h/今天/昨天/日期」递进分桶（2026-06-05）
   - 待办：移动端布局与卡片密度、urgency 视觉层级、Radar 爆品卡（缩略图/榜位/区域 chip）、骨架屏/加载态、空态与错误态、字体与间距打磨、暗色对比度可达性
3. **物流/平台再补源**：EU 稳定法规 feed（替 B04/B05）、ME/LatAm/SEA 平台与物流覆盖
4. **反爬 backlog（Phase 2，需付费API/代理）**：Temu(D21)/AliExpress(D23)/MercadoLibre(D20)/Noon(D22)/CIFNews(F09)/Ebrun(F10)
5. **Radar 深化**：BSR rank delta 时序（目前 first-seen rank）+ 三源扩散佐证
6. **D03 Movers&Shakers**（可选）：非无头/交互式抓取方案
7. 收尾：F01 “Read more” 噪声项、Neon retention 最终值

## Sprint 004 Summary（趋势 + 扩散 + 推送）
T1 趋势摄取 ✅（keywords + score.ts + trends worker + daily schedule；pytrends 单次取 169 点验证；**429 限流记为生产风险**，已加退避，高可用需付费源）
T2 跨区扩散 ✅（diffusion.ts lead-lag 算法 + 5 单测；真实算法产出 5 个直观信号；**/trends Radar 页已上线**，沿用 Wire 视觉）
T3 即时推送 ✅（Telegram/Slack 渲染+发送，approve→dispatchPush；真实发送 gated on token）
延后：Amazon BSR 多源佐证、Phase 1.5 源扩展 → Sprint 005。
69 单测 / lint 0 / next build ✓ / 真实 Neon+pytrends 管道验证。

## Sprint 003 Summary（Web + 分发）
Next.js 14 + Tailwind 接入(与 worker 共存，webpack extensionAlias 解析 .js→.ts)。
T1 时间线 + 过滤器 ✅ / T2 REST API + UA 门禁 ✅ / T3 日报生成(5段)+Resend(gated) ✅ / T4 RSS ✅ / T5 审核 UI ✅。
**真实验证(next start + Neon)**：API 返回 2 条预警、bot UA→403/browser→200、首页渲染、过滤器(regulatory→1/europe→0)、审核页、RSS、日报 dry-run。
`next build` ✓ / 56 单测 / lint 0。
延后项：read-state/24h-delay/auth(→S005)、daily-by-date/openapi/rate-limit、cron、真实发信(RESEND key)、Feedly 手动确认。

## Sprint 002 Summary（评分与预警生成）
T1 Stage-2 评分 ✅（score prompt + stage2 + MiniMax 真实验证：de minimis→5/GPSR→4/tips→1）
T2 Alert 生成 ✅（score-queue + scoring worker + 聚类合并 + 状态路由；真实验证 pending_review/published）
T3 审核队列后端 ✅（review CLI list/approve/reject，真实 approve 验证）
管道现已贯通：crawl→ingest→Stage1(deepseek-flash)→dedup→Stage2(MiniMax 评分)→alerts(状态路由)→人工审核。
反爬源：Amazon BSR(D02/D03) 选择器已验证；TikTok CC(D07) 门禁停用。
49 单测 / lint 0 / 真实 Neon+模型 e2e 全过。

## (历史) Sprint 001 Summary
Sprint 001（数据摄取基础设施）**全部完成并真实验证** —— T1 Schema✅ / T2 爬虫框架(pg-boss)✅ / T3 源接入✅ / T4 AI 粗筛翻译(deepseek-v4-flash)✅ / T5 去重聚类✅ / T6 Python Scraper✅。
真实 e2e 验证：
- Neon dev：migrate(9表)、pg_trgm、RSS 抓取→入库、trigram 查询
- AI：deepseek-v4-flash 关思考(bench 后定，ADR-005)，粗筛/译英/分类全通；MiniMax 留作 Sprint-002 打分
- Python：py3.11 + scrapling[fetchers] 0.4.8 + Chromium，FastAPI /scrape + Node 桥接打通(10 items)
单测 40 passed / lint 0 error。
调优项：prefilter recall 偏严（ai-pipeline.md 记录）；各反爬源选择器线上迭代。
密钥在 .env(gitignored)：Neon、MINIMAX(打分)、DEEPSEEK(Stage-1)。
SPEC/PLAN：docs/specs/{data-model,crawler-contract,ai-pipeline,IMPL-PLAN-sprint-001}.md。ADR-001~004 见 Obsidian。
测试现状：`pnpm test` 40 passed / `pnpm lint` 0 error / `pnpm db:validate` ok / py_compile ok。
**基础设施已定（ADR-003/004）**：Neon(PG, pooled+direct 双 URL，并承载 pg-boss 队列) + Railway(workers) + Vercel(前端)。**已删 Redis/Upstash**——队列改用 pg-boss(纯 SQL，跑在 Neon)，组件 4→3。本地连 Neon dev 分支（无本地 PG）。**需 provision**：Neon 项目+dev分支、DeepSeek key — 到位后 T3 入库 / T5 trigram 可真验证。

## Next Sprint Candidates（Sprint 005：账户 + 变现 + 扩源）
- [ ] [EP-008] [HIGH] Auth(NextAuth v5)：登录 + 管理页鉴权 + 用户订阅设置
- [ ] [EP-008] [HIGH] Stripe 订阅(Free/Pro/Team) + 计费页
- [ ] [EP-009] [MED] 关键词监控(Pro)：自定义品类/品牌/竞品盯防
- [ ] [EP-001] [MED] Phase 1.5 源扩展(SEA/ME/LatAm/ANZ 35 源)
- [ ] [EP-005] [LOW] UI 增强：urgency 排序/已读置灰/中英切换


## Version History（最近 6 版）
| Version | Date | Summary |
|---------|------|---------|
| v0.11.0 | 2026-06-07 | BL-026 编辑式首页 v2(hero+次级+Latest 簇 / 板块差异化 / Hot on X)+ BL-040 Google News 真 URL 解析 + channelId 归一化(189 测试) |
| v0.10.0 | 2026-06-07 | BL-026 UI 改版 + BL-040 频道大图新闻卡(sendPhoto+按钮 / 来源美化 / cap 12) |
| v0.9.0 | 2026-06-07 | BL-039 slice 1 上线 + 频道卡片首版 |
| v0.8.1 | 2026-06-07 | BL-039 slice 1: Telegram 频道精选推送(Wire+Radar 混合,6-8条/天,3×/天 cron,纯函数+42单测) |
| v0.8.0 | 2026-06-06 | Daily Note 原创日报 + X 信源扩展(18 核验账号) + 管道加固 + /admin/sources 源监控 |
| v0.6.0 | 2026-06-04 | 上线 Vercel + Web v2(时间线分段/紧急度档位/标题跳转/og:image)+ JsonAdapter + Amazon多区品类 + cap |
| v0.5.3 | 2026-06-04 | 平台爆品源扩展：Amazon BSR UK/UAE/AU 验证上线(各30条)+ Temu/MELI/Noon backlog |
| v0.5.2 | 2026-06-04 | JsonAdapter(Federal Register 20条上线)+ 死源清理(EU OJ/LUCID/Momentum/Ebrun/Reddit 停用) |
| v0.5.1 | 2026-06-04 | 修复 3 个死源(USTR/ACCC 换 RSS、CIFNews 停用)+ Prisma Neon 冷启动重试 |
| v0.5.0 | 2026-06-04 | Sprint 004：趋势摄取(pytrends)+跨区扩散信号(/trends Radar)+即时推送(gated)，差异化卖点上线 |
| v0.4.1 | 2026-06-04 | UI 重做：Intelligence Wire 编辑风(Fraunces+Plex Mono+琥珀信号色)，用户确认采用 + Neon 连接池修复 |
| v0.4.0 | 2026-06-03 | Sprint 003：Next.js Web(时间线+过滤)+REST API+RSS+审核UI+日报生成，真实验证 |
| v0.3.0 | 2026-06-03 | Sprint 002：评分(MiniMax)+Alert生成+状态路由+审核队列，全链真实验证 |
| v0.2.0 | 2026-06-03 | Sprint 001 完成：数据摄取管道（pg-boss/Neon + deepseek-v4-flash + Scrapling）全链真实验证 |
| v0.1.0 | 2026-06-03 | 项目立项，规范初始化，数据源清单确认 |
