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
- **Caddy**: `Caddyfile` raiz com snippets `(blog)` e `(blog-cf)` + `import
  /etc/caddy/sites/*.caddy`; um arquivo por blog em `caddy/sites/`.
  `(blog-cf)` é para blog atrás do **Cloudflare** (hoje só o credito.vc): lá o
  Caddy NÃO consegue emitir certificado PÚBLICO (o CF fala HTTPS com a origem
  até nas requisições do ACME → HTTP 525). O credito.vc roda com **`tls
  internal`** (CA interna do Caddy, que renova sozinha) — aceito porque o modo
  do Cloudflare é **Full**, que não valida o certificado da origem; se um dia
  virar Full (strict), aí sim precisa de Origin Certificate, e é para isso que
  `/opt/certs` já está montado `:ro` (fora do repo — chave privada não se
  commita). O snippet reescreve o `X-Forwarded-For` a partir do
  `Cf-Connecting-Ip` só quando o peer é IP do Cloudflare: sem isso o `trust
  proxy 1` do api entrega o IP do EDGE como se fosse o do leitor e, como IP de
  edge carrega flag `hosting`, TODA visita nasceria `is_internal` e o painel de
  audiência do blog ficaria zerado sem erro nenhum aparecendo. Runbook:
  `deploy/README.md`.
  GOTCHA: o Caddyfile é bind de arquivo único — `git pull` troca o inode e
  `caddy reload` relê o arquivo VELHO → pull que muda o Caddyfile exige
  `docker compose up -d --force-recreate caddy`. O diretório `caddy/sites/`
  não sofre disso (reload normal funciona).
  **Arquivos na raiz do domínio** (verificação do Search Console/Bing/Meta,
  `ads.txt`): `caddy/verify/<BLOG_ID>/<arquivo>` — servido só no domínio
  daquele blog pelo matcher `@verify` dos snippets `(blog)`/`(blog-cf)` e do
  bloco do sp011. Não pode ir em `artifacts/brasilia-agora/public/`: a imagem
  `web` é UMA para os 11 blogs, e o token do Search Console de um domínio
  responderia na raiz de todos os outros — além de o `staticExistsPlugin`
  (§17) devolver 404 para extensão que não existe em `dist/public`. O matcher
  só casa se o arquivo EXISTIR, e só para `.html/.txt/.xml/.json`; o
  `file_server` lê do disco a cada request, então arquivo novo vale NA HORA,
  sem reload, sem rebuild. Publicar é UM comando: `verify-add <domínio-ou-id>
  <arquivo>` (`deploy/verify-add.sh`, symlinkado em `/usr/local/bin` na VPS) —
  ele resolve blog↔domínio pelo `caddy/sites/`, deriva o conteúdo dos arquivos
  `google*.html` do próprio nome e confere origem + domínio público com curl.
  Arquivo criado por ele fica não rastreado: commitar depois é o que o faz
  sobreviver a um reprovisionamento. Runbook: `caddy/verify/README.md`.
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
| `oleysports` | **oleysports.com.br** (zona própria desde 2026-08-14; `oleysports.midia.run` → 301) | pt-BR, esporte (parceria OleyBet) | azul vivo `#2563ff`, royal `#1936c4`, navy `#0a0e27` | No ar. Banners viram OleyBet quando chegar a logo branca |
| `beeesportes` | beeesportes.midia.run | pt-BR, esporte | verde menta `#57c785`, profundo `#18754e`, dark `#0e1412` | Kit completo; go-live pendente |
| `pontofarma` | pontofarma.com (zona própria; ou .midia.run provisório) | pt-BR, B2B setor farmacêutico | verde `#18a957`/`#0c8b46` + navy `#0e2341`, rodapé `#0c1630`, tagline "conteúdo que gera resultado" | Kit completo em `deploy/pontofarma/` (GO_LIVE + sources_farma + template); go-live pendente; sem backfill (nicho novo) |
| `creditovc` | **credito.vc** (zona própria, **atrás do Cloudflare** — único da rede; ver §3) | pt-BR, educação financeira/crédito | verde vivo `#0ec76d`/`#0a9455` + navy `#0f2446`, rodapé `#0a1630`, tagline "Educação financeira para a vida real" | No ar. Kit em `deploy/creditovc/`; sem backfill (nicho novo) |
| `apostaganha` | apostaganha.midia.run | pt-BR, esporte (marca Aposta Ganha) | laranja vivo `#ff6a00` (só sobre fundo escuro) + laranja queimado `#c24500` (blocos/menu ativo) + preto `#111111`, rodapé `#080808` | Kit completo em `deploy/apostaganha/`; go-live pendente |
| `recebabet` | recebabet.midia.run | pt-BR, esporte (marca Receba Bet) | azul-céu `#3d9bff` + azul royal `#0f62d6` + navy `#071b3d`, rodapé `#040f26` | Kit completo em `deploy/recebabet/`; go-live pendente |
| `ocomandante` | **ocomandantenews.com.br** (zona própria desde 2026-08-14; `ocomandante.midia.run` → 301) | pt-BR, negócios/economia/aviação/turismo | navy `#14265e` (wordmark) + azul royal `#1657d0` (emblema) + royal claro `#2f6fe0` + azul claro `#4d8dff` (só sobre escuro) + vermelho `#d81f26` (bloco "NEWS", só com tinta branca), dark `#0a1740`, rodapé `#060e26`, tagline "No comando da notícia" | Blog no ar (ago/2026). Kit em `deploy/ocomandante/` (GO_LIVE + template com 2 homes + sources + rules_keywords); falta aplicar template/fontes e as logos |

- Slugs de categoria dos blogs de esporte **pt-BR** (EA/RV/Oley/Bee/Aposta
  Ganha/Receba Bet, todos iguais): `copa-do-mundo, futebol, volei, tenis, f1, futebol-americano,
  e-sports, outros`. **Propositalmente ≠ dos slugs EN do ksports**
  (`world-cup, football, volleyball, tennis, formula-1, nfl, esports,
  others`) — regra da central casa por categoria sem filtrar idioma; slug
  igual mandaria notícia PT ao ksports e dispararia tradução.
- Categorias reais do sp011 (artigos publicados): politica, mundo, geral,
  economia, cultura, esportes, cidade, saude, tecnologia, seguranca, nfl.
