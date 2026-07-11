# CLAUDE.md — Contexto completo do projeto (rede de blogs sp011)

> Documento de handoff/contexto para o Claude Code (carregado automaticamente
> em toda sessão). Escrito em 2026-07-11 para migração de máquina. Mantenha-o
> atualizado quando decisões estruturais mudarem. Runbook operacional vivo:
> `deploy/README.md`. Responda ao usuário SEMPRE em português (pt-BR).

## 1. O que é este projeto

Monorepo pnpm de uma **plataforma de portais de notícias multi-blog**:
- Um "blog engine" completo (api + site público React + painel admin) que roda
  como N instâncias independentes na mesma VPS (uma imagem Docker, N projetos
  compose).
- Um **painel central de notícias** (coleta RSS → reescrita com IA →
  distribuição por regras → push HMAC para cada blog).
- Dono/operador: usuário solo (midiaranking@gmail.com / BeeMediaOF no GitHub),
  opera a VPS colando blocos de comandos prontos. Repo:
  `github.com/BeeMediaOF/sp011`, branch única `main` (commit direto, sem PR).

## 2. Estrutura do monorepo

| Caminho | O que é |
|---|---|
| `artifacts/api-server` | Backend do blog (Express, esbuild). Serve `/api/*`, ingest HMAC, AMP, sitemaps, social render (Playwright), analytics |
| `artifacts/brasilia-agora` | Frontend do blog (React/Vite, pacote `@workspace/sbc-agora`): site público + painel `/admin`. SSR só da home via plugin do vite |
| `artifacts/central-hub` | API do painel central (porta 8090): collector, rewriter, distributor, localizer, deliveryWorker |
| `artifacts/central-web` | SPA do painel central (porta 3001) |
| `lib/db` | Drizzle schema do blog (lazy init; `ensureSchema.ts` roda no boot — deploy NÃO roda drizzle-kit push) |
| `lib/central-db` | Schema do banco central (11 tabelas) |
| `lib/news-engine` | Pipeline compartilhado da central (scrape, rss, prompts, geminiPool, rewrite, quality, dedup, signing). Blog importa só `@workspace/news-engine/signing` |
| `lib/social-template` | Fonte única do template de artes sociais (editor e renderer usam o MESMO CSS) |
| `deploy/` | Kits operacionais: `README.md` (runbook), `blog-template/` (compose+.env de blog novo), `<blog>/GO_LIVE.md` + SQLs por blog |

Pacotes `lib/*` são TypeScript composite: depois de mexer em schema, rodar
`pnpm exec tsc -b` no lib antes de typecheckar quem depende (dist é gitignored).

## 3. Infraestrutura de produção

- **VPS Hostinger KVM 8** (`srv1794848`, 31 GB RAM / 8 vCPU / 400 GB). Repo em
  `/opt/sp011`. Só o Caddy expõe 80/443.
- **Compose raiz** (`/opt/sp011/docker-compose.yml`): serviços `api`, `web`
  (blog sp011), `central-api`, `central-web`, `ollama`, `caddy`, `pg-blogs`
  (postgres:16 interno, sem porta no host). Env: `.env` (blog sp011 + infra) e
  `.env.central` (central). App lê env via `node --env-file`.
- **Blogs replicados**: um diretório por blog em `/opt/blogs/<id>/`
  (compose.yml copiado de `deploy/blog-template/`, `.env` próprio, volume
  `api_data` com `db-config.enc`). Todos usam a MESMA imagem `blog-api:vN` /
  `blog-web:vN` buildada na VPS (sem registry).
- **Rede** `blogs_shared`: Caddy e `API_URL` usam SÓ aliases únicos
  `<id>-api`/`<id>-web` (o alias automático `api` é ambíguo — incidente
  2026-07-07 servia o blog errado). IDs reservados: `sp011`, `central`.
- **Caddy**: `Caddyfile` raiz com snippet `(blog)` + `import
  /etc/caddy/sites/*.caddy`; um arquivo por blog em `caddy/sites/`.
  GOTCHA: o Caddyfile é bind de arquivo único — `git pull` troca o inode e
  `caddy reload` relê o arquivo VELHO → pull que muda o Caddyfile exige
  `docker compose up -d --force-recreate caddy`. O diretório `caddy/sites/`
  não sofre disso (reload normal funciona).
