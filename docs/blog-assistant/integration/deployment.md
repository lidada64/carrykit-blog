# 部署与运维方案

当前状态（2026-10-27）：原06发布已升级为rag09完整Agent与配套博客镜像；博客页面可进入助手，访客0.5元/UTC日、访客共享1元/日，admin免两项金额限额并独立记账；北京时间08:00重置。609统一离线/45 Linux/59部署/22 Node测试和lint/build通过，原始中文问题hybrid召回、实际跨发布跟进与刷新零额外调用已验。原Caddy/数据卷/srv保留，768MiB限制实际执行；真实runtime备份和目标镜像恢复、11文件异机加密/解密核验通过，两timer active。未停止Fitlinkin。当前版本及限制见[能力审计](../../../../Agent/docs/public-agent-parity.md)。下方旧版本数据为历史，不覆盖当前状态。

历史准备状态（2026-10-26，当时口径）：[发布操作手册](release-runbook.md)、`scripts/deployment-preflight.mjs` 与 `docker-compose.preflight.yml` 已落地。当时预检只验证现有 Blog 配置/卷映射，overlay 强制复用显式现有卷并关闭 fixture；当时尚无 Agent HTTP 镜像或可上线服务，Docker 实构、真实代理、双库恢复与公开矩阵仍待 I2–I4。部署开关 `ASSISTANT_PREVIEW_ENABLED` 仅用于前端开发预览，不代表真实 Agent 运行许可。

Dockerfile 的 proddeps 已改为继承 `npm ci` 完成的 deps 阶段，迁移工具与传递依赖复用同一 lockfile，避免二次无锁安装。保留既有 dev 工具会增加镜像体积；阶段/原生模块环境及 generated client 路径仅完成静态核对，镜像实构与体积测量待 Docker 环境可用后执行。

