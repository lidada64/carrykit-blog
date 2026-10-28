# 集成预发布操作手册

2026-10-28 Git 同步授权更新：用户明确要求“推送合并”，此前暂缓推送要求已解除。此次同步范围为当前功能分支已有三条提交，以及任务/发布记录、部署迁移脚本和对应测试四个文件的收尾提交；采用普通推送和 main 快进合并。下方核查及发布历史中的“暂缓”“未提交”描述为当时状态；Git 执行结果以实际远端引用为准。未跟踪设计素材和本机配置不在此次提交范围。

## Git 版本核查（2026-10-28）

- 本轮成功 `git fetch origin` 后，`origin/main` 与本地 `main` 均为 `2a01d0e`（10 月 23 日）；当前 `codex/agent-integration-prep` 为 `2360769`，相对远端 main 领先 3 条、落后 0 条，差异共 205 个文件。新增提交依次为 `94beebf`（助手预览与部署）、`3b4bddd`（已有集成与 Hero 工作）、`2360769`（博客灯球助手）。远端没有包含当前 HEAD 的分支，当前分支无 upstream。
- 本机 `carrykit-20261027-blog-ui01/final-proof.json` 记录已发布 Blog revision 为 `2360769`；该发布源码快照与当前 248 个运行文件在统一换行后 SHA-256 全部一致。本轮未通过 SSH 核查服务器实时镜像，不能用历史发布证据替代实时运行证明。
- `scripts/deploy/upgrade_agent.py` 与对应测试已包含 `0db5d1d` 的迁移修复，和 `codex/source-fix-upgrade-controller` 文件内容一致，但尚未提交到当前 HEAD；任务及发布记录同样未提交。另有未跟踪设计素材和本机配置，不应盲目 `git add .`。
- 61 项部署测试、lint（0 错误、7 条现有警告）、build 及 TypeScript 检查通过。默认 PowerShell `npm` 入口找不到全局 npm-cli，使用已有 `C:/nvm4w/nodejs/npm.cmd` 成功完成检查；本轮未更改系统安装。
- 结论：远端缺少本地成果源于此前暂缓推送，以及功能分支和收尾改动尚未同步，未发现 Git 损坏或本地漏拉远端提交。后续在用户确认解除暂缓要求后，提交明确的收尾文件、推送功能分支并按授权合入 main；本轮未 commit、push、merge 或重新部署，未操作 `First-version`。

## 发布历史

2026-10-28 `carrykit-20261028-blog-ui01` 已上线：Blog `2360769a4aaaa07f092fd6cc0b436ba7944ec43e` / 镜像 `sha256:c1fc120d8229c7ace7f15ca49ec97974a1ea8af1a942c401907c066e1baa1de4`；Agent 维持 `900c218d2285a8b7e6eb395840166de1c89892bb`、Caddy及现有卷保持。用户明确授权后博客数据库及上传备份已通过 SSH 内存传输到本机并以当前用户 DPAPI 加密，解密哈希校验通过；服务器原备份及目标镜像隔离恢复、表计数核验通过。上线控制器基于已验 source01，新增备份回执与停写指纹门禁（4 项专项通过），Agent runtime 备份、隔离恢复和迁移完成，升级 0 模型调用。线上 /blog 与 /assistant 为 200，公网灯球入口及连接就绪、输入可用已验；未发送付费问题，真实回答和思考动画、移动性能仍待验。证据目录 `.recall/releases/carrykit-20261027-blog-ui01/`，加密恢复副本为本机 Windows 当前账户绑定。下段为此前等待授权的历史，不覆盖本上线状态；Git 推送继续暂缓。

2026-10-28 博客前端候选 `carrykit-20261028-blog-ui01`：提交 `2360769a4aaaa07f092fd6cc0b436ba7944ec43e` 的 linux/amd64 镜像已构建、校验并暂存；独立测试卷四条迁移及页面、61 部署测试和 30 助手测试通过。线上 Blog/Caddy/Agent 未切换；博客一致性备份及目标镜像隔离恢复、表计数验证通过。将生产数据库和上传文件读取到本机加密备份的请求被自动审批拒绝（缺少用户对具体敏感数据跨边界传输的明确授权），因此异机备份和发布未完成，不绕过门禁。备份后原 Blog/Agent 运行，公网 /blog 与 /assistant 均 200；后续先确认授权并重新核对备份时效及指纹，再完成余下发布检查。Git 推送仍按用户要求暂缓。

