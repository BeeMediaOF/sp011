# O Comandante News — go-live

Portal de **negócios, economia, aviação e turismo** em pt-BR.

Todos os comandos são completos, prontos para copiar e colar na VPS.

| Item | Valor |
|---|---|
| BLOG_ID / banco / bucket | `ocomandante` |
| Domínio | `ocomandante.midia.run` (wildcard já resolve) ou zona própria — **defina na variável `DOMAIN` no topo de cada bloco** |
| Idioma / fuso | pt-BR / America/Sao_Paulo |
| Editorias (slugs) | `negocios`, `economia`, `aviacao`, `turismo` |
| Identidade (logos) | navy `#14265e` (wordmark) · azul royal `#1657d0` (emblema) · royal claro `#2f6fe0` · azul claro `#4d8dff` (só sobre fundo escuro) · vermelho `#d81f26` (o bloco "NEWS" — botões, sempre com tinta branca) · navy profundo `#0a1740` (top bar/menu) · rodapé `#060e26` |
| Matcher SQL do blog | `name ILIKE '%comandante%' OR domain ILIKE '%comandante%'` |

> **Atenção às editorias.** Só `/economia` é editoria fixa do engine
> (`categoryRoutes.ts`). `/negocios`, `/aviacao` e `/turismo` só existem porque
> há item de menu apontando para elas — os dois templates já vêm com os quatro.
> Tirar uma do menu derruba a página dela.

## Se o blog JÁ está no ar

Foi o caso em 2026-08-07: a casca subiu antes das editorias serem decididas.
Rode só os passos **6** (templates + categorias) e **7** (fontes e regras) e
confira no **8**. Nada mais muda.

## As duas homes

O `template_final.sql` instala **os dois templates de uma vez**; aplicar é
escolha no admin, e "Desfazer" volta atrás.

| Template | Layout | Quando usar |
|---|---|---|
| **O Comandante - Portal** | 22 blocos, família "KSports - Final": top bar escura, hero portal com sidebar Mais Lidas + Últimas, faixa de anúncio, recentes, **4 colunas (uma por editoria)**, "Radar da Aviação" horizontal, "mais notícias" | Portal denso, muita manchete na primeira dobra |
| **O Comandante - Revista** | 21 blocos, layout do mock Bee Media: fundo claro, hero de boas-vindas com busca, cards revista, grade das 4 editorias com ícones, Escolha do Editor, Negócios + Economia lado a lado, Turismo, newsletter em cartão | Leitura calma, poucas matérias por vez |

O Revista exige imagem `blog-api`/`blog-web` com os layouts `hero`/`mini`
(≥ v85) — o passo 3 já pega a imagem mais recente do sp011.

## 0) Pré-requisito: DNS

```bash
DOMAIN='ocomandante.midia.run'
dig +short $DOMAIN
```

Deve devolver o IP da VPS. Subdomínio `.midia.run` já resolve pelo wildcard.
Zona própria: crie o **registro A do apex → IP da VPS** no provedor ANTES de
tudo (o Caddy emite o certificado sozinho quando o DNS propagar).

## 1) Cadastro no painel central

Blogs → Novo:
- Nome: **O Comandante News** · Domínio: o escolhido acima ·
  API URL: `https://<dominio>`
- Idioma: **pt-BR**. **Exigir aprovação: ON** nos primeiros dias.
- Teto diário e espaçamento: o passo 7 preenche 24/dia e 30 min se estiverem
  vazios (blog ativo sem teto nunca deixa o portão de economia fechar).
- Não crie regra de distribuição na mão: o passo 7 cria as quatro.
- **Copiar o segredo de integração** — é exibido UMA única vez (vira o
  `CENTRAL_INGEST_SECRET` no passo 3).

## 2) Banco no pg-blogs

```bash
cd /opt/sp011
PASS=$(openssl rand -hex 16); echo "SENHA DO BANCO (anote): $PASS"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE ROLE ocomandante_user LOGIN PASSWORD '$PASS';"
docker compose exec -T pg-blogs psql -U postgres -c "CREATE DATABASE ocomandante OWNER ocomandante_user;"
docker compose exec -T pg-blogs psql -U postgres -c "REVOKE CONNECT ON DATABASE ocomandante FROM PUBLIC;"
```

