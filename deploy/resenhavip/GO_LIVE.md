# Resenha Vip — go-live (resenhavip.midia.run)

Quarto blog da VPS: **esporte em português**, irmão do Esporte Agora — mesmas
fontes, mesmos slugs de categoria, template clonado do "KSports - Final" na
identidade da marca. Nada passa por tradução (pt-BR ponta a ponta).

Todos os comandos são completos, prontos para copiar e colar na VPS.
Tempo estimado: ~20 min.

| Item | Valor |
|---|---|
| BLOG_ID / banco / bucket | `resenhavip` |
| Domínio | `resenhavip.midia.run` (ajuste se for outro — os scripts SQL localizam o blog por nome/domínio `%resenha%`) |
| Idioma / fuso | pt-BR / America/Sao_Paulo (padrão — não mexer) |
| Categorias (slugs) | `copa-do-mundo`, `futebol`, `volei`, `tenis`, `f1`, `futebol-americano`, `e-sports`, `outros` (iguais aos do Esporte Agora — ambos pt-BR, sem risco de tradução) |
| Identidade (logos) | verde `#1e7a3f` · amarelo `#fdb913` (o "Vip") · fundo escuro `#0d3b1f` · rodapé `#082916` |

## 0) Pré-requisito: DNS

```bash
dig +short resenhavip.midia.run
```

Deve devolver o IP da VPS (o wildcard `*.midia.run` já cobre; senão, crie o
registro A antes de tudo).

## 1) Cadastro no painel central

Blogs → Novo:
- Nome: **Resenha Vip** · Domínio: `resenhavip.midia.run` ·
  API URL: `https://resenhavip.midia.run`
- Idioma: **pt-BR** (padrão). **Exigir aprovação: ON** nos primeiros dias
  (vale só para o fluxo orgânico — o backfill do passo 8 publica direto de
  propósito).
- Teto diário / intervalo mínimo entre posts: a gosto (sugestão: 30/dia, 20 min).
- **Copiar o segredo de integração** — é exibido UMA única vez (vira o
  `CENTRAL_INGEST_SECRET` no passo 3).

## 2) Banco no pg-blogs

```bash
cd /opt/sp011
PASS=$(openssl rand -hex 16); echo "SENHA DO BANCO (anote): $PASS"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE ROLE resenhavip_user LOGIN PASSWORD '$PASS';"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE DATABASE resenhavip OWNER resenhavip_user;"
docker compose exec -T pg-blogs psql -U postgres -c "REVOKE CONNECT ON DATABASE resenhavip FROM PUBLIC;"
```

Storage: no projeto Supabase dedicado a Storage, criar **bucket público
`resenhavip`**.

## 3) Scaffold do blog

Primeiro, coloque o segredo de integração copiado no passo 1 na variável
(entre as aspas simples):

```bash
INGEST='COLE_AQUI_O_SEGREDO_DO_PASSO_1'
```

Depois cole o bloco inteiro (usa a mesma tag de imagem do ksports e gera os
segredos sozinho):

```bash
TAG=$(grep -m1 '^BLOG_IMAGE_TAG=' /opt/blogs/ksports/.env | cut -d= -f2-)
mkdir -p /opt/blogs/resenhavip && cd /opt/blogs/resenhavip
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
sed -i "s|^BLOG_ID=.*|BLOG_ID=resenhavip|" .env
sed -i "s|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=blog-resenhavip|" .env
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$TAG|" .env
sed -i "s|^APP_URL=.*|APP_URL=https://resenhavip.midia.run|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://resenhavip.midia.run|" .env
sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://resenhavip.midia.run|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^SETTINGS_ENCRYPTION_KEY=.*|SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env
sed -i "s|^CENTRAL_INGEST_SECRET=.*|CENTRAL_INGEST_SECRET=$INGEST|" .env
grep -E '^(BLOG_ID|COMPOSE_PROJECT_NAME|BLOG_IMAGE_TAG|APP_URL|CENTRAL_INGEST_SECRET)=' .env
```

