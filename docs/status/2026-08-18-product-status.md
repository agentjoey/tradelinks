# TradeLinks — 产品进展、状态与 Backlog

**日期：** 2026-08-18 · **生产 commit：** `c43d6c7` · **数据来源：** Neon `br-autumn-smoke-aof5n7pe`、Railway API、生产站点实测

---

## 0. 一句话

管线全线打通并已自主运行 17 天，公开站有真实内容且可被订阅。**瓶颈已从"技术不通"转为"源产不出足够有价值的内容"**——按当前源外推，每月能上线 1–2 条，填不满一个日更情报站。

---

## 1. 产品当前形态

面向**在美国市场销售的跨境卖家**的公开情报站，可被索引、证据可追溯。

**线上地址：** https://tradelinks.agentjoey.ai
（计划中的 `tradelinks.us` 已被他人持有、不可购买，该假设作废）

### 公开面（全部 200）

| 类别 | 路由 |
|---|---|
| 首页与变更 | `/` `/changes` `/changes/[slug]` |
| Hub | `/us` `/amazon-us` `/shopify-us` `/categories(/[c])` `/topics(/[t])` |
| 内容 | `/guides(/[slug])` `/briefings(weekly|monthly|daily)` |
| 透明度 | `/coverage` |
| 机器契约 | `/openapi.json` · `/api/v1/changes` · `/feeds/changes.xml` 等四路 RSS · `/agent/tradelinks/SKILL.md` |

Legacy 六条路由全部 308 到契约目标。`/admin/review` 为编辑台（`ADMIN_EMAILS` 白名单）。

### 内容流水线

```
采集(8 cron) → 聚簇 → 相关性判别(AI) → 促成 → 解读生成(AI) → 人工审核 → 发布 → 分发
```

**两道 AI 门禁都 fail-closed**：不确定一律不放行。

- **相关性判别**（MiniMax-M3）：判"该变更是否对跨境消费品卖家**强制或自动**生效"。可选功能、工业品反倾销、非美国事务一律拒绝。
- **解读生成**：护栏是**可计算的**——模型必须逐字引用原文支撑句，程序校验其存在，找不到即丢弃。

---

## 2. 生产实测数据

### 内容漏斗

| 阶段 | 数量 |
|---|---|
| items | 4,316 |
| 证据簇 | 4,195（其中 **184** 被相关性门禁判定无关并永久落库） |
| canonical 变更 | 11 |
| ├ 草稿（待人工审核） | 8 |
| └ 已发布 | **3** |
| 公开可见 | RSS 3 项 · API 3 条 · sitemap 18 条 |

**转化率约 0.26%**（4,195 簇 → 11 变更）。这不是缺陷——门禁在诚实工作；它反映的是源的构成。

### 管线健康（近 10 天，331 次运行）

| 作业 | 成功 | 异常 |
|---|---|---|
| COLLECT | 89 | 1 PARTIAL |
| CANONICALIZE | 60 | — |
| PUBLISH | 60 | —（全 EMPTY，无已审核内容可发） |
| HEALTH | 274 | 1 FAILED（见 §4.2，是**检测生效**而非故障） |
| BRIEFING | 1 | 1 BLOCKED |

源健康：24 小时内 24 个源成功抓取，**0 个 capability 为 STALE**。

### 基础设施

| 平台 | 状态 |
|---|---|
| **Vercel** | Ready，服务 `tradelinks.agentjoey.ai` |
| **Railway** | 8 个 cron + scraper；7 SUCCESS / 1 CRASHED（见 §4.1） |
| **Neon** | **32.5 / 100 CU-h**（周期第 17 天），外推月末约 **50**；存储 177 MB / 512 MB |

Neon 余量比 8 月初预估（69–84）宽裕，因归档了 dev/staging 分支且测试频率下降。**不再是紧迫风险。**

---

## 3. 本轮已交付（2026-08-05 → 08-08，19 个提交）

### 3.1 打通管线（此前完全断裂）

- **cluster → CanonicalChange 促成**（`9a5669a`）。此前全仓库无任何代码创建 `CanonicalChange`，3,667 个簇永远停在 DRAFT，`publish` 每次正确地报空。两条铁律：绝不发明文字、绝不产出公众可见行。
- **90 天时效下限**（`262d745`）。Shopify changelog feed 带整个存档回溯到 2018，促成任务曾把八年前的功能公告当作当前情报。合格积压 1,625 → 140。
- **相关性判别 + 判定落库**（`4046598` `6eed6a2` `4805ef8`）。
- **解读生成**（`1d54b33`）。

### 3.2 修复"看起来正常、实际什么都没做"的缺陷

按危害排序：

