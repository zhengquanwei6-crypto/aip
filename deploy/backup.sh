#!/usr/bin/env bash
# =============================================================
# design-ai-ops · 备份脚本
# 把 SQLite 数据库 + uploads 打成 tar.gz
# 推荐加到 crontab：每天凌晨 3 点
#   0 3 * * * /opt/design-ai-ops/deploy/backup.sh
# =============================================================
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/design-ai-ops}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/design-ai-ops}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/aip_${TS}.tar.gz"

cd "$INSTALL_DIR"

# 容器内热备 SQLite
docker compose exec -T app sh -c "cp /data/dev.db /data/dev.db.bak" || true

# 拷贝出卷数据
DB_VOL="$(docker volume inspect -f '{{.Mountpoint}}' "$(basename "$INSTALL_DIR")_app_data" 2>/dev/null \
  || docker volume inspect -f '{{.Mountpoint}}' design-ai-ops_app_data 2>/dev/null \
  || true)"
UP_VOL="$(docker volume inspect -f '{{.Mountpoint}}' "$(basename "$INSTALL_DIR")_app_uploads" 2>/dev/null \
  || docker volume inspect -f '{{.Mountpoint}}' design-ai-ops_app_uploads 2>/dev/null \
  || true)"

if [ -z "$DB_VOL" ] || [ -z "$UP_VOL" ]; then
  echo "未找到数据卷，请确认 docker compose project 名称" >&2
  exit 1
fi

tar -czf "$OUT" -C / "${DB_VOL#/}" "${UP_VOL#/}"
echo "[ok] backup -> $OUT"

# 清理过期备份
find "$BACKUP_DIR" -type f -name 'aip_*.tar.gz' -mtime +"$KEEP_DAYS" -delete
