#!/usr/bin/env bash
# restore-blog.sh — restaura um dump cifrado num banco do pg-blogs (PRD-09).
# Uso: restore-blog.sh <arquivo.dump.gpg> <banco_destino> [caminho_config] [--force]
#
# Guardas de seguranca:
#   - DROP DATABASE so e permitido para nomes com prefixo restore_test_
#     (o teste de restore obrigatorio usa esse prefixo).
#   - restaurar por cima de um banco SEM esse prefixo (producao) exige a flag
#     explicita --force como 4o argumento — protege contra sobrescrever um blog vivo.
set -euo pipefail

DUMP="${1:?uso: restore-blog.sh <arquivo.dump.gpg> <banco_destino> [config] [--force]}"
TARGET="${2:?informe o banco de destino}"
CONF="${3:-/opt/blog-ctl/backup.conf}"
FORCE="${4:-}"

# shellcheck source=/dev/null
source "$CONF"

COMPOSE="docker compose -f $REPO_DIR/docker-compose.yml"

is_test_db=0
case "$TARGET" in
  restore_test_*) is_test_db=1 ;;
esac

if [ "$is_test_db" -eq 0 ] && [ "$FORCE" != "--force" ]; then
  echo "[restore] RECUSADO: '$TARGET' nao tem prefixo restore_test_ e --force nao foi passado." >&2
  echo "[restore] Para restaurar por cima de um banco real, repita com --force como 4o argumento." >&2
  exit 1
fi

if [ ! -s "$DUMP" ]; then
  echo "[restore] ERRO: arquivo de dump inexistente ou vazio: $DUMP" >&2
  exit 1
fi

# Banco de teste: recria do zero (idempotente). Producao: nunca dropa aqui.
if [ "$is_test_db" -eq 1 ]; then
  $COMPOSE exec -T pg-blogs psql -U postgres -c "DROP DATABASE IF EXISTS \"$TARGET\";"
fi

if ! $COMPOSE exec -T pg-blogs psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET';" | grep -q 1; then
  $COMPOSE exec -T pg-blogs psql -U postgres -c "CREATE DATABASE \"$TARGET\";"
fi

gpg --batch --quiet --decrypt --passphrase-file "$PASSPHRASE_FILE" "$DUMP" \
  | $COMPOSE exec -T pg-blogs pg_restore --no-owner --no-privileges -d "$TARGET"

echo -n "[restore] tabelas em $TARGET (schema public): "
$COMPOSE exec -T pg-blogs psql -U postgres -d "$TARGET" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
