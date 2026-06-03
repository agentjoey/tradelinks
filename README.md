# TradeLinks MVP

全球跨境电商情报平台 — 预警 + 趋势预测。面向全球卖家、服务商、投研机构。

> Sprint 001 (v0.2.0 目标): 数据摄取基础设施。详见 `.agent/CURRENT.md`。

## 文档

| 文档 | 内容 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 技术上下文、栈、dev 命令 |
| [docs/architecture.md](docs/architecture.md) | 系统架构 |
| [docs/specs/sources.md](docs/specs/sources.md) | 58 个信息源清单 |
| [docs/specs/data-model.md](docs/specs/data-model.md) | 数据模型 SPEC |
| [docs/specs/crawler-contract.md](docs/specs/crawler-contract.md) | 爬虫契约 SPEC |
| [docs/specs/ai-pipeline.md](docs/specs/ai-pipeline.md) | AI 管道 SPEC |
| [docs/specs/IMPL-PLAN-sprint-001.md](docs/specs/IMPL-PLAN-sprint-001.md) | Sprint 001 实施计划 |

## Quickstart

```bash
pnpm install
cp .env.example .env          # 填入 Neon DATABASE_URL+DIRECT_URL / API keys
pnpm db:gen                   # 生成 Prisma Client（无需 DB）
pnpm db:validate              # 校验 schema
pnpm test                     # 单元测试（adapters / blocked / AI stage1，无需 DB）

# 本地调试单个 RSS 源（dry-run，无需 DB/Redis）
pnpm worker:run-once --source=A02

# 迁移到 Neon dev 分支（用 DIRECT_URL）
pnpm db:migrate

# 启动 worker（需要 Neon 连接串；队列用 pg-boss，无需 Redis）
pnpm worker
```

> 基础设施：Neon(PG + pg-boss 队列) + Railway(workers) + Vercel(前端)，无 Redis，见 ADR-003/004 / docs/deployment.md。
> 本地无需安装 Postgres——连 Neon dev 分支即可。

## 架构速览（ADR-002 混合爬虫）

- **Node/TS worker**: RSS + fetch 源（~50%），blocked-detection 检测 bot-wall
- **Python Scrapling 服务**（`scraper-py/`, T6）: 反爬源 + Google Trends
- **AI 管道**: DeepSeek V3.2（粗筛/翻译）→ DeepSeek V4 Pro（打分，Sprint 002）
- **存储**: PostgreSQL 16 + pg_trgm

## 当前状态

见 [`.agent/CURRENT.md`](.agent/CURRENT.md)。
