# 集成预发布操作手册

2026-10-26。当前交付是准备材料：Blog 可构建，Agent 仅配置/存储基础，尚无可上线 HTTP 服务；不执行下述生产操作。I2/I3 与上线矩阵未通过前，公开问答保持关闭，开发 fixture 也不对公众开放。

用户提供的目标环境：Linux VPS，2 vCPU / 2GB RAM / 100GB 磁盘 / 10Mbps 带宽，域名 `carrykit.top`。规格是用户提供的配置输入；项目与卷名已获下方Termius盘点，实际挂载、可用资源、DNS、证书及现网负载仍待核实。建议在本机或 CI 完成镜像构建后推送/传输至 VPS，避免 2GB 内存主机同时承担 Next 构建与线上服务。首轮试运行建议全局并发从 1 开始，测量峰值内存、队列等待和模型时延后再决定；这不替代部署方案中的通用建议值 2，也不保证此机器的实际容量。

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
