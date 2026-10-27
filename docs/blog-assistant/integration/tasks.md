# 集成实施与验收

2026-10-26：INTEGRATION-0及本机HTTP切片已交付，最新完成范围见文末HTTP验收；历史记录保留。本表是跨仓库协调计划，不重复勾选已有 USER/META/MGMT 功能。

## 开发顺序

| 阶段 | 前端 / Blog 工作流 | 后端 / Agent 工作流 | 放行标准 |
| --- | --- | --- | --- |
| I0 架构基线 | workspace、UI 状态、文档对齐 | 源码接点、持久化与协议设计 | 文档链接/路径核验、现有基线检查 |
| I1 契约与夹具 | /assistant 静态壳、所有状态 fixtures、reducer | runtime store/API skeleton、配置验证、文章来源 seam | 前端 fixture 与后端同契约；新增框架先确认；不开放公网 |
| I2 最小联通 | Actions/session/所有权；snapshot/SSE 订阅 | durable run、单会话锁、幂等、停止/退出、额度 | 同问题重复提交只生成一次，刷新恢复，跨用户失败 |
| I3 真实数据与联网 | 已发布文章 API、语言/版本、引用 UI | 网站 adapter、来源核验、网页 MCP、后续独立索引 | 博客与网页实际可答；draft/撤回/断连正确；只在实际查询后标联网 |
| I4 预发布 | 实际页面/键盘/双语/移动体验 | 镜像/迁移/备份、代理、限流、故障恢复 | 下面上线矩阵全通过；真实质量和费用授权实验完成 |
| I5 体验补齐 | USER-6/7/8/9/10、完整过程展示 | 静态语料、阶段持久化、保留清理 | 降级后零模型/MCP；退出不重开；不重置额度 |
| I6 管理闭环 | /admin/assistant 原稿/差异/审批 | 单篇整理提案、版本/幂等、审计/outbox | 人工批准一次生效，冲突拒绝，之后才扩批量 |

I1 前后端可各自工作，I2/I3 必须联合验收。初始最小联网链路保留原 PRD 的优先意图；I3 不要求完成语义索引才允许网页查询。完整 token streaming、复杂动画和 Subagent 不阻塞首版；基本身份/持久预算/来源门禁则不能后置。

## 可直接认领的任务

2026-10-26后续认领：用户要求HTTP接入、真实模型和Docker实构，先补前置；已明确批准Starlette+Uvicorn，使用独立Python环境与版本锁。真实测试获准现有DeepSeek、仅合成内容、最多3次、总费用不超过1元；由主代理统一执行与持久记账，其他工作流只用mock。公开入口继续关闭，HTTP鉴权/Run预算/内容回源/身份迁移随本切片交付；现有CLI不改。具体结果后补，不预先勾选I2–I4。

2026-10-26 部署前准备认领：按用户要求由三个 subagent 分别负责 I1-F、I1-B 的无新增框架基础切片、I4 部署材料与预检。前端先确保开发预览可操作，不改首页与 Blog 设计；真实 HTTP/身份/预算执行/内容 API/MCP 及生产放行仍按后续矩阵验收。HTTP 框架未批准前不安装依赖；不以临时 HTTP server 替代生产适配器。

- [x] I1-F：按 frontend.md 建页面与 fixture transport，覆盖正常/排队/取消/失败/退出/过期/预算/撤回；无实际服务时明确标开发预览。2026-10-26：15项reducer/transport检查通过，双语、桌面与360/390px页面实际验收见下；这是开发夹具，不代表真实问答上线。
- [x] I1-B：先审批 HTTP 依赖；抽出文章来源接口与 Web RuntimeStore，验证 CLI 兼容、artifact 路径和 checkpoint 原子性。
  - [x] 2026-10-26 无新增框架基础：配置默认关闭、显式SQLite v1迁移、owner/到期隔离、checkpoint CAS与受控artifact seam；18专项及统一547项通过。文章来源接口与HTTP仍待实现，见 [Web基础说明](../../../../Agent/code/blog_assistant/web/README.md)。
- [x] I2-F：visitor session、命令 Actions、只读 routes；每个入口校验 owner，SSE 不缓存。
- [x] I2-B：Run/预算/事件事务、相同幂等键、取消 fence、受限队列与不确定调用恢复。
- [x] I3-F：文章 API 与 manifest、内容版本/撤回检测、双语字段、来源卡片。
- [ ] I3-B：网站只读 adapter、上下文/答案/历史回放核验、真实网页 MCP；关键词路径通过后再索引同步。
- [ ] I4：两仓联调、真实模型成本/质量实验、故障注入、生产代理与备份恢复。
- [ ] I5：完整额度体验与静态语料，按既有 USER 各条验收；基础退出/刷新能力已在 I2 完成。
- [ ] I6：单篇提案/审批闭环；META 字段通过 migration 增加；批量另行认领。

