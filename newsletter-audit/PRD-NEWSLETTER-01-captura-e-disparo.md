# PRD-NEWSLETTER-01 — Captura e Disparo de Newsletter

> Documento autocontido. Escrito para ser executado por uma sessão futura do Claude Code
> **sem memória** desta conversa. Evidências da investigação em
> `newsletter-audit/00-investigacao.md`. Data: 2026-07-31.

## Objetivo

Entregar, ponta a ponta e por blog, a funcionalidade de **captura** de e-mails de
newsletter (formulário já existente no site, hoje só métrica) e de **disparo** de
campanhas por e-mail, usando **Gmail (senha de app) por blog** como remetente do MVP,
com **consentimento LGPD explícito (double opt-in)**, **descadastro em todo e-mail**,
**lista isolada por blog** e **disparo manual ou agendado** — sem regredir a performance
do site público e sem introduzir dependência externa nova (n8n/Redis/lib de e-mail).

## Contexto / evidência (Fase 0)

- Captura existe em `Footer.tsx:50-82` e `HomeCustomBlocks.tsx:354-461`; ambas via
  `trackNewsletter` (`useAnalytics.ts:302-306`) → `POST /api/analytics/behavior`
  (`routes/analytics.ts:268-306`). **Hoje o e-mail não é persistido** — cai em
  `behavior_events.value` (`lib/db/src/schema/behavior_events.ts:3-20`) e só é contado
  (`analyticsShared.ts:709-751`). **Não há tabela de inscritos** (`lib/db/src/schema/index.ts`).
- **LGPD (reescopo):** o "bypass" citado no prompt **já foi corrigido** (commit `b6d58b8`);
  hoje o submit está atrás do gate de **cookies de analytics** (`useAnalytics.ts:278`,
  `LGPDConsent.tsx:9-15`). Isso **acopla indevidamente** a assinatura ao consentimento de
  analytics: quem recusa cookies e quer assinar é descartado. O escopo real é **separar
  as duas bases** — assinar = consentimento próprio de marketing (sempre permitido);
  métrica = segue no gate de analytics.
- **SMTP pronto:** `artifacts/api-server/src/lib/mailer.ts` — `smtpSend` (`:37-192`) é um
  cliente SMTP sem dependências (Gmail 587/465). Falta **exportar/parametrizar por blog**
  (hoje só `sendWelcomeEmail`, env vars, `:303-335`) e **des-chumbar a marca** do template
  (`welcomeEmailHtml` `:199-296` usa `BRAND`).
- **Motor:** não há n8n/fila externa. Padrão da casa = tabela-fila Postgres + worker
  in-process. Espelhar `deliveryWorker.ts` + `backoff.ts` + schema `deliveries.ts:7-35`;
  produtor estilo `autoScheduler.ts:363-454`. Worker roda no container `api` (`mem_limit
  2g`, `cap_drop ALL`, healthcheck 30s) → leve, lotes pequenos, drip.
- **Settings/segredos/admin:** campo novo em `SiteSettings` (`adminApi.ts:317-428`) +
  espelho em `store.ts`; segredo em `SECRET_FIELDS.site_settings` (`store.ts:35-42`,
  cripto `crypto.ts`); tabela nova autocria no boot (`ensureSchema.ts`, CLAUDE.md §17);
  aba de admin = rota em `App.tsx` + `NAV_MAIN` em `AdminLayout.tsx:24-36` + i18n em
  `adminI18n.ts`.

## Decisões (Fase 0, confirmadas pelo usuário)

1. **Lista isolada por blog** → tabelas no DB de cada blog (`lib/db`), não na central.
2. **Disparo manual + agendado** → produtor cria campanha e enfileira com `scheduledAt`.
3. **Remetente = Gmail próprio por blog** → SMTP por blog em `site_settings`.
4. **Editor = texto rico (TipTap)** → reaproveita o editor de artigo; o sistema envolve o
   corpo num *shell* (cabeçalho de marca + rodapé com descadastro obrigatório).

---

## Requisitos funcionais

