#!/bin/sh
# 容器启动(ARCHITECTURE §5):先应用数据库迁移,再启动 standalone server
set -e

echo "Running prisma migrate deploy..."
npx prisma migrate deploy

exec node server.js