## 公开上线必须通过的矩阵

| 场景 | 可验证结果 |
| --- | --- |
| 两个访客、伪造 admin/mode、猜 conversation/run ID | 所有消息、事件、恢复、取消均隔离；不能读 draft/CLI 文件 |
| 相同 ID 重发、快速双击、双标签并发 | 一个 run、一次预算预留；不同 payload 冲突；会话只一 active |
| 接受成功但响应丢失、SSE 断网/刷新 | 查询原 run；事件不重复拼接；不增加模型调用 |
| 取消与完成竞态、运行中退出、迟到响应 | 单一终态；closed 不复活；迟到费用有账、消息不追加 |
| worker 在模型发送前/后、检查点前/后崩溃 | 可解释 interrupted；不自动重复付费；无丢账/假 completed |
| 文章更新/撤回/删除、索引陈旧、API 失联 | 读取/上下文/最终答复/历史回放均重验；无旧正文再曝光 |
| 预算告警/耗尽、清 cookie、全站并发 | 日硬上限仍生效；fallback/blocked 零模型/MCP 调用 |
| SQLite 锁、磁盘满、迁移失败 | 请求不被虚假接受；健康检查/告警可见；旧博客仍可浏览 |
| provider 超时、空响应、输出截断、摘要失败 | partial/failed 明确；有限重试计入总额；不假称完整 |
| HTTPS/Caddy/CDN 实际流、连接泄漏 | 分段及时到达；心跳/恢复有效；终态关闭连接 |
| 凭据/日志/恶意文章/恶意 URL | 无前端密钥；提示注入不提权；内网访问工具被拒 |
| 双语、移动、IME、键盘、减少动态 | 实际 dev server 页面目检与操作通过 |
| 备份恢复到空的隔离环境 | 两库/必要 artifacts 可读；旧权限重验；记录真实 RPO/RTO |

每次 Blog 改动运行 `npm run lint`、`npm run build`；页面实现后运行 dev server 实测，数据实现后用隔离 seed 验证前后台。Agent 实现/提交前跑 `python code/evaluate_agent.py --mode offline`；真实模型实验独立记录模型、语料版本、样本、正确性、来源支持、费用、失败样本。未经授权不付费测试，不能用离线数量替代问答质量。

## 发布前需要冻结的配置

HTTP 框架依赖批准；实际 VPS 资源/域名/原卷名；模型与网页 MCP 提供方及凭据；明确日成本上限；对话/备份保留期与隐私文案。这些不阻塞设计与 fixture 开发，但未确定前 feature flag 保持关闭。

2026-10-26：用户提供 Linux/2vCPU/2GB/100GB/10Mbps、`carrykit.top`，未实测。SSH目标可连通但现有密钥认证失败，用户使用Termius密码登录；用户已返回Termius只读盘点：carrykit-blog运行2容器，配置/opt/carrykit-blog/docker-compose.yml，三个carrykit-blog卷存在且为local；Mounts实际映射与资源占用仍待核实。另有独立srv项目，不在修改范围。连接信息按用户要求仅保存在本地Git忽略目录，不把SSH地址写入公开文档。成本/模型/HTTP依赖/保留期仍未冻结。

## 本轮验证记录

本轮仅文档与 workspace；不修改 schema、业务代码、部署配置或用户数据。路径/链接、lint/build、Git 状态的实际结果记录在本节收尾；不预先宣称页面/HTTP/生产验收通过。

2026-10-26 收尾：两个 workspace 的三项目录均解析成功；本目录 Markdown 本地链接零缺失；博客 lint 通过（0错误、7既有警告）、production build 与 TypeScript 通过。首次 npm shim 缺失目标模块，随后用 `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint` 和同入口 `run build` 成功，不更改环境、不绕过检查。页面/Agent服务/真实模型/生产故障验收未执行，因为本轮没有实现这些代码；未运行Agent离线套件，本轮仅Agent文档且无提交。

Git：两仓开始时已有未提交修改，本轮只增改文档/workspace，保留原有修改；未提交、未推送。独立本机workspace启动目录不属于这两个业务仓库；可迁移workspace文件已随Blog集成文档保存。P1规划记录已同步唯一台账029；I0已完成，I1–I6仍待实施。

### 2026-10-26 部署前准备实施验收

