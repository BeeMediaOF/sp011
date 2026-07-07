# Blogs replicados — guia de operação (Fase 0)

Como subir N blogs independentes na mesma VPS usando **uma única base de
código e um único par de imagens** (`blog-api:vN` / `blog-web:vN`), cada blog
com projeto compose, `.env`, banco e volume próprios. Complementa o
`README_NOVA_INSTANCIA.md` (que cobre a instância em VPS separada do cliente).

## Arquitetura

```
/opt/sp011  (repo + compose raiz)          /opt/blogs/<id>/  (um dir por blog)
  caddy  ── 80/443 (único exposto)           compose.yml   (cópia do template)
  ollama, central-api, central-web           .env          (segredos próprios)
  api, web (sp011)                           volume api_data (db-config.enc)
  pg-blogs (postgres:16, sem porta host)
        └────────── rede compartilhada `blogs_shared` ──────────┘
```

- Cada blog mantém os serviços internos `api`/`web` (projetos compose não
  colidem entre si) e entra na `blogs_shared` com aliases únicos
  `<id>-api`/`<id>-web` — **os únicos nomes que o Caddy e o `API_URL` usam**
  (o alias automático `api` é ambíguo na rede compartilhada). Vale para o
  Caddy INTEIRO: até o sp011 usa aliases únicos (`sp011-api`/`sp011-web`) no
  Caddyfile — apontar para `api`/`web` curtos fez o tráfego do sp011 cair no
  container de outro blog (incidente 2026-07-07). IDs reservados: `sp011`,
  `central`.
- Banco: um `DATABASE` + uma `ROLE` por blog no `pg-blogs`; configurado pelo
  assistente `/admin/setup` (fica criptografado em `db-config.enc`).
- Uploads: um projeto Supabase dedicado só a Storage, um bucket por blog.
- O blog nasce em modo central-push puro (fontes seed inativas; sem
  `OLLAMA_BASE_URL`/chaves de IA no `.env`) — coleta/reescrita ficam no
  painel central, que entrega via `POST /api/ingest` (HMAC).

## Preparação única da VPS

```bash
cd /opt/sp011 && git pull

# 1) Senha do superusuário do pg-blogs no .env da raiz
echo "PG_BLOGS_SUPERPASS=$(openssl rand -hex 24)" >> .env

# 2) Builda e tagueia blog-api:v1 / blog-web:v1 (NÃO recria containers)
docker compose build api web

# 3) Cria a rede blogs_shared, sobe o pg-blogs e recria SÓ o caddy
#    (blip de ~2–5s na borda; certificados persistem em caddy_data)
docker compose up -d pg-blogs caddy
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
```

> ⚠️ Enquanto o sp011 não for recriado num deploy normal, evite
> `docker compose up -d` sem lista de serviços: a linha `image:` nova muda o
> config-hash de api/web e o compose os recriaria (breve indisponibilidade).

Uma vez só, também:
- **DNS**: registro wildcard `*.seudominio.com.br → IP da VPS` (blogs novos
  já nascem resolvendo).
- **Storage**: criar o projeto Supabase dedicado a Storage; anotar a URL e a
  `service_role` key.

## Subir um blog novo (~15 min)