1. **`AMZ-ANNOUNCEMENTS` 四层失效**（`ab72adf`）——选择器选中营销区块 → 解析失败**伪装成"成功但为空"** → 夹具照着错误选择器手写所以测试永远绿。该源自配置起零产出。修复后 0 → 9 条，**已在生产确认为 `SUCCEEDED_ITEMS / 200`**。
2. **readiness 冻结**（`7852be6`）——`seedSources` 只在待删的旧 worker 里被调用，Railway 切换后无人接管。源全死也不会转 STALE。已安家到每小时 `health-check`。这同时让 owner 决策 4 首次生效（`platform:amazon-us` UNAVAILABLE → MONITORED，`/amazon-us` 与 `/trends` 由 404 变 200）。
3. **VERIFIED 不可达 → RSS 订阅者永远收不到东西**（`a77ad68` `4a90d6a`）——`EvidenceRecord.reviewedAt` 自 Foundation 起从未被任何代码写入，而三个分发渠道默认只看 verified 池。已加"确认证据"编辑动作 + 默认池改 monitored。
4. **草稿只有标题**（`3615558`）——6/8 条 summary 是标题复读，正文一直躺在 `rawContent` 里。
5. **canonical 主机三处不一致**（`895ef4f`）——机器契约在宣告一个不解析的域名。收敛为单一常量 + 文档漂移守卫测试。
6. **sitemap 在宣告自己的 308 重定向**（同上）。
7. **时区缺陷**——纯日期在东八区整体偏移一天（生产跑 UTC 才碰巧没暴露）。
8. **一个未转义的 `&`** 让 750 KB 的 feed 整份丢弃（`7852be6`）。
9. **置信度字段畸形吃掉整批**（`3615558`）——模型返回 `"medium"` 而非数字，严格 schema 抛错导致 20 条一批全丢。

### 3.3 编辑与呈现

- **审核队列上限 50 + `showing N of M`**——原查询对每条草稿急加载证据与全部历史版本，几千条会拖垮页面；而截断后看起来像"队列已清空"会误导编辑。
- **免责声明改为页级**（`c43d6c7`，走完 T3 强度的 Mockup Gate）——原本 100% 记录命中，一页 20 条重复 20 次。真实 build 又暴露出 `/changes` 上一条前提已全部过期的 `Expert view` 提示，一并移除。

### 3.4 我自己的两个错误（已在仓库文档撤回并更正）

- 把 `items` 列入退役集——`EvidenceClusterMember` 对它有外键，执行会打断在跑的管线。`0014` 未编写，错误只被记录未被执行。
- `.env.production` 不存在，`dotenv-cli` 静默回落到 dev 库，导致一整轮"生产"结论全错。

---

## 4. 当前已知问题

### 4.1 `collect-fast` 显示 CRASHED — 中

最后一次运行 `attempted=10 succeeded=9 failed=1 itemCount=17 exitCode=1`。**采集是成功的**（17 条），但一个源失败导致整个作业 exit 1，Railway 记为 CRASHED。

失败源为 **`US-FTC-CONSUMER`**，且它**连 `SourceCheck` 都没写入**——失败发生在结果能入账之前。

两个独立问题：
- 9/10 成功被呈现为"服务崩溃"，会造成告警疲劳，让真故障淹没在噪音里；
- 一个源的失败没有留下任何可诊断记录。

### 4.2 周报永远为空 — 高

`Briefing` 表**一行都没有**，而 `BRIEFING` 作业在 08-10 报告过 `SUCCEEDED_ITEMS`。

根因是**契约错位**：Operations 分支的 `briefing-batch` 写 `scopeKey = "weekly-briefing"`（常量），而 `briefings.ts` 查找 `${kind}:${periodKey}`（如 `weekly:2026-W33`）。两者永不匹配；且 `generateBriefing()` 在生产**没有任何调用方**。

`/briefings` 因此恒为空。08-17 的 `HEALTH FAILED`（scopeKey `BRIEFING_ABSENT:2026-08-10`）正是健康检测**正确地**发现了这件事——那不是故障，是告警在工作。

### 4.3 解读功能上线 11 天，生产产出 0 条 — 高

08-11 促成的 **"Managed Markets is ending Delivered Duty Unpaid (DDU)"**——一条高度相关的变更（直接关乎跨境卖家的关税处理），正文 684 字符——**没有解读**。

已排除：密钥存在、代码已部署（`1d54b33c`）、正文远超 120 字符门槛。**对同一条草稿现在复跑，结果是 `applies=true`、引用校验通过、`TEMPLATE OK`。**

所以最可能是当时模型调用偶发失败，被 fail-soft 吸收。**但 fail-soft 路径不留任何记录**——这才是真正要修的：现在无法区分"模型拒绝"、"引用校验不过"和"调用失败"。