- **Bancos**:
  - Blog sp011 (mãe): **Supabase** (projeto "SP011", ref
    `yfmyufqfepzwjtzblths`, sa-east-1) via `SUPABASE_DATABASE_URL` no `.env`
    raiz — NÃO está no pg-blogs.
  - Central: **Supabase** próprio (ref `sxilzannsqfkncxjnbad`) via
    `CENTRAL_DATABASE_URL` no `.env.central`.
  - Blogs replicados: um DATABASE + ROLE por blog no `pg-blogs`
    (`REVOKE CONNECT FROM PUBLIC`); credencial configurada pelo wizard
    `/admin/setup` e guardada criptografada em `db-config.enc` — **a conexão
    NÃO fica no .env**.
- **Uploads/Storage**: sp011 grava em disco na VPS (`/data/uploads`, volume
  `api_data`) desde jul/2026 (cota de egress do Supabase free estourou; bucket
  `uploads` é só fallback de leitura). Blogs replicados usam um projeto
  Supabase dedicado só a Storage, **um bucket público por blog** (nome =
  BLOG_ID). Nunca copiar caminho `/api/uploads/...` entre blogs.
- **DNS**: wildcard `*.midia.run → IP da VPS` (blogs novos nascem resolvendo);
  sp011.com.br e ksports.bebee.me são zonas próprias.
- Via MCP do Supabase (claude.ai) há acesso direto aos projetos "SP011"
  (`yfmyufqfepzwjtzblths`) e "Brasilia Agora" (`bfikqxysgktgmoxobxxu`) — dá
  para consultar/alterar o banco do sp011 sem passar pela VPS.

## 4. Blogs da rede (estado em 2026-07-11)

| BLOG_ID | Domínio | Idioma/nicho | Identidade (cores) | Estado |
|---|---|---|---|---|
| `sp011` | sp011.com.br | pt-BR, notícias gerais (mãe) | navy `#1e2d5e` + vermelho `#e01b2c`, dark `#0d1533`, tagline "Notícia que conecta" | No ar. Template "SP011 - Final" já importado no banco — falta Aplicar no admin |
| `ksports` | ksports.bebee.me (migração p/ ksports.midia.run decidida) | EN, esporte, foco Nigéria | dark blue `#0e0d2a`, K-Pink `#ff2b74`, K-Purple `#6600b8` (brandbook KBET) | No ar. NDPA/permissões/idioma entregues (deploy v23 + SQL do go-live pendentes) |
| `esporteagora` | esporteagora.midia.run | pt-BR, esporte | roxo `#5b2d8e`, verde `#4bce10`, dark `#241243` | Kit completo em `deploy/esporteagora/`; go-live operacional pendente |
| `resenhavip` | resenhavip.midia.run | pt-BR, esporte | verde `#1e7a3f`, amarelo `#fdb913`, dark `#0d3b1f` | Kit completo; ⚠️ flag "Páginas enganosas" no Search Console — revisão solicitada (ver §19) |
| `oleysports` | oleysports.midia.run | pt-BR, esporte (parceria OleyBet) | azul vivo `#2563ff`, royal `#1936c4`, navy `#0a0e27` | Kit completo; go-live pendente; banners viram OleyBet quando chegar a logo branca |
| `beeesportes` | beeesportes.midia.run | pt-BR, esporte | verde menta `#57c785`, profundo `#18754e`, dark `#0e1412` | Kit completo; go-live pendente |

- Slugs de categoria dos blogs de esporte **pt-BR** (EA/RV/Oley/Bee, todos
  iguais): `copa-do-mundo, futebol, volei, tenis, f1, futebol-americano,
  e-sports, outros`. **Propositalmente ≠ dos slugs EN do ksports**
  (`world-cup, football, volleyball, tennis, formula-1, nfl, esports,
  others`) — regra da central casa por categoria sem filtrar idioma; slug
  igual mandaria notícia PT ao ksports e dispararia tradução.
- Categorias reais do sp011 (artigos publicados): politica, mundo, geral,
  economia, cultura, esportes, cidade, saude, tecnologia, seguranca, nfl.
