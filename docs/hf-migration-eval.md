# Hugging Face 免费层级部署评估（2026-07-19）

> 调研：后台（Railway 两个服务）能否迁到 Hugging Face 免费层级。结论先行：**scraper 可迁（省 Railway 上 Chromium 那份钱），worker 不可迁（HF 网络策略挡死 Neon 连接）**。推荐「scraper → HF Spaces free / worker 留 Railway」的分体方案。

## 1. 后台现状（repo 事实）

| 组件 | 平台 | 形态 | 资源特征 |
|---|---|---|---|
| Next.js 前端 | Vercel | serverless | pooled DATABASE_URL，connection_limit=1 |
| Node worker | Railway svc#1 | **常驻进程，无 HTTP 端口** | pg-boss（9 cron + 5 事件队列），纯出站 TCP 到 Neon :5432；启动 `pnpm worker`（tsx 直跑，需 dev deps） |
| Python scraper | Railway svc#2 | **无状态 HTTP 服务**（FastAPI :8000，Dockerfile 自包含） | Chromium 单例串行，1–2GB RAM，调用 ~2 次/天（BSR 12h + trends 每日），其余时间 sleep |
| PostgreSQL 16 | Neon 免费档 | DB + pg-boss 同库 | 被 scheduler-tick 每分钟 poll，永不 scale-to-zero |

worker 的 9 个 cron（scheduler-tick 1min / trends / source-health / x / daily-note / channel-push ×3 / translate 15min / radar-review / newsletter 周一）+ 5 个事件队列（crawl/scrape/ingest/process/score）全部依赖 Neon 长连接。

## 2. HF 免费层级事实（官方文档，2026-07 核）

