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

# v0.11 B11 + B15.3: 启动时种 market:platform:* + market:snapshot:*:<today>
# (B10 followup #7 闭环，B13 self-check §十一 #3 闭合)
#
# B11 原版只 seed PlatformInfo 三行；B15.3 扩展为：
#   ① 缺 market:platform:<slug> 就写（idempotent，B11 行为）
#   ② 缺 market:snapshot:<slug>:<today YYYY-MM-DD> 就写一条 placeholder
#      （source='placeholder' / placeholder=true，UI 会打「示例数据」徽章）
# 这样新部署冷启动后 /api/health.marketTrendsModule.snapshotCount ≥ 3，
# /market 页直接渲染示例数据卡片，不会出现「无数据」空白态。
# 不依赖 Next.js 起服务后才能调 /api/market/platforms?seedIfMissing=1。
if [ -f /app/prisma/market-seed.js ]; then
  echo "[entrypoint] seeding market platforms + today snapshots if missing (idempotent)"
  node /app/prisma/market-seed.js 2>&1 || echo "[entrypoint] market-seed failed (non-fatal)"
fi

# v0.11 B15.7: 启动时跑一次 asset cleanup dry-run，把候选数 + 释放预期写到 docker logs
# 用户不会被自动删任何东西 — dry-run 只读 prisma + fs.stat。
# 真清理需要 host crontab 主动调 `docker exec design-ai-ops node /app/scripts/cleanup-assets.mjs --apply`
# (详见 /docs/08-backup §「💾 磁盘清理 (v0.11 B15.7)」)。
if [ -f /app/scripts/cleanup-assets.mjs ]; then
  echo "[entrypoint] B15.7 asset cleanup dry-run (read-only · 不删任何文件)"
  node /app/scripts/cleanup-assets.mjs 2>&1 | sed 's/^/[cleanup-dry-run] /' || echo "[entrypoint] cleanup dry-run failed (non-fatal)"
fi

echo "[entrypoint] starting Next.js"
exec "$@"
