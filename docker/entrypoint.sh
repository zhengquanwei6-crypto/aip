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

echo "[entrypoint] starting Next.js"
exec "$@"
