# TradeLinks — Agent Context (OpenCode / Trae Solo)

## ⭐ Session 启动（每次必执行）
```bash
git pull
cat .agent/CURRENT.md
```

See CLAUDE.md for full project context, tech stack, and dev commands.

## ⭐ 前端工作流（OpenCode 覆盖）
本项目对 Claude Code/Gemini CLI 仍以 `CLAUDE.md` 为单一来源；但对 OpenCode 而言，
**前端用户可见变更不再走 `frontend-harness-workflow.md`**（旧 workflow 文件暂作历史
参考保留，不要再作为运行时流程来源）。

请改用 frontend-harness Skill（user-scope 已安装到
`~/.config/opencode/skills/frontend-harness/SKILL.md`）作为前端工作的运行时流程来源。
在 Skill 提示触发前端/UI/UX/设计/动效/前端交付相关任务时调用该 Skill，按其 canonical
流程执行。分级（T1/T2/T3）、设计约束、SDD 惯例、T3 硬门槛等仍以 `CLAUDE.md` §"前端变更
工作流"为准；Skill 负责流程编排，CLAUDE.md 负责项目级业务约束。

切换后请在新会话中验证：执行 `/skill` 或 `frontend-harness` Skill 列表，确认新 Skill
已被 OpenCode 加载。如果仍未发现，重启 OpenCode harness。

<!-- pact:begin (managed by pactify — edit outside this block) -->
# pact protocol

This repo uses the **pact protocol** (v1). Seats (who does what) are listed in
`.pact/PROJECT.md` and `.pact/STATE.yml`.

**Your identity — bind it to this working copy first.** Your seat is resolved
from `PACT_AGENT_ID` (env), else the untracked `.pact/seat` file. Set the
file once per working copy:
```bash
pactify seat use <your-seat-id>   # from the roster in .pact/PROJECT.md
```
For concurrent seats in the same repo, use a separate git worktree per seat.

**Primary — MCP:** the `pact` MCP server is wired into your config. Use its tools
(projects / status / join / assign / checkpoint / accept / changes / merge / validate) and
resources (`pact://state`, `pact://log`). Cold start: call `status`, then `join`
(registers your seat and checks out your feature branch). Every action tool takes an
optional `project` (a name from `projects`) to act on another registered repo without
restarting — default is this repo.

**Fallback — shell** (if MCP is unavailable):
```bash
pactify seat use <your-seat-id>   # if not already bound
pactify join --roles <your-roles>
```
then `pactify help` for the verbs.

**The two rules:** a worker cannot self-accept (only the task's reviewer accepts); a
feature cannot merge until all its tasks are accepted.
<!-- pact:end -->