```bash
ID=cliente-a
DOMAIN=cliente-a.seudominio.com.br
DBNAME=${ID//-/_}          # hífen não vale em nome de banco/role

# 0) Painel central → Blogs → Novo (name, domain, apiUrl=https://$DOMAIN)
#    → copiar o segredo de integração (exibido UMA única vez).

# 1) Banco (senha: openssl rand -hex 16 — sem caracteres especiais)
docker compose -f /opt/sp011/docker-compose.yml exec -T pg-blogs psql -U postgres <<SQL
CREATE ROLE ${DBNAME}_user LOGIN PASSWORD '<senha>';
CREATE DATABASE ${DBNAME} OWNER ${DBNAME}_user;
REVOKE CONNECT ON DATABASE ${DBNAME} FROM PUBLIC;
SQL

# 2) Storage: criar bucket público "$ID" no projeto Supabase de Storage.

# 3) Scaffold
mkdir -p /opt/blogs/$ID && cd /opt/blogs/$ID
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
nano .env   # BLOG_ID, COMPOSE_PROJECT_NAME=blog-$ID, URLs, SESSION_SECRET e
            # SETTINGS_ENCRYPTION_KEY (2x openssl rand -hex 32), CENTRAL_INGEST_SECRET

# 4) Subir + rota no Caddy
docker compose up -d
printf '%s {\n\timport blog %s\n}\n' "$DOMAIN" "$ID" > /opt/sp011/caddy/sites/$ID.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# 5) Setup token (regenerado a cada boot — leia AGORA)
docker compose logs --tail 100 api | grep -i "setup token"

# 6) Navegador: https://$DOMAIN/admin/setup
#    token + connection string  postgresql://<db>_user:<senha>@pg-blogs:5432/<db>
#    com SSL = "disable" (rede interna) + Storage (URL/service_role/bucket)
#    + primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

# 7) Painel central → Blogs → Testar conexão → "online".
#    Enviar 1 notícia real e conferir no blog.
```

### Checklist de verificação

- `dig +short $DOMAIN` → IP da VPS
- `curl -sI https://$DOMAIN` → 200 com TLS (emissão ACME leva 10–60s após o reload)
- `curl -s https://$DOMAIN/api/setup` → `{"setupRequired":false}` pós-wizard
- Login em `https://$DOMAIN/admin`
- Ingest test "online" no painel central + push real aparece no blog
- OG/WhatsApp: `curl -s -A "facebookexternalhit/1.1" https://$DOMAIN/ | grep og:`
- `docker stats --no-stream` → anotar RAM/CPU (calibração da Fase 1)
- `docker compose logs --tail 50` sem erros recorrentes

### ⚠️ Alterou o `Caddyfile` (via git pull)? Recrie o caddy

O `Caddyfile` é montado como bind de **arquivo único** — e o `git pull` troca o
arquivo por um novo (novo inode), então o container continua preso à versão
antiga. `caddy reload`/`restart` releem o arquivo VELHO. Sempre que um pull
mudar o `Caddyfile`:

```bash
docker compose up -d --force-recreate caddy   # blip ~3s; certificados persistem
```

O diretório `caddy/sites/` NÃO sofre disso (montagem de diretório) — para os
arquivos por blog, o `caddy reload` continua sendo o caminho.

### Remover um blog (rollback)

```bash
cd /opt/blogs/$ID && docker compose down -v   # -v apaga o db-config.enc; o banco fica
rm /opt/sp011/caddy/sites/$ID.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
rm -rf /opt/blogs/$ID
# Opcional: DROP DATABASE no pg-blogs. Remover/desativar o blog no painel central.
```

## Domínio próprio depois (upgrade de um blog)

1. DNS do cliente → IP da VPS.
2. `caddy/sites/<id>.caddy`: `dominio-proprio.com.br, cliente-a.seudominio.com.br { import blog cliente-a }` + reload.
3. `.env` do blog: `APP_URL/SITE_URL/ALLOWED_ORIGINS` → novo domínio; `docker compose up -d` no dir do blog.
4. Painel central: atualizar domain/apiUrl do blog.

## Atualizar/reverter versão (fluxo por tag)

```bash
cd /opt/sp011 && git pull
# suba a versão no .env da raiz: BLOG_IMAGE_VERSION=v2
docker compose build api web            # gera blog-api:v2 / blog-web:v2
# canário: em /opt/blogs/<id>/.env mude BLOG_IMAGE_TAG=v2 e rode docker compose up -d
# ok no checklist → repita nos demais. Rollback = voltar a tag anterior.
```

Regras: manter as 3 últimas tags; `docker builder prune` mensal; **backup
externo dos bancos do pg-blogs é obrigatório** (script + cron na Fase 1 do
plano de replicação).
