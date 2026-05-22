#!/bin/sh
set -e

# 1) 把 SQLite 数据库放到挂载卷 /data 里
DB_FILE="${DB_FILE:-/data/dev.db}"
export DATABASE_URL="file:${DB_FILE}"

# 2) 首次启动 / schema 变化时同步表结构
echo "[entrypoint] prisma db push (sync schema)"
node node_modules/prisma/build/index.js db push --skip-generate

# 3) 如果是空库，写入种子数据；标志文件避免重复
SEED_MARK="/data/.seeded"
if [ ! -f "$SEED_MARK" ]; then
  echo "[entrypoint] seeding initial data"
  node node_modules/.bin/tsx prisma/seed.ts || true
  touch "$SEED_MARK"
fi

# 4) 启动 Next.js standalone server
echo "[entrypoint] starting Next.js"
exec "$@"