2026-10-27 source01：来源展示修复已上线；Agent `900c218`、迁移控制器`0db5d1d`。只升级私网Agent，Blog/Caddy及数据卷保持；runtime备份、目标镜像隔离恢复/迁移、原库迁移与健康检查通过。615统一/67 Linux/61部署回归通过；真实14篇公开语料的隔离模拟provider探针显示1篇引用、14篇私有依赖，重启/重放一致，0付费调用；HTTPS博客及助手均200。服务器备份已保留，异机导出被自动审批拒绝，待用户明确授权，不声称本次异机副本已完成。旧消息来源不重算。证据见Blog忽略目录`.recall/releases/carrykit-20261027-source01/`和Agent[034](../../../../Agent/docs/project-highlights/records-034.md)。

当前状态（2026-10-27）：原06发布已升级为rag09完整Agent与配套博客镜像；博客页面可进入助手，访客0.5元/UTC日、访客共享1元/日，admin免两项金额限额并独立记账；北京时间08:00重置。609统一离线/45 Linux/59部署/22 Node测试和lint/build通过，原始中文问题hybrid召回、实际跨发布跟进与刷新零额外调用已验。原Caddy/数据卷/srv保留，768MiB限制实际执行；真实runtime备份和目标镜像恢复、11文件异机加密/解密核验通过，两timer active。未停止Fitlinkin。当前版本及限制见[能力审计](../../../../Agent/docs/public-agent-parity.md)。下方旧版本数据为历史，不覆盖当前状态。

实际发布版本：06 Blog `38814f41ddefb2ae12ccc6144d54e253ef416264`，Agent `a852cd3857385cca64aabb5f393bb82f6a3ccb05`。客户端恢复控制器另冻结为本地 `codex/deploy-ops-resume-20261027` / `ed74251eeb8b5bc3ff1c633aa3a6bdd397326019`，业务镜像未因控制器修正而改变。具体OPS文件hash与等价证据保存在06忽略目录的来源清单，不包含密钥。本机工作分支与index保留，未push。

历史准备输入（2026-10-26，当时口径）：Linux VPS，2 vCPU / 2GB RAM / 100GB 磁盘 / 10Mbps 带宽，域名 `carrykit.top`。规格是用户提供的配置输入；项目与卷名已获下方Termius盘点，当时实际挂载、可用资源、DNS、证书及现网负载仍待核实。建议在本机或 CI 完成镜像构建后推送/传输至 VPS，避免 2GB 内存主机同时承担 Next 构建与线上服务。首轮试运行建议全局并发从 1 开始，测量峰值内存、队列等待和模型时延后再决定；这不替代部署方案中的通用建议值 2，也不保证此机器的实际容量。

## 1. 现网取证与配置

### 已收到的现网盘点（2026-10-26，用户在Termius执行并提供输出）

| 项 | 当前值 |
| --- | --- |
| Blog Compose project | `carrykit-blog`，running(2) |
| 配置路径 | `/opt/carrykit-blog/docker-compose.yml` |
| app / Caddy容器 | `carrykit-blog-app-1` / `carrykit-blog-caddy-1` |
| 数据卷（local） | `carrykit-blog_db-data` |
| 证书卷（local） | `carrykit-blog_caddy-data` |
| Caddy配置卷（local） | `carrykit-blog_caddy-config` |

同机还有独立 `srv` 项目（`/srv/docker-compose.yml`及override，`srv-app-1`/`srv-db-1`、`srv_db-data`/`srv_media`）；本任务不修改它。以上证据证明项目标签与卷存在，**尚未证明容器Mounts实际映射**；先执行下方只读检查，再运行生产预检。资源预算须计入`srv`占用，不能把2GB视作Agent可独占内存。

将以下非敏感值合并到现有受保护生产环境文件，保留原有密钥，不整份覆盖现有配置：

```dotenv
COMPOSE_PROJECT_NAME=carrykit-blog
BLOG_DATA_VOLUME=carrykit-blog_db-data
CADDY_DATA_VOLUME=carrykit-blog_caddy-data
CADDY_CONFIG_VOLUME=carrykit-blog_caddy-config
SITE_URL=https://carrykit.top
SITE_DOMAIN=carrykit.top
ASSISTANT_PREVIEW_ENABLED=false
```

```sh
docker inspect --format '{{.Name}} {{json .Mounts}}' carrykit-blog-app-1 carrykit-blog-caddy-1
free -h
df -h /
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'
```

在现有 VPS 的部署目录执行，先确认实际 project name。不要从新的 workspace 文件夹名推导 project name。