- Matchers de SQL por blog: RV `%resenha%`, Oley `%oley%`, Bee
  `name ILIKE '%bee%esporte%' OR domain ILIKE '%beeesportes%'` (NUNCA `%bee%`
  sozinho — ksports mora em ksports.bebee.me).

## 5. Workflow git + deploy padrão (VPS)

Commit **direto na main**, push para `origin main`. Depois de TODO push,
terminar a resposta com o bloco pronto para colar na VPS, com rebuild
**direcionado** aos serviços afetados:

```bash
cd /opt/sp011
git pull
docker compose build <serviços afetados>
docker compose up -d <serviços afetados>
```

Mapeamento arquivo→serviço: `artifacts/api-server` ou `lib/db` → `api`;
`artifacts/brasilia-agora` → `web`; `artifacts/central-hub`, `lib/central-db`
ou `lib/news-engine` → `central-api`; `artifacts/central-web` → `central-web`;
`lib/social-template` → `api` E `central-api`; `Caddyfile` →
`docker compose up -d --force-recreate caddy`; mudança só de `.env`/
`.env.central` → `docker compose up -d --force-recreate <svc>` (restart NÃO
relê env_file). Commits só de `deploy/*.sql`/docs → só `git pull`.

## 6. Deploy de imagem dos blogs replicados

`api`/`web` do compose raiz têm `image: blog-api:${BLOG_IMAGE_VERSION:-v1}` —
o build do sp011 é o que gera a imagem dos blogs. Cada blog replicado fixa a
sua tag em `BLOG_IMAGE_TAG` no `.env` próprio. Rollout padrão (bump + build +
sp011 + canário + demais):

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

```bash
# canário (ex.: resenhavip), depois conferir o site antes de seguir
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
```

```bash
# demais blogs (pula os que ainda não existem)
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes; do
  [ -d "/opt/blogs/$b" ] || continue
  cd "/opt/blogs/$b"
  sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
  docker compose up -d
done
cd /opt/sp011
```

Diagnóstico de mistura de blogs (incidente clássico):
`curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'` em cada
domínio — cada um deve devolver o próprio nome.

## 7. Replicar um blog novo (~20 min)

Modelo de runbook: `deploy/beeesportes/GO_LIVE.md` (o mais recente/completo).
Sequência (cada GO_LIVE tem os comandos completos):

1. **DNS** — `dig +short <dominio>` deve devolver o IP (wildcard já cobre).
2. **Painel central → Blogs → Novo** (nome, domínio, apiUrl) — copiar o
   segredo de integração (exibido UMA vez → `CENTRAL_INGEST_SECRET`).
   Ligar "Exigir aprovação" nos primeiros dias; definir teto diário
   (`max_posts_per_day` — blog sem teto nunca deixa o portão de economia
   fechar).
3. **Banco no pg-blogs**: `CREATE ROLE <id>_user LOGIN PASSWORD ...; CREATE
   DATABASE <id> OWNER <id>_user; REVOKE CONNECT ... FROM PUBLIC;` (senha
   `openssl rand -hex 16`; hífen não vale em nome de banco/role). Criar
   bucket público `<id>` no projeto Supabase de Storage.
4. **Scaffold**: `mkdir -p /opt/blogs/<id>` + `cp` do
   `deploy/blog-template/compose.yml` e `.env.example` + `sed -i` de BLOG_ID,
   COMPOSE_PROJECT_NAME=blog-<id>, BLOG_IMAGE_TAG (mesma dos irmãos), URLs,
   SESSION_SECRET/SETTINGS_ENCRYPTION_KEY (`openssl rand -hex 32` cada),
   CENTRAL_INGEST_SECRET. `grep` de conferência no final.
5. **Subir + Caddy**: `docker compose up -d`; criar
   `/opt/sp011/caddy/sites/<id>.caddy` com `printf '<dominio> {\n\timport
   blog <id>\n}\n'`; `caddy reload`. Ler o **setup token** nos logs da api
   AGORA (regenera a cada boot).
