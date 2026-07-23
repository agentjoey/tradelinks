# 环境拆分方案（dev / staging / prod）（2026-07-21）

> 现状（CLAUDE.md §Single environment MVP）："dev" = 本地 repo；GitHub/Vercel/Railway/Neon 全是生产；本地 `.env` 的 `DATABASE_URL`/`DIRECT_URL` **直连生产库**，本地写脚本（翻译、backfill）直接写生产。本文规划如何低成本拆出 dev + staging 环境。

## 1. 目标与原则

1. **本地默认安全**：`pnpm dev` / 脚本默认连 dev 库，写错不伤生产。
2. **生产操作显式化**：连生产必须是一个"刻意动作"（专用 env 文件 / 专用命令）。
3. **零新增常驻成本**：不跑第二个常驻 worker/scraper；dev 计算资源用 Neon 分支 + 本地进程。
4. **一键切换**：env 文件约定清晰，任何人（和 agent）一眼知道自己在连哪里。

## 2. 目标拓扑

```
本地开发（默认安全区）
  pnpm dev ────────────────► Neon dev 分支（pooled）
  pnpm worker（按需） ─────► Neon dev 分支（DIRECT，自建 pgboss schema）
  脚本（backfill 等） ──────► Neon dev 分支
  scraper ── 无状态，环境无关 ── 直接用生产 scraper URL（输出写到调用方的 dev 库，scraper 本身不碰 DB）

Git / Vercel / Neon
  Git main ──► GitHub Action ──► Git staging ──► Vercel staging project ──► Neon staging 分支
  Git staging ──► PR ──► Git production ──► Vercel production project ──► Neon production 分支

Vercel
  原项目 Preview（main / PR） ──► Neon dev 分支
  staging 项目 Production ──────► Neon staging 分支
  production 项目 Production ───► Neon production 分支

Railway（生产专属，不动）
  worker / scraper ────────► Neon production 分支
```

## 3. 分步实施

### Step 0：Neon 创建 dev + staging 分支（人工 1 分钟 / 或给 agent API key）

- Neon Console → Branches → Create branch，从 `production`（`ep-mute-base-aotkza3n`）派生：
  - 命名 `dev`（`ep-super-mountain-aoh4zjj9`）
  - 命名 `staging`（`ep-odd-violet-ao98q1jy`）
- 得到两个分支各自的 pooled + direct 两条连接串。
- 免费档分支额度以 Console 为准（历史上 10 个/项目；dev/staging 分支空闲自动 scale-to-zero，几乎不耗 CU）。
- **立即在 dev 和 staging 分支各做一次清理**（分支会连 pg-boss 的 schema 一起复制，含 9 个 cron schedule 和残留 job）：
  ```sql
  TRUNCATE pgboss.schedule; TRUNCATE pgboss.job; TRUNCATE pgboss.archive;
  ```
  否则 worker 一启动就会照 prod 的 cron 表开火。

### Step 1：env 文件重组（本地默认 dev）

- `.env` → 全部改指 **dev 分支**（pooled + direct）。从此本地一切默认安全。
- 新增 `.env.staging`（gitignored）→ 放 staging 两条连接串 + staging 开关默认值（镜像生产但推送目标隔离）。
- 新增 `.env.production`（gitignored）→ 放生产两条连接串 + 生产特有的 key 引用。
- 用法约定（写进 `.env.example` 和 CLAUDE.md）：
  - staging: `pnpm db:migrate:staging` 或 `dotenv -e .env.staging -- ...`
  - production: `pnpm db:migrate:prod` 或 `dotenv -e .env.production -- ...`
- `.env.example` 增补 dev/staging/prod 三套示例 + 注释说明默认必须指 dev。

### Step 2：Vercel 项目拆分

采用 **两个 Vercel project** 给 staging / production 各自稳定的 Production 部署：

- `tradelinks-mvp-staging`
  - Git Production Branch = `staging`
  - `DATABASE_URL` → Neon **staging** 分支 pooled
- `tradelinks-mvp-production`
  - Git Production Branch = `production`
  - `DATABASE_URL` → Neon **production** 分支 pooled
- 原 `tradelinks-mvp` 项目保留给 Preview / 本地 `vercel dev`
  - Git Production Branch = `production`（让 `main` 及 PR 都走 Preview）
  - Preview / Development scope 的 `DATABASE_URL` → Neon **dev** 分支 pooled

### Step 3：dev 侧的功能开关默认值（防"dev 发真推送"）