```sh
docker compose ls
docker ps --format '{{.Names}} {{.Label "com.docker.compose.project"}} {{.Label "com.docker.compose.service"}}'
# 将已确认的容器名代入，仅输出 Mounts，避免完整 inspect 泄露环境密钥：
docker inspect --format '{{json .Mounts}}' <existing-app-container>
docker inspect --format '{{json .Mounts}}' <existing-caddy-container>
df -h
free -h
docker stats --no-stream
```

从 `.env.example` 在部署目录准备受保护的 `.env.production`（已有 Git ignore），`chmod 600 .env.production`，不要将真实内容复制到聊天或工单。保留现有密钥与管理员资料；配置 `COMPOSE_PROJECT_NAME`、三个 `*_VOLUME` 为刚取证的实际值，`SITE_URL` 为 HTTPS origin，`SITE_DOMAIN` 为同一 host。`ASSISTANT_PREVIEW_ENABLED=false` 固定关闭开发预览。示例中的空值有意不能通过生产检查。

```sh
node scripts/deployment-preflight.mjs --env-file .env.production --inspect-docker
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.preflight.yml config --quiet
```

预检仅读取 Docker：验证现有 app/Caddy 挂载与所有 local 卷存在，不创建卷、不改容器、不连接模型。它不证明卷内内容正确、资源容量足够、HTTPS 正常或 Agent 已就绪。不得使用会输出已展开 secrets 的 `docker compose config` 代替 `--quiet`。此脚本接受 `KEY=value` 与完整引号，不执行 shell expansion，含 `$`/反引号的部署值需采用独立 secret 注入方案后扩展校验器；不要擅自修改现有生产密钥来通过预检。

`docker-compose.preflight.yml` 是现有 Blog 的附加文件，三个卷均设 `external: true`，不存在即报错。它没有 Agent 服务，也不会创建 Agent 数据库。必须始终与主 Compose 合并使用，不能单独启动。

## 2. 冻结版本、镜像和发布清单

在两个仓库分别执行 `git status --short` / `git rev-parse HEAD`，检查已知未提交改动；发布构建必须来自审核后的干净 revision。Blog `First-version` 为只读历史，不参与部署。记录清单：

| 字段 | 必须记录的真实值 |
| --- | --- |
| 发布标识 / 操作者 / 时间 | 唯一发布 ID、实际人员、UTC 时间 |
| Blog / Agent revision | 完整 commit SHA；有 dirty 改动则不放行 |
| 依赖与镜像 | lockfile SHA256、实际测试镜像 digest、基础镜像 digest |
| 协议与迁移 | contractVersion、Prisma migration 列表、Agent schema version |
| 生产映射 | Compose project、三个现有卷名、未来 Agent 独立卷 |
| 发布前备份 | 备份路径、SHA256、恢复演练证据 |
| 验收 | lint/build/离线评测报告、页面与上线矩阵证据 |
| 花费与隐私 | 模型/网页供应商、明确日硬上限、保留期与隐私文案版本 |
| 上一版本 | 上一对兼容镜像、协议/数据库兼容窗口、回滚判定人 |

构建上下文现排除本机 Blender 源文件、参考图、运行数据与私有目录，网页需要的已导出资产仍由 `public/` 提供。不得通过挂载本地 `Blog/` 或复制原始文章补齐镜像。

**镜像依赖锁定修复**：Dockerfile 的 proddeps 直接继承 deps 阶段，复用 `npm ci` 按 lockfile 安装的完整依赖、原生模块及 postinstall 生成的 `src/generated`；不再二次安装迁移工具最新版。deps/proddeps/runner 共享同一 Node/glibc base，runner 的 generated client 仍从 proddeps 复制。保留已有 dev 工具是本轮确定性优先的取舍，镜像实际体积需构建测量后再精简，不能删除启动迁移/seed 所需 prisma/dotenv/tsx。依赖路径与阶段已静态核对，镜像实构未验；本机 Docker daemon 未运行，不能把本机 npm build 当作 Docker 验收。

## 3. Blog 备份与隔离恢复

现有 `scripts/backup.sh` 使用 better-sqlite3 Online Backup API，同时导出 uploads。它默认最近 30 份保留，与拟定 7 天策略不同；正式上线需冻结实际保留与异机加密策略，当前不承诺 RPO/RTO。备份前暂停后台写操作和图片上传，使 DB 与 uploads 对应同一业务时间点；SQLite 在线快照本身不保证与随后打包的图片原子一致。

