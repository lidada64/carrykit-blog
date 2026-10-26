# Carrykit × Blog-Agent 集成工作区

更新：2026-10-26。交付状态：架构基线、`/assistant` 开发夹具页面、Agent 配置/SQLite checkpoint 基础及部署预检材料。尚未实现 HTTP 服务或运行连接，未生产部署。

采用一个专用 multi-root workspace 管理集成，Blog 与 Agent 留在原目录、原 Git 仓库。集成文档存放于博客现有 docs 下，避免再复制一份产品需求或业务代码。打开 [carrykit-agent.code-workspace](carrykit-agent.code-workspace) 即可同时管理三个视图：Integration、Carrykit Blog、Blog-Agent。本机独立入口另存于专用 `carrykit-agent-integration` 文件夹；该入口不改变 Codex 项目绑定。

## 从哪里开始

| 工作 | 阅读 | 完成条件 |
| --- | --- | --- |
| 总体选型、模块责任、数据归属 | [architecture.md](architecture.md) | 明确数据与权限的唯一所有者 |
| 页面与对话栏设计 | [frontend.md](frontend.md) | 按状态矩阵做界面，先接固定事件夹具 |
| 前后端接线 | [contracts.md](contracts.md) | 身份、版本、幂等、事件和错误契约一致 |
| 部署与数据库运维 | [deployment.md](deployment.md) | 预发布故障演练、恢复和关闭入口均通过 |
| 发布前操作与检查命令 | [release-runbook.md](release-runbook.md) | 核实现网卷/版本/备份及真实发布门槛 |
| 开发顺序与验收 | [tasks.md](tasks.md) | 按阶段提供证据，未实现项保持未勾选 |

产品范围仍以 [Agent PRD](../../../../Agent/docs/PRD.md) 与 [Blog PRD](../../PRD.md) 为准；历史讨论由 [共享上下文](../README.md) 保留。此目录只维护跨仓库架构与联调契约。涉及业务范围变化先改对应 PRD；接口变化先改本目录，再同步实现与契约测试。

## 本轮默认决策

- 同一 VPS：Caddy → Next.js → 私网 Python；单 Agent 实例起步。
- 首个可分享入口 `/assistant`；文章页 contextual 入口后接，管理页 `/admin/assistant` 单独隔离。
- Next.js 管身份、正式内容、审批；Agent 管会话、执行、预算、事件和派生索引。
- 浏览器发送命令用 Server Actions，读取状态/事件用同源 GET + SSE；不让浏览器直接连接 Python。
- Python 的 HTTP 层建议 Starlette + Uvicorn，属于**待确认的新框架依赖**，本轮未安装；实现前按两仓规则确认，不用临时自制生产 HTTP server 绕过。
- 管理写入留第二阶段，首版公开问答只读；网页 MCP 是原有首批需求，必须有真实提供方接入后才声明联网可用。

以上为本次自主规划的架构基线，可直接指导两个工作流。匿名身份、保留期限、并发与超时的初始值均在部署文档明确列为待预发布验证配置；未声称已经获得容量或费用验证。

## 协作与版本

前端工作流维护 Blog 页面、字典、Server Actions、内容 API；后端工作流维护 Agent adapter、服务、持久化、工具权限。两者共享契约，分别提交各自仓库。每次联调记录两个 commit SHA（有未提交修改时另记工作树摘要）、协议版本、migration 版本、模型/提示/索引版本与测试报告。

不合并仓库，不复制核心，不移动文章、SQLite 或现有会话，不操作 `First-version`。所有“目标行为”都应经 tasks.md 验收后才能标为已实现。

## 当前可运行入口

- Blog 开发服务器：`npm run dev` 后访问 `/assistant`；状态和回答均为夹具，不调用模型/内容 API/MCP。正式 build 的页面默认 404；`ASSISTANT_PREVIEW_ENABLED` 仅是预览开关，不是正式 Agent 运行开关。
- Agent：在 `Agent/code` 执行 `python -m blog_assistant.web.preflight`，默认返回 `DISABLED`；详细配置、显式迁移和未完成项见 [Web 基础说明](../../../../Agent/code/blog_assistant/web/README.md)。`AGENT_WEB_ENABLED` 默认 false，预检通过不表示 HTTP 已就绪。
- 生产预检：按 [操作手册](release-runbook.md) 获取真实 Compose/卷映射，再执行脱敏检查。当前 SSH 密码会话由用户在本机 Termius 登录，已收到carrykit-blog项目与三个同前缀local卷的盘点，待核实实际挂载与共享资源占用；具体值见操作手册。