Storage: no projeto Supabase dedicado a Storage, criar **bucket público
`ocomandante`**.

## 3) Scaffold do blog

Primeiro, o segredo de integração do passo 1 e o domínio:

```bash
INGEST='COLE_AQUI_O_SEGREDO_DO_PASSO_1'
DOMAIN='ocomandante.midia.run'
```

Depois cole o bloco inteiro (usa a imagem mais recente já buildada no sp011 e
gera os segredos sozinho):

```bash
TAG=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2-)
mkdir -p /opt/blogs/ocomandante && cd /opt/blogs/ocomandante
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
sed -i "s|^BLOG_ID=.*|BLOG_ID=ocomandante|" .env
sed -i "s|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=blog-ocomandante|" .env
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$TAG|" .env
sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://$DOMAIN|" .env
sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$DOMAIN|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^SETTINGS_ENCRYPTION_KEY=.*|SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env
sed -i "s|^CENTRAL_INGEST_SECRET=.*|CENTRAL_INGEST_SECRET=$INGEST|" .env
grep -E '^(BLOG_ID|COMPOSE_PROJECT_NAME|BLOG_IMAGE_TAG|APP_URL|CENTRAL_INGEST_SECRET)=' .env
```

O `grep` final é a conferência — os 5 valores devem sair preenchidos.
`SUPABASE_DATABASE_URL` fica comentado (o wizard configura o banco).

## 4) Subir + rota no Caddy

```bash
DOMAIN='ocomandante.midia.run'
cd /opt/blogs/ocomandante
docker compose up -d
printf '%s {\n\timport blog ocomandante\n}\n' "$DOMAIN" > /opt/sp011/caddy/sites/ocomandante.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
docker compose logs --tail 100 api | grep -i "setup token"
```

Anote o setup token AGORA (regenera a cada boot da api).

## 5) Wizard `/admin/setup`

Se ainda estiver na mesma sessão do passo 2, imprima a connection string
pronta:

```bash
echo "postgresql://ocomandante_user:$PASS@pg-blogs:5432/ocomandante"
```

Em `https://<dominio>/admin/setup`:
- Token do passo 4.
- Connection string acima (se fechou o terminal, monte com a senha anotada:
  `postgresql://ocomandante_user:<senha do passo 2>@pg-blogs:5432/ocomandante`) ·
  SSL: **disable** (rede interna).
- Storage: URL + `service_role` do projeto de Storage + bucket `ocomandante`.
- Primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

Depois: painel central → Blogs → **Testar conexão** → "online".

## 6) Templates, categorias e identidade

```bash
cd /opt/sp011 && git pull
docker compose exec -T pg-blogs psql -U postgres -d ocomandante -v ON_ERROR_STOP=1 < deploy/ocomandante/template_final.sql
```

O `\echo` no fim lista o que ficou salvo — devem aparecer as duas linhas
(`tpl-ocomandante-portal` 22 blocos / 5 itens de menu, `tpl-ocomandante-revista`
21 blocos / 4 itens) e as 4 categorias.

Em `https://<dominio>/admin` (aparecem em Home + menu → aba Templates →
"Meus templates" em ≤15s, sem restart):

1. Aplicar **um dos dois** — instala blocos, menu, rodapé, cores, idioma
   pt-BR e fuso SP de uma vez. Ver o site, aplicar o outro, comparar; o botão
   **Desfazer** restaura o estado anterior.
   **Se você já aplicou uma versão anterior do template, aplique de novo**: o
   menu antigo (com as editorias clássicas) só troca ao aplicar.
2. **Configurações → Informações**: nome "O Comandante News", tagline,
   **upload das logos** (a horizontal para o header, a quadrada para o
   favicon), autor padrão (ex.: "Redação O Comandante"). Nunca reaproveitar
   caminho `/api/uploads/` de outro blog — bucket é por blog.

O SQL só grava a lista de **Categorias** se ela ainda não existir: se você já
salvou categorias no painel, ajuste lá (Categorias) com os slugs `negocios`,
`economia`, `aviacao`, `turismo`.

## 7) Fontes e regras (banco CENTRAL)

```bash
cd /opt/sp011 && git pull
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/ocomandante/sources_ocomandante.sql
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/ocomandante/rules_keywords.sql
```

