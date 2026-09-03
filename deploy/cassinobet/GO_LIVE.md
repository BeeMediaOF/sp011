# Cassino Bet — go-live (cassinobet.midia.run)

Mais um blog de **esporte em português**, irmão do Esporte Agora, Resenha Vip,
Oley Sports, Bee Esportes, Aposta Ganha e Receba Bet — mesmas fontes, mesmos
slugs, template clonado do "KSports - Final" na identidade da marca. Nada passa por tradução
(pt-BR ponta a ponta).

Todos os comandos são completos, prontos para copiar e colar na VPS.
Tempo estimado: ~20 min.

| Item | Valor |
|---|---|
| BLOG_ID / banco / bucket | `cassinobet` |
| Domínio | `cassinobet.midia.run` (ajuste se for zona própria — os scripts SQL localizam o blog por nome `%cassino%bet%` ou domínio `%cassinobet%`) |
| Idioma / fuso | pt-BR / America/Sao_Paulo (padrão — não mexer) |
| Categorias (slugs) | `copa-do-mundo`, `futebol`, `volei`, `tenis`, `f1`, `futebol-americano`, `e-sports`, `outros` (iguais aos dos irmãos pt-BR, sem risco de tradução) |
| Identidade (logo) | azul royal `#0f57cf` (losango — accent, 6,39:1 sobre o header branco) · azul claro `#2f8bf7` ("BET" — CTA e acento do rodapé) · charcoal `#15181d` ("CASSINO" — top bar, menu e banners) · rodapé `#0b0d10` |

Os banners nascem como "Anuncie aqui" nas cores da marca (3 blocos HTML).
Você já tem as três artes: o **losango azul com a espadilha** vira o favicon
e a logo quadrada; a **versão branca** do lockup é a que vai no cabeçalho
escuro e nas artes sociais; a **colorida** serve para fundo claro.

> ⚠️ **A recomendação para este blog é PULAR o passo 9 (backfill).** Leia o
> aviso de SEO no fim deste arquivo antes de decidir.

## 0) Pré-requisito: DNS

```bash
dig +short cassinobet.midia.run
```

Deve devolver o IP da VPS (o wildcard `*.midia.run` já cobre; senão, crie o
registro A antes de tudo).

## 1) Cadastro no painel central

Blogs → Novo:
- Nome: **Cassino Bet** · Domínio: `cassinobet.midia.run` ·
  API URL: `https://cassinobet.midia.run`
- Idioma: **pt-BR** (padrão). **Exigir aprovação: ON** nos primeiros dias
  (vale só para o fluxo orgânico — o backfill do passo 9 publica direto de
  propósito).
- Teto diário / intervalo mínimo entre posts: a gosto (sugestão: 30/dia, 20 min).
  **Todo blog ativo precisa de teto** — sem ele o portão de economia da central
  nunca fecha.
- **Copiar o segredo de integração** — é exibido UMA única vez (vira o
  `CENTRAL_INGEST_SECRET` no passo 3).

## 2) Banco no pg-blogs

```bash
cd /opt/sp011
PASS=$(openssl rand -hex 16); echo "SENHA DO BANCO (anote): $PASS"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE ROLE cassinobet_user LOGIN PASSWORD '$PASS';"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE DATABASE cassinobet OWNER cassinobet_user;"
docker compose exec -T pg-blogs psql -U postgres -c "REVOKE CONNECT ON DATABASE cassinobet FROM PUBLIC;"
```

Storage: no projeto Supabase dedicado a Storage, criar **bucket público
`cassinobet`**.

## 3) Scaffold do blog

Primeiro, coloque o segredo de integração copiado no passo 1 na variável
(entre as aspas simples):

```bash
INGEST='COLE_AQUI_O_SEGREDO_DO_PASSO_1'
```

Depois cole o bloco inteiro (usa a imagem mais recente já buildada no sp011 e
gera os segredos sozinho):

```bash
TAG=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2-)
mkdir -p /opt/blogs/cassinobet && cd /opt/blogs/cassinobet
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
sed -i "s|^BLOG_ID=.*|BLOG_ID=cassinobet|" .env
sed -i "s|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=blog-cassinobet|" .env
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$TAG|" .env
sed -i "s|^APP_URL=.*|APP_URL=https://cassinobet.midia.run|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://cassinobet.midia.run|" .env
sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://cassinobet.midia.run|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^SETTINGS_ENCRYPTION_KEY=.*|SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env
sed -i "s|^CENTRAL_INGEST_SECRET=.*|CENTRAL_INGEST_SECRET=$INGEST|" .env
grep -E '^(BLOG_ID|COMPOSE_PROJECT_NAME|BLOG_IMAGE_TAG|APP_URL|CENTRAL_INGEST_SECRET)=' .env
```

O `grep` final é a conferência — os 5 valores devem sair preenchidos.
`SUPABASE_DATABASE_URL` fica comentado (o wizard configura o banco).

## 4) Subir + rota no Caddy

```bash
cd /opt/blogs/cassinobet
docker compose up -d
printf 'cassinobet.midia.run {\n\timport blog cassinobet\n}\n' > /opt/sp011/caddy/sites/cassinobet.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail 100 api | grep -i "setup token"
```

