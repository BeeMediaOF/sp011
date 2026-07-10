# Resenha Vip — go-live (resenhavip.midia.run)

Quarto blog da VPS: **esporte em português**, irmão do Esporte Agora — mesmas
fontes, mesmos slugs de categoria, template clonado do "KSports - Final" na
identidade da marca. Nada passa por tradução (pt-BR ponta a ponta).

Os passos de infra são os MESMOS do Esporte Agora — detalhes em
`deploy/esporteagora/GO_LIVE.md`; aqui só o que muda + os scripts próprios.
Tempo estimado: ~20 min.

| Item | Valor |
|---|---|
| BLOG_ID / banco / bucket | `resenhavip` |
| Domínio | `resenhavip.midia.run` (ajuste se for outro — os scripts SQL localizam o blog por nome/domínio `%resenha%`) |
| Idioma / fuso | pt-BR / America/Sao_Paulo (padrão — não mexer) |
| Categorias (slugs) | `copa-do-mundo`, `futebol`, `volei`, `tenis`, `f1`, `futebol-americano`, `e-sports`, `outros` (iguais aos do Esporte Agora — ambos pt-BR, sem risco de tradução) |
| Identidade (logos) | verde `#1e7a3f` · amarelo `#fdb913` (o "Vip") · fundo escuro `#0d3b1f` · rodapé `#082916` |

## 1) Infra (igual ao Esporte Agora, trocando `esporteagora` → `resenhavip`)

1. DNS: `dig +short resenhavip.midia.run` → IP da VPS (wildcard `*.midia.run` já cobre).
2. **Painel central → Blogs → Novo**: nome **Resenha Vip**, domínio/API URL
   `https://resenhavip.midia.run`, idioma pt-BR, **Exigir aprovação ON** nos
   primeiros dias (o backfill ignora aprovação de propósito; isso vale só
   para o fluxo orgânico). Copiar o segredo de integração (exibido 1x).
3. **Banco**: `CREATE ROLE resenhavip_user LOGIN PASSWORD '<openssl rand -hex 16>';`
   `CREATE DATABASE resenhavip OWNER resenhavip_user;`
   `REVOKE CONNECT ON DATABASE resenhavip FROM PUBLIC;` (via
   `docker compose exec -T pg-blogs psql -U postgres -c "..."`, um por vez).
4. **Storage**: bucket público `resenhavip` no projeto Supabase de Storage.
5. **Scaffold**: `/opt/blogs/resenhavip/` com o template de compose/.env
   (`BLOG_ID=resenhavip`, `COMPOSE_PROJECT_NAME=blog-resenhavip`,
   `BLOG_IMAGE_TAG` = tag atual, URLs do domínio, `SESSION_SECRET`/
   `SETTINGS_ENCRYPTION_KEY` novos, `CENTRAL_INGEST_SECRET` do passo 2).
6. **Subir + Caddy**: `docker compose up -d` no diretório do blog;
   `printf 'resenhavip.midia.run {\n\timport blog resenhavip\n}\n' > /opt/sp011/caddy/sites/resenhavip.caddy`
   e `caddy reload`. Ler o setup token nos logs da api.
7. **Wizard** `/admin/setup`: token, connection
   `postgresql://resenhavip_user:<senha>@pg-blogs:5432/resenhavip` (SSL
   disable), Storage + bucket `resenhavip`, primeiro admin.
8. Central → Blogs → **Testar conexão** → "online".

## 2) Fontes + regras na central

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

## 3) Template + identidade

```bash
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

## 4) Backfill — ~50 posts imediatos

```bash
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/resenhavip/backfill_50.sql
```

Pega até 50 notícias de esporte do histórico **reaproveitando a reescrita e a
categoria já usadas no Esporte Agora** (zero IA, zero aprovação), escalonadas
a cada 10s da mais antiga para a mais nova → tudo no ar em ~8 min, com a mais
fresca no topo da home. Detalhes e dedupe no cabeçalho do script. Exige o
blog "online" (senão aborta). Rodar de novo pega as próximas 50.

## 5) Verificação

- `curl -sI https://resenhavip.midia.run` → 200 com TLS.
- Home popula por seção conforme o backfill entra; `<html lang="pt-BR">`.
- Central → Entregas: lote do backfill percorre `pending → delivered`;
  fluxo orgânico passa a criar entregas para Esporte Agora E Resenha Vip.
- `docker stats --no-stream` e logs do blog sem erros.

Rollback: seção "Remover um blog" do `deploy/README.md`.