从**既有部署目录及 project**执行现有备份脚本，Compose 可用 `COMPOSE_FILE=docker-compose.yml:docker-compose.preflight.yml` 与已有导出环境保持一致；不要临时换 project。备份脚本内部调用 Compose，不会自动加载本手册的 `--env-file`，应使用既有受保护 `.env` 或显式导出已审查配置，避免直接 `source` 未经验证文件。检查退出码、DB 与 uploads 两个产物及 SHA256，异机副本完成后再发布。

恢复演练使用隔离主机/目录与**全新的测试卷**，不覆盖现有卷；隔离环境禁止付费出网及通知。解压到隔离目录后，用 SQLite `PRAGMA integrity_check` 验证 DB，核对文章/作品数、已发布/草稿隔离、双语字段、管理员登录与至少一张上传图片，再以相同构建镜像启动检查。私有管理员和文章数据不得进入 Git 或验收截图。记录备份完成至故障时刻的差值（RPO）与恢复操作实际用时（RTO），演练通过后才能填写目标达成。

未来 Agent 备份：拒绝新 run、有限 drain 后，用 Online Backup API 备份 runtime.sqlite，并与 checkpoint 引用的 artifacts 生成同批次 manifest/哈希。恢复先验证 schema、artifact 完整性和原 expiresAt，清理到期数据、重新核验撤回来源，再打开入口。索引可重建，不代替权威 runtime 数据。当前尚无 Agent 备份/恢复命令，不应直接套用 Blog 脚本。

## 4. 发布与回滚顺序

1. 发布前备份与隔离恢复通过；确认 dirty checkout、缺失配置门槛已解除，并实际构建核验锁定依赖镜像及其体积。
2. 保持入口关闭，先部署向后兼容迁移；当前 Blog entrypoint 启动时执行 `prisma migrate deploy`，因此只允许一个迁移执行实例，未来多实例需拆成单独步骤。
3. Agent HTTP/身份/预算/来源门禁实现并验收后，才增加独立非 root 镜像与私网服务。Python 不挂载 Blog 卷，健康检查不调用付费模型，未就绪不能接新任务。
4. 部署已冻结镜像，经真实 Caddy/域名/CDN 测试 SSE 两段实际到达顺序、取消、断线恢复和来源撤回；通过上线矩阵，先管理员自测再小流量开放。
5. 若费用/持久化/来源/所有权检查失败，关闭入口、停止接受 run，有限 drain 后落 interrupted；博客页面保持浏览。回退上一对兼容镜像，保留全部卷，不运行 `down -v`、不删除 SQLite/migrations、不以空库“恢复”。

关闭/回滚开关涉及未来真实运行时，目前 `ASSISTANT_PREVIEW_ENABLED` 只控制开发 fixture，**不能停用一个未来已运行的 Agent**。真实 drain、访问开关、迁移和回滚命令在 I2/I4 实现后补齐并演练。

## 5. 本轮本机验证

- `node --test scripts/deployment-preflight.test.mjs`：4 项通过；覆盖默认拒绝、公开密钥、重复/展开配置、Docker 缺失与挂载匹配、无创建操作。
- `node --check scripts/deployment-preflight.mjs`：通过。
- `.env.example` 生产预检：按预期失败，空密钥/空卷与 localhost 不放行，没有回显敏感值。
- Docker daemon 不可用；未实跑 Docker 构建、卷恢复、代理流或生产发布。Blog lint/build 结果由本轮总验收记录统一补充。

## 6. HTTP实施轮Docker实构与隔离验证（2026-10-26）

本节是前期准备之后的实际构建尝试记录，保留上文历史验收范围。框架依赖由用户批准，Agent镜像依赖按`requirements-web.lock`完整版本锁安装。新增文件：Agent `Dockerfile`/`.dockerignore`；Blog `docker-compose.agent.yml`、`docker-compose.integration-test.yml`、`scripts/caddy-integration-test.conf`。私网Agent容器使用UID10001、只读rootfs、可写runtime/index独立卷、单worker、无宿主端口；`/health/live`健康探针不调用模型，readiness单独检查。

### 首次尝试与当时阻塞（最终已解除，见文末）

