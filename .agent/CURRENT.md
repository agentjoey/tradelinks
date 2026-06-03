# Current Status — TradeLinks

Version:        v0.4.0
Sprint:         003
Sprint Status:  ✅ Done
Last Updated:   2026-06-03 by claude-opus-4-8
Sprint File:    .agent/sprints/sprint-003.md

## Open Bugs（P0/P1 必须本 Sprint 修复）
🟢 无已知 P0/P1 bug。
- 注：F01 Marketplace Pulse 无公开 RSS（已改 fetch adapter，选择器待线上验证，非阻塞）

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

## Next Sprint Candidates（Sprint 004：趋势 + Push）
- [ ] [EP-004] [HIGH] 趋势时序摄取（Google Trends pytrends + Amazon BSR 快照）
- [ ] [EP-004] [HIGH] 跨区扩散信号 v1（3 源交叉 + 置信度）+ /trends 看板
- [ ] [EP-003] [HIGH] 即时 Push（Telegram/Slack，urgency≥4 approved alert）
- [ ] [EP-001] [MED] Phase 1.5 源扩展（SEA/ME/LatAm/ANZ）
- [ ] [EP-008] [HIGH] Auth(NextAuth)+Stripe+关键词监控（Sprint 005）


## Version History（最近 5 版）
| Version | Date | Summary |
|---------|------|---------|
| v0.4.0 | 2026-06-03 | Sprint 003：Next.js Web(时间线+过滤)+REST API+RSS+审核UI+日报生成，真实验证 |
| v0.3.0 | 2026-06-03 | Sprint 002：评分(MiniMax)+Alert生成+状态路由+审核队列，全链真实验证 |
| v0.2.0 | 2026-06-03 | Sprint 001 完成：数据摄取管道（pg-boss/Neon + deepseek-v4-flash + Scrapling）全链真实验证 |
| v0.1.0 | 2026-06-03 | 项目立项，规范初始化，数据源清单确认 |