本地 `.env`（dev）强制：
```
X_ENABLED=false
CHANNEL_PUSH_ENABLED=false
TRANSLATE_ENABLED=false
TELEGRAM_CHAT_ID=<测试 chat id>   # 建一个测试频道/chat
DAILY_NOTE_AUTOPUBLISH=false
```
要测全链路时逐项打开（翻译/推送都有各自的 budget 开关）。

### Step 4：dev worker / scraper 使用模式

- **dev worker 不托管**：按需本地 `pnpm worker`（读 `.env`=dev）。用完 Ctrl-C，零常驻成本。
- **dev scraper 不部署**：本地 Docker 或直接调生产 scraper URL——scraper 无状态、不碰 DB，产物由调用方（dev worker）写进 dev 库，天然隔离。
- Railway 保持生产专属，不加 staging（worker 的 dev 验证靠本地跑覆盖）。

### Step 5：migration 流程定型（三阶段）

1. 新 migration 先对 dev 分支跑 `pnpm db:migrate:dev`（`prisma migrate dev`）。
2. 验证（dev 起 app/worker 冒烟）。
3. push `main` → GitHub Action 自动晋升到 `staging` → Vercel staging 部署。
4. 对 staging 跑 `pnpm db:migrate:staging`（新增 script）。
5. staging 验证通过 → PR `staging` → `production` → merge。
6. 对 production 跑 `pnpm db:migrate:prod`。
7. 文档：`docs/deployment.md` 更新为「migration 三阶段」。

### Step 6：文档收口

- 重写 CLAUDE.md 的 **Single environment (MVP)** 节 → **Environments** 节（dev / staging / prod 映射、晋升流程）。
- `docs/operations.md` 增补「环境矩阵」表（组件 × dev/staging/prod × 连接目标）。
- `docs/deployment.md` 重写为三分支、双 Vercel project 部署指南。
- 新增 `.github/workflows/promote-main-to-staging.yml`：push `main` 自动 fast-forward `staging`。
- AGENTS.md 顶部启动协议无需改（`git pull` + CURRENT.md 不变）。

## 4. 成本影响

| 项 | 新增成本 |
|---|---|
| Neon dev 分支 | ~$0（免费档分支额度内；空闲自动睡眠） |
| Neon staging 分支 | ~$0（免费档分支额度内；空闲自动睡眠） |
| Vercel staging project | $0（Hobby 含 1 个 project；如超限再评估） |
| Vercel Preview | $0（Hobby 含预览） |
| Railway | $0（不动，生产专属） |
| dev/staging worker/scraper | $0（本地按需） |
| **合计** | **~$0/月** |

## 5. 风险与注意事项

| 风险 | 缓解 |
|---|---|
| dev/staging 分支复制了 prod 的 pgboss cron 表，worker 启动即触发真实推送 | Step 0 的 TRUNCATE + dev/staging 开关谨慎配置，双保险 |
| 旧习惯肌肉记忆：脚本仍写生产 | `.env` 默认指 dev；生产/Staging 必须经 `.env.production` / `.env.staging`——物理隔离 |
| Neon 免费档分支数/CU 额度不确定 | Console 可见；超出就评估是否保留 staging 或改用 preview 方案 |
| staging 环境误推送到生产 Telegram/Slack 频道 | `.env.staging` 中 `TELEGRAM_CHAT_ID` / `TELEGRAM_CHANNEL_ID` 必须指向 staging-only 频道 |
| 预览部署拿 dev 库跑 migration 冲突 | Preview 不设 DIRECT_URL，prisma 只在 Railway/本地执行 |
| Neon Auth 在 dev/staging 分支的行为（托管 Auth 随分支复制） | 各环境分别登录验证；分支 auth 数据是快照，测试账号按需重建 |

## 6. 执行顺序（总计 ~40 分钟人工 + 1 个任务量）

1. 【人工/agent】Neon 建 `dev` + `staging` 分支 + TRUNCATE pgboss 三表 + 记录连接串
2. 【agent】`.env` 指 dev、新增 `.env.staging` + `.env.production`、migration scripts、`.env.example` 三套示例
3. 【agent】GitHub 建 `staging` + `production` 分支；新增 `promote-main-to-staging.yml` Action
4. 【agent】文档更新（CLAUDE.md / operations.md / deployment.md / env-separation-plan.md）
5. 【人工】Vercel 创建 staging / production 两个 project，配置 Production Branch 和 env（§Step 2）
6. 【人工+agent】验收：
   - `pnpm dev` 连 dev 正常
   - `pnpm db:migrate:staging` 指向 staging
   - `pnpm db:migrate:prod` 指向 production
   - push `main` 后 GitHub Action 自动更新 `staging` 分支
