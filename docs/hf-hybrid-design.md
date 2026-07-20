# HF 混合方案详细设计（2026-07-19）

> 前置：`docs/arch-review-2026-07.md`（四方向评估）、`docs/hf-migration-eval.md`（HF 单点）。
> 本文：① worker/scraper 成本压力分解 → ② 混合方案详细设计（P1 Neon 成本修正 + P2 scraper→HF + P3 可选 worker→Fly）。

## 1. 成本压力分析

### 1.1 worker（Railway svc#1）— 表面 $5，真正的压力在它强加给 Neon 的常醒

| 压力源 | 量级 | 说明 |
|---|---|---|
| 常驻占位 | Railway ~$5/月 | 720h 常驻 Node，但 9 个 cron 里 8 个日/周级、事件队列大部分时间在等活 —— **真实工作负载 <5% 占空比**，$5 买的是"在线"本身 |
| **二阶压力（主因）** | Neon ~180 CU-h/月 vs 100 免费帽 ≈ **~$19/月** | worker 的 `scheduler-tick`（每分钟）+ pg-boss maintenance + polling 让 Neon 永不 scale-to-zero（`docs/operations.md` 已记录）。**Neon 超额不是数据量问题，是 worker 的 poll 节奏问题** |
| 内存/CPU | 可忽略 | Node + Prisma(5) + pg-boss(1)，几百 MB，CPU 近零 |

**结论：worker 的费用压力 80% 在 Neon 侧（节奏问题），20% 在 Railway 常驻费。** 只迁 worker 去 Fly（省 $1.8）不解决主矛盾。

### 1.2 scraper（Railway svc#2）— 历史压力已被工程压缩，残余很小

| 压力源 | 现状 | 说明 |
|---|---|---|
| Chromium RAM 峰值 1–2GB | 已控 | `batchSize:1` 串行 + `disable_resources` + `--disable-dev-shm-usage` |
| 浏览器冷启 CPU | 已控 | BSR 12h cadence + Railway serverless 闲时 sleep |
| 镜像体积/构建 | 存在 | Chromium + 17 系统库，镜像大、构建慢 —— 一次性成本 |
| 残余费用 | 小 | ~2 次/天 × 分钟级活动 —— 具体分项见 Railway 账单（P0 行动项） |

**结论：scraper 迁 HF 是把"残余小头归零"的纯收益项（无状态、Docker 就绪、零风险面），不是救火。**

### 1.3 压力优先级（决定设计顺序）

**Neon 常醒（~$19）≫ Railway worker 常驻（$5）> scraper 残余（~$1–3?）**

## 2. 目标架构

```
Vercel（$0，不动）          Neon（DB+pg-boss+Auth，目标回免费帽内）
     │                         ▲ pooled      ▲ DIRECT
     │                         │             │（15min 节奏改造后可睡眠）
Railway worker（$5，不动）─────┘─────────────┘
     │ HTTPS + X-Scraper-Token
     ▼
HF Spaces scraper（$0）   ← 12h 自然调用节奏 > 永不触眠（48h 阈值）
```

## 3. P1：Neon 成本修正（最大杠杆，零新平台）

把 Neon 的活跃源从"每分钟"降到"一刻钟几次"，让它在大部分时间里 scale-to-zero：

| # | 改动 | 文件 | 预期效果 |
|---|---|---|---|
| 1 | `scheduler-tick` cron `* * * * *` → `*/15 * * * *` | `src/workers/index.ts` | 源频率全是 4–12h（`src/config/sources.ts`），15min 粒度**零信息损失** |
| 2 | pg-boss `maintenanceIntervalMinutes: 15` | `src/queue/queues.ts`（PgBoss 构造，knob 已核实存在于 attorney.js:299-305） | maintenance 清理（30min 保留）滞后 ≤15min，无感 |
| 3 | 核查 `pollingIntervalSeconds`（attorney.js:287-291 可配）：若 worker 对 queue 是高频 poll 而非纯 LISTEN/NOTIFY，调到 ≥60s | `src/queue/queues.ts` | 消除最后一个常醒源 |

