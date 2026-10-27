# 多阶段构建(ARCHITECTURE §5 / TASKS M4-1)
# base → deps(全量依赖+prisma generate) → builder(standalone 构建)
#      → proddeps(复用锁定依赖+迁移/seed 工具链) → runner
#
# 说明:
# - 构建期 SSG 需要数据库:builder 内用空库(migrate deploy)预渲染,
#   页面上线后由 ISR(60s)从数据卷真库刷新
# - 运行时保留 prisma CLI + dotenv + tsx:容器启动执行 migrate deploy,
#   并支持 `npx prisma db seed` 创建生产 admin(M4-2)
# - 用 debian slim 而非 alpine:better-sqlite3 原生模块与 prisma
#   schema-engine 的 glibc 预编译产物最稳

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ---- deps:全量依赖(构建用),postinstall 触发 prisma generate ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---- builder:standalone 构建,SSG 用空库预渲染 ----
FROM base AS builder
ARG SITE_URL=http://localhost
ENV SITE_URL=$SITE_URL
ENV DATABASE_URL=file:./build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# src/generated 被 .dockerignore 排除,构建前重新生成 client
# 限制 Node 内存，防止在小内存 VPS (1GB) 上由于 Next.js 构建导致 OOM 卡死
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npx prisma generate && npx prisma migrate deploy && npm run build

# ---- proddeps:复用 npm ci 的锁定依赖与原生模块 ----
# 保留既有 dev 工具，确保 prisma/dotenv/tsx 及其传递依赖均来自 lockfile。
# deps 与 runner 同属 base，原生模块的 Node/glibc 环境一致；不二次安装最新版。
# 镜像体积待实际构建测量后再精简，不能 prune 掉启动迁移/seed 所需工具。
FROM deps AS proddeps

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

# Runtime tools use the locked full dependency tree. Avoid first copying the
# traced node_modules and then replacing them in another immutable image layer.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/server.js ./server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=proddeps --chown=nextjs:nodejs /app/node_modules ./node_modules
# 迁移与 seed 所需
COPY --chown=nextjs:nodejs prisma.config.ts ./
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --from=proddeps --chown=nextjs:nodejs /app/src/generated ./src/generated
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
    && mkdir -p /data/uploads && chown -R nextjs:nodejs /data \
    && chown nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