- Slugs do **pontofarma**: `gestao, fiscal-tributario, legislacao, mercado,
  vendas, equipe, tecnologia, saude-categorias, outros`. Slugs do
  **creditovc**: `credito, sair-das-dividas, score, organizar-financas,
  renda-extra, planejar-o-futuro, investimentos` — **sem `outros`** desde
  2026-08-18: balão de escape do classificador é o oposto de blog focado, e
  a categoria nem existia no admin do blog (199 artigos viraram página
  órfã). Sem balde, quem barra pauta alheia são as REGRAS: as 7 do
  credito.vc têm `targetCategory` fixo e o catch-all está desligado — se
  alguma regra ativa ficar sem target, o que a IA não classificar cai no
  ÚLTIMO slug da lista (`investimentos`). Identidades e
  editorias vêm das propostas Bee Media (PDFs "Proposta_PontoFarma" e
  "Proposta_Portal_CreditoVC"); mock HTML/JSON de referência em
  `docs/Guia_Claude_Code_Base.md` (movido de public/ — ali seria servido no
  site de todos os blogs). ⚠️ O template desses dois é LAYOUT PRÓPRIO do
  mock, COLUNA ÚNICA fiel desde 2026-07-16: layouts de app `hero` (3 colunas:
  boas-vindas+busca | destaque | 2 cards) e `mini` (cards revista c/ tempo de
  leitura), `sectionStyle:"revista"`, newsletter `format:"card"`, fundo
  `pageBgColor:#f7f9fb`, rodapé claro 3 colunas + social — exige imagem
  blog-api/web com esses layouts (aplicar template SÓ depois do rollout).
  "Mais Lidas"/"Últimas Notícias" fora da home; `colunistas` oculto até
  existirem colunistas reais. NÃO é a família KSports-Final; os
  template_final.sql deles também fazem bootstrap do site_settings com os
  defaults do app (espelho do store.ts) quando a linha não existe.
- Slugs do **ocomandante** (definidos em 2026-08-07): `negocios, economia,
  aviacao, turismo`. Só `economia` é `FIXED_CATEGORIES`
  (`brasilia-agora/src/lib/categoryRoutes.ts`) — as outras três resolvem
  porque existe menuItem apontando para elas, então **tirar uma do menu
  derruba a página**. Único blog da rede com DOIS templates no mesmo
  `template_final.sql` (dollar-quotes `$tplp$`/`$tplr$` +
  `jsonb_build_array`): "O Comandante - Portal" (22 blocos, família
  KSports-Final) e "O Comandante - Revista" (21 blocos, layout do mock, exige
  imagem ≥ v85 pelos layouts `hero`/`mini`). O mesmo SQL grava
  `settings.categories` (painel → Categorias) quando a lista ainda não existe
  — aplicar template NÃO mexe nela.
- Matchers de SQL por blog: RV `%resenha%`, Oley `%oley%`, Bee
  `name ILIKE '%bee%esporte%' OR domain ILIKE '%beeesportes%'` (NUNCA `%bee%`
  sozinho — ksports mora em ksports.bebee.me), Aposta Ganha `%aposta%ganha%`,
  Receba Bet `%receba%bet%`, O Comandante `%comandante%`.

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

⚠️ **Bump de `BLOG_IMAGE_VERSION` SEMPRE builda `api` E `web` juntos**, mesmo
que a mudança seja só de frontend: a versão tagueia as DUAS imagens e `web`
tem `depends_on: api`, então `up -d web` com a tag nova encontra
`blog-api:<N>` inexistente e dispara um build implícito do api no meio do
`up` (2026-08-10: +733 s em cima dos 1182 s, em série em vez de paralelo).
Rebuild direcionado a um só serviço (§5) só vale SEM bump.

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
# demais blogs (pula os que ainda não existem) — EM PARALELO: são projetos
# compose independentes, e em série cada blog custa o seu próprio stop+start
# (~25 s × N; 2026-08-10 foram 4 min para 9 blogs).
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes; do
  [ -d "/opt/blogs/$b" ] || continue
  ( cd "/opt/blogs/$b" \
    && sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env \
    && docker compose up -d ) &
done
wait
cd /opt/sp011
```

⚠️ **`compose.yml` de blog replicado é CÓPIA do template, não um link.** Mudar
`deploy/blog-template/compose.yml` não muda blog nenhum — tem que propagar
(`cp` + `up -d`, no mesmo loop paralelo). Sem isso a rede deriva em silêncio:
em 2026-08-10 sete blogs ainda rodavam o template PRÉ-PRD-07 (sem `mem_limit`,
`cap_drop`, `no-new-privileges` nem healthcheck) porque foram criados antes de
`82f9dc8` — os 10 foram alinhados nesse dia. Para auditar a deriva, comparar
com a versão ANTERIOR do template (`git show <commit>~1:deploy/blog-template/
compose.yml`); comparar com a atual acusa todos depois de um `git pull`.

```bash
cd /opt/sp011
for b in ocomandante ksports esporteagora resenhavip oleysports beeesportes \
         apostaganha recebabet pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || continue
  cp deploy/blog-template/compose.yml /opt/blogs/$b/compose.yml
  ( cd /opt/blogs/$b && docker compose up -d ) &
done
wait
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

O layout dos blogs de ESPORTE é a família "KSports - Final" (pontofarma e
creditovc têm layout próprio do mock — ver §4) (22 blocos): top bar escura,
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
  (balde `others`/`outros`, ou o ÚLTIMO slug se o blog não tiver balde).
  Classificação nunca bloqueia entrega. O `targetCategory` da regra NÃO é
  validado contra a taxonomia, e isso é deliberado: o sp011 tem taxonomia
  VAZIA de propósito (catch-all da rede) e depende inteiramente dele —
  validar derrubaria as 18 regras dele de uma vez. Blog SEM balde
  (credito.vc, ocomandante) só está seguro enquanto toda regra ativa tiver
  target; regra ativa sem target manda o que a IA não classificar para o
  último slug da lista. Conferência pronta no fim de
  `deploy/central/taxonomias_reparo.sql`.
- **Portão de economia**: todos os blogs ativos saturados (entregues+em
  espera ≥ teto) → collector/rewriter pulam o ciclo. Todo blog ativo precisa
  de `max_posts_per_day`.
- **Publicar agora**: `POST /deliveries/:id/publish-now` (pending ou
  awaiting_approval) — também via botão na página Entregas.
- **Publicação manual** ("Nova notícia", 2026-07): editor réplica do Novo
  Artigo do blog (TipTap + Tailwind utilities-only no central-web). POST/PUT
  `/news/manual` — rascunho fica em `news_items.status='manual_draft'` (sem
  entregas; editar via `/nova-noticia?id=`), publicar cria 1 entrega/blog;
  agendamento = `deliveries.scheduledAt` futuro (worker só pega vencidas);
  upload de capa em `/data/news-images` (volume central_data, rota pública
  `/api/news/image/:name`, host na allowlist do proxy de imagem dos blogs —
  NUNCA apagar: artigos publicados hotlinkam); `author` ("Por BeeSports") e
  `imageCredit` atravessam o ingest e o blog exibe (autor não-genérico vence
  a assinatura padrão); autofill SEO `POST /news/manual/autofill` no provider
  da central (purpose "autofill").