O que entra:

| Categoria de fonte | Fontes ativas | Editoria |
|---|---|---|
| `oc-aviacao` | Aero Magazine, Airway, Aeroflap, FlightGlobal, FLYING Magazine, Simple Flying | `aviacao` |
| `oc-turismo` | Forbes Brasil — Turismo de Luxo | `turismo` |
| `oc-negocios` | NeoFeed, Brazil Journal | `negocios` |
| `oc-economia` | Gazeta do Povo — Economia | `economia` |

E mais **4 regras por keyword** (prioridade maior) que corrigem o destino
quando a pauta atravessa: macroeconomia vinda de NeoFeed/Brazil Journal vai
para `/economia`, resultado de empresa vindo da Gazeta vai para `/negocios`, e
pauta de companhia aérea ou de hotelaria vai para `/aviacao` e `/turismo`
venha de onde vier.

**Nascem inativas** (ligue em Fontes no painel quando quiser):

- **PANROTAS, Mercado & Eventos, Melhores Destinos** — sugestão para engrossar
  turismo, que hoje tem uma fonte só. Ativar as três de uma vez:
  `docker compose exec -T pg-blogs psql "$DBURL" -c "UPDATE central_sources SET active=true WHERE category='oc-turismo';"`
- **InfoMoney — Economia, Business e Onde Investir** — os três feeds de seção
  do InfoMoney respondem 200 com XML válido e **zero item** (verificado em
  2026-08-07); o InfoMoney só publica no feed geral, que já está na central
  como fonte de `financas` do Crédito.vc. Confira antes de ativar:
  `curl -s https://www.infomoney.com.br/economia/feed/ | grep -c '<item'`

As três fontes em inglês (FlightGlobal, FLYING, Simple Flying) ficam com
`language='pt-BR'` **de propósito**: o prompt padrão da central já escreve em
português, então elas não passam pelo tradutor — e marcar `en` faria o script
do KSports carimbar um prompt em inglês nelas. Detalhes no cabeçalho do
`sources_ocomandante.sql`.

## 8) Verificação

```bash
DOMAIN='ocomandante.midia.run'
curl -sI https://$DOMAIN
curl -s https://$DOMAIN/api/setup
curl -s https://$DOMAIN/ | grep -o '<html lang="[^"]*"'
curl -s https://$DOMAIN/api/site | grep -o '"siteName":"[^"]*"'
curl -sI https://$DOMAIN/aviacao | head -1
```

- 1º curl: `200` com TLS (ACME leva 10–60s).
- 2º curl: `{"setupRequired":false}`.
- 3º curl: `<html lang="pt-BR"`.
- 4º curl: **`O Comandante News`** — se sair o nome de outro blog, é mistura
  de aliases na rede `blogs_shared` (§3 do CLAUDE.md).
- 5º curl: `200` (a rota da editoria existe porque o menu do template a define).

Fluxo de conteúdo, ~15 min depois do passo 7 (no banco central):

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -c "SELECT s.category, count(*) FROM news_items n JOIN central_sources s ON s.id=n.source_id WHERE s.category LIKE 'oc-%' GROUP BY 1 ORDER BY 1;"
docker compose exec -T pg-blogs psql "$DBURL" -c "SELECT d.status, d.category, count(*) FROM deliveries d JOIN blogs b ON b.id=d.blog_id WHERE b.name ILIKE '%comandante%' GROUP BY 1,2 ORDER BY 1,2;"
```

A primeira query mostra a coleta por eixo; a segunda, as entregas por editoria.
Com "Exigir aprovação" ligado elas ficam em `awaiting_approval` até você
aprovar na página Entregas — é ali que dá para ver se a classificação por
keyword está acertando antes de qualquer coisa ir ao ar.

Rollback: seção "Remover um blog" do `deploy/README.md`.

## O que ainda não existe

- **Backfill.** O histórico da central é de esporte e finanças; não serve para
  este blog. O catálogo nasce da coleta orgânica — conte ~1 dia para a home
  encher.
- **Artes sociais** (`social_templates.sql`). Peça quando for conectar
  Instagram/Facebook — a arte usa a logo de `/api/site-asset/logo`, então o
  upload do passo 6.2 precisa vir antes, em versão clara para contrastar com
  o bloco escuro do canto.