- 前端：`/assistant` 开发预览、同契约reducer与fixture transport；不访问模型/内容API/MCP。生产模式HTTP404已实测；预览默认关闭。状态测试15项、部署预检4项通过。
- 页面实际验收：dev server 1280px桌面、390/360px窄屏；Enter与鼠标发送、排队取消、退出后输入锁/新对话焦点、过期、新建后模拟额度不重置、fallback固定回复、来源撤回清正文/来源、EN/中切换均已操作。窄屏scrollWidth等于360/390，composer位于消息区之后无覆盖；修复说明折叠和ScrollSmoother适配，见台账D25。中文IME保护与无新增动画路径已复核，未声称真实手机软键盘/系统reduced-motion实测通过。
- Blog 最终 lint通过（0错误、7既有警告）、production build含TypeScript通过。Agent最终547项0失败/错误/跳过，报告 `Agent/code/eval_results/20261026T055355035528Z/report.md`；18专项用临时库/模拟模型，没有读私人文章或付费调用。
- 部署：新增external三卷overlay、脱敏只读预检、发布/备份/隔离恢复/回滚手册；合成Compose `config --quiet`通过。构建上下文排除本机素材/运行数据；Docker daemon不可用，镜像实构/启动/恢复/Caddy SSE/真实问答均未执行，I2-I6与公开上线矩阵保持未勾选。
- Git：两仓保留原有修改，本轮新增代码/文档均未commit或push；`.recall/deployment-access.md`仅本地记录，无密码/私钥。不将dirty checkout视为可重建发布版本。

### Git整理与提交快照验收（2026-10-26）

按用户授权，两仓各自建立`codex/agent-integration-prep`，Blog基于main、Agent基于master；只提交本轮文件/文档片段，旧Hero、全文阅读与RAG修改留在工作树，不推送或自动合并。两仓使用`Integration-Id: carrykit-agent-prep-20261026`关联，Blog提交说明记录Agent提交SHA，最终SHA清单仅保存在本地忽略目录。

Blog暂存快照用全新隔离空库，Prisma应用3项已有migration后lint/build和19专项通过；Agent暂存快照修复测试连接释放后541项全过。差于工作树547项的6项属于本轮排除的旧功能测试；失败/修正过程见共享台账030。密钥、SQLite、运行日志、私人文章与SSH记录未暂存。

### 2026-10-26 HTTP、真实模型与本机Docker最终验收

本节更新前文历史状态：HTTP运行连接已在本机实现并通过合成数据验证，尚未部署VPS或开放公网。Starlette/Uvicorn已获用户批准并独立环境锁定；Next访客cookie、服务双向HMAC/持久nonce、Actions与snapshot/SSE、已发布文章回源、Run幂等/取消/队列/预算/恢复已实现。来源在上下文、提交、快照与事件重放时重验；继承历史的来源计入当前答案依赖。SSE发送真实阶段和核验后的完整答案，尚非逐token输出。CLI工具、私人文章、网页MCP未接入该路径。

- Blog lint通过（0错误、7既有警告），production build含TypeScript通过；23项内容/签名/状态检查及7项部署配置检查通过。实际dev页面可发送真实合成问题并显示来源，刷新恢复未新增模型调用；先前fixture的桌面、360/390px验收保留，不冒充本轮真实移动设备测试。
- Agent统一573项0失败/错误/跳过（含44项Web测试），报告 `Agent/code/eval_results/20261026T121400799092Z/report.md`。Mock与真实host HTTP各14检查通过；容器HTTPS六检查通过，涵盖ready不付费、Next到私网Agent、同键同run、SSE终态、仅一次provider调用、撤回后snapshot和历史SSE清除旧答案。
- 授权真实请求共3次，均为合成Orion材料，DeepSeek/deepseek-flash，input共521、output共90 token；按已核实高峰未命中输入/输出价格保守估算合计¥0.001762，不是服务商账单。不再调用模型。计数与脱敏结果保存在Blog忽略目录 `.recall/http-integration-20261026/` 和 `.recall/docker-build-20261026/`。
- Docker引擎已正常启动，Linux server 29.9.2。Blog与Agent镜像实构成功，独立测试项目只绑定loopback HTTPS3443、使用新测试卷；原本机/VPS博客卷和srv未动。测试后恢复两个flag=false，去除临时真实provider配置；/blog=200、/assistant=404，TLS使用专用CA正常校验，无全局信任修改或安全绕过。
- 未完成：IP层滥用限制、物理TTL清理与隐私文案、协调备份/隔离恢复、完整故障矩阵、真实文章质量与2GB VPS容量/实际卷映射核验。I3网页MCP及索引仍待实施，I4整体不勾选；此前D7/D9真实多轮质量提醒保留，这3个单题不能代替其验收。
- Git：当前HTTP切片尚未commit/push；原有Hero/RAG等修改保留。镜像来自已提交基线Git归档加显式HTTP文件覆盖，不是已冻结的干净发布revision；正式部署前仍需分别提交、验证同一配对快照并记录digest。