6. **Wizard** `https://<dominio>/admin/setup`: token + connection string
   `postgresql://<id>_user:<senha>@pg-blogs:5432/<id>` com SSL **disable** +
   Storage (URL do projeto, service_role, bucket) + primeiro admin. Depois:
   central → Testar conexão → "online". O wizard tem guarda anti-adoção
   (409 `existing_install` se a connection apontar para banco de outro blog).
7. **Fontes + regras**: rodar `deploy/<id>/sources_pt.sql` no banco CENTRAL
   (16 fontes PT de esporte compartilhadas entre os irmãos — upsert no-op se
   já existem — + taxonomia do blog + 8 regras de distribuição).
8. **Template**: rodar `deploy/<id>/template_final.sql` no banco DO BLOG e
   Aplicar no admin (ver §8).
9. **Backfill**: `deploy/<id>/backfill_50.sql` no banco central → ~50 posts
   no ar em ~8 min sem IA (ver §9). Verificações finais no GO_LIVE.

O blog nasce em modo **central-push puro**: fontes seed inativas, sem chaves
de IA no `.env` — coleta/reescrita ficam na central. Fallback de emergência do
ksports: `deploy/ksports/sources_blog_backup.sql` (fontes no banco do próprio
blog, active=false).

## 8. Replicar/clonar template de home

O layout da rede é a família "KSports - Final" (22 blocos): top bar escura,
hero portal com sidebar Mais Lidas/Últimas, faixa de anúncio, Últimas, grade
de recentes, box de anúncio lateral, 4 colunas por categoria, seção
horizontal, "mais notícias", + 9 blocos padrão ocultos. Cada blog tem um
`deploy/<id>/template_final.sql` idempotente que injeta o snapshot em
`settings.homeTemplates` do banco do blog (o app relê site_settings a cada
15s — sem restart; exige wizard concluído).

- **Aplicar** = ação no admin (Home + menu → aba Templates → "Meus templates"
  → Aplicar). Aplicar template também substitui menu, rodapé, cores e
  siteLanguage/siteTimezone do snapshot (campos "portal" recebem reset neutro
  quando o template não os define). Desfazer restaura tudo.
- **Como os clones foram gerados**: script node que lê o `template_final.sql`
  de um blog irmão, faz split no dollar-quote `$tpl$`, parseia o JSON e:
  (a) troca a paleta por mapa de slots (principal, CTA, dark bg, footer,
  border, muted, texto-sobre-CTA, gradiente do hero), (b) troca wordmark/
  tagline/banners HTML, (c) se as categorias mudarem, MUTA menu/blocos no
  objeto (técnica do sp011) em vez de replace de strings. Validações que o
  script deve manter: split em 3 partes, 22 blocos, ids únicos, orders
  contíguos 0–21, categorias dos blocos visíveis ⊆ categorias existentes,
  paths do menu ⊆ rotas válidas, varredura de strings proibidas do blog de
  origem, contagem de wordmark. (Scripts geradores viviam no scratchpad da
  sessão — não migram; os SQL commitados são a fonte da verdade. Para um blog
  novo, gerar novo script a partir de um template_final.sql existente.)
- **Extrair um template salvo no admin** para SQL:
  `SELECT t::text FROM settings, jsonb_array_elements(value::jsonb->'homeTemplates') t
  WHERE key='site_settings' AND t->>'name' ILIKE '%<nome>%'`.
- Starters embutidos no código (`STARTER_TEMPLATES` em
  `HomeBlocksManager.tsx`): "KSports — Portal Esportivo" (EN/KBET) e
  "Esporte Agora — Portal Esportivo (PT)". Nunca são persistidos no banco.
- Rotas de categoria custom SÓ funcionam se existir menuItem com o path
  (DynamicCategory resolve `/:slug`; App.tsx tem rotas fixas para as
  editorias clássicas).

## 9. Backfill — catálogo instantâneo sem IA

Padrão `deploy/<id>/backfill_50.sql` (roda no banco CENTRAL): pega até N
notícias de esporte do histórico **reaproveitando a reescrita compartilhada e
a categoria já decididas para o Esporte Agora** (zero IA, zero aprovação),
cria deliveries `pending` escalonadas a cada 10s (worker envia 5/15s → tudo
no ar em ~8 min). Exige blog "online". Rodar de novo pega as próximas N.
NUNCA criar `awaiting_localization` em massa; NUNCA incluir
`awaiting_localization` em publicação em massa (publicaria idioma errado).
⚠️ Mesmo conteúdo em N domínios = conteúdo duplicado para SEO — aceito pelo
usuário por velocidade, mas é o suspeito nº 1 do flag Safe Browsing do
resenhavip; se a revisão for negada, variação de reescrita por blog vira
prioridade.

