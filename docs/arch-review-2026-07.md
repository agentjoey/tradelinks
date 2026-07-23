# 整体架构评估（2026-07-19）：四个方向 + DB/Auth 替代项

> **决策记录（2026-07-21）**：P1（Neon 节奏修正）已实施上线（`cbbbc53`）；**scraper→HF 迁移取消，架构保持 Vercel + Railway(worker+scraper) + Neon 三组件，不引入新平台**。§3 推荐路径中 P2/P3 不再执行，本文其余分析（成本压力、Neon 免费帽、worker 归宿判定）继续有效。
> 关联文档：`docs/hf-migration-eval.md`（HF 单点评估）、`docs/architecture.md`、`docs/railway-setup.md`。
> 本文是决策评估，不是实施计划。选定方向后再出 plan。

## 0. 触发本次评估的关键发现：Neon 免费档与"永不睡眠"冲突

- **Neon Free = 每项目 100 CU-hours/月**，闲置自动 scale-to-zero 才不计费（[Neon Pricing](https://neon.com/pricing)）。
- 本项目 `scheduler-tick` **每分钟 poll Neon**（`docs/operations.md` 记录"永不 scale-to-zero"）。常驻最低 0.25 CU × 720h ≈ **180 CU-hours/月 —— 已超免费帽 ~1.8 倍**。超出后要么转 Launch 付费（$0.106/CU-h → 约 **$19/月**），要么免费档被限额暂停。
- **行动项 P0：查 Neon 当前 plan 与最近账单**——这决定后面所有方向的基线成本。生产目前正常，说明要么已在付费、要么有未注意的豁免。
- Neon Auth（Managed Better Auth）免费档 60k MAU 内不收钱，beta 期 Object Storage/Functions 免费，这些不是成本问题。

## 1. 架构不变量（任何方向都必须满足）

1. **Vercel 前端需要公网可达的 Postgres**（serverless 直连，pooled）。
2. **pg-boss 需要 PG 兼容 + LISTEN/NOTIFY + 直连端口**（pooler 事务模式会断 LISTEN；Neon/Supabase 都有 direct 端口）。换成非 PG（Turso/SQLite）= 队列层重写，不予考虑。
3. **`pg_trgm` 扩展**（去重相似度）→ DB 必须支持扩展。
4. **worker 必须常驻 + 任意出站 TCP**（Neon/Supabase `:5432`、各 AI API、Telegram、Resend）。
5. **scraper 无状态 HTTP**（Chromium，1–2GB，~2 次/天）。
6. **Auth 当前 = Neon Managed Better Auth**（`/admin/*`，Google OAuth + ADMIN_EMAILS）。替换成本中低（见 §4）。
7. 前端 Vercel Hobby 免费且健康，**不在本次变动范围**。

## 2. 四个方向

### 方向 1：Railway + Neon（现状）

```
Vercel ─┐                    Neon Free/Paid（DB+pg-boss+Auth）
        ├─ pooled :5432 ────▲ ▲
Railway worker ─────────────┘ │
Railway scraper（内网）◄───────┘ worker HTTP 调用
```

- **月成本**：Railway $5（Hobby）+ Neon $0–19（见 §0）= **$5–24**
- **优势**：零迁移、已在跑、文档齐全、scraper 内网私有。
- **劣势**：Neon always-on 与免费帽冲突（§0）；Railway 上 Chromium 曾烧 credit；两个平台各有价格变动史。
- **结论**：若 §0 查下来 Neon 实际免费（或几分钱），现状就是合理基线，只做 scraper 出账优化即可；若 Neon 在收 ~$19，现状是**最贵的方案**。

### 方向 2：Fly.io + Neon

- **月成本**：worker shared-cpu-1x 512MB ≈ $3.2–4（[Fly 价目](https://fly.io/docs/about/pricing/)）+ Neon $0–19 + scraper 另置（HF $0 或 Fly 按秒）= **$3.2–23**
- **优势**：worker 比 Railway 便宜 ~$1–2；按秒计费精细；区域多可贴 Neon；无常驻 HTTP 要求（Machines 无 `[[services]]`）。
- **劣势**：**迁 worker 不是孤立决策**——worker 与 scraper 的 Railway 内网断裂，scraper 被迫公网化（加 token）或随迁；双平台运维；无免费档。
- **结论**：单独为 worker 迁 Fly 收益 ~$1–2/月，不抵迁移+运维成本。**只有在决定 worker 也离开 Railway 时才进入候选（见方向 3 的组合 B）。**

### 方向 3：混合 Hugging Face 免费 + 其他

- scraper → **HF Spaces free**（2vCPU/16GB，Docker SDK，出站 80/443 ✓，睡眠与 12h 调用节奏天然匹配）——详见 `docs/hf-migration-eval.md` §3.1 改造清单（端口、token 鉴权、保活 ping、冷启动实测）。
- worker 留 Railway（A）或迁 Fly（B）；DB/Auth 见 §4 的两种选择。
- **组合 A（最小变动）**：Railway worker $5 + HF scraper $0 + Neon = **$5–24**（Neon 问题原样保留）。
- **组合 B（成本最优云方案）**：Fly worker ~$3.2 + HF scraper $0 + **Supabase $0（DB+Auth，见 §4）** ≈ **$3.2/月**。
- **结论**：**推荐路径**。scraper 迁 HF 是无风险面的纯收益（无状态、Docker 就绪）；DB 是否迁 Supabase 取决于 §0 账单。

#### 附：worker 能去 Supabase 或 HF 吗？（2026-07-19 补，结论：都不能，除非重写）

| 平台 | 现状部署 | 重构适配 | 判定 |
|---|---|---|---|
| HF Spaces | ❌ 出站白名单（80/443/8080）挡死任何 PG `:5432`（Neon/Supabase 一样）；免费档无入站流量必睡眠；该网络策略对付费档同样生效 | 队列层改成全 HTTP（PostgREST/RPC）才可谈——那是重写 | **不适合，永远**（对无状态 HTTP 的 scraper 才合适） |
| Supabase | ❌ 无常驻 Node 运行时；Edge Functions 是 **Deno**，免费档 **150s 墙钟 / 2s CPU / 256MB**（[limits](https://supabase.com/docs/guides/functions/limits)）——分钟级 LLM 管线（daily-note/x-tick）装不下，pg-boss/Prisma 的 Node 语义也不兼容 | 理论路径：`pg_cron + pg_net → Edge Functions + pgmq`（[Supabase Queues](https://supabase.com/docs/guides/queues) 存在），把常驻 worker 拆成定时短函数；代价 = 队列层重写（push→poll 语义）+ Deno 移植 + 长任务分段，收益仅省 Railway $5/月 | **MVP 阶段不划算** |

worker 的现实归宿：**Railway（现状 $5）/ Fly（~$3.2）/ 本机常开（$0）** 三选一。

### 方向 4：本地方案

#### 4a. 半本地（worker+scraper 本地，DB 留云）

- worker 用 pm2/launchd 常驻本机，直连云端 PG（Neon/Supabase 均公网可达）；scraper 本机 Docker，worker 走 localhost。
- **月成本**：$0（电费忽略）+ 云 DB $0。
- **硬前提**：**一台 24h 常开的机器**。MacBook 合盖/睡眠 = 每分钟 cron 全部停摆、队列积压。有 Mac mini/NAS/旧机才谈。
- **风险**：单机故障即全停；无托管备份（DB 在云上不受影响）；本机 IP 变化/断网时队列重试堆积（pg-boss 有重试，恢复后自愈）。
- **结论**：有常开机则 worker 成本直接归零，是最便宜的"半"方案；没有则一票否决。

#### 4b. 全本地（含前端与 DB）

- Next.js 自托管（node/pm2）+ Cloudflare Tunnel（免费 HTTP 隧道）+ 本地 Postgres（Docker）+ Better Auth 自托管。
- **月成本**：$0 + 电费。
- **额外代价**：前端出公网全靠隧道（单点）；本地 PG 无托管备份（需 pg_dump cron + 异地拷贝）；域名接入 Cloudflare；所有平台化保障（Vercel CDN/边缘、Neon 分支/恢复）全没了。
- **结论**：技术可行、工程不划算。除非有明确的"去云化"诉求，不推荐。

## 3. DB 替代项矩阵（不换 PG 的前提下）

| 候选 | 免费额度 | always-on 适配 | pg-boss | pg_trgm | 风险/注记 |
|---|---|---|---|---|---|
| **Neon（现状）** | 100 CU-h/月 + 0.5GB | ❌ 超帽（§0） | ✓（DIRECT_URL） | ✓ | 超帽即 $19/月或暂停 |
| **Supabase Free** | 500MB DB，**无 compute-hour 计费**，7 天无活动才暂停（我们每分钟活跃 → 永不暂停） | ✅ | ✓（用 direct :5432，绕开 Supavisor pooler） | ✓ | egress 5GB/月需观察（MVP 流量内）；备份免费档 7 天 |
| Railway PG | 按量（~$5+/月） | ✅ | ✓ 内网 | ✓ | 比 Supabase 贵，胜在同平台 |
| 自托管 PG（Fly volume/本地） | $0（机器成本） | ✅ | ✓ | ✓ | 运维+备份自理 |
| ~~Turso/libSQL~~ | — | — | ✗ 非 PG | ✗ | 队列重写，排除 |

**Auth 替代项**（若 DB 离开 Neon）：

| 候选 | 适配 | 成本 |
|---|---|---|
| **Better Auth 自托管**（Neon Managed 的本体库） | 语义最接近现状：Google OAuth + ADMIN_EMAILS + middleware；auth 表进新 DB（CLI 生成 schema） | $0，~1–2 任务量 |
| Supabase Auth | 免费 50k MAU，全家桶顺手 | $0，但 SDK 语义与现 middleware 差异较大 |
| Auth.js(NextAuth) v5 | CLAUDE.md 原规划项 | $0，重写 auth 层 |

推荐 **Better Auth 自托管**（库相同、改动最小）。

## 4. 推荐路径（分阶段，每步可独立止损）

- **P0（今天就做，零成本）**：查 Neon plan + 最近 3 个月账单、Railway 账单分项（worker vs scraper）。基线数字决定一切。
- **P1（若 Neon 在收费）**：DB 迁 **Supabase Free** —— pg_dump/restore（数据 ~29MB，分钟级）、pg-boss schema 重建（任务 30min 保留，无需迁移）、Prisma `DATABASE_URL`/`DIRECT_URL` 改指（worker 用 Supabase **direct** 端口）、auth 换 Better Auth 自托管。**收益 ~$19/月。**
- **P2（任意时点）**：scraper → HF Spaces free（改造清单见 hf-migration-eval §3.1，约 1 任务量）。**收益 = Railway 上 scraper 分项。**
- **P3（可选）**：worker → Fly（~$3.2/月）。仅在 P1+P2 落地后且 Railway worker 分项 > $4 时值得。**收益 ~$1–2/月，优先级最低。**
- **目标态（组合 B）**：Vercel（$0）+ Fly worker（~$3.2）+ HF scraper（$0）+ Supabase DB+Auth（$0）≈ **$3.2/月**，全部主流免费/低价档，无单点绑定。
- **本地方案保留意见**：若你有 24h 常开机器，方向 4a 可以把 worker 那份也省掉（目标态变 **$0/月**），用可靠性换成本——告诉我机器情况再评估。

## 5. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| Neon 免费帽被超，DB 被限额暂停 | 全站停摆 | P0 查账单；迁移 Supabase |
| Supabase egress 5GB 超额 | $0.09/GB | 上线后观察一个月（MVP 流量预估内） |
| HF Spaces 冷启动 > scrape 120s 超时 | BSR 批次失败 | 保活 ping + worker 预热重试逻辑 |
| pg-boss 换库重连抖动 | 队列短暂积压 | 迁移窗口低峰期；重试机制自带 |
| auth 迁移期 admin 登不上 | 审核中断 | 保留 Neon Auth 项目 30 天回滚位 |