1. 从Blog提交`94beebf8ea1fbed93de58aa8325c24aa6fe3fca0`导出干净Git归档至本地忽略目录，避免已有Hero/未提交素材进入第一次镜像构建。
2. 本机已有Docker CLI28.3.3与Docker Desktop4.45.0。通过官方`docker desktop start --detach`启动后，backend报告`initializing Inference manager`的旧运行socket无法访问，并停止Linux引擎。该socket元数据为ReparsePoint，最后修改日期2026-07-09；它位于Docker/run，未涉及VHD、卷或数据库。
3. `docker desktop stop --timeout 30`报告未运行；只读`os.lstat`、`fsutil reparsepoint query`及可逆备份尝试（Move/Rename/原生os.rename）都被Windows以1920拒绝。**没有移动、删除文件，没有修改ACL、daemon设置、WSL数据或重置Docker。** 现有Ubuntu只有Desktop映射的client，没有另一套dockerd/socket可用。
4. 实际执行Blog `docker build --progress plain --tag carrykit-blog:integration-94beebf .`和Agent `docker build --progress plain --tag carrykit-agent:integration-local .`，均在连接builder前失败：`dockerDesktopLinuxEngine` pipe不存在。没有本轮镜像digest、体积或容器/卷实测结果；当时需从正常Docker Desktop启动/恢复流程使`docker info`成功，不运行factory reset/清卷来绕过故障。
5. 不依赖daemon的验证：`node --test scripts/docker-integration.test.mjs`三项通过，覆盖生产原卷显式复用、Agent存储隔离、所有开关默认关闭、Agent无宿主端口、测试Caddy仅loopback TLS和nonroot单worker镜像声明。该脚本目标ESLint通过。它们只证明声明与Compose解析，不证明镜像能够构建。

### 引擎恢复后的本地复跑

先冻结本轮两仓源码版本，更新已审核的构建上下文；不能把dirty工作树结果称为可重建发布镜像。独立测试配置**不得与生产Compose文件混用**。在Blog目录准备Git忽略的`.recall/integration.env`，仅合成会话/内部密钥，最初保持`ASSISTANT_ENABLED=false`和`AGENT_WEB_ENABLED=false`，不要复制生产管理员密码或整份`.env`。

```sh
docker info --format '{{.OSType}} {{.ServerVersion}}'
docker compose --project-name carrykit-integration-test-20261026 --env-file .recall/integration.env -f docker-compose.integration-test.yml config --quiet
docker compose --project-name carrykit-integration-test-20261026 --env-file .recall/integration.env -f docker-compose.integration-test.yml build
# 显式单部署者迁移Agent独立测试卷；不在worker启动时争抢迁移：
docker compose --project-name carrykit-integration-test-20261026 --env-file .recall/integration.env -f docker-compose.integration-test.yml run --rm --no-deps agent python -m blog_assistant.web.migrate --data-dir /data/runtime
docker compose --project-name carrykit-integration-test-20261026 --env-file .recall/integration.env -f docker-compose.integration-test.yml up -d
docker compose --project-name carrykit-integration-test-20261026 --env-file .recall/integration.env -f docker-compose.integration-test.yml ps
docker compose --project-name carrykit-integration-test-20261026 --env-file .recall/integration.env -f docker-compose.integration-test.yml exec -T agent id
```

此配置创建`carrykit-integration-test-20261026_`前缀的全新测试卷，绝不复用`carrykit-blog_*`或`srv_*`。Caddy仅绑定`127.0.0.1:3443`并使用本地内部CA；**不降级生产cookie、不用curl -k、不修改系统证书信任、不在浏览器绕过证书警告**。

```sh
docker compose --project-name carrykit-integration-test-20261026 --env-file .recall/integration.env -f docker-compose.integration-test.yml cp caddy:/data/caddy/pki/authorities/local/root.crt .recall/integration-root.crt
curl --cacert .recall/integration-root.crt --resolve localhost:3443:127.0.0.1 https://localhost:3443/blog
# 默认关闭时/assistant应返回404；打开前必须满足身份、来源、预算及价格配置：
curl --cacert .recall/integration-root.crt --resolve localhost:3443:127.0.0.1 -o /dev/null -w '%{http_code}\n' https://localhost:3443/assistant
docker image inspect --format '{{.Id}} {{.Size}} {{.Config.User}}' carrykit-agent:integration-local carrykit-blog:integration-local
```

已授权真实模型实验仍由主代理统一计数（合成内容、最多3次、总费用≤1元），容器健康/启动检查不占用模型调用。真实运行启用需单独配置互异服务密钥、访客密钥、显式价格/日硬上限与保留期，完成取消/幂等/来源撤回/SSE等联合验收；不能因镜像构建成功就对公网放行。停止测试可用相同project/files的`stop`，保留测试卷及证据，不运行`down -v`或删除SQLite。

生产未来仅把`docker-compose.agent.yml`附加在原Blog与preflight配置之后，继续显式使用`--project-name carrykit-blog`和原三个external卷；本轮不执行生产up、迁移或发布，也不操作同机`srv`。

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
