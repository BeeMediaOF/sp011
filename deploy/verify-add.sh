#!/usr/bin/env bash
# =============================================================================
# verify-add — publica um arquivo na RAIZ do dominio de um blog, na hora.
#
# Instalar UMA vez na VPS:
#   ln -sf /opt/sp011/deploy/verify-add.sh /usr/local/bin/verify-add
#
# Usar:
#   verify-add credito.vc google2242104f477c8204.html
#   verify-add oleysports BingSiteAuth.xml '<?xml version="1.0"?>...'
#   verify-add creditovc                       # so lista o que ja esta la
#
# Aceita o DOMINIO ou o BLOG_ID como primeiro argumento -- ele descobre o outro
# lendo caddy/sites/*.caddy. Para arquivo do Google o conteudo e derivado do
# proprio nome (e sempre "google-site-verification: <nome>"), entao o terceiro
# argumento so e necessario nos outros casos.
#
# Escreve em caddy/verify/<BLOG_ID>/ e confere com curl. Nao precisa de rebuild,
# reload nem restart: o file_server do Caddy le do disco a cada request.
#
# O arquivo fica NAO RASTREADO no git. Sobrevive a `git pull`, mas some se a VPS
# for reprovisionada -- commite o mesmo arquivo no repositorio quando der.
# =============================================================================
set -euo pipefail

SELF="$(readlink -f "${BASH_SOURCE[0]}")"
REPO="$(cd "$(dirname "$SELF")/.." && pwd)"
SITES="$REPO/caddy/sites"

erro() { printf 'erro: %s\n' "$*" >&2; exit 2; }

uso() {
  sed -n '3,18p' "$SELF" | sed 's/^# \{0,1\}//'
  exit 2
}

[ $# -ge 1 ] || uso

ALVO="$1"; ARQ="${2-}"; CONT="${3-}"

# --- descobre BLOG_ID + dominio ---------------------------------------------
ID=""; DOM=""
for f in "$SITES"/*.caddy; do
  [ -f "$f" ] || continue
  d=$(sed 's/#.*//' "$f" | grep -m1 -oE '^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}' || true)
  i=$(sed 's/#.*//' "$f" | grep -m1 -oE 'import[[:space:]]+blog(-cf)?[[:space:]]+[A-Za-z0-9_-]+' | awk '{print $NF}' || true)
  [ -n "$i" ] || continue
  if [ "$ALVO" = "$d" ] || [ "$ALVO" = "$i" ]; then ID="$i"; DOM="$d"; break; fi
done

# O sp011 nao tem arquivo em caddy/sites/ -- o dominio dele vem do .env.
if [ -z "$ID" ]; then
  SP=$(grep -m1 '^SITE_DOMAIN=' "$REPO/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  if [ "$ALVO" = "sp011" ] || { [ -n "$SP" ] && [ "$ALVO" = "$SP" ]; }; then
    ID="sp011"; DOM="${SP:-sp011.com.br}"
  fi
fi

if [ -z "$ID" ]; then
  printf 'erro: nao achei blog nem dominio "%s". Conhecidos:\n' "$ALVO" >&2
  for f in "$SITES"/*.caddy; do
    [ -f "$f" ] || continue
    i=$(sed 's/#.*//' "$f" | grep -m1 -oE 'import[[:space:]]+blog(-cf)?[[:space:]]+[A-Za-z0-9_-]+' | awk '{print $NF}' || true)
    d=$(sed 's/#.*//' "$f" | grep -m1 -oE '^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}' || true)
    [ -n "$i" ] && printf '  %-14s %s\n' "$i" "$d" >&2
  done
  exit 2
fi

DIR="$REPO/caddy/verify/$ID"

# --- sem nome de arquivo: so lista ------------------------------------------
if [ -z "$ARQ" ]; then
  printf '%s (%s) -> %s\n' "$ID" "$DOM" "$DIR"
  if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    for a in "$DIR"/*; do printf '  https://%s/%s\n' "$DOM" "$(basename "$a")"; done
  else
    printf '  (vazio)\n'
  fi
  exit 0
fi

# --- validacoes --------------------------------------------------------------
case "$ARQ" in
  */*|.*|"") erro "nome de arquivo invalido: $ARQ (sem barra, sem comecar com ponto)" ;;
esac
case "$ARQ" in
  *.html|*.txt|*.xml|*.json) ;;
  *) erro "extensao de $ARQ nao esta no matcher @verify do Caddyfile (so .html .txt .xml .json). Adicionar uma exige editar o 'path' do matcher nos tres blocos." ;;
esac

# O conteudo do arquivo do Google e sempre derivado do nome.
if [ -z "$CONT" ]; then
  case "$ARQ" in
    google*.html) CONT="google-site-verification: $ARQ" ;;
    *) erro "conteudo obrigatorio para $ARQ (so arquivo google*.html e derivado do nome)" ;;
  esac
fi

# --- publica -----------------------------------------------------------------
mkdir -p "$DIR"
if [ -e "$DIR/$ARQ" ] && [ "$(cat "$DIR/$ARQ")" != "$CONT" ]; then
  printf 'aviso: %s ja existia com outro conteudo -- sobrescrevendo.\n' "$ARQ" >&2
fi
printf '%s\n' "$CONT" > "$DIR/$ARQ"
printf 'escrito: %s\n' "$DIR/$ARQ"

# --- confere ------------------------------------------------------------------
URL="https://$DOM/$ARQ"
ORIG=$(curl -sk --max-time 10 --resolve "$DOM:443:127.0.0.1" -o /dev/null -w '%{http_code}' "$URL" 2>/dev/null) || ORIG=000
PUB=$(curl -s  --max-time 15 -o /dev/null -w '%{http_code}' "$URL" 2>/dev/null) || PUB=000
printf 'origem=%s  publico=%s  %s\n' "$ORIG" "$PUB" "$URL"

if [ "$ORIG" != "200" ]; then
  printf '\nA ORIGEM nao respondeu 200. O Caddy so serve este diretorio se o volume\n' >&2
  printf './caddy/verify estiver montado -- confira se o container ja foi recriado\n' >&2
  printf 'depois do commit que criou o matcher (docker compose up -d --force-recreate caddy).\n' >&2
  exit 1
fi
if [ "$PUB" != "200" ]; then
  printf '\nA origem responde 200 mas o dominio publico nao. Se este blog estiver atras\n' >&2
  printf 'do Cloudflare, e o 404 anterior em cache: purgue a URL no painel da zona.\n' >&2
  exit 1
fi

printf '\nconteudo servido:\n'
curl -s --max-time 15 "$URL"