## 10. Painel central de notícias (como flui uma notícia)

`central.midia.run` (host em `CENTRAL_DOMAIN` no `.env` raiz). Pipeline no
central-hub: **collector** (tick 1min, janela BR, orçamento, backpressure) →
**rewriter** (poll 10s, reescrita ÚNICA compartilhada `rewrites.blog_id=null`,
quality gate, `ai_usage_events`) → **distributor** (regras → `deliveries`
UNIQUE(news,blog), pacing minMinutes/maxPerDay) → **localizer** (só quando
idioma do blog ≠ da fonte OU blog tem taxonomia e a regra não fixa categoria:
`awaiting_localization → localizing`, traduz/classifica em 1 chamada, reusa
tradução por (notícia, idioma)) → **deliveryWorker** (POST `/api/ingest` no
blog com HMAC `${timestamp}.${rawBody}`, anti-replay 300s, idempotência por
centralId; backoff 1m→5m→15m→1h→6h, 5 tentativas → dead).

- Precedência de categoria: regra (`targetCategory`) > IA > fallback
  `others`/último slug. Classificação nunca bloqueia entrega.
- **Portão de economia**: todos os blogs ativos saturados (entregues+em
  espera ≥ teto) → collector/rewriter pulam o ciclo. Todo blog ativo precisa
  de `max_posts_per_day`.
- **Publicar agora**: `POST /deliveries/:id/publish-now` (pending ou
  awaiting_approval) — também via botão na página Entregas.
- IA da central: pools de chaves Gemini/OpenAI/Perplexity (criptografadas)
  com rodízio; prompt padrão de reescrita PT em
  `lib/news-engine/src/prompts.ts` — **espelhar sempre** com
  `api-server/src/lib/rssProcessor.ts` (diff deve dar idêntico); versão EN em
  `deploy/ksports/sources_en.sql`.
- Dedup global (guid/URL/título normalizado + overlap 500 recentes) — feeds
  sobrepostos entre irmãos são seguros.

## 11. Pipeline interno do blog (modo standalone — hoje só o sp011 usa)

`startScheduler()` no api-server: scheduler (20 min) → rssProcessor (RSS ou
scrape) salva rascunho → rewriteQueue reescreve com IA e publica. **Nada
publica sem reescrita.** Provider primário: **Ollama** self-hosted
(`qwen2.5:7b-instruct`, serviço `ollama` no compose, api fala
`http://ollama:11434`); fallback Gemini (chaves `AIzaSy...` no painel,
criptografadas) e Perplexity; lane de reforço (boost) configurável no painel.
Backpressure: coleta adia quando o backlog de rascunhos ≥
`rssMaxPendingRewrites`. Configuração de coleta/janela/tetos no card do
RSSManager.

## 12. Acesso aos bancos (padrões prontos para a VPS)

```bash
# Banco do blog sp011 (Supabase do .env raiz)
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT 1;"
```

```bash
# Banco CENTRAL (Supabase do .env.central)
cd /opt/sp011
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT 1;"
```

```bash
# Banco de um blog replicado (superusuário local; banco = BLOG_ID)
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d ksports -c "SELECT 1;"
```

Scripts SQL sempre por redirect: `... psql "$DBURL" -v ON_ERROR_STOP=1 <
deploy/<blog>/<arquivo>.sql`. Depois de mexer em `rss_sources` direto no banco
de um blog: `docker compose restart api` do blog (store lê fontes no boot).

## 13. Regras invioláveis / segurança

- **NUNCA trocar `SESSION_SECRET`** (nem `SETTINGS_ENCRYPTION_KEY` se
  definido): a chave AES-256-GCM dos segredos do banco deriva dele — trocar
  torna tudo ilegível. Envelope: `enc:v1:` + base64(iv|tag|ciphertext),
  `crypto.ts` do api-server.
