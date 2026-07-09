#!/bin/sh
# SQLite 定时备份(TASKS M4-3):在 VPS 上由 cron 调用,项目根目录执行。
# 用 better-sqlite3 的在线备份 API(容器内自带)生成一致性快照,
# 拷出后 gzip,保留最近 30 份。用法:
#   BACKUP_DIR=/var/backups/carrykit ./scripts/backup.sh
# cron 示例(每天 03:00):
#   0 3 * * * cd /opt/carrykit-blog && BACKUP_DIR=/var/backups/carrykit ./scripts/backup.sh >> /var/log/carrykit-backup.log 2>&1
set -e

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

# 在线备份:对运行中的库生成一致性快照(非直接 cp,避免写入中途撕裂)
docker compose exec -T app node -e "require('better-sqlite3')('/data/blog.db').backup('/data/backup.tmp.db').then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); })"
docker compose cp app:/data/backup.tmp.db "$BACKUP_DIR/blog-$STAMP.db"
docker compose exec -T app rm /data/backup.tmp.db

gzip "$BACKUP_DIR/blog-$STAMP.db"

# 只保留最近 30 份
ls -1t "$BACKUP_DIR"/blog-*.db.gz 2>/dev/null | tail -n +31 | xargs -r rm --

echo "backup done: $BACKUP_DIR/blog-$STAMP.db.gz"