### RF1 — Captura + consentimento (corrige o acoplamento LGPD)
- Novo endpoint público **`POST /api/newsletter/subscribe`** `{ email }`:
  valida e normaliza o e-mail (lowercase/trim), faz **upsert** do inscrito com
  `status='pending'`, grava `consentIp`, `consentUserAgent`, `source`
  (`footer`|`home_block`), gera `confirmToken` e **enfileira o e-mail de confirmação**
  (não envia inline — ver RNF-Perf). Responde rápido e **idempotente** (reenviar não
  duplica; se já `confirmed`, responde ok sem novo e-mail).
- `Footer.tsx` e `HomeCustomBlocks.tsx`: o submit passa a chamar **`subscribeNewsletter`**
  (novo helper) que faz o `POST` acima **sem depender do gate de analytics**. O evento de
  métrica `trackNewsletter` **continua** e **continua atrás do gate** (as duas ações
  ficam lado a lado; a inscrição não é bloqueada pela recusa de cookies).
- **Double opt-in:** `GET /api/newsletter/confirm?token=…` marca `status='confirmed'`,
  grava `confirmedAt` (prova de consentimento). Página pública simples de confirmação.
- Texto de consentimento visível no formulário (o aviso "sem spam / cancelar quando
  quiser" já existe; manter e vincular ao ato de opt-in).

### RF2 — Admin: cadastro de remetente (por blog)
- Campos em `site_settings` (novos): `newsletterEnabled` (bool), `newsletterFromName`,
  `newsletterFromEmail`, `newsletterSmtpHost` (default `smtp.gmail.com`),
  `newsletterSmtpPort` (default `587`), `newsletterSmtpUser`,
  **`newsletterSmtpPass` (SEGREDO)**, `newsletterReplyTo` (opcional),
  **`newsletterDailyCap`** (int, default **450** — margem sobre o limite de ~500/dia da
  conta Gmail comum).
- `newsletterSmtpPass` entra em `SECRET_FIELDS.site_settings` (`store.ts:36-40`) →
  encriptado; input `type="password"`, mascarado na leitura pública (padrão `social.ts`).
- Botão **"Enviar e-mail de teste"** (`POST /api/admin/newsletter/test`) que dispara para
  o e-mail do admin logado, validando a conexão SMTP na hora.

### RF3 — Admin: "Modelo de Layout" do e-mail
- Campo `newsletterTemplate` em `site_settings` (JSON): `{ accentColor, logoMode
  ('wordmark'|'none'), headerText, footerText, signature }` — o **shell** do e-mail.
- O **corpo** de cada campanha é HTML de **editor de texto rico (TipTap)**, reaproveitando
  o editor de artigo já existente. O sistema monta o e-mail final = *shell* (cabeçalho de
  marca do blog vindo das settings, **não** de `BRAND`) + corpo da campanha + **rodapé
  com link de descadastro obrigatório** e identificação do remetente (LGPD).
- Reusar a estrutura table-based/inline-styles de `welcomeEmailHtml` como base do shell,
  **parametrizada por blog** (cores/nome do site das settings).

### RF4 — Campanhas (manual + agendado)
- Admin cria/edita campanha (`newsletter_campaigns`): `subject`, `bodyHtml`, `status`
  (`draft`|`scheduled`|`sending`|`sent`|`failed`|`canceled`), `scheduledAt`.
- **Enviar agora** ou **Agendar** (`scheduledAt` futuro). Ao disparar, o **produtor**
  faz fan-out: cria uma linha em `newsletter_send_queue` **por inscrito `confirmed`**,
  com `scheduledAt` escalonado (**drip** = controla a *velocidade*).
- **Teto diário (`newsletterDailyCap`)** — distinto do drip, limita o *total* por dia. O
  produtor/worker conta quantos e-mails já foram efetivados (`status='sent'`) no dia
  corrente do blog e **para de escalonar** ao atingir o teto; o excedente fica `pending`
  agendado para o **próximo dia** (`scheduledAt` = início do dia seguinte). Assim uma
  campanha maior que o teto **escorre por vários dias** sem estourar o limite do Gmail
  (que barra o remetente por 24h ao ser excedido).
- Estados/estatísticas por campanha: total, enviados, falhas, descadastros gerados.

### RF5 — Descadastro (obrigatório em todo e-mail)
- **`GET /api/newsletter/unsubscribe?token=…`**: clique humano no link visível do e-mail —
  sem login, marca `status='unsubscribed'`, grava `unsubscribedAt`, e retorna **página**
  pública de confirmação.
- **`POST /api/newsletter/unsubscribe?token=…`**: **one-click da RFC 8058** (mesmo token,
  mesma tabela). É o que o botão nativo "Cancelar inscrição" do Gmail/Yahoo dispara — chamado
  **por máquina**, sem navegador. Deve efetivar o descadastro (`status='unsubscribed'`) e
  responder **rápido, 200/204, SEM redirecionar** e sem exigir corpo além do que o RFC manda
  (`List-Unsubscribe=One-Click`). **Sem esse POST o `List-Unsubscribe-Post` mente:** o botão
  falha (404/405) e o usuário vai para "Denunciar spam" — pior para a reputação do remetente
  do que não ter o header. Idempotente (POST repetido em token já descadastrado → 200/204).
- Todo e-mail (confirmação e campanha) inclui o link tokenizado por inscrito **no corpo**
  (aponta para o GET) e nos headers **`List-Unsubscribe: <https://…/unsubscribe?token=…>`** +
  **`List-Unsubscribe-Post: List-Unsubscribe=One-Click`** (o cliente chama o POST na mesma
  URL) — o mesmo token serve os três (POST one-click, GET do header, e link visível).
- Inscritos `unsubscribed`/`bounced`/`complained` **nunca** entram no fan-out (lista de
  supressão = filtro por `status`).

### RF6 — Gestão de inscritos (admin)
- Lista paginada com filtro por `status`, contadores, **export CSV**. Sem exibir dados
  além do necessário (privacidade).

---

## Requisitos não-funcionais

- **RNF-Perf-1 (captura):** `POST /api/newsletter/subscribe` **não** pode fazer SMTP no
  caminho da requisição — a confirmação é **enfileirada**. Critério de aceite: p95 do
  endpoint < 150 ms local; nenhum envio SMTP síncrono no request (verificável lendo o
  handler e medindo `curl -w %{time_total}`).
- **RNF-Perf-2 (site público):** zero código novo no bundle público além do `subscribe`
  helper (poucas linhas); admin é lazy e **não** entra no SSR (`App.tsx` `isAdminArea`);
  o formulário mantém o **mesmo markup** (sem mídia, **CLS=0**). PageSpeed do site não
  regride (o único caminho público novo é server-side).
- **RNF-Perf-3 (disparo):** worker in-process no `api`, lotes pequenos (`BATCH` 5–10),
  **sem carregar a lista toda em memória** (paginar a fila), **sem bloquear o event loop**
  (healthcheck 30s), drip por minuto configurável. Fila em Postgres (não há fila externa).
- **RNF-LGPD:** consentimento explícito com **timestamp + IP + origem**; **double opt-in**
  (só `confirmed` recebe); **link de descadastro** em todo e-mail; lista de supressão por
  status; inscrição **desacoplada** do cookie de analytics.
- **RNF-Multi-blog:** tabelas e SMTP **isolados por blog** (DB e settings próprios); nada
  cruza entre blogs; `newsletterEnabled` liga/desliga por blog.

---

## Modelo de dados (novas tabelas em `lib/db` — autocriadas por `ensureSchema.ts`)

- **`newsletter_subscribers`**: `id`, `email` (**UNIQUE**, normalizado), `status`
  (`pending`|`confirmed`|`unsubscribed`|`bounced`|`complained`), `confirmToken`,
  `confirmSentAt`, `confirmedAt`, `unsubscribeToken`, `unsubscribedAt`, `consentIp`,
  `consentUserAgent`, `source`, `createdAt`, `updatedAt`. Índice em `status`.
- **`newsletter_campaigns`**: `id`, `subject`, `bodyHtml`, `status`, `scheduledAt`,
  `sentAt`, `recipients`, `sentCount`, `failedCount`, `createdAt`, `updatedAt`.
- **`newsletter_send_queue`** (espelha `deliveries.ts:7-35`): `id`, `campaignId`,
  `subscriberId`, `email`, `status` (`pending`|`sending`|`sent`|`failed`|`dead`),
  `attempts`, `nextRetryAt`, `scheduledAt`, `lastError`, `createdAt`.
  **UNIQUE(campaignId, subscriberId)** (idempotência); índice `(status, next_retry_at)`.

Registrar as três em `lib/db/src/schema/index.ts` e no espelho de tipos do servidor.
Supressão = filtro por `status` (tabela dedicada fica como evolução).

## Motor de disparo assíncrono

- **Worker** `startNewsletterWorker()` no `api-server`, padrão `deliveryWorker.ts`:
  `setInterval` (~30s) + `_timer.unref()` + guarda `_running`; **claim condicional**
  (`UPDATE … WHERE id=? AND status='pending' RETURNING`); pega lote `pending AND
  scheduledAt <= now`; envia via `sendEmail(perBlogSmtpConfig, msg)` (novo export de
  `mailer.ts`); grava resultado; **backoff** reusando módulo puro estilo `backoff.ts`
  (`[1,5,15,60,360]` min, máx 5 → `dead`). **Só roda se `newsletterEnabled`.** Wiring em
  `artifacts/api-server/src/index.ts:194-200`.
- **Produtor** (no `POST /:id/send` ou quando `scheduledAt` vence): fan-out para
  `newsletter_send_queue` com `scheduledAt` escalonado (drip), pulando supressos, e
  distribuindo o `scheduledAt` por dias de modo que nenhum dia receba mais que
  `newsletterDailyCap` envios. O worker reforça o teto na hora do envio (conta `sent` do
  dia corrente antes de reclamar o lote) — cinto e suspensório contra estourar o Gmail.
- **Refactor de `mailer.ts` (com endurecimento — ver revisão em `00-investigacao.md`):**
  exportar `sendEmail(config, {to,subject,html,text,headers?})` extraindo `smtpSend`,
  config vinda das settings do blog; `sendWelcomeEmail` continua funcionando (env como
  fallback). **Obrigatório no mesmo refactor:** (a) `rejectUnauthorized: true` +
  `servername: host` no TLS (`mailer.ts:112,175` hoje `false`); (b) suportar headers
  extras e sempre injetar `List-Unsubscribe` + `List-Unsubscribe-Post:
  List-Unsubscribe=One-Click` e `Message-ID` no builder (`:59-80`) — exigência de bulk
  do Gmail/Yahoo e do descadastro LGPD; (c) re-armar o timeout após o upgrade STARTTLS e
  guarda `settled`. 1 conexão por e-mail é aceitável no MVP (baixo volume); pool/provider
  fica na evolução.

## Contrato de API / admin

Público (sem auth, rate-limited):
- `POST /api/newsletter/subscribe` `{ email }` → `{ ok }`.
- `GET /api/newsletter/confirm?token=` → página de confirmação.
- `GET /api/newsletter/unsubscribe?token=` → **página** de descadastro (clique humano).
- `POST /api/newsletter/unsubscribe?token=` → **one-click RFC 8058** (botão do Gmail/Yahoo):
  efetiva o descadastro e responde **200/204 sem página/redirect**. Mesmo token do GET.

Admin (auth + `requirePermission`):
- `GET /api/admin/newsletter/subscribers?status=&page=` ; `GET …/subscribers.csv`.
- `GET/PUT /api/admin/newsletter/settings` (remetente + template). **Decisão travada
  (usuário, 2026-07-31):** o armazenamento continua em `site_settings` (é onde a config
  por blog mora), mas **toda a config de remetente/Gmail e do modelo é editada
  exclusivamente na subaba "Configurações" dentro da aba Newsletter** — **não** na página
  global de Configurações do admin (`SettingsPage`). Por isso um endpoint dedicado
  (`/api/admin/newsletter/settings`) que lê/grava só o subconjunto newsletter de
  `site_settings`, em vez de dobrar os campos no `PUT /settings` global.
- `GET/POST/PUT /api/admin/newsletter/campaigns` ; `POST …/campaigns/:id/send` ;
  `POST …/campaigns/:id/cancel`.
- `POST /api/admin/newsletter/test` (e-mail de teste ao admin logado).

Admin UI: página **`/admin/newsletter`** (rota lazy em `App.tsx`, item `nav.newsletter`
em `AdminLayout.tsx:24-36`, i18n em `adminI18n.ts` PT+EN, ícone `Mail`) com **subabas**
**Inscritos**, **Campanhas** (editor TipTap) e **Configurações** (remetente + modelo do
e-mail). A subaba **Configurações** é o **único** lugar onde o admin cadastra o Gmail/
remetente e edita o modelo — nada disso aparece na página global de Configurações.

## Fases internas de verificação

1. **Captura + consentimento**: `subscribe` persiste inscrito `pending` com IP/UA/origem,
   desacoplado do cookie de analytics; double opt-in confirma; CLS=0 preservado.
2. **Admin de config**: remetente Gmail (segredo encriptado/mascarado) + modelo de layout;
   e-mail de teste chega.
3. **Motor assíncrono**: fila + worker + backoff + drip + teto diário; campanha manual e
   agendada.
4. **Ponta a ponta**: inscrição real → confirmação → campanha recebida → descadastro
   (link visível **e** one-click do Gmail/Yahoo).

## Comandos de verificação (por fase, com resultado esperado)

> Rodar **na VPS** (padrão do projeto: validação por comando SQL/curl, nunca DevTools).
> DB do blog replicado: `docker compose exec -T pg-blogs psql -U postgres -d <blog>`.
> DB do sp011: usar `SUPABASE_DATABASE_URL` (CLAUDE.md §12).

- **Local (build/testes):** dentro de `artifacts/api-server`: `pnpm run typecheck`,
  `node --test "test/**/*.test.ts"`, `node ./build.mjs`. Em `lib/db`: `pnpm exec tsc -b`.
  Frontend typecheck dentro de `artifacts/brasilia-agora`.
- **Fase 1:**
  `curl -s -X POST https://<dominio>/api/newsletter/subscribe -H 'content-type: application/json' -d '{"email":"teste@exemplo.com"}'`
  → `{ok:true}`; depois
  `psql … -c "SELECT email,status,consent_ip,source FROM newsletter_subscribers WHERE email='teste@exemplo.com';"`
  → 1 linha `pending` com IP/origem. Abrir o link de confirmação → status vira `confirmed`.
- **Fase 2:** salvar remetente no admin →
  `psql … -c "SELECT value FROM settings WHERE key='site_settings';" | grep -o 'newsletterSmtpPass":"enc:v1:'`
  (segredo encriptado, nunca em claro). Botão "teste" → e-mail chega na caixa do admin.
- **Fase 3:** criar campanha e "Enviar agora" →
  `psql … -c "SELECT status,count(*) FROM newsletter_send_queue WHERE campaign_id=<id> GROUP BY 1;"`
  → linhas migram `pending→sent`; forçar falha (SMTP errado) → `attempts` sobe,
  `next_retry_at` futuro, `status='pending'`; após 5 → `dead`. **Teto diário:** baixar
  `newsletterDailyCap` (ex.: 5), disparar com >5 inscritos →
  `psql … -c "SELECT date(scheduled_at), count(*) FROM newsletter_send_queue WHERE campaign_id=<id> GROUP BY 1 ORDER BY 1;"`
  → nenhum dia agenda mais que o teto; o excedente cai no(s) dia(s) seguinte(s).
- **Fase 4:** inscrição real de uma caixa de teste → confirma → recebe a campanha →
  clica descadastro (GET) →
  `psql … -c "SELECT status FROM newsletter_subscribers WHERE email='<caixa>';"` →
  `unsubscribed`; nova campanha **não** o inclui no fan-out. **One-click:** com outra caixa
  já `confirmed`, `curl -si -X POST 'https://<dominio>/api/newsletter/unsubscribe?token=<token>'`
  → **200/204 sem `Location`/HTML**; o `SELECT status` da caixa vira `unsubscribed`.

## Critérios de aceite (verificáveis)

- `subscribe` grava inscrito com `consent_ip`/`source` e **funciona com o cookie de
  analytics recusado** (testar com `localStorage bee_analytics_consent = rejected`).
- Só inscritos `confirmed` recebem campanha; `unsubscribed`/`bounced`/`complained` nunca.
- Todo e-mail contém link de descadastro que funciona em um clique sem login (GET).
- **One-click RFC 8058:** `curl -X POST 'https://<dominio>/api/newsletter/unsubscribe?token=<token>'`
  marca `status='unsubscribed'` e responde **200/204 sem redirect/página** (não precisa da
  página de confirmação nem de corpo). Header `List-Unsubscribe-Post` presente nos e-mails.
- **Teto diário:** uma campanha com mais inscritos que `newsletterDailyCap` **não ultrapassa
  o teto no mesmo dia** — verificável contando `sent` por dia:
  `SELECT date(sent_at), count(*) FROM newsletter_send_queue WHERE status='sent' GROUP BY 1;`
  (nenhum dia > `newsletterDailyCap`; o excedente aparece nos dias seguintes).
- `newsletterSmtpPass` nunca aparece em claro no banco, em logs, nem na leitura pública.
- Worker não bloqueia o healthcheck (container `api` estável durante um disparo).
- Formulário do site com **CLS=0** e sem regressão de PageSpeed (mesmo markup público).
- Multi-blog: dois blogs com listas e remetentes distintos, sem vazamento entre eles.

## Invariantes preservadas

- **CLS=0** no bloco de captura; **PageSpeed** do site não regride.
- **Multi-blog isolado** (DB + settings + SMTP por blog).
- **NUNCA trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`** (o segredo do SMTP deriva
  dele — CLAUDE.md §13).
- Tabelas/colunas novas **autocriadas no boot** (`ensureSchema.ts`); não depender de
  migração manual.
- `sanitizeArticleHtml` isomórfico e demais invariantes de SSR/perf (CLAUDE.md §17)
  intactas; o corpo TipTap da campanha deve ser sanitizado antes de compor o e-mail.

## Caminho de evolução (fora do MVP)

Gmail → **provedor transacional** (Resend/SES/Postmark): a config de remetente ganha
`provider` + API key (segredo); o `sendEmail` do worker troca SMTP por API do provedor;
adicionar **ingestão de webhooks** de bounce/complaint → supressão automática (novos
status já previstos); SPF/DKIM no domínio próprio; **pool de conexões**/envio em massa.
O modelo de dados (status + fila + supressão) já comporta a troca sem migração destrutiva.

## Dependências

Nenhuma dependência npm nova (SMTP artesanal em `mailer.ts`; TipTap já no repo; fila em
Postgres; worker `setInterval`). Requer o SMTP do Gmail habilitado com **senha de app**
por blog (config do usuário, não do código).

## Estimativa de esforço

- Fase 1 (captura + consentimento + double opt-in): ~M.
- Fase 2 (admin remetente + modelo + refactor `mailer.ts`): ~M.
- Fase 3 (fila + worker + produtor + backoff): ~M/L.
- Fase 4 (campanhas UI + inscritos + CSV + ponta a ponta): ~M.
Ordem obrigatória 1→4 (cada fase valida antes da próxima).

## Plano de rollback

`newsletterEnabled=false` por blog desliga o worker e a captura volta a ser só métrica
(o `subscribe` pode responder ok sem enfileirar). Tabelas novas são **aditivas**
(nenhuma alteração destrutiva); em último caso, dropar as três tabelas não afeta o resto.
Deploy só de `api` (backend) + `web` (helper do form) — rollback = redeploy da imagem
anterior (§6 do CLAUDE.md).

## Notas de execução para o agente

- Trabalhe apenas neste PRD; não expanda escopo.
- Rode os comandos de verificação **literalmente na VPS**; não presuma sucesso.
- Se qualquer critério de aceite falhar: registre, reverta, pare.
- Não toque em `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`; use `SECRET_FIELDS` para o
  segredo do SMTP.
- Sanitizar o HTML da campanha (TipTap) antes de compor o e-mail.
- Ao concluir cada fase: atualize `newsletter-audit/STATUS.md`. Ao final: escreva
  `newsletter-audit/RELATORIO-FINAL.md`.