2026-10-26 HTTP实施轮的容器准备：Agent已新增独立Dockerfile与生产依赖完整版本锁，Python 3.12、nonroot、单Uvicorn worker；生产附加配置为`docker-compose.agent.yml`，本地隔离验证为`docker-compose.integration-test.yml`。两端运行开关默认关闭，Agent不发布宿主端口、不挂载Blog库或本机文章。三项Compose/容器配置专项通过。**实际Blog与Agent的docker build均已尝试，但Docker Desktop引擎启动失败，尚未生成本轮镜像或运行容器**；具体诊断与恢复后的完整复跑步骤见[操作手册§6](release-runbook.md#6-http实施轮docker实构与隔离验证2026-10-26)。不得将配置解析通过写成镜像实构通过。

## 1. 部署单元

| 服务 | 网络与进程 | 持久化 |
| --- | --- | --- |
| caddy | 公网 80/443；只转 Next | 复用证书卷 |
| app | 3000 仅 Docker 网络 | **复用现有 db-data 卷**，Prisma 管理 blog.db |
| agent | 私网 8000，单 ASGI 进程、有界异步执行器 | agent-data：runtime.sqlite、受控 artifacts |
| index maintenance | 单独计划任务/单写者，复用已有 cache_update 思路 | agent-index：网站派生快照/索引；模型缓存只读挂载 |

首版建议 Starlette + Uvicorn（需确认新增依赖）；不把 CLI 作为每请求子进程，不在 Next Server Action 内跑长 Python 任务。embedding CPU 工作与事件循环隔离，复用当前隔离 worker，冷启动预热后再启用 readiness。不在模型缺失时对每个请求自动下载。

Compose 扩展以现有 blog 部署为基准；先查现网 project name 与实际卷名，再显式引用现有卷。禁止在独立 workspace 直接用新的 Compose project 名启动一个同名空库并误判数据丢失。agent 不发布宿主机端口；仅将必要服务接入网络。需要模型/MCP 出网，因此不能只用断外网的 internal network 而遗漏 egress 设计。Linux 本地磁盘存 SQLite，不放 NFS。

服务进程以非 root 运行，最小可写目录；不挂载宿主机源码、个人文章、Docker socket 或整份 .env。凭据按服务分配，Next 若保留原翻译能力仍使用自己的独立模型配置，不与访客 Agent 共享无限额账户权限。

## 2. 配置与启动检查

| 配置类别 | 内容 |
| --- | --- |
| Next | 现有 DATABASE_URL/SESSION_SECRET/SITE_URL；AGENT_BASE_URL、双向内部密钥、访客 cookie 密钥、入口 feature flag |
| Agent | runtime/index/artifact 目录、模型 endpoint/model/key、内容 API 地址、内部签名密钥、公开工具 allowlist |
| 预算 | 每主体/全站日成本上限、单轮最大调用/输入输出、摘要/修复预留、MCP 成本上限、计价版本 |
| 运维 | 消息保留期、审计保留期、并发/队列/超时、健康阈值、备份目标 |

秘密放部署环境或 secret 文件，不入 Git、不用 NEXT_PUBLIC 前缀。配置缺失时 readiness 失败；每日成本上限没有显式值时保持 Agent 入口关闭，不擅自选择真实花费额度。

初始**工程建议值，非实测容量**：全局同时执行 2 个 run、排队最多 8 个、每会话 1 个；排队超时 30 秒、run 截止 120 秒、外部调用超时不超过剩余 deadline；SSE 心跳 15 秒。Agent 冷启动/慢模型不满足时应调优或降低并发，而非取消限额。会话固定创建后 24 小时到期（访问不续期），公开消息/事件同 TTL，清理小时级；脱敏运行审计 7 天，费用账本至少覆盖日窗口及对账期。隐私说明需明确提示内容会发送到配置的模型服务、保留时间及退出不等于立即删除。

## 3. 启动、迁移与发布

1. 冻结两个仓库 revision、依赖锁与镜像 digest、contractVersion、迁移版本和测试报告；不把 dirty checkout 当可重建发布版本。
2. 备份现有 Blog SQLite 与 uploads，记录真实卷映射；Agent 首次上线另建卷。Blog schema 变化生成 Prisma migration，部署用 migrate deploy；Agent 存储用自身版本化迁移。迁移由单个部署步骤执行，不由多个 worker 抢跑。
3. 先向后兼容的数据库扩展，再部署 Agent 与 Next；旧列保留至回滚窗口结束。新旧协议不兼容时关闭入口再升级。
4. 私网 `/health/live` 只检查进程存活，`/health/ready` 检查数据库/迁移/配置/模型资源；不为健康检查调用付费模型。ready 失败停止接新 run，博客本身继续工作。
5. 经 Caddy 完成真实浏览器对话、取消、重连、草稿隔离、来源撤回、额度与故障演练；通过后先管理员自测再小流量开放。
6. 回滚先关闭 feature flag、拒绝新 run，允许有界 drain；超过宽限期取消并落 interrupted。切回上一对兼容镜像；数据库只做已验证的兼容回滚，不能直接丢卷重建。

单机发布允许短暂 Agent 不可用，目标是博客浏览持续可用；不宣称零停机或高可用。灰度与回滚兼容窗口至少保留上一版协议/数据库读取能力。

## 4. 流式与反向代理

SSE 路径不缓存、不经过普通响应压缩/聚合；Caddy 对 `text/event-stream` 有即时 flush 行为，仍需通过实际域名/可能的 CDN 测试，不能只验证 localhost。Next route 使用 streaming response，订阅断开释放连接，任务执行寿命独立。不得随意全站设置负 flush_interval 并假设它等同于取消语义。

验收：开发和生产代理路径分别发两个间隔事件，浏览器第一段必须先于第二段到达；短暂断网后从 cursor 重放且模型请求次数不增加。官方依据：[Next 自托管](https://nextjs.org/docs/app/guides/self-hosting)、[Caddy streaming](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。

## 5. 备份、告警与故障处理

SQLite WAL 仍只有一个同时写者，控制事务时长并观测 busy/锁等待。[SQLite WAL](https://www.sqlite.org/wal.html)

备份使用 SQLite Online Backup API，不直接复制运行中的 `.db` 单文件；复用网站现有备份脚本思路。Agent 备份 runtime.sqlite 与被 checkpoint 引用的 artifacts：暂停新 run 并 drain 后建立同一 manifest 快照，或实现版本不可变 artifact + 备份清单校验。索引可重建不作为权威恢复来源。[SQLite Backup API](https://www.sqlite.org/backup.html)

建议初期每日加密异机备份、保留 7 天，目标 RPO ≤24h、RTO ≤1h，**须恢复演练才能承诺**。备份包含会话时也受保留策略管理，恢复后按原 expiresAt 清理，不复活过期消息；短期会话到期不代表历史备份已即时物理清除，隐私说明披露最长备份保留期。Article 撤回后恢复出的旧索引必须重验网站权限才能启用。

监测 requestId/runId、队列等待、阶段耗时、首个公开事件、成功/partial/失败/取消、provider usage、预留/实际/未知费用、索引版本、DB busy、磁盘与内存。日志不记录正文、隐藏推理、密钥或完整 IP。

故障门槛：预算服务/身份验证不可用 → 拒绝新 run；内容 API 失联 → 博客证据路径关闭；embedding 不可用 → 明确关键词降级；provider 超时 → partial/failed，不无限重试；磁盘不足/持久化失败 → 不返回已接受/已完成假象；Agent 全停 → 网站保留浏览并显示暂不可用。

扩容触发由观测决定：持续锁等待/队列超时、恢复目标不达标或必须多实例时，再设计 PostgreSQL/外部队列；在此之前不增加这些依赖。

### 实构最终结果：初始阻塞已解除（2026-10-26）

以上失败记录仅代表首次尝试。随后AI从Docker Desktop正常GUI启动，界面显示Engine running，docker info确认Linux 29.9.2；GUI显示Desktop4.96.3，前述4.45.0来自旧信息，不能作为当前版本。旧dockerInference/socket问题的确切根因未证明；无清卷、重置或ACL修改。

使用基线Git归档加显式HTTP覆盖生成受控上下文，Agent锁定依赖，完成两个镜像：

| 镜像 | ID | 本机inspect Size |
| --- | --- | --- |
| carrykit-blog:http-20261026 | sha256:3d731ef781163338c1168ff65a0353765debf59ad688f32d05e18fd62499b4eb | 1,786,525,522 bytes |
| carrykit-agent:http-20261026 | sha256:1a6b0a315c1c641e5e136a67baa77dc094c0a7c52d16abef86a522684b5503e5 | 266,354,111 bytes |

Blog第一次成功实构为3,354,394,242 bytes；发现standalone与完整node_modules重复COPY，后续chown还复制大层。调整为只复制standalone/server.js、.next和package.json，保留完整锁定生产依赖，COPY --chown并仅chown必要目录；第二次实构和容器启动验证通过。以上为本机镜像字节对照，不是线上下载量/内存/延迟结论。

独立项目carrykit-integration-test-20261026已实际完成迁移、nonroot运行及Caddy TLS联通；完整证据在忽略目录`.recall/docker-build-20261026/`。真实合成问题经HTTPS→Next→Agent→provider完成，幂等不重复付费、撤回后快照及历史SSE不再返回旧正文/来源；首批阶段0.032s、终态0.844s到达，证明该次代理分段发送，不代表真实域名/CDN性能。Windows curl/Schannel专用CA请求因撤销检查未知失败，改用Python ssl.create_default_context加载同一CA且验证hostname成功，未使用-k或禁用证书校验。

3次授权模型请求总计521输入/90输出token，保守价格估算¥0.001762（非账单），额度已用满。容器测试后已还原默认关闭配置，临时带真实模型key的env文件移除，原生产项目/卷未动；测试服务收尾停止并保留新卷/证据。正式日预算、保留策略、备份恢复和VPS容量未冻结，不据本次结果开放carrykit.top。当前HTTP变更未提交，镜像不是正式发布冻结版本。
