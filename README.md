# TradeLinks

TradeLinks 正在从“跨境电商信号/趋势站”翻新为面向卖家的美国市场开店与运营情报工具。

Phase 1 的产品结构是：

- **Public Intelligence**：公开、可索引、证据可追溯的市场、平台、政策、合规与类目情报。
- **Private Relevance**：由免费 Seller Profile 驱动的个性化 Briefing、Actions 与邮件体验。
- **首发范围**：美国市场，Amazon US 与 Shopify US；首发六个商品大类以产品 spec 为准。

当前仓库已完成 **Phase 1 Foundation**：来源契约、readiness、采集账本、规范化聚类、不可变版本、证据门禁、覆盖能力与 legacy backfill。公开页面和个性化产品尚未切换；线上仍运行原有 Wire/Radar/Daily 体验。

## 当前交付状态

- Pact feature `phase1-foundation`：8/8 tasks accepted。
- Draft PR：[Phase 1 foundation: evidence-ready intelligence model](https://github.com/agentjoey/tradelinks/pull/3)。
- 验证：Prisma schema、TypeScript、53 个测试文件 / 426 个测试、Next.js production build 全部通过。
- 数据库验证仅发生在批准的非生产 Neon 隔离分支；没有生产数据库、云端配置或部署变更。
- 下一阶段：Public Intelligence；P0 验收包含连续 7 天稳定运行。

## 文档入口

| 文档 | 内容 |
|------|------|
| [.agent/CURRENT.md](.agent/CURRENT.md) | 当前任务、发布与风险状态 |
| [PRODUCT.md](PRODUCT.md) | 产品用户、承诺与 Phase 1 边界 |
| [CLAUDE.md](CLAUDE.md) | 技术上下文、环境与开发命令 |
| [docs/architecture.md](docs/architecture.md) | 当前系统与 Phase 1 Foundation 架构 |
| [Phase 1 product spec](docs/superpowers/specs/2026-07-23-tradelinks-phase-1-product-structure-design.md) | 产品结构与范围 |
| [Foundation plan](docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md) | 已完成的 Foundation 实施计划 |
| [Foundation verification](docs/superpowers/verification/2026-07-28-tradelinks-phase1-foundation-verification.md) | 验收证据与安全边界 |
| [Public Intelligence plan](docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md) | 下一阶段公开产品计划 |
| [Private Relevance plan](docs/superpowers/plans/2026-07-23-tradelinks-phase1-private-relevance.md) | 后续个性化产品计划 |
| [Operations & Cost plan](docs/superpowers/plans/2026-07-23-tradelinks-phase1-operations-cost.md) | 成本、调度与 7 天稳定性计划 |

## Quickstart

```bash
pnpm install
cp .env.example .env          # 默认指向 Neon dev；不要复用生产连接串
pnpm db:gen
pnpm db:validate
pnpm lint
pnpm test
pnpm build
```

部分 Foundation 测试使用 PostgreSQL。运行数据库测试前必须确认 `DATABASE_URL` / `DIRECT_URL` 指向获批的非生产 Neon 分支；backfill apply 还会在代码内校验批准的隔离 endpoint。

常用开发命令：

```bash
pnpm dev                      # Next.js App Router
pnpm worker                   # 本地按需启动 pg-boss worker
pnpm worker:run-once --source=A02
pnpm db:migrate:dev           # 仅 Neon dev
pnpm patrol                   # 日常信号源与内容巡检
```

## 技术栈

- Next.js 14 App Router + TypeScript + Tailwind CSS
- Prisma + PostgreSQL 16 on Neon
- pg-boss 队列；Railway 运行 Node worker 与 Python Scrapling 服务
- Vercel 提供前端、Route Handlers、RSS 与受保护的 admin surfaces
- Neon Auth / Better Auth + Google OAuth 管理 admin 身份
- Resend、Telegram 与 Slack 复用为现有分发能力

基础设施目标保持 Neon + Railway + Vercel、无 Redis；Phase 1 免费验证期核心 infra 预算约 `$25–50/月`。