- IA da central: provider primário configurável (`aiProvider` nas
  Configurações) — em produção é o **Ollama** self-hosted
  (`qwen2.5:7b-instruct`, serviço `ollama` do compose raiz,
  `http://ollama:11434`; ~13 GB de RAM residentes, maior consumidor da VPS;
  teto de 4 dos 8 vCPU via `cpus`+`cpuset` desde 2026-08-21 — ver §17),
  com fallback e lane de reforço nos pools de chaves Gemini/OpenAI/Perplexity
  (criptografadas, rodízio). Prompt padrão de reescrita PT em
  `lib/news-engine/src/prompts.ts` — **espelhar sempre** com
  `api-server/src/lib/rssProcessor.ts` (diff deve dar idêntico); versão EN em
  `deploy/ksports/sources_en.sql`. Reescrita é COMPARTILHADA entre blogs
  (1 notícia = 1 reescrita, N entregas) — custo de IA não cresce por blog.
- Dedup global (guid/URL/título normalizado + overlap 500 recentes) — feeds
  sobrepostos entre irmãos são seguros.

## 11. Pipeline interno do blog (modo standalone — DORMENTE desde jul/2026)

Desde ~2026-07 **nenhum blog usa o pipeline interno**: o sp011 também passou a
ser alimentado pela central (central-push, como os irmãos). O código continua
como fallback de emergência: `startScheduler()` no api-server: scheduler
(20 min) → rssProcessor (RSS ou scrape) salva rascunho → rewriteQueue reescreve
com IA e publica. **Nada publica sem reescrita.** Providers do blog: Ollama
self-hosted (mesmo serviço do compose), Gemini e Perplexity (chaves no painel,
criptografadas); lane de reforço (boost) configurável. Backpressure: coleta
adia quando o backlog de rascunhos ≥ `rssMaxPendingRewrites`. Configuração de
coleta/janela/tetos no card do RSSManager.

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
- **Permissão é POR USUÁRIO** (ago/2026): tabela `user_permissions`, editada na
  sub-aba "Permissões" do modal do usuário (a aba única em Configurações virou
  só um atalho para Usuários). `role_permissions` sobrou como MODELO do perfil —
  é o que o usuário novo recebe copiado e o que responde por quem ainda não tem
  linhas próprias (nenhum editor antigo perde acesso no deploy). Três perfis:
  `admin` (tudo), `editor`, `columnist`. Colunista enxerga/edita SÓ os artigos
  que assina (`articles.columnist_id` = `users.columnist_id`) — o escopo é do
  servidor (`columnistScope` em `routes/admin.ts`), não da tela; ele nasce sem
  `articles.publish`. Um usuário Colunista sempre tem um perfil em
  `settings.columnists` (criado junto pelo `POST /users`) — é dele a foto/nome/
  bio que assinam o artigo no site.
- Isolamento entre blogs é por infra (container+DB+SESSION_SECRET próprios);
  NÃO existe blogId no app — nunca hardcodar conteúdo por blog na imagem
  compartilhada (usar settings).
- **Fontes RSS de cada blog vêm da CENTRAL, por push** (2026-08-14): a imagem
  instalava 25 feeds do sp011 em todo blog — um blog de esporte exibia política
  do DF no painel. A imagem é compartilhada e não sabe qual blog está rodando,
  então **ela não instala fonte nenhuma**. Quem sabe é a central: as regras de
  distribuição dizem quais fontes alimentam cada blog (`sourceBelongsToBlog`,
  `central-hub/src/lib/rules.ts` — a mesma conta do filtro "fontes por blog" da
  página Fontes). Esse critério é o ESTRITO: só conta a regra ativa que NOMEIA
  a categoria da fonte ou a própria fonte. O permissivo (`sourceMatchesAnyRule`,
  usado por quem avalia notícia a notícia) trata regra por keyword e catch-all
  como "casa tudo" — com ele o credito.vc recebeu 112 fontes com football,
  oc-aviacao e farmacia (2026-08-14), porque basta UMA regra por keyword para
  arrastar o catálogo inteiro. Quando nenhuma regra ativa nomeia nada (blog só
  com catch-all, caso do sp011), o escopo volta a ser tudo menos os excludes. Fluxo: `POST /blogs/:id/sync-sources` (ou `/blogs/sync-sources`
  para todos; botões na página Blogs) → `syncBlogSources()` → `sendSigned()` no
  mesmo canal HMAC do ingest → `POST /api/ingest/sources` no blog →
  `syncCentralSources()`. Tudo chega `active:false`/`autoMode:"none"` — a coleta
  segue na central (§11). Idempotente; a lista instalada fica em
  `settings.rss_central_synced_urls`, e é ela que autoriza remover depois: fonte
  cadastrada à mão, ligada ou que já coletou NUNCA é apagada
  (`rssSourcesToRemove` em `lib/rssCatalog.ts`, puro e testado). No boot,
  `pruneLegacyRssSources()` (flag `settings.rss_legacy_pruned`) remove as 25
  antigas com a mesma regra. **Go-live de blog novo: depois das regras, clicar
  "Fontes" no card do blog** — sem isso o painel dele nasce vazio.
  `reconcileRssCatalog()` (boot, flag `settings.rss_catalog_v2`) troca as
  antigas nos blogs que já existiam — apaga SÓ o que casa URL antiga **E**
  inativa **E** `last_fetched_at IS NULL`, e insere deduplicando por URL em
  código (a tabela não tem UNIQUE em `url`). Regenerar o catálogo a partir do
  banco central: comando no cabeçalho do próprio arquivo.