O `grep` final é a conferência — os 5 valores devem sair preenchidos.
`SUPABASE_DATABASE_URL` fica comentado (o wizard configura o banco).

## 4) Subir + rota no Caddy

```bash
cd /opt/blogs/resenhavip
docker compose up -d
printf 'resenhavip.midia.run {\n\timport blog resenhavip\n}\n' > /opt/sp011/caddy/sites/resenhavip.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail 100 api | grep -i "setup token"
```

Anote o setup token AGORA (regenera a cada boot da api).

## 5) Wizard `/admin/setup`

Se ainda estiver na mesma sessão do passo 2, imprima a connection string
pronta:

```bash
echo "postgresql://resenhavip_user:$PASS@pg-blogs:5432/resenhavip"
```

Em `https://resenhavip.midia.run/admin/setup`:
- Token do passo 4.
- Connection string acima (se fechou o terminal, monte com a senha anotada:
  `postgresql://resenhavip_user:<senha do passo 2>@pg-blogs:5432/resenhavip`) ·
  SSL: **disable** (rede interna).
- Storage: URL + `service_role` do projeto de Storage + bucket `resenhavip`.
- Primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

Depois: painel central → Blogs → **Testar conexão** → "online".

## 6) Fontes + regras na central

```bash
cd /opt/sp011 && git pull
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/resenhavip/sources_pt.sql
```

As 16 fontes são as MESMAS do Esporte Agora (upsert é no-op se já existem);
o script grava idioma/taxonomia do blog e cria as 8 regras do Resenha Vip.
A partir daí toda notícia de esporte nova vai para os DOIS blogs (fonte
genérica é classificada uma vez por blog — chamada barata). O catch-all do
sp011 já exclui esses slugs desde 2026-07-10.

## 7) Template + identidade

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 < deploy/resenhavip/template_final.sql
```

Em `https://resenhavip.midia.run/admin` (o template aparece em Home + menu →
aba Templates → "Meus templates" em ≤15s, sem restart):

1. Aplicar **"Resenha Vip - Final"** — instala os 22 blocos, menu PT, rodapé
   escuro, banners "Anuncie aqui" verde/amarelo, idioma pt-BR + fuso SP.
2. **Configurações → Informações**: nome "Resenha Vip", tagline, **upload das
   logos** (horizontal p/ header claro, ícone p/ favicon), autor padrão
   (ex.: "Redação Resenha Vip"). Nunca reaproveitar caminho `/api/uploads/`
   de outro blog — bucket é por blog.

## 8) Backfill — ~50 posts imediatos

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/resenhavip/backfill_50.sql
```

Pega até 50 notícias de esporte do histórico **reaproveitando a reescrita e a
categoria já usadas no Esporte Agora** (zero IA, zero aprovação), escalonadas
a cada 10s da mais antiga para a mais nova → tudo no ar em ~8 min, com a mais
fresca no topo da home. Detalhes e dedupe no cabeçalho do script. Exige o
blog "online" (senão aborta). Rodar de novo pega as próximas 50.

## 9) Verificação

```bash
curl -sI https://resenhavip.midia.run
curl -s https://resenhavip.midia.run/api/setup
curl -s https://resenhavip.midia.run/ | grep -o '<html lang="[^"]*"'
docker stats --no-stream
docker compose -f /opt/blogs/resenhavip/compose.yml logs --tail 50
```

- 1º curl: `200` com TLS (ACME leva 10–60s).
- 2º curl: `{"setupRequired":false}`.
- 3º curl: `<html lang="pt-BR"`.
- Home popula por seção conforme o backfill entra; Central → Entregas: lote
  percorre `pending → delivered`; fluxo orgânico passa a criar entregas para
  Esporte Agora E Resenha Vip.

Rollback: seção "Remover um blog" do `deploy/README.md`.
