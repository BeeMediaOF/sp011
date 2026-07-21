#!/usr/bin/env bash
# backup-volumes.sh — tar cifrado + offsite dos volumes que hotlinkam producao (PRD-09).
# Uso: backup-volumes.sh [caminho_config]   (default /opt/blog-ctl/backup.conf)
#
# Cobre os volumes cuja perda e irrecuperavel:
#   - <proj>_central_data  (/data/news-images — capas hotlinkadas por artigos)
#   - <proj>_api_data      (/data/db-config.enc + /data/uploads do sp011)
#   - blog-<id>_api_data   (db-config.enc cifrado de cada blog replicado)
# Descobre os volumes dinamicamente (nao hardcoda blogs). Cifra ANTES do offsite.
set -euo pipefail

CONF="${1:-/opt/blog-ctl/backup.conf}"
# shellcheck source=/dev/null
source "$CONF"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$LOCAL_BACKUP_DIR/volumes/$STAMP"
mkdir -p "$OUT"
MANIFEST="$OUT/MANIFEST.txt"
echo "volumes backup $STAMP" > "$MANIFEST"

echo "[backup-volumes] inicio $STAMP"
count=0
for vol in $(docker volume ls --format '{{.Name}}' | grep -E '_(api|central)_data$'); do
  echo "[backup-volumes] volume: $vol"
  docker run --rm -v "$vol":/src:ro alpine tar -C /src -cf - . \
    | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASSPHRASE_FILE" -o "$OUT/$vol.tar.gpg"
  if [ ! -s "$OUT/$vol.tar.gpg" ]; then
    echo "[backup-volumes] ERRO: tar vazio para $vol" >&2
    exit 1
  fi
  sha256sum "$OUT/$vol.tar.gpg" >> "$MANIFEST"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "[backup-volumes] ERRO: nenhum volume _api_data/_central_data encontrado" >&2
  exit 1
fi

rclone copy "$OUT" "$RCLONE_REMOTE:$RCLONE_PATH/volumes/$STAMP" --transfers 2 --checkers 4

find "$LOCAL_BACKUP_DIR/volumes" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETAIN_LOCAL_DAYS" -exec rm -rf {} +
rclone delete "$RCLONE_REMOTE:$RCLONE_PATH/volumes" --min-age "${RETAIN_REMOTE_DAYS}d" || true
rclone rmdirs "$RCLONE_REMOTE:$RCLONE_PATH/volumes" --leave-root || true

echo "[backup-volumes] OK: $count volumes em $OUT"