- Credenciais de banco dos blogs replicados NUNCA em .env/logs/central — só
  no `db-config.enc` via wizard. Acesso administrativo é sempre
  `docker compose exec -T pg-blogs psql -U postgres -d <blog>`.
- **NUNCA `docker system prune --volumes`** (volumes de banco locais).
- Heredoc NÃO funciona no terminal do usuário — `psql -c` de linha única ou
  redirect `< arquivo.sql`. (O heredoc antigo no deploy/README.md §Subir é
  legado — preferir os GO_LIVE por blog, que já vêm sem heredoc.)
- Segredos gravados direto no banco central ficam em texto puro até o 1º
  Salvar nas Configurações — reiniciar o central-api ANTES de salvar.
- Texto NDPA do ksports é rascunho pendente de validação jurídica.
- Admin ignora permissões por design; nunca rebaixar/excluir o último admin.
- Isolamento entre blogs é por infra (container+DB+SESSION_SECRET próprios);
  NÃO existe blogId no app — nunca hardcodar conteúdo por blog na imagem
  compartilhada (usar settings).

## 14. Desenvolvimento local no Windows (limitações intencionais)

- `vite build` do frontend NÃO roda no Windows (pnpm-workspace exclui
  binários win32 de rollup/esbuild/lightningcss) — build real é no Docker da
  VPS. O build do api-server (esbuild) funciona.
- `pnpm run typecheck` da raiz não casa os filtros no Windows — rodar por
  pacote (`pnpm run typecheck` dentro de artifacts/api-server, etc.).
- Testes: `node --test` (vitest não roda aqui). api-server, news-engine e
  central-hub têm suites; imports relativos com extensão `.ts` explícita.
- NUNCA usar caracteres unicode literais em regex neste repo (Edit/Write
  normalizam NFC) — sempre `\uXXXX`.
- PowerShell expande `$tpl$` em aspas duplas — scripts node com dollar-quote
  sempre via arquivo, nunca `node -e`.
- Docker local não builda imagens grandes (disco C: cheio) — validar builds
  na VPS.

## 15. Idiomas