**验证方式**：改完上 Railway 后，看 Neon Console 的 compute 图 24h —— 目标：大部分时间 0 CU；月度 CU-h 估算 ~10–30（< 100 免费帽）。若仍不睡眠，说明还有未知活跃源，用 `pg_stat_activity` 抓现行再处理。
**注意**：Neon 项目设置里 autosuspend 需为默认（~5min）且未被禁用；scale-to-zero 被显式关掉的话先开回。
**风险**：tick 间隔变大导致源抓取延迟 ≤15min（4–12h 频率下无感）；pg-boss 过期任务清理滞后 ≤15min（30min 保留窗口内安全）。

## 4. P2：scraper → HF Spaces（免费）

### 4.1 仓库与部署

- HF Space（Docker SDK）本身就是一个 git repo。采用 **GitHub 单向同步**：加 `.github/workflows/deploy-scraper-hf.yml`，当 `scraper-py/**` 在 main 有变更时，把 `scraper-py/` 子树推送到 HF repo（`https://huggingface.co/spaces/<user>/tradelinks-scraper`）：
```yaml
name: deploy-scraper-hf
on:
  push:
    branches: [main]
    paths: ["scraper-py/**"]
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install huggingface_hub
      - run: huggingface-cli upload "$HF_SPACE_ID" . . --repo-type=space --token="$HF_TOKEN"
        working-directory: scraper-py
        env:
          HF_TOKEN: ${{ secrets.HF_TOKEN }}
          HF_SPACE_ID: ${{ secrets.HF_SPACE_ID }}
```
（Space repo 根目录还需一个 README.md 带 YAML front-matter：`sdk: docker`、`app_port: 7860` —— 直接提交进 `scraper-py/README.md` 的 YAML 块即可被同步。）

### 4.2 Dockerfile 改造（4 处）

