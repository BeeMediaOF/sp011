# Esporte Agora — go-live (esporteagora.midia.run)

Blog novo replicado na mesma VPS: **esporte em português**, alimentado pelo
painel central com fontes brasileiras dedicadas. Como blog e fontes são
pt-BR, **nada passa por tradução** — no máximo a IA classifica a categoria
das fontes gerais (chamada barata, só título+resumo).

Complementa o runbook genérico `deploy/README.md` (Fase 0 da replicação).
Tempo estimado: ~20 min.

| Item | Valor |
|---|---|
| BLOG_ID / banco / bucket | `esporteagora` |
| Domínio | `esporteagora.midia.run` |
| Idioma do site | pt-BR (padrão — não mexer) |
| Fuso | America/Sao_Paulo (padrão — não mexer) |
| Categorias (slugs) | `copa-do-mundo`, `futebol`, `volei`, `tenis`, `f1`, `futebol-americano`, `e-sports`, `outros` |

> ⚠️ Os slugs são de propósito DIFERENTES dos do KSports (`f1`≠`formula-1`,
> `futebol-americano`≠`nfl`, `e-sports`≠`esports`, `outros`≠`others`). As
> regras do KSports casam por categoria e não filtram idioma — slug igual
> mandaria notícia PT para o KSports e dispararia tradução PT→EN indesejada.

## 0) Pré-requisitos

- DNS: `dig +short esporteagora.midia.run` → IP da VPS. Se não houver
  wildcard `*.midia.run`, crie o registro A antes de tudo.
- Imagens `blog-api`/`blog-web` na tag atual. Se o deploy **v23** (traduções
  do painel) ainda não foi feito, faça-o primeiro; senão, use a tag que o
  ksports está rodando: `grep BLOG_IMAGE_TAG /opt/blogs/ksports/.env`.

## 1) Cadastro no painel central

Blogs → Novo:
- Nome: **Esporte Agora** · Domínio: `esporteagora.midia.run` ·
  API URL: `https://esporteagora.midia.run`
- Idioma: **pt-BR** (padrão). **Exigir aprovação: ON** nos primeiros dias.
- Teto diário / intervalo mínimo entre posts: a gosto (sugestão: 30/dia, 20 min).
- **Copiar o segredo de integração** — é exibido UMA única vez
  (vira `CENTRAL_INGEST_SECRET` no passo 3).

## 2) Banco no pg-blogs

```bash
cd /opt/sp011
PASS=$(openssl rand -hex 16); echo "SENHA DO BANCO (anote): $PASS"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE ROLE esporteagora_user LOGIN PASSWORD '$PASS';"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE DATABASE esporteagora OWNER esporteagora_user;"
docker compose exec -T pg-blogs psql -U postgres -c "REVOKE CONNECT ON DATABASE esporteagora FROM PUBLIC;"
```

Storage: no projeto Supabase dedicado a Storage, criar **bucket público
`esporteagora`**.

## 3) Scaffold do blog

```bash
mkdir -p /opt/blogs/esporteagora && cd /opt/blogs/esporteagora
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
nano .env
```

No `.env`:

```ini
BLOG_ID=esporteagora
COMPOSE_PROJECT_NAME=blog-esporteagora
BLOG_IMAGE_TAG=v23                # ou a tag atual do ksports
APP_URL=https://esporteagora.midia.run
SITE_URL=https://esporteagora.midia.run
ALLOWED_ORIGINS=https://esporteagora.midia.run
SESSION_SECRET=<openssl rand -hex 32>
SETTINGS_ENCRYPTION_KEY=<openssl rand -hex 32>
CENTRAL_INGEST_SECRET=<segredo copiado no passo 1>
# VAPID_* opcional (web push): npx web-push generate-vapid-keys
```

`SUPABASE_DATABASE_URL` fica **comentado** (o wizard configura o banco).

## 4) Subir + rota no Caddy

