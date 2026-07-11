# 多阶段构建(ARCHITECTURE §5 / TASKS M4-1)
# base → deps(全量依赖+prisma generate) → builder(standalone 构建)
#      → proddeps(运行时依赖+迁移/seed 工具链) → runner
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
RUN npx prisma generate && npx prisma migrate deploy && npm run build

# ---- proddeps:仅运行时依赖 + 迁移/seed 工具链 ----
FROM base AS proddeps
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts \
    && npm install --no-save --no-package-lock prisma dotenv tsx \
    && npx prisma generate

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

# standalone 产物(server.js + 精简依赖),node_modules 用 proddeps 覆盖
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=proddeps /app/node_modules ./node_modules
# 迁移与 seed 所需
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY --from=proddeps /app/src/generated ./src/generated
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
    && mkdir -p /data/uploads && chown -R nextjs:nodejs /data /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