- **Nenhuma marca embutida na imagem** (varredura de 2026-08-08): não existe
  mais `brand.ts` com nome/domínio fixos. Identidade vem de
  `settings.siteName`/`contact` e, como reserva, do host da requisição —
  `brasilia-agora/src/lib/blogIdentity.ts` (painel/site: `blogDisplayName`,
  `brandNameFromHost`, `blogUrlExample`…) e `api-server/src/lib/brand.ts`
  (runtime: `siteName()`, `defaultAuthor()`, `adminIssuer()`, lê o store).
  Defaults de `store.ts` (siteName, tagline, DEFAULT_CONTACT) nascem VAZIOS e
  o site omite o que não foi configurado; sem logo, cabeçalho e rodapé
  escrevem o nome do site. Ao criar placeholder/exemplo/preset novo, derivar
  do próprio blog — nunca citar outro portal da rede.

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
- **Memória do proxy de imagem** (ago/2026): o `sharp`/libvips é o maior
  consumidor do api e foi quem levou dois blogs a OOM-kill do cgroup (12 e
  13/08, ~2 GiB, `libvips worker invoked oom-killer`) — uma dezena de
  `/api/image` do mesmo carregamento de página virava uma dezena de
  decodificações concorrentes. Três travas em `lib/imageTransform.ts`:
  `sharp.concurrency(2)` (o default é 1 thread por vCPU, e são 10 blogs no
  mesmo host), `sharp.cache({memory:32})` e o semáforo `withTransformSlot`
  (2 transformações simultâneas por processo; `uploads.ts` divide a mesma
  fila). Falha PERMANENTE de origem (4xx, não-imagem, acima do cap de 12 MiB)
  não é re-tentada e entra no cache negativo de 10 min
  (`lib/originFailures.ts`) — sem isso a mesma foto reprovada era rebaixada a
  cada visita. Transitória (5xx/timeout) continua com retry: a capa da central
  engasga sob carga e precisa da segunda chance.
- **Cache de imagem sobrevive ao deploy** (2026-08-26): o cache em disco do
  proxy mora em `/data/img-cache` (volume `api_data`, já montado no compose raiz
  E no `blog-template` — nenhum blog precisa de mudança de compose), não mais em
  `os.tmpdir()`. No tmp ele era a camada gravável da IMAGEM: todo rollout (§6
  recria os 11 containers) descartava o cache da rede inteira, e o primeiro
  visitante depois do deploy pagava a reconstrução de TODAS as imagens da home de
  uma vez — com a fila de 2 vagas, a décima transformação esperava dezenas de
  segundos e o navegador desistia (`net::ERR_TIMED_OUT` em `/api/image` e
  `/api/site-asset/logo`, PageSpeed do oleysports). Cache que sobrevive é cache
  que cresce: `pruneImageCache()` roda no boot e a cada 6 h, apagando os menos
  recentes acima de `IMG_CACHE_MAX_MB` (512 por padrão, × 11 blogs).
  `IMG_CACHE_DIR` sobrepõe o caminho.
- **Arte de identidade tem fila própria** (2026-08-26): `withArtworkSlot` (1
  vaga) ao lado de `withTransformSlot` (2, fotos). Logo, logo-mobile, byline e
  favicon são meia dúzia de chaves por blog, minúsculas e `immutable`, mas moram
  no CABEÇALHO — na fila única entravam atrás de uma dezena de capas de artigo e
  eram as últimas a sair; as três deram timeout e o site apareceu sem marca. O
  teto de memória do bullet acima continua valendo: no máximo 3 transformações
  simultâneas por processo, e a terceira é sempre uma logo.
