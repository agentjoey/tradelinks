# Current Status — TradeLinks

Version:        v0.6.0
Sprint:         005 (Web polish + deploy)
Sprint Status:  ✅ Web v2 done（部署+4项优化）
Last Updated:   2026-06-04 by claude-opus-4-8
Sprint File:    .agent/sprints/sprint-005.md

## 🚀 LIVE
- **生产**: https://tradelinks-mvp.vercel.app （Vercel，5 路由全 200，31 条真实预警）
- **GitHub**: agentjoey/tradelinks-mvp（main，作者已为 agentjoey）
- **DB**: Neon dev branch `ep-bitter-wildflower-ao1u2qbn` / `neondb`（数据所在；prod 父 branch 为空）
- **部署分工**: Vercel=只读前端+API；worker+Python scraper=本地按需(`pnpm worker`)，未常驻；待选 GCP e2-micro/Fly/Railway 上线
- Vercel env 已配：DATABASE_URL(指向 dev branch)+ TELEGRAM_*

## 数据源现状（36 源 / 23 enabled）
- ✅ RSS 法规/行业(9)：USTR(B01) CBP(B02) UK Gov(B06) ACCC召回(B16) ModernRetail(F02) RetailDive(F03) Tamebay(F04) Shopify(A02) …
- ✅ JSON：B03 Federal Register（JsonAdapter，已产出真实数据）
- ✅ Amazon 爆品(scrapling,10)：US 电子+5品类(D02/D03/D30-34) + UK(D04)/UAE(D05,中东)/AU(D06)
- ✅ Google Trends(D01,pytrends,429-prone)
- ⛔ 反爬停用(enabled:false)：TikTok CC(D07)、CIFNews(F09)、亿邦(F10) / backlog：Temu(D21)、AliExpress(D23)、MercadoLibre(D20)、Noon(D22)——均需付费抓取API/代理
- 死源已停：B04 EU OJ、B07 LUCID、A01 eBay、F05 Momentum Works（URL 失效/反爬）

## Open Bugs（P0/P1）
🟢 无已知 P0/P1 bug。
- ⚠️ `/admin/review` 无鉴权（裸奔，待 Auth/Vercel password）
- 注：F01 Marketplace Pulse fetch 选择器未验证

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


## Version History（最近 5 版）
| Version | Date | Summary |
|---------|------|---------|
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
