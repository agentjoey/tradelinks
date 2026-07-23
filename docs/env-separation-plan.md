# 环境拆分方案（dev / prod）（2026-07-21）

> 现状（CLAUDE.md §Single environment MVP）："dev" = 本地 repo；GitHub/Vercel/Railway/Neon 全是生产；本地 `.env` 的 `DATABASE_URL`/`DIRECT_URL` **直连生产库**，本地写脚本（翻译、backfill）直接写生产。本文规划如何低成本拆出 dev 环境。

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

Vercel
  Production 部署 ─────────► Neon production 分支（现状不变）
  Preview 部署（PR/分支） ──► Neon dev 分支（Preview 作用域 env）

Railway（生产专属，不动）
  worker / scraper ────────► Neon production 分支
```

## 3. 分步实施

### Step 0：Neon 创建 dev 分支（人工 1 分钟 / 或给 agent API key）

- Neon Console → Branches → Create branch，从 `production`（`ep-mute-base-aotkza3n`）派生，命名 `dev`。
- 得到 dev 分支的 pooled + direct 两条连接串。
- 免费档分支额度以 Console 为准（历史上 10 个/项目；dev 分支空闲自动 scale-to-zero，几乎不耗 CU）。
- **立即在 dev 分支做一次清理**（分支会连 pg-boss 的 schema 一起复制，含 9 个 cron schedule 和残留 job）：
  ```sql
  TRUNCATE pgboss.schedule; TRUNCATE pgboss.job; TRUNCATE pgboss.archive;
  ```
  否则本地 dev worker 一启动就会照 prod 的 cron 表开火（虽然数据写到 dev 库，但 channel-push/newsletter/radar-review 会真的发 Telegram/Resend——见 Step 3 的开关）。

### Step 1：env 文件重组（本地默认 dev）

- `.env` → 全部改指 **dev 分支**（pooled + direct）。从此本地一切默认安全。
- 新增 `.env.production`（gitignored）→ 放生产两条连接串 + 生产特有的 key 引用，**仅**以下场景使用：
  - `prisma migrate deploy` 上生产 schema
  - 明确要在生产跑的 backfill/修复脚本
- 用法约定（写进 `.env.example` 和 CLAUDE.md）：生产操作统一 `dotenv -e .env.production -- pnpm tsx scripts/xxx.ts` 或 `pnpm db:migrate:prod`（新增 script）。
- `.env.example` 增补 dev/prod 双套示例 + 注释说明默认必须指 dev。

### Step 2：Vercel 环境作用域

- `DATABASE_URL`/`DIRECT_URL` 在 Vercel 项目设置里按作用域拆分：
  - **Production** = production 分支 pooled（DIRECT 仅 worker 用，Vercel 不需要）
  - **Preview** = dev 分支 pooled → 所有 PR/分支预览部署自动用 dev 库
  - **Development** = dev 分支 pooled（`vercel dev` 本地联调）
- 其他 key（AI/Telegram/Resend/X）：Preview 作用域放空或放测试值，避免预览环境触发真实推送。

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

### Step 5：migration 流程定型

1. 新 migration 先对 dev 分支跑 `pnpm db:migrate:dev`（`prisma migrate dev`）。
2. 验证（dev 起 app/worker 冒烟）。
3. 上线窗口：`dotenv -e .env.production -- pnpm prisma migrate deploy`（新增 `pnpm db:migrate:prod` script 固化此命令）。
4. 文档：`docs/deployment.md` 加「migration 两阶段」节。

### Step 6：文档收口

- 重写 CLAUDE.md 的 **Single environment (MVP)** 节 → **Environments** 节（dev 默认 / prod 显式 / 各组件归属）。
- `docs/operations.md` 增补「环境矩阵」表（组件 × dev/prod × 连接目标）。
- AGENTS.md 顶部启动协议无需改（`git pull` + CURRENT.md 不变）。

## 4. 成本影响

| 项 | 新增成本 |
|---|---|
| Neon dev 分支 | ~$0（免费档分支额度内；空闲自动睡眠；CU 与 P1 修正后的节奏一致） |
| Vercel Preview | $0（Hobby 含预览） |
| Railway | $0（不动） |
| dev worker/scraper | $0（本地按需） |
| **合计** | **~$0/月** |

## 5. 风险与注意事项

| 风险 | 缓解 |
|---|---|
| dev 分支复制了 prod 的 pgboss cron 表，dev worker 启动即触发真实 Telegram/Resend | Step 0 的 TRUNCATE + Step 3 的强制关开关，双保险 |
| 旧习惯肌肉记忆：脚本仍写生产 | `.env` 默认指 dev 后，写生产必须经 `.env.production`——物理隔离 |
| Neon 免费档分支数/CU 额度不确定 | Step 0 时在 Console 一眼可见；超出就先删旧 dev 再建 |
| 预览部署拿 dev 库跑 migration 冲突 | Preview 不设 DIRECT_URL，prisma 只在 Railway/本地执行 |
| Neon Auth 在 dev 分支的行为（托管 Auth 随分支复制） | admin 登录验证一次；dev 分支的 auth 数据是分支时刻快照，测试账号可能需重建（进 Step 2 验收） |

## 6. 执行顺序（总计 ~30 分钟人工 + 1 个任务量）

1. 【人工】Neon Console 建 dev 分支 + TRUNCATE pgboss 三表 + 记录两条连接串（或给我 Neon API key 代办）
2. 【人工】Vercel env 按作用域拆分（§Step 2）
3. 【agent】`.env` 指 dev、新增 `.env.production`、`pnpm db:migrate:prod` script、`.env.example` 双套示例
4. 【agent】dev 侧开关默认值写入 `.env`；文档三处更新（CLAUDE.md / operations.md / deployment.md）
5. 【人工+agent】验收：`pnpm dev` 连 dev 正常；本地 `pnpm worker` 起得来且不碰生产；`db:migrate:prod` dry-run 确认指向