- **Site público**: `settings.siteLanguage` ("pt-BR"|"en") +
  `siteTimezone` (IANA); dicionário em `brasilia-agora/src/lib/i18n.ts`
  (valores pt = literais antigos exatos → default byte-idêntico);
  formatadores SEMPRE com timeZone explícito (SSR=cliente, evita React #418).
  Propagação de mudança ≤90s. `t` de `useT()` muda a cada render — nunca em
  deps de useEffect.
- **Painel admin**: idioma POR USUÁRIO (`users.language`, seletor no Meu
  Perfil), `lib/adminI18n.ts` (~700 chaves) — shell + Dashboard, Analytics,
  Menu, Configurações e Redes Sociais traduzidos; abas só-admin ficaram
  pt-BR por escopo.

## 16. Social / Meta

Admin → Redes Sociais: editor WYSIWYG estilo Canva (pacote
`@workspace/social-template`), render por Playwright/Chromium no api-server,
fila `social_publication_queue` → Meta Graph API. OAuth Meta: App ID/Secret
globais em `social_config` (secret criptografado; **trim aplicado no salvar**
— espaço colado junto causava "Error validating client secret", commit
cf67b35), callback `{APP_URL}/meta-auth-complete.html` registrado no Meta for
Developers. `social_title` de 70–85 chars gerado pela IA para a arte.
Automação (aba Automação) auto-enfileira artigos publicados. Legenda sempre
montada no servidor.

## 17. Invariantes técnicas (não quebrar)

- **SSR/perf**: SSR só da home; `sanitizeArticleHtml` isomórfico (nunca
  retornar "" no servidor); `/api/site` publica assets como URL
  `/api/site-asset/:key` (updateSettings ignora valores que começam com esse
  prefixo); allowlist do proxy de imagem espelhada em `routes` do api-server
  E `brasilia-agora/src/lib/newsImage.ts` (mudar nos DOIS); HTML com
  `no-cache` (NUNCA `no-store` — mata bfcache).
- **Analytics**: heartbeat cumulativo agregado por MAX; tráfego interno
  marcado `is_internal`, nunca dropado; `totals.*` do /stats fixos ao agora;
  canal classificado no servidor; migrações de coluna via Drizzle schema E
  ensureSchema. Docs: `docs/ANALYTICS.md`.
- **Blocos da home**: `blockType` persistido (retrocompat por prefixo do id);
  `itemsLimit` não vale para blocos editoriais no fluxo clássico; rodapé em
  `settings.footerConfig`; zonas main/sidebar/half; ver memória do repo em
  `HomeBlocksManager.tsx` ao criar tipo novo (renderer + case + painel +
  tipos nos dois stores).
- Colunas novas do blog se autocriam no boot (`ensureSchema.ts`) — não
  depender de migração manual.

## 18. Preferências do usuário (como trabalhar)

- Responder SEMPRE em pt-BR.
- Depois de todo push: bloco de comandos VPS pronto para colar (nunca "mesmo
  comando de antes"), rebuild direcionado (§5), passos pós-deploy listados.
- Runbooks/instruções: TODO comando completo e auto-suficiente para colar —
  `cd` no início do bloco, valores do usuário como variável no topo
  (`INGEST='COLE_AQUI'`), arquivos gerados com `cp` + `sed -i`, `grep` de
  conferência no final, sem heredoc. Modelo: `deploy/beeesportes/GO_LIVE.md`.
- Dev solo: sem PR, sem branch — commit direto na main.

## 19. Estado atual e pendências (2026-07-11)

1. **sp011**: template "SP011 - Final" já está no banco (importado via
   Supabase) — falta o usuário Aplicar no admin. Aplicar também conserta o
   menu atual (sobras do incidente ksports: `/recnologia`, submenus EN, sem
   Política/Economia).
2. **Deploy de imagem do cf67b35** (trim do Meta App Secret) — bloco do §6;
   pode já ter sido rodado. Depois, reconectar a conta Meta do Resenha Vip.
3. **Resenha Vip / Safe Browsing**: GSC marcou "Páginas enganosas"
   (engenharia social). Revisão solicitada (1–3 dias; não reenviar em loop).
   Provável gatilho: domínio novo + conteúdo 100% duplicado do backfill. Se
   negada, ou se Oley/Bee forem flagados: **variação de reescrita por blog
   vira prioridade**. Recomendado registrar a propriedade de domínio
   `midia.run` (TXT no DNS) no Search Console para monitorar todos os
   subdomínios.
4. **Go-lives pendentes**: oleysports e beeesportes (kits completos em
   `deploy/<id>/GO_LIVE.md`); esporteagora (backfill_30) e resenhavip
   conferir estado real na VPS.
5. **KSports**: deploy v23 + SQL de permissões/idioma
   (`deploy/ksports/NDPA_IDIOMA_PERMISSOES.md`), revisão jurídica NDPA,
   migração de domínio para ksports.midia.run (decidida, execução a
   confirmar), logo KBET branca para os banners.
6. **Replicação Fases 1–2** (pendentes de implementação): `deploy/blog-ctl`
   (backup pg_dump+rclone é INEGOCIÁVEL — pg-blogs não tem durabilidade
   gerenciada; PG_POOL_MAX; DISABLE_LOCAL_PIPELINE; mem_limit/healthcheck) e
   provisionador autônomo + tela "Novo blog" na central.
7. OleyBet: trocar banners "Anuncie aqui" quando o usuário mandar a logo.

## 20. Onde procurar mais (no repo)

- `deploy/README.md` — runbook vivo da replicação (arquitetura, preparação,
  subir blog, remover blog, gotchas do Caddy).
- `deploy/<blog>/GO_LIVE*.md` — roteiros completos por blog;
  `deploy/ksports/NDPA_IDIOMA_PERMISSOES.md` e `GO_LIVE_EN.md` (ksports EN).
- `README_NOVA_INSTANCIA.md` — instância em VPS separada (wizard/setup).
- `docs/ANALYTICS.md` / `docs/ANALYTICS-VALIDACAO.md` — métricas.
- `plano_painel_central_rss.md`, `prompt_replicacao_provisionamento_blogs.md`,
  `ksports-ndpa-idioma-validacao-permissoes.md` — briefings originais.
- Histórico git: mensagens de commit em pt-BR descrevem cada entrega.