### 4.4 内容量不足 — 最高（这是产品问题，不是技术问题）

相关性门禁工作正常，但它照出了源的贫瘠：

| 源 | 性质 | 产出 |
|---|---|---|
| `A02` Shopify Changelog | 功能更新日志 | 多为可选功能，被正确拒绝 |
| `B03` 联邦公报 | 全品类 | 多为**工业品**反倾销（拖车、钢丝、液压缸） |
| `AMZ-ANNOUNCEMENTS` | 亚马逊公告 | 约 4–5 条/年，多为大会/项目宣传 |

140 条候选里仅约 4% 值得发布。**每月能上线 1–2 条。**

方向不在调门禁——门禁的 DROP 理由逐条正确。方向在**启用面向消费品的联邦源**：

| 源 | 现状 | 为何值得 |
|---|---|---|
| `US-CPSC-RECALLS` | disabled（缺解析器与夹具） | 消费品召回＝必须下架，最强"必须行动" |
| `US-FDA-RECALLS` | disabled（待官方通告核对） | 化妆品/保健品召回 |
| `US-CPSC-RSS` | **已在抓**，但 `EXPERIMENTAL` | 被锚点门槛挡住 |
| `US-FTC-CONSUMER` | **已在抓**，但 `EXPERIMENTAL` | 同上（且正是 4.1 的失败源） |

后两个已有数据，仅因 readiness 是 `EXPERIMENTAL` 而无法锚定变更。**提级是一项覆盖度声明，属 Human Owner 决定。**

---

## 5. Backlog（按建议顺序）

### P0 — 让产品有内容

| # | 项 | 说明 | 归属 |
|---|---|---|---|
| 1 | 查 CPSC/FTC 两源实际抓到什么 | 量化"提级能带来多少真实内容"，作为决策输入 | Agent |
| 2 | **决定是否将 `US-CPSC-RSS` / `US-FTC-CONSUMER` 提级为 MONITORED** | 覆盖度声明 | **Human Owner** |
| 3 | 为 `US-CPSC-RECALLS` / `US-FDA-RECALLS` 补解析器与夹具 | 消费品召回是"必须行动"密度最高的一类 | Agent |

### P1 — 修好已交付但未生效的东西

| # | 项 | 说明 |
|---|---|---|
| 4 | 给解读的 fail-soft 路径加可观测性 | 记录跳过原因（拒绝／未落地／调用失败），否则无法诊断 4.3 |
| 5 | 修 briefing 契约错位 | 统一 `scopeKey` 为 `kind:periodKey`，并在作业中接上 `generateBriefing()` |
| 6 | 区分"部分成功"与"崩溃" | 让 `collect-fast` 在 9/10 成功时不以 exit 1 结束；同时确保源失败必定入账 |

### P2 — 编辑与运营

| # | 项 | 说明 |
|---|---|---|
| 7 | **审核队列 8 条草稿** | 每条都有 "Confirm evidence → Verified" 可用 | **Human Owner** |
| 8 | **前端改动亲自走查** | `/changes` 默认视图、详情页红框、移动端、主题切换 | **Human Owner** |
| 9 | 首批发布后复验 | RSS/sitemap/hub 归类是否正确 | Agent |

### P3 — 收尾与治理

| # | 项 | 说明 |
|---|---|---|
| 10 | pact `railway-cutover` 仍 `awaiting_review` | Track A 任务，其余 22 个已全部 accepted |
| 11 | Step 8 legacy 退役（`0014`） | 退役集为 `alerts`/`daily_notes`/legacy `clusters`，**不含 `items`**；执行前须按现行代码重新推导 |
| 12 | 清理 Neon 检查点分支 | `pre-relevance-sweep`、`phase1-public-pre-retirement` 等 |
| 13 | 修正 CLAUDE.md 中失效引用 | `frontend-harness` Skill 不存在；`.env.production`/`.env.staging` 不存在 |

---

## 6. 判断

**技术侧该通的都通了。** 从采集到分发的每一环都在生产自主运行，两道 AI 门禁的行为经过实测且都朝安全方向失败，编辑台具备发布一条变更所需的全部动作。

**站点价值的上限现在由源决定，不由代码决定。** 继续优化管线的边际收益很低；把 CPSC/FTC 那条线打通，是当前唯一能显著改变产品面貌的动作。

**一个必须保持诚实的事实**：站上现在有 3 条内容。产品的立身之本是"诚实声明自己知道什么、不知道什么"——在源变厚之前，它就应该看起来像一个覆盖窄但每条都站得住的站，而不是靠放宽门禁去撑满页面。
