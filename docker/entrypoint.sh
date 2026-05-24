#!/bin/sh
set -e

DB_FILE="${DB_FILE:-/data/dev.db}"
export DATABASE_URL="file:${DB_FILE}"

echo "[entrypoint] prisma db push (sync schema)"
node node_modules/prisma/build/index.js db push --skip-generate

# 首次启动写入种子数据
SEED_MARK="/data/.seeded"
if [ ! -f "$SEED_MARK" ]; then
  echo "[entrypoint] seeding initial data (compiled seed.js)"
  if node prisma/seed.js; then
    touch "$SEED_MARK"
    echo "[entrypoint] seed done"
  else
    echo "[entrypoint] seed failed but continuing (will retry on next boot)"
  fi
fi

# v0.11 B11: 启动时种 PlatformInfo（B10 followup #7 闭环）
# 容器换 DB 卷或全新部署时, Setting 表 market:platform:* 行不存在,
# 用一个内联 node 脚本直接写 3 行 Setting (idempotent).
# 不依赖 Next.js 起服务后才能调 API.
if [ -f /app/prisma/market-seed.js ]; then
  echo "[entrypoint] seeding market platforms if missing (idempotent)"
  node /app/prisma/market-seed.js 2>&1 || echo "[entrypoint] market-seed failed (non-fatal)"
fi

echo "[entrypoint] starting Next.js"
exec "$@"
