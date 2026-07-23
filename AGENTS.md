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
