# =============================================
# design-ai-ops · 多阶段构建 Dockerfile
# Next.js standalone + 编译后的 seed.js
# v0.11 B11: 加 market-seed.js（启动期 PlatformInfo 兜底）
# =============================================

# ---------- 1) 依赖阶段 ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- 2) 构建阶段 ----------
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="file:/tmp/build.db"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build
# 确保 public 目录存在
RUN mkdir -p public

# 把 seed.ts 编译成单文件 seed.js（不打包 @prisma/client，运行时用 node_modules 里的）
RUN npx esbuild prisma/seed.ts \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --outfile=prisma/seed.js \
    --external:@prisma/client \
    --external:.prisma/*

# ---------- 3) 运行阶段 ----------
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/dev.db"

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + 编译好的 seed.js + Prisma CLI 用于启动时 db push
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/seed.js ./prisma/seed.js
# v0.11 B11: market-seed.js 启动时 idempotent seed PlatformInfo (B10 followup #7)
COPY --from=builder --chown=nextjs:nodejs /app/prisma/market-seed.js ./prisma/market-seed.js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY --chown=nextjs:nodejs docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

RUN mkdir -p /data /app/public/uploads && chown -R nextjs:nodejs /data /app/public/uploads
VOLUME ["/data", "/app/public/uploads"]

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
