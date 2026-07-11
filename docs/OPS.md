# OPS — 部署与运维手册

> 版本:v1.0 | 日期:2026-07-09 | 适用:TASKS M4(Docker + Caddy + VPS)
> 架构见 [ARCHITECTURE.md](ARCHITECTURE.md) §5;环境变量清单见 §6。

## 1. 首次部署(VPS)

前置:VPS 已安装 Docker(含 compose 插件);域名 A 记录指向 VPS IP;80/443 端口开放。

```bash
# 1. 取代码
git clone https://github.com/lidada64/carrykit-blog.git /opt/carrykit-blog
cd /opt/carrykit-blog

# 2. 配置环境变量(compose 读取同目录 .env)
cat > .env <<'EOF'
SESSION_SECRET=<32+ 随机字符,如 openssl rand -base64 32>
SITE_URL=https://your-domain.com
SITE_DOMAIN=your-domain.com
ADMIN_EMAIL=<管理员邮箱>
ADMIN_PASSWORD=<初始密码,seed 后可从 .env 移除>
EOF

# 3. 构建并启动(app 启动时自动 prisma migrate deploy;Caddy 自动签 HTTPS)
docker compose up -d --build

# 4. 创建生产 admin 用户(会同时写入示例文章/作品,后台可删)
docker compose exec app npx prisma db seed
```

验证:`https://your-domain.com` 各页可访问;`/admin` 能用上面的凭据登录。

注意:
- 公开页构建期用空库预渲染,seed/发文后由 ISR 在 60s 内刷新,属正常现象
- `DATABASE_URL` 由 compose 固定为 `file:/data/blog.db`(named volume `db-data`),不需要写进 .env
- 上传图片存储在 `/data/uploads`,与数据库共用 `db-data` volume 自动持久化

## 2. 更新(发布新版本)

```bash
cd /opt/carrykit-blog
git pull
docker compose build app
docker compose up -d app     # 启动时自动应用新迁移
docker image prune -f        # 清理旧镜像层(可选)
```

数据卷不受影响;有 schema 迁移时 entrypoint 的 `migrate deploy` 会自动应用。

## 3. 回滚

```bash
cd /opt/carrykit-blog
git log --oneline -10                 # 找到要回退到的 commit
git checkout <commit>
docker compose build app && docker compose up -d app
```

注意:**代码回滚不会回退数据库迁移**。若坏版本引入了新迁移,优先"向前修复"
(fix + 新迁移);确需回退数据库,用备份恢复(见 §5),再回滚代码。
确认稳定后 `git checkout main` 回到主线。

## 4. 备份

脚本:[`scripts/backup.sh`](../scripts/backup.sh)——对运行中的库做一致性在线快照
(better-sqlite3 backup API,不是裸 cp),gzip 后保留最近 30 份。
同时备份 `/data/uploads` 目录(tar + gzip),与数据库快照配对。

```bash
# 手动执行
cd /opt/carrykit-blog
BACKUP_DIR=/var/backups/carrykit ./scripts/backup.sh

# 定时(crontab -e,每天 03:00)
0 3 * * * cd /opt/carrykit-blog && BACKUP_DIR=/var/backups/carrykit ./scripts/backup.sh >> /var/log/carrykit-backup.log 2>&1
```

建议再配一层异地备份(rclone/scp 把 `/var/backups/carrykit` 同步到对象存储)。

## 5. 恢复

**关键**:不要对停止的容器 `docker cp`——volume 只在容器运行时挂载,
写入会落到容器层而不是数据卷。恢复用临时容器直接挂 volume:

```bash
cd /opt/carrykit-blog
docker compose stop app                        # 1. 停 app,避免写入竞争

gunzip -k /var/backups/carrykit/blog-<时间戳>.db.gz   # 2. 解压出 .db

# 3. 临时容器挂数据卷覆盖数据库(volume 名用 `docker volume ls` 确认,
#    通常为 <目录名>_db-data)
docker run --rm \
  -v carrykit-blog_db-data:/data \
  -v /var/backups/carrykit:/backup:ro \
  alpine sh -c "cp /backup/blog-<时间戳>.db /data/blog.db"

docker compose start app                       # 4. 重启
```

若同时需要恢复上传图片:

```bash
# 解压 uploads 备份(与数据库恢复一同操作)
gunzip -k /var/backups/carrykit/uploads-<时间戳>.tar.gz
docker run --rm \
  -v carrykit-blog_db-data:/data \
  -v /var/backups/carrykit:/backup:ro \
  alpine sh -c "rm -rf /data/uploads/* && tar xf /backup/uploads-<时间戳>.tar -C /data/uploads"
```

验证:前台内容回到备份时点;admin 可登录。

## 6. 常用命令

| 操作 | 命令 |
|---|---|
| 看应用日志 | `docker compose logs -f app` |
| 看 Caddy 日志 | `docker compose logs -f caddy` |
| 容器状态 | `docker compose ps` |
| 进入应用容器 | `docker compose exec app sh` |
| 手动跑迁移 | `docker compose exec app npx prisma migrate deploy` |
| 重新 seed | `docker compose exec app npx prisma db seed`(幂等 upsert) |
| 全栈停止/启动 | `docker compose down` / `docker compose up -d` |

## 7. 恢复演练记录

- 2026-07-09(本地 Docker,M4-3 验收):备份 → 删除一篇文章模拟数据损坏 →
  按 §5 流程恢复 → 文章回来,计数与备份时点一致。✅