- **`<img>` de upload no HTML do operador é reescrito no `/api/site`**
  (2026-08-26): o painel grava o banner como `<img src="/api/uploads/x.png"
  style="width:100%;height:auto">` — PNG cru, sem `width`/`height` (252,7 KiB em
  duas artes na home do oleysports; 229,5 KiB de desperdício + CLS).
  `lib/htmlUploadImages.ts` (puro, testado) troca o `src` por `?w=<nativa>&q=82`
  — a rota `/api/uploads/:filename` já sabia redimensionar e converter para
  WebP, o HTML é que nunca pedia — e carimba as dimensões nativas lidas com
  sharp (`blockImageMeta.ts`, mesmo cache por nome de arquivo). Alcança
  `homeBlocks[].html`, `articleSidebarBlocks[].html` e `headerBannerHtml`. É no
  SERVIDOR e não no `sanitizeArticleHtml` do front por dois motivos: só ele tem
  o arquivo para medir, e reescrever no payload faz SSR e hidratação receberem a
  MESMA string por construção (o mismatch #418 já custou o LCP da home uma vez).
  NÃO se toca em `src` que já tem query (é ajuste manual de quem escreveu), e
  NÃO se acrescenta `loading="lazy"`: trocar a semântica de carregamento de um
  slot PAGO, em 11 blogs de layout desconhecido, não é assunto de uma correção
  de bytes. O `/api/admin/settings` é outra rota — o editor continua mostrando o
  HTML original do operador.
- **GTM carrega no `load`, não no parse** (2026-08-26): a tag `<script>` do
  container continua no `<head>` servido, com a URL literal do `gtm.js` dentro —
  é isso que o verificador do GTM lê num GET simples, e desfazer isso reabre o
  "container não encontrado" de 2026-08-14. O que mudou é só o `j.src`,
  atribuído dentro de `go()` e disparado por `load` / `pointerdown` /
  `visibilitychange:hidden` / teto de 3 s. Motivo: 279,8 KiB (129,3 sem uso) e
  236 ms dos 260 ms de bloqueio da thread principal, disputando banda com a
  imagem do LCP num link 4G. O teto de 3 s é o que garante o container para quem
  sai antes do `load` — sem ele, uma página com um recurso lento nunca
  registraria a visita.
- **Container que roda Chromium precisa de `init: true`** (2026-08-21): o Node
  como PID 1 não adota nem enterra processo órfão, e cada arte social
  renderizada pelo Playwright deixa filho para trás — em 2026-08-20 eram
  **2.610 zumbis** na VPS, a ponto de o `docker compose stop` falhar ("PID ...
  is zombie and can not be killed. Use the --init option"). O campo está no
  `api` do `docker-compose.yml` **E** no `deploy/blog-template/compose.yml`; e
  como o template é CÓPIA (§6), mudar lá não muda blog nenhum sem o `cp` +
  `up -d`. O `ollama` ganhou teto de CPU no mesmo dia (`cpus: 4.0` +
  `cpuset: "0-3"`): sem ele chegou a **4092% de CPU** nos 8 vCPU e estrangulou
  os 11 blogs de uma vez (resposta em 8 s, steal de 34–83% no host). O `cpuset`
  não é redundante com o `cpus` — o runtime Go lê `sched_getaffinity`, NÃO a
  cota do cgroup: sem pin ele abriria 8 threads para caber em 4 CPUs de cota e
  a geração ficaria mais LENTA de tanto throttling.
- **Analytics**: heartbeat cumulativo agregado por MAX; tráfego interno
  marcado `is_internal`, nunca dropado; `totals.*` do /stats fixos ao agora;
  canal classificado no servidor; migrações de coluna via Drizzle schema E
  ensureSchema. Docs: `docs/ANALYTICS.md`.
- **Playlist do YouTube** (bloco `playlist`, ago/2026): player + lista lateral
  no visual do portal. A lista sai do **feed Atom público**
  (`/feeds/videos.xml?playlist_id=`) via `GET /api/youtube/playlist` — sem chave
  de API em blog nenhum, cache de 30 min em memória no api-server. Playlist tem
  que ser pública. O parse é espelhado em dois lugares (`parsePlaylistId` em
  `api-server/src/lib/youtubePlaylist.ts` E em
  `brasilia-agora/src/lib/homeBlocks.ts`) — mudar nos DOIS.
- **Blocos da home**: `blockType` persistido (retrocompat por prefixo do id);
  `itemsLimit` não vale para blocos editoriais no fluxo clássico; rodapé em
  `settings.footerConfig`; zonas main/sidebar/half; ver memória do repo em
  `HomeBlocksManager.tsx` ao criar tipo novo (renderer + case + painel +
  tipos nos dois stores).
  - `hideHeader` (2026-08-14) é o "modo hero" de QUALQUER bloco: esconde
    título + "Ver mais". Cada layout tem markup de cabeçalho próprio, então o
    campo é honrado em 13 lugares (4 inline no `Home.tsx`, o
    `SectionHeaderClassic`, os 6 `components/SectionBlock*.tsx`, o
    `ZoneSectionHeader` e o `SectionHeading` dos blocos custom) — layout novo
    tem que respeitá-lo também.
  - `formToBlockPatch` só grava `itemsLimit` para `ARTICLE_TYPES`. Gravar para
    todos criava campo fantasma: o bloco Categorias, que não tem esse controle
    na tela, saía de qualquer edição com `itemsLimit: 4` (default do
    `blockToForm`) e a home exibia 4 editorias sem ninguém pedir. O corte por
    `itemsLimit` saiu do `resolveCategoryBlockItems` — quem quer menos usa o
    olho (`hidden`) de cada editoria.
  - `columns` (bloco Categorias) escolhe onde a fileira quebra no desktop
    (2–10; ausente = automático). A regra mora no `index.css`
    (`.category-grid--fixed` + var `--cat-cols`), não em estilo inline: inline
    não tem media query e venceria o breakpoint por especificidade — no celular
    a grade tem que continuar automática.
- **`sizes` de caixa que RECORTA a foto** (`object-cover`): o navegador escolhe
  o candidato do `srcset` pela LARGURA, mas o recorte precisa cobrir a ALTURA —
  num card 3:4 de 296x395 com foto 16:10 a origem precisa ter `395 x 1,6 = 632`
  px. Pedir a largura da caixa (320) fazia o navegador ampliar 2x e borrar
  (item do credito.vc, 2026-08-14). Essas caixas usam `COVER_WIDTHS`/`COVER_Q`
  de `lib/newsImage.ts` (degrau de 1280 para telas 2x) e `sizes` calculado pela
  altura, não pela largura.
- **Rodapé**: 4 estilos (`dark`, `portal`, `light`, `minimal`). O `portal`
  (2026-08-14) é o modelo da rede: marca + descrição na 1ª coluna do grid, 3
  colunas de links, e barra final com copyright | `CNPJ … • endereço` (do hub
  de Contato; sem os dois, cai nos links legais). O tipo está escrito em 6
  lugares (`store.ts` ×2, `homeBlocks.ts`, `adminApi.ts`, `useSite.ts`,
  `HomeBlocksManager.tsx`) — mudar nos SEIS. Kit do credito.vc:
  `deploy/creditovc/footer_final.sql` (rodar DEPOIS do template, que
  sobrescreve o rodapé).
- **Blocos do corpo do artigo** (vídeo, galeria, citação, imagem no texto —
  ago/2026): o corpo é editado pelo **TipTap**, que DESCARTA em silêncio toda
  tag sem nó no schema. Quem gera o HTML é `lib/articleEmbeds.ts` (puro,
  testado) e quem ensina o schema é `components/admin/editorBlocks.ts`
  (`iframeEmbed`, `videoEmbed`, `blockDiv` só para `div[data-block]`,
  `image` com `style`) — **os dois espelhados em `central-web`**
  (`src/lib/articleEmbeds.ts`, `src/components/editorBlocks.ts`). Tag nova sem
  nó = bloco somem do editor sem erro nenhum (foi o bug do vídeo). O bloco leva
  `class` ALÉM do `style` porque o sanitizador do ingest apaga `style` inline:
  o layout real vem de `.video-embed`/`.article-gallery`/`.article-quote`
  (`index.css` do blog e `styles.css` da central). O round-trip de verdade
  (parse+serialize do ProseMirror, com jsdom) é testado em
  `brasilia-agora/src/components/admin/editorBlocks.test.ts` — bloco novo
  entra lá, é o único jeito de provar que ele sobrevive.
- **Barra Editar/Excluir dos blocos** (ago/2026): cada `blockDiv`/`videoEmbed`/
  `image` tem node view com barra flutuante (`.pm-block`/`.pm-block-tools`, CSS
  no `index.css`/`styles.css`; nada disso vai para o HTML salvo). O lápis
  chama `options.onEdit` → modal no RichTextEditor (vídeo: refaz o bloco pela
  URL; imagem: src/alt/href/alinhamento, e o alinhamento só reescreve o `style`
  se o autor tocar nele, senão quebra a célula da galeria). Excluir apaga o
  bloco inteiro quando o nó é filho único de um `blockDiv`. O botão YouTube da
  barra do editor usa `buildVideoEmbed` (o nó `youtube` do TipTap ficou só para
  ler conteúdo antigo). Imagem carrega `href` como ATRIBUTO (`<a>` em volta não
  é nó nenhum e sumia — era o banner de anúncio perdendo o clique); o `<a>`
  volta no `renderHTML` e só é lido do DOM quando a imagem é o único conteúdo
  do link.
- **Player de vídeo é a única exceção a iframe** nas TRÊS sanitizações
  (`brasilia-agora/src/lib/sanitize.ts`, `central-web/src/lib/sanitize.ts` e a
  canônica `lib/news-engine/src/sanitizeHtml.ts`): só https e só
  youtube.com/embed, youtube-nocookie.com/embed e player.vimeo.com/video.
  A allowlist está escrita nos três — mudar nos TRÊS. `srcdoc` cai sempre.
  E-mail e AMP continuam sem iframe nem `<video>`.
- **Seleção múltipla / exclusão em lote** (2026-08-18, Artigos e Fontes RSS): a
  aritmética de conjunto mora em `brasilia-agora/src/lib/bulkSelection.ts` (puro,
  testado) — as telas só desenham. Um `Set` nunca é mutado no lugar (mesma
  referência = React não redesenha). Dois efeitos por tela são obrigatórios:
  zerar a seleção quando o filtro muda (senão o botão oferece apagar o que saiu
  da tela) e `pruneSelection` quando a lista muda (senão o contador mente e o
  POST leva id fantasma). Servidor: `POST /api/admin/articles/bulk-delete` e
  `POST /api/admin/rss/sources/bulk-delete` — UM `DELETE ... IN (...)`, teto
  `BULK_DELETE_MAX = 500` por requisição (a tela divide em levas com `chunk`,
  e o valor está escrito nos DOIS lados). O escopo do colunista é aplicado no
  SERVIDOR relendo o dono de cada artigo — nunca confiar no payload. Na tela de
  Artigos a caixinha do cabeçalho marca só A PÁGINA; "selecionar os N do filtro"
  é um segundo clique (padrão do Gmail), senão um clique apagaria 600 artigos.
- **URL, indexação e sitemap** (2026-08-21, P0 do OleySports, imagem v98):
  cinco invariantes que valem para a rede inteira, porque a imagem é uma só.
  - **Buscador e navegador recebem o MESMO HTML.** O pré-render social
    (`socialOgPlugin`, `vite.config.ts`) só atende crawler SOCIAL —
    `SOCIAL_CRAWLER_RE` em `brasilia-agora/src/lib/crawlerUa.ts`. Googlebot,
    bingbot e Applebot saíram de lá e caem no SSR normal; antes recebiam um
    stub de 3 KB com `window.location.replace` (divergência por User-Agent, o
    achado F-26). A verificação válida é `curl -A 'Googlebot/2.1 ...'` — o
    "Testar URL ativa" do Search Console usa `Google-InspectionTool`, que
    **não** casa o regex e mascara o defeito.
  - **Existir, aparecer no menu e ser indexável são coisas diferentes.**
    `blogCategorySurface`/`resolveCategoryRoute` (`lib/categoryRoutes.ts`)
    montam a superfície por blog a partir de `settings.categories` ∪ menu —
    `visible:false` é navegação, NÃO existência, e por isso a superfície
    **não copia** o filtro `visible !== false` de `routes/articles.ts`.
    Quatro classes: declarada com conteúdo → 200; declarada e vazia → 200 +
    `noindex`; fora do menu mas com artigos → **200 indexável** (é o
    `/seguranca` do sp011, 163 artigos); nem declarada nem com conteúdo →
    404. A resolução por conteúdo só vale em slug canônico
    (`CONTENT_SLUG_RE`), senão `/FUTEBOL` duplicaria `/futebol`.
    `FIXED_CATEGORIES` só entra quando o blog não declara NADA.
  - **Falha de infraestrutura nunca vira ausência.** O `fetch` do SSR é
    tri-estado (achou / não achou / indisponível): timeout, 5xx e
    ECONNREFUSED servem HTML stale (janela de 10 min) ou **503 +
    `Retry-After: 60` + `no-store`** — nunca 404, nunca 200 vazio. Só um 404
    explícito da api vira 404 público, e ele invalida a entrada do cache.
  - **Path com extensão que não existe em `dist/public` responde 404**
    (`staticExistsPlugin`, registrado por ÚLTIMO para `/robots.txt`,
    `/llms.txt` e `/sitemap.xml` já terem sido respondidos). O `appType`
    padrão do Vite é `spa`: antes disso `/wp-login.php` e
    `/assets/inexistente.js` devolviam o `index.html` com 200.
  - **Sitemap** `/api/sitemap.xml` sai do banco (artigos publicados +
    editorias indexáveis), `lastmod` = `publishedAt` (`updatedAt` é alterado
    em massa por rotinas de manutenção — `articleService.ts`), `max-age=900`,
    teto de 50.000 URLs com log. `/sitemap.xml` → 301 para ele;
    `/sitemap_index.xml` → 404. Nenhuma URL publicada no sitemap pode
    responder 301, 404 ou `noindex`.
- **Aba "Top News"** (`/top-news`, 2026-08-27): página das mais lidas do blog.
  Está na imagem, então EXISTE nos 11 blogs; quem decide se ela aparece é o
  menu — `deploy/top-news/menu_top_news.sql` roda só nos sete de esporte.
  Path único e em inglês para pt-BR e EN de propósito: um path por idioma teria
  que ser resolvido em tempo de execução no App, no `ssrRoutes` e no
  `categoryRoutes` — o rótulo é dado do blog, o path é código. Três amarras:
  - `/top-news` mora em `STATIC_PAGE_PATHS` (`lib/categoryRoutes.ts`), e isso
    faz DUAS coisas — o middleware de SSR o classifica como `static` (nunca
    404 de "editoria sem conteúdo") e o `RESERVED_PATHS` impede que o item de
    menu vire uma EDITORIA chamada "top-news", que abriria categoria vazia com
    `noindex` no lugar da página. Espelhado em `RESERVED_SLUGS` do
    `api-server/src/lib/sitemapXml.ts`.
  - O ranking é uma CASCATA (`api-server/src/lib/topArticles.ts`, puro e
    testado): leituras da janela (`analytics_events`, pageviews não-internos)
    → acumulado (`article_views`) → data. A janela existe para a aba não
    congelar no campeão histórico; os outros dois degraus são o que segura a
    página cheia em blog de tráfego ralo e em blog recém-publicado. `GET
    /api/articles/top?limit=&days=` (`days=0` = sempre) fica ANTES de `/:id` na
    rota, senão o Express entrega "top" como slug de artigo; a agregação tem
    cache de 5 min e single-flight — é varredura de tabela numa rota pública,
    em VPS compartilhada por 11 blogs.
  - **Aplicar template apaga o menu** (§8). Por isso a aba também está nos seis
    `deploy/<blog>/template_final.sql` de esporte e nos dois starters do
    código (`KSPORTS_MENU`/`EA_MENU` em `HomeBlocksManager.tsx`) — template
    novo já nasce com ela; snapshot salvo no banco antes desta data, não.
- **Módulo "Transferências"** (rumores de mercado, 2026-08-31): cadastro
  MANUAL de possíveis transferências — módulo `/admin/transferencias`, bloco de
  home `transfers` e página pública `/transferencias`. Está na imagem, então
  EXISTE nos 11 blogs; quem decide se aparece no site é o operador, adicionando
  o bloco. Sem rumor ativo o bloco não renderiza e o `/api/site` manda
  `"transfers":[]`. Nada disso passa pela central: é manual, sem coleta e sem
  IA. Kit: `deploy/transferencias/` (seed de 96 clubes + runbook).
  - **Os dados moram em `settings`, não em tabela**: duas chaves
    (`transfer_rumors`, `transfer_clubs`), no padrão dos colunistas — entram no
    `SYNCED_KEYS` e reidratam a cada 15 s em todo processo, sem restart e **sem
    schema novo**. Tetos de 200 rumores / 300 clubes recusados com 409: o blob é
    reescrito inteiro a cada edição, e é o teto que o mantém barato.
  - **O `/api/site` publica só os ATIVOS**, com os clubes já resolvidos, já
    ordenados e cortados em 30 — e é isso que dá SSR de graça: o `renderHome` já
    busca esse payload, então o bloco nasce no HTML do servidor, sem fetch no
    cliente e sem CLS. Rumor cujo clube foi apagado é DESCARTADO do público
    (`publicRumors`) mas fica no cadastro, marcado "fora do site" no painel.
  - **Ordena por `infoDate` desc → `updatedAt` desc → `id`**, não por
    probabilidade (decisão do usuário; o mock ordenava por probabilidade). O
    campo nasce com hoje, rumor sem data cai no `updatedAt`, e editar um rumor
    antigo NÃO o traz de volta ao topo — corrigir uma digitação não republica.
    O desempate por `id` não é firula: SSR e cliente precisam pintar a MESMA
    ordem, senão a hidratação descarta o HTML servido.
  - **Posição é enum + i18n** (`transfers.pos.*`), nunca texto livre: "Atacante"
    digitado à mão apareceria em português no ksports, que é EN. **Dinheiro é
    formatado sem `Intl`** (`formatMoney`/`formatMoneyShort` em
    `brasilia-agora/src/lib/transfers.ts`, puros e testados) — o ICU do Node e o
    do navegador podem divergir, e divergência SSR↔hidratação é o #418.
  - **O catálogo de clubes chega por SQL, blog a blog**
    (`deploy/transferencias/clubes_seed.sql`), NUNCA pela imagem: ela não sabe
    qual blog está rodando (§13) e instalaria times de futebol no credito.vc, no
    pontofarma e no ocomandante — a mesma lição das 25 fontes RSS do sp011. O
    `id` do clube é o slug do nome (gerado, nunca digitado: é o que torna a
    mescla idempotente e o que impede duplicata quando o painel cadastra o mesmo
    nome). **Sem escudo de propósito** (marca de terceiro): o site desenha um
    monograma com as iniciais até o operador subir o escudo na aba Clubes.
  - **A página `/transferencias` tem as mesmas cinco amarras do `/top-news`**:
    rota antes do `/:slug`, `STATIC_PAGE_PATHS` (que também alimenta o
    `RESERVED_PATHS`, senão o path viraria editoria vazia com `noindex`),
    `RESERVED_SLUGS` do `sitemapXml.ts`, e teste nos dois resolvedores. Ela
    **não** entra no menu — a porta de entrada é o link do bloco; colocá-la lá
    obrigaria a mexer nos seis `template_final.sql` e nos dois starters.
  - `transfers.view`/`transfers.manage` no grupo Conteúdo. ⚠️ Upload é
    permissão SEPARADA (`upload.images`): sem ela o formulário cai para um campo
    de URL, com o motivo escrito, em vez de um 403 genérico. E `itemsLimit` do
    bloco vive em `LIMIT_TYPES` (não em `ARTICLE_TYPES`) no HomeBlocksManager:
    "transfers" escolhe quantas linhas exibe, mas não é bloco de artigos.
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
8. **PontoFarma e Crédito.vc** (2026-07-15): kits completos em
   `deploy/<id>/` (GO_LIVE.md + sources + template). Falta: decisão de
   domínio (zona própria pontofarma.com/credito.vc vs .midia.run),
   provisionamento na VPS e artes sociais (social_templates.sql). Nichos ≠
   esporte: fontes próprias com category de fonte NOVA (`farmacia`/
   `financas` — os scripts blindam o catch-all do sp011 com esses excludes);
   NÃO usar sources_pt.sql dos irmãos nem backfill do Esporte Agora
   (catálogo nasce da coleta orgânica). ICTQ e Portal Contábeis nascem
   inativas (validar endpoint do feed antes de ativar).
9. **Aposta Ganha e Receba Bet** (2026-08-06): kits completos em
   `deploy/<id>/` (GO_LIVE + sources_pt + backfill_50 + template + 2 SQLs de
   arte social), clonados do Oley Sports com a paleta trocada por mapa de
   slots. Falta o go-live operacional na VPS e as logos das duas marcas no
   admin. São blogs de ESPORTE pt-BR — herdam as 16 fontes e os 8 slugs dos
   irmãos, então o mesmo artigo passa a existir em até 7 domínios: o aviso de
   SEO no fim de cada GO_LIVE explica quando pular o backfill.
10. **O Comandante News** (2026-08-07): blog **no ar**; editorias fechadas em
    `negocios, economia, aviacao, turismo`. Kit completo em
    `deploy/ocomandante/`: `template_final.sql` (as DUAS homes + as 4
    categorias), `sources_ocomandante.sql` (14 fontes em 4 categorias de fonte
    prefixadas `oc-*` — prefixo proposital, "economia"/"negocios" são termos
    genéricos na rede — + taxonomia + 4 regras com target FIXO) e
    `rules_keywords.sql` (4 regras de prioridade maior que corrigem o destino
    quando a pauta atravessa os eixos). Falta: rodar os SQLs, escolher a home
    e subir as logos. **Gotchas registrados**: os 3 feeds de seção do InfoMoney
    (`/economia/`, `/business/`, `/onde-investir/`) respondem 200 com ZERO
    item — nascem inativos, substituídos por NeoFeed, Brazil Journal e Gazeta
    do Povo; as 3 fontes em inglês (FlightGlobal, FLYING, Simple Flying) ficam
    com `language='pt-BR'` porque o prompt padrão já devolve em português —
    marcar `en` gastaria tradução à toa E faria `deploy/ksports/sources_en.sql`
    carimbar prompt inglês nelas. Sem backfill (histórico da central é de
    esporte/finanças) e sem artes sociais.
11. **Crédito.vc — SEO/descoberta** (2026-08-22): auditoria cruzada com os PRDs
    do OleySports em `docs/PRD-SEO-CREDITOVC-CRUZAMENTO-OLEYSPORTS.md`; execução
    em `docs/PRD-IMPL-CREDITOVC-PRIORIDADES.md` + runbook
    `deploy/creditovc/EXECUCAO_PRIORIDADES.md`. **Etapas 1–3 entregues**
    (`home_blocos.sql`, `menu_final.sql`, `rodape_limpeza.sql`): a home saiu de
    11 para 21 artigos únicos, zero seção vazia, zero URL 404 publicada, as 6
    editorias alcançáveis pelo menu. **Etapas 6, 7 e 8 também entregues**
    (`ticker_h1_h2.sql` tirou o 2º `<h1>` da home trocando o do ticker por `h2`
    — `to_jsonb(replace(...))` não digita HTML, por isso é mais seguro que
    editar 15 KB na textarea; `autoria_redacao.sql` gravou
    `settings.bylineName`; `score_rodape.sql` tirou do rodapé o link para
    `/score`, que é editoria vazia = `noindex` publicado na home, e traz o SQL
    de restauração comentado — nada devolve o link sozinho). Falta: capas
    hotlinkadas de terceiros (9 diretas + os cards de marca "SUNO NOTÍCIAS") —
    exige imagem própria ou licenciada, re-hospedar foto alheia só move o
    problema — e o `robots.txt` gerenciado do Cloudflare que bloqueia
    GPTBot/ClaudeBot (toggle no painel da zona, fora da VPS). O `@type: Person`
    para uma organização é código: P1 do OleySports. ⚠️ `investimentos` concentra 63% do
    acervo (140 de 223) — `reclassifica_investimentos.sql` existe e não foi
    rodado. Os defeitos de CÓDIGO que o Crédito.vc revelou não abrem release
    própria: entram pelo P1 do OleySports, para os 11 blogs de uma vez.
12. **Higiene de categoria da rede** (2026-08-24): o bug do slugify (barra dupla
    apagando `u`, `f` e dígitos, corrigido em `90a0d47`) tinha reparo só na
    CENTRAL — o `articles.category` já gravado no banco de cada blog ficou como
    estava. Até a v98 essas rotas eram shell; depois dela viraram **Classe 3**
    (não declarada mas com conteúdo → 200 indexável) e entraram no sitemap.
    Eram **357 artigos em 20 editorias fantasma**: ksports 151 (`ootball` 119,
    `world-cp` 14, `nl` 14, `ormla` 4), recebabet 40, apostaganha 40,
    beeesportes 33, esporteagora 32, resenhavip 32, pontofarma 29 — todos
    duplicando a editoria real ao lado. **Corrigido** por
    `deploy/higiene/categorias_slugify.sql` (mapa único, idempotente, roda em
    qualquer banco: nenhuma origem colide com slug canônico, e a guarda prévia
    só exige o destino quando a origem tem linha). O 1 artigo do ksports em
    `copa-do-mundo` (slug PT em blog EN) tem arquivo próprio com trava
    `current_database()` — em blog pt-BR `copa-do-mundo` é a editoria canônica e
    um mapa global esvaziaria 92 artigos só no Oley. Os 21 do ocomandante fora
    da taxonomia não eram corrupção: `deploy/ocomandante/editorias_higiene.sql`
    declara `o-comandante` como **5ª editoria** (9 relatos de aviação em 1ª
    pessoa — coluna, não erro), manda `tecnologia` (6) para `negocios` e
    despublica `esportes` (6), já que o blog não tem balde. ⚠️ **O sp011 não foi
    medido** — banco no Supabase, fora da varredura; o mapa só cobre o que foi
    MEDIDO, e as editorias dele corrompem em formas ainda não vistas (`mundo` →
    `mndo`, `cultura` → `cltra`, `saude` → `sade`, `seguranca` → `segranca`).
    Achado lateral: `menu_items` não carrega `order` e `getMenuItems`
    (`store.ts:1129`) ordena por ele sobre um cast sem normalização — o
    comparador devolve `NaN` e só não quebrou porque o V8 mantém a ordem de
    inserção.

13. **Crise de CPU da VPS** (2026-08-27 a 08-31): a Hostinger aplicou
    limitação automática (teto de 40%) e ela **não caiu sozinha em três dias**,
    mesmo com `ollama` e `central-api` parados o tempo todo. O Ollama era o
    maior consumidor, não a causa do estrangulamento permanente. A causa era o
    `getArticles()`: TTL sem proteção contra concorrência, e o `renderHome`
    dispara `/api/articles?limit=300` mais um `?category=` por bloco visível
    (8 pedidos em milissegundos) — os oito viam o cache vencido juntos e cada
    um abria o SEU `SELECT *` com a coluna `content`. No ksports (3.095
    publicados / 7,9 MB de HTML) davam ~1,9 milhão de conversões de linha por
    hora. Corrigido em `58fcae6` (single-flight + contador de geração para a
    corrida com a escrita) e o `CACHE_TTL` foi de 30 s para 60 s: 30 s era
    igual ao `HOME_TTL_MS` do SSR, então os relógios ressoavam e quase todo
    render caía em cache frio. **Nunca deixe os dois TTL iguais.** A prova no
    log é N requisições a `/api/articles` terminando no MESMO milissegundo.
14. **`pg-blogs` cai sozinho sob CPU faminta** (a investigar): `server process
    exited with exit code 2` + `terminating any other active server processes`
    em 20/08, 22/08, 28/08 e 31/08 — quatro vezes em onze dias, todas em
    período de crise de CPU (Ollama disparado nas duas primeiras, limitação da
    Hostinger nas duas últimas). O CONTAINER não cai (`restarts=0`, `oom=false`):
    é crash-recovery INTERNO do Postgres, ~1 min de todos os 10 blogs sem banco.
    Não há erro registrado antes; a única anomalia na hora anterior foi
    `canceling authentication due to timeout` (handshake estourando 60 s).
    Teste: se a CPU normalizar e parar, está confirmado que é sintoma.
15. **Build da imagem custa 65 min** (2026-08-31, sob throttle; ~32 min normal).
    Metade é evitável: `pnpm install` (790 s × 2) e `playwright install
    chromium` (985 s) rodaram SEM cache mesmo sem mudança no lockfile —
    invalidou no `COPY package.json pnpm-lock.yaml …`, conferir `docker buildx
    du`. Os dois defeitos estruturais: `COPY --from=build --chown=node:node
    /app /app` copia o workspace inteiro com `node_modules` numa camada só e o
    `--chown` reescreve metadado de cada arquivo (523+432 s copiando, 786 s
    exportando, 453 s desempacotando); e o Chromium do Playwright mora na
    imagem de TODO blog (`apt-get install-deps` de 846 s por build) para um
    recurso que a maioria nunca usa.

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