- **Spaces CPU Basic = 免费**：2 vCPU / 16GB RAM / 50GB **非持久**磁盘（[Spaces Overview](https://huggingface.co/docs/hub/spaces-overview)、[Pricing](https://huggingface.co/pricing)）。
- **Docker SDK**：自带 Dockerfile 即可部署；`app_port` 默认 7860（可改）；容器以 uid 1000 运行；Secrets 以环境变量注入；公网 URL `<space>.hf.space`（[Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker)）。
- **⚠️ 出站网络白名单**：只允许 80 / 443 / 8080 端口出站，**其余端口一律封禁**（[Spaces Overview — Networking](https://huggingface.co/docs/hub/spaces-overview)）。
- **休眠**：免费硬件闲置后睡眠（官方表述 "after a period of time if unused"，历史值为 48h）；永远在线需付费档；唤醒即冷启动（镜像内程序重新拉起，启动超时上限 `startup_duration_timeout` 默认 30min，[config ref](https://huggingface.co/docs/hub/spaces-config-reference)）。
- **磁盘非持久**：重启即丢（本项目 scraper 无状态，无影响）。
- **HF Jobs**：支持 cron 调度（`hf jobs scheduled run "*/5 * * * *" image cmd`，[Schedule Jobs](https://huggingface.co/docs/hub/jobs-schedule)），但**按秒计费、不是免费层级**，且同样受 HF 网络策略约束。

## 3. 逐组件判定

### 3.1 Python scraper → HF Spaces free：✅ 可行（推荐）

| 要求 | scraper 实况 | HF free 匹配 |
|---|---|---|
| Docker 部署 | `scraper-py/Dockerfile` 完整自包含 | Docker SDK 原生支持 |
| 内存 | 1–2GB（Chromium 峰值） | 16GB，余量充足 |
| 出站 | 目标站点 HTTP/HTTPS | 80/443 白名单内 ✅ |
| 被调方式 | worker HTTP 调用 | 公网 `<space>.hf.space` ✅ |
| 调用频率 | ~2 次/天 | 睡眠策略天然匹配（闲时本来就不跑） |

需要的改造（小）：
1. **端口**：uvicorn 监听 `${PORT:-8000}`（Dockerfile CMD 改为 shell 形式），HF README YAML 设 `sdk: docker` + `app_port: 7860`。
2. **鉴权**：Railway 内网隔离没了，公网 URL 必须加共享密钥 header（`X-Scraper-Token`，worker 端 `SCRAPER_SERVICE_URL` + header 配对），否则任何人可调你的 Chromium。
3. **保活/冷启动**：48h 无流量会睡。两种策略：
   - a. **接受睡眠 + 冷启动**：BSR 批次前先让 worker 对 `/health` 预热重试（当前 120s 超时可能不够，冷启动含镜像拉起 + Chromium 首启，需实测；给 scrape-queue 加「先 ping、醒后重试」逻辑）；
   - b. **外部 ping 保活**：cron-job.org（免费）每 ~36h 打一次 `/health` —— 简单可靠，推荐先用 b，若想纯粹可后转 a。
4. 构建纪律：`scrapling install || true` / `patchright install chromium || true` 会吞安装失败 → 部署后必须 curl `/health` + 实跑一次 stealth BSR 验证再切流。
5. （可选）加 `.dockerignore`（`__pycache__`/`.venv`/`explore.py`）。

### 3.2 Node worker → HF Spaces free：❌ 不可行（结构性）

两个独立死因，任一即否决：

1. **Neon 连不上**：pg-boss 需要到 Neon `:5432` 的原始 TCP 长连接（LISTEN/NOTIFY + 5min maintenance），HF 出站白名单只放 80/443/8080。Neon 的 HTTP serverless driver 只支持单条 SQL，**无法承载 pg-boss 的队列语义** —— 没有绕行方案。
2. **形态不合**：worker 是无 HTTP 端口的常驻进程；Spaces 要求监听 web 端口且免费档无流量即睡 —— worker 没有入站流量，必睡无疑；即便包一层 dummy server 骗保活，死因 1 仍然成立。

**结论：worker 留在 Railway（或未来评估允许任意出站 TCP 的常驻型平台）。** Railway 只剩 worker 后，其资源占用是"Node + Prisma 池"级别，成本已到底部。Vercel 也不能接：函数 60s（Hobby）/300s（Pro）上限装不下 daily-note/x-tick 的分钟级管线，且 pg-boss 事件队列需要常驻监听者。

### 3.3 cron ticks → HF Jobs：⚠️ 技术可行但不推荐

- 按秒计费（不是免费层级）；9 个 tick 里 8 个要连 Neon（同 3.2 死因 1），唯一 DB 无关的是无 —— 每个 tick 都要读写 Neon。**直接排除。**

## 4. 推荐方案：分体部署

```
Vercel（前端，不动）        Neon（DB + pg-boss，不动）
     │                          ▲              ▲
     │                          │ :5432        │ :5432
Railway worker（不动）───────────┘              │
     │ SCRAPER_SERVICE_URL + X-Scraper-Token    │
     ▼                                          │
HF Spaces（scraper，免费档）─────────────────────┘
     ▲ /health 每 36h（cron-job.org 免费保活）
```

**收益**：Railway 账单里 Chromium 那份（历史上烧 credit 的主因）归零；Railway 只剩轻量 worker。
**成本**：多一个平台要管 + 保活 ping 依赖 + 冷启动路径需要一次实测调参。
**前置验证（切换前必做）**：① Space 构建后 `/health` + 实跑 stealth BSR；② 冷启动计时（Space 睡后第一次调用端到端耗时 vs scrape-queue 的 120s 超时，不够就加预热重试）；③ token header 未配时返回 401。

## 5. 不做这件事的理由（诚实评估）

scraper 在 Railway 上已经 serverless-sleep、12h 才用一次，遗留成本可能很小（docs 无具体金额）。**先查 Railway 账单里 scraper 与 worker 的实际分项**再决定：如果 scraper 月成本 < ~$2，迁移的工程成本（改造 + 双平台运维 + 冷启动风险）可能不划算，此时应放弃迁移、仅保留本评估备案。