```bash
docker compose up -d
printf 'esporteagora.midia.run {\n\timport blog esporteagora\n}\n' > /opt/sp011/caddy/sites/esporteagora.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail 100 api | grep -i "setup token"   # leia AGORA (regenera a cada boot)
```

## 5) Wizard `/admin/setup`

Em `https://esporteagora.midia.run/admin/setup`:
- Token do passo anterior.
- Connection string: `postgresql://esporteagora_user:<senha do passo 2>@pg-blogs:5432/esporteagora` · SSL: **disable** (rede interna).
- Storage: URL + `service_role` do projeto de Storage + bucket `esporteagora`.
- Primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

Depois: painel central → Blogs → **Testar conexão** → "online".

## 6) Fontes PT + taxonomia + regras na central

```bash
cd /opt/sp011 && git pull
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/esporteagora/sources_pt.sql
```

O script cadastra 16 fontes (ge por editoria + Trivela, TenisNews,
Motorsport BR, UOL, Metrópoles, ESPN BR, Gazeta, The Playoffs — URLs
validadas em 2026-07-10), grava a taxonomia do blog e cria as 8 regras.
Fontes usam o **prompt padrão em português** da central (sem custom prompt).

**Confira na saída "REGRAS DE DISTRIBUICAO"**: se algum OUTRO blog (ex.:
sp011) tiver regra catch-all (todas as colunas de include vazias), ele vai
receber as notícias de esporte também. Se não quiser, exclua as categorias
novas nessa regra:

```bash
docker compose exec -T pg-blogs psql "$DBURL" -c "UPDATE distribution_rules SET categories_exclude='[\"copa-do-mundo\",\"futebol\",\"volei\",\"tenis\",\"f1\",\"futebol-americano\",\"e-sports\",\"outros\"]'::jsonb WHERE id='<id da regra catch-all>';"
```

## 7) Identidade e home no admin do blog

Em `https://esporteagora.midia.run/admin`:

1. **Configurações → Informações**: nome "Esporte Agora", tagline, logos,
   autor padrão/byline (ex.: "Redação Esporte Agora"). Idioma do site
   público: **Português** e fuso **America/Sao_Paulo** (já são o padrão).
2. **Home + menu**: aba Templates → aplicar o starter
   **"Esporte Agora — Portal Esportivo (PT)"** (existe a partir da imagem
   v23; réplica do layout do KSports nas cores da marca — roxo `#5b2d8e`,
   verde `#4bce10`, fundo escuro `#241243`). Ele já instala o menu em
   português com os slugs das regras (`copa-do-mundo`, `futebol`, `volei`,
   `tenis`, `f1`, `futebol-americano`, `e-sports`, `outros`), rodapé escuro
   PT e grava idioma pt-BR + fuso São Paulo. Os banners nascem como
   "Anuncie aqui" — troque o HTML quando houver patrocinador.
   (Imagem antiga sem o starter? Alternativa: aplicar o do KSports e
   desfazer idioma EN/fuso UTC, nomes em inglês e banners KBET.)

## 8) Verificação

- `curl -sI https://esporteagora.midia.run` → 200 com TLS (ACME leva 10–60s).
- `curl -s https://esporteagora.midia.run/api/setup` → `{"setupRequired":false}`.
- Central → Entregas: primeira notícia percorre
  `pending/awaiting_approval → delivered` (fontes gerais passam antes por
  `awaiting_localization → localizing` = só classificação; **nenhuma**
  entrega deve ficar presa em tradução).
- Artigo publicado cai na seção certa da home; `<html lang="pt-BR">`.
- OG/WhatsApp: `curl -s -A "facebookexternalhit/1.1" https://esporteagora.midia.run/ | grep og:`
- `docker stats --no-stream` e `docker compose logs --tail 50` sem erros.

Rollback: seção "Remover um blog" do `deploy/README.md`.
