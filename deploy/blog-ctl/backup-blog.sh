#!/usr/bin/env bash
# backup-blog.sh — dump cifrado + offsite de TODOS os bancos do pg-blogs (PRD-09).
# Uso: backup-blog.sh [caminho_config]     (default /opt/blog-ctl/backup.conf)
#
# - Enumera os bancos de blog dinamicamente (nao hardcoda a lista — regra de
#   isolamento do CLAUDE.md). pg_dump roda via `docker compose exec` (conexao
#   local, sem senha) — o script NUNCA manipula PG_BLOGS_SUPERPASS.
# - Cifra cada dump com GPG AES256 ANTES de qualquer coisa sair da VPS.
# - Valida dump nao-vazio, escreve MANIFEST com sha256, envia offsite e aplica
#   retencao local/remota. NUNCA imprime a chave de cifra.
set -euo pipefail

CONF="${1:-/opt/blog-ctl/backup.conf}"
# shellcheck source=/dev/null
source "$CONF"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$LOCAL_BACKUP_DIR/pg-blogs/$STAMP"
mkdir -p "$OUT"

COMPOSE="docker compose -f $REPO_DIR/docker-compose.yml"
MANIFEST="$OUT/MANIFEST.txt"
echo "pg-blogs backup $STAMP" > "$MANIFEST"

echo "[backup-blog] inicio $STAMP"
count=0
for db in $($COMPOSE exec -T pg-blogs psql -U postgres -Atqc "SELECT datname FROM pg_database WHERE datistemplate=false AND datname NOT IN ('postgres');"); do
  echo "[backup-blog] banco: $db"
  $COMPOSE exec -T pg-blogs pg_dump -U postgres -Fc -d "$db" \
    | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASSPHRASE_FILE" -o "$OUT/$db.dump.gpg"
  if [ ! -s "$OUT/$db.dump.gpg" ]; then
    echo "[backup-blog] ERRO: dump vazio para $db" >&2
    exit 1
  fi
  sha256sum "$OUT/$db.dump.gpg" >> "$MANIFEST"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "[backup-blog] ERRO: nenhum banco de blog encontrado no pg-blogs" >&2
  exit 1
fi

rclone copy "$OUT" "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs/$STAMP" --transfers 2 --checkers 4

# Retencao local (apaga diretorios de dump antigos).
find "$LOCAL_BACKUP_DIR/pg-blogs" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETAIN_LOCAL_DAYS" -exec rm -rf {} +
# Retencao offsite.
rclone delete "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs" --min-age "${RETAIN_REMOTE_DAYS}d" || true
rclone rmdirs "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs" --leave-root || true

echo "[backup-blog] OK: $count bancos em $OUT"