0. **（必须先做）uid 1000 非 root 用户**——HF Docker 容器以 uid 1000 运行（[官方范式](https://huggingface.co/docs/hub/spaces-sdks-docker)），现 Dockerfile 未建用户，Chromium/patchright 需要可写 `HOME`（profile/cache 目录）：
```dockerfile
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app
COPY --chown=user . $HOME/app
```
（浏览器二进制安装到 `$HOME` 下；`scrapling install` / `patchright install chromium` 在 USER user 之后执行。）

1. **端口**：CMD 改 shell 形式读 `PORT`：`CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]`（HF 注入 7860，Railway/本地继续 8000，向后兼容）。
2. **`.dockerignore`** 新增：`__pycache__/`、`.venv/`、`explore.py`、`*.pyc`。
3. 浏览器安装失败不再静默：`scrapling install` / `patchright install chromium` 保留 `|| true` 但在 CMD 前加一行启动自检 `python -c "from scrapling import StealthyFetcher; print('scrapling ok')"`，失败则镜像起不来（比带病上线好）。

### 4.6 HF 免费层特质适配清单（逐条核对）

| 特质 | 影响 | 设计适配 |
|---|---|---|
| **重启/重部署后磁盘清零**（50GB 非持久盘） | scraper 零磁盘状态：无 DB、无文件产物、浏览器每请求新建（无 profile 复用） | ✅ 天然免疫，无数据可丢；token 走 Secrets(env)，不随盘丢 |
| **~48h 无流量睡眠** | 见 §4.4：最长空闲 12h（BSR）≪ 阈值 | ✅ 稳态不睡；部署后冷启动有 prewarm+retry |
| **出站限 80/443/8080** | scraper 只抓 HTTP(S)，无 DB 连接 | ✅ 无违例；worker 留 Railway 不受此限 |
| **容器 uid 1000（非 root）** | Chromium 需可写 HOME | ✅ §4.2-0 已补（本清单的唯一真实缺口） |
| **2 vCPU shared** | BSR 串行批次耗时拉长 | 可接受（batchSize=1 本来就是串行设计）；trends 批次同 |
| **构建时长/镜像体积** | 镜像 ~2GB ≪ 50GB；构建含 Chromium 下载，分钟级 | ✅；`startup_duration_timeout` 默认 30min 足够 |
| **源码/构建日志公开** | 无密钥硬编码（token 在 Secrets） | ✅；部署后顺手自查一遍日志无泄漏 |
| **无 SLA / 公平使用** | ~2 次/天、分钟级负载 | 远低于公平线 |

### 4.3 鉴权（公网化的代价）

- `main.py` 加 FastAPI 依赖：`POST /scrape` 要求 header `X-Scraper-Token == os.environ["SCRAPER_TOKEN"]`，不符 401；`GET /health` 保持开放（无信息泄露，供保活/监控）。
- HF Space Settings → Secrets 配 `SCRAPER_TOKEN`；worker 侧同名 env。
- Space 可见性选 **public**（app 必须公网可达）；源码公开无碍（无密钥、token 在 secret 里）。

### 4.4 睡眠与冷启动（比预期乐观）

- BSR 12h + trends 每日 ≈ 最长空闲 12h ≪ 48h 触眠阈值 —— **稳态下 Space 永不睡眠，冷启动只发生在部署/异常重启后**。
- worker 端仍加一层保险（`src/workers/scrape.ts`）：调用前先 `GET /health`（5s 超时）预热，失败则 30s 后重试一次；`/scrape` 主调用 120s 超时不变。
- worker 调用处带 `X-Scraper-Token` header（`SCRAPER_SERVICE_URL` 改指 `https://<space>.hf.space`）。

### 4.5 验收（切流前必过）

1. Space 构建完成 → `curl https://<space>.hf.space/health` 200。
2. 无 token `POST /scrape` → 401；带 token → 200。
3. 实跑一次 stealth BSR（Amazon 某榜单 30 条）结果结构与 Railway 版一致。
4. 冷启动计时：手动 Restart Space 后立刻调 `/health` → 记录到 200 的秒数；再调一次真 scrape 确认端到端 < 120s。
5. Railway scraper 服务**保留不删**（pause），`SCRAPER_SERVICE_URL` 指回内网即回滚。

## 5. P3（可选）：worker → Fly.io

触发条件：P1+P2 落地后 Railway worker 分项仍 > $4 且想再省 ~$1.8/月。
形态：`fly.toml` 无 `[[services]]`、`min_machines_running=1`、shared-cpu-1x 512MB；Neon/Supabase 公网直连不受影响；scraper 已在 HF（公网），无内网依赖。**当前不实施，备案。**

## 6. 实施任务分解（建议按 SDD 走，每任务双审）

| Task | 内容 | 验收 |
|---|---|---|
| 1 | P1 三个节奏改动（scheduler cron、maintenanceIntervalMinutes、pollingIntervalSeconds 核查）+ 观察方法写进 operations.md | lint/test 绿；Railway 部署后 Neon 24h CU 图见睡眠 |
| 2 | scraper-py Dockerfile/端口/dockerignore/启动自检 + token 鉴权（FastAPI 依赖 + 测试） | 本地 Docker 起，无 token 401、有 token 200 |
| 3 | HF Space 创建 + GitHub 同步 workflow + README YAML | push 后 HF 自动重建成功 |
| 4 | worker 侧 `scrape.ts`：URL/token/prewarm+retry | 单测（mock fetch）+ `pnpm worker:run-once` 真跑一次 stealth |
| 5 | 切流 + 验收清单 4.5 全过 + operations.md 更新 + Railway scraper pause 保留回滚位 | BSR 真实批次端到端 < 120s |

## 7. 风险登记

| 风险 | 缓解 |
|---|---|
| Neon 仍有未知常醒源（pg-boss LISTEN 连接行为） | P1 验收就是 CU 图实测；不行再抓 `pg_stat_activity` |
| HF 首次构建拉 Chromium 层慢/失败 | 启动自检让坏镜像起不来；Railway 版保留回滚 |
| token 泄漏 | secret 存储；HF/GitHub 双端 secrets；可随时轮换 |
| 15min tick 错过"突发"源 | 源全是 4–12h 周期，不存在分钟级突发语义 |
| GitHub Action 推送 HF 失败 | workflow_dispatch 手动重跑；Space 也可本地 `git push hf main` 兜底 |