Anote o setup token AGORA (regenera a cada boot da api).

## 5) Wizard `/admin/setup`

Se ainda estiver na mesma sessão do passo 2, imprima a connection string
pronta:

```bash
echo "postgresql://cassinobet_user:$PASS@pg-blogs:5432/cassinobet"
```

Em `https://cassinobet.midia.run/admin/setup`:
- Token do passo 4.
- Connection string acima (se fechou o terminal, monte com a senha anotada:
  `postgresql://cassinobet_user:<senha do passo 2>@pg-blogs:5432/cassinobet`) ·
  SSL: **disable** (rede interna).
- Storage: URL + `service_role` do projeto de Storage + bucket `cassinobet`.
- Primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

Depois: painel central → Blogs → **Testar conexão** → "online".

## 6) Fontes + regras na central

```bash
cd /opt/sp011 && git pull
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/cassinobet/sources_pt.sql
```

As 16 fontes são as MESMAS dos irmãos de esporte (upsert é no-op se já
existem); o script grava idioma/taxonomia do blog e cria as 8 regras do Cassino
Bet. A partir daí toda notícia de esporte nova vai para TODOS os blogs de
esporte pt-BR (fonte genérica é classificada uma vez por blog — chamada
barata). O catch-all do sp011 já exclui esses slugs desde 2026-07-10.

## 7) Template + identidade

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d cassinobet -v ON_ERROR_STOP=1 < deploy/cassinobet/template_final.sql
```

Em `https://cassinobet.midia.run/admin` (o template aparece em Home + menu →
aba Templates → "Meus templates" em ≤15s, sem restart):

1. Aplicar **"Cassino Bet - Final"** — instala os 22 blocos, menu PT, rodapé
   navy, banners "Anuncie aqui" azul, idioma pt-BR + fuso SP.
2. **Configurações → Informações**: nome "Cassino Bet", tagline, **upload das
   logos** (horizontal p/ header, ícone/quadrado p/ favicon), autor padrão
   (ex.: "Redação Cassino Bet"). Nunca reaproveitar caminho `/api/uploads/`
   de outro blog — bucket é por blog.

## 8) Artes sociais (opcional, mas barato)

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d cassinobet -v ON_ERROR_STOP=1 < deploy/cassinobet/social_templates.sql
docker compose exec -T pg-blogs psql -U postgres -d cassinobet -v ON_ERROR_STOP=1 < deploy/cassinobet/social_feed_story.sql
```

Três modelos de arte na identidade do blog (2 de feed + 1 feed/story). A logo
vem de `/api/site-asset/logo` — faça o upload do passo 7.2 **antes** de gerar
artes, e suba a versão CLARA/branca para contrastar com o bloco azul do canto.

## 9) Backfill — ~50 posts imediatos

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/cassinobet/backfill_50.sql
```

Pega até 50 notícias de esporte do histórico **reaproveitando a reescrita e a
categoria já usadas no Esporte Agora** (zero IA, zero aprovação), escalonadas
a cada 10s da mais antiga para a mais nova → tudo no ar em ~8 min, com a mais
fresca no topo da home. Detalhes e dedupe no cabeçalho do script. Exige o
blog "online" (senão aborta). Rodar de novo pega as próximas 50.

## 10) Verificação

```bash
curl -sI https://cassinobet.midia.run
curl -s https://cassinobet.midia.run/api/setup
curl -s https://cassinobet.midia.run/ | grep -o '<html lang="[^"]*"'
curl -s https://cassinobet.midia.run/api/site | grep -o '"siteName":"[^"]*"'
docker stats --no-stream
```

- 1º curl: `200` com TLS (ACME leva 10–60s).
- 2º curl: `{"setupRequired":false}`.
- 3º curl: `<html lang="pt-BR"`.
- 4º curl: **`Cassino Bet`** — se sair o nome de outro blog, é mistura de
  aliases na rede `blogs_shared` (ver §3 do CLAUDE.md).
- Home popula por seção conforme o backfill entra; Central → Entregas: lote
  percorre `pending → delivered`.

Rollback: seção "Remover um blog" do `deploy/README.md`.

## Aviso de SEO — leia antes do backfill

O backfill publica o **mesmo texto** que já está no ar no Esporte Agora, Resenha
Vip, Oley Sports, Bee Esportes, Aposta Ganha e Receba Bet. Com o Cassino Bet,
o mesmo artigo passa a existir em até **8 domínios** — risco MAIOR: além do texto duplicado, o nome da marca é de casa de apostas — foi exatamente esse par (domínio novo + conteúdo repetido) que fez o Resenha Vip ser marcado por "Páginas enganosas".

**Recomendação: pule o passo 9 neste blog** e deixe o catálogo nascer da coleta
orgânica da central (foi o que se decidiu para o PontoFarma e o Crédito.vc). A
home fica magra por alguns dias, o que é barato; uma marcação no Search Console
não é. Se preferir a velocidade, rode o backfill com consciência do risco — a
decisão é sua, o script está pronto.

A alternativa estrutural — variação de reescrita por blog na central — continua
pendente (§19 do CLAUDE.md).

Recomendado registrar a propriedade de domínio `midia.run` no Search Console
(TXT no DNS) para monitorar todos os subdomínios de uma vez.
