# STATUS — Newsletter

| Etapa | Estado | Data |
|---|---|---|
| Fase 0 — Investigação (`00-investigacao.md`) | ✅ Concluída | 2026-07-31 |
| Fase 1 — PRD (`PRD-NEWSLETTER-01-captura-e-disparo.md`) | ✅ Concluído | 2026-07-31 |
| Revisão pós-aprovação (POST one-click RFC 8058 + teto diário) | ✅ Aplicada | 2026-07-31 |
| Execução — Fase interna 1 (captura + consentimento) | ✅ Validada em prod (VPS, sp011) | 2026-07-31 |
| Execução — Fase interna 2 (admin: remetente + modelo) | ✅ Validada em prod (VPS, sp011) | 2026-08-01 |
| Execução — Fase interna 3 (motor de disparo assíncrono) | ✅ Validada em prod (VPS, sp011) | 2026-08-02 |
| Execução — Fase interna 4 (ponta a ponta) | ✅ Validada em prod (VPS, sp011) | 2026-08-02 |
| `RELATORIO-FINAL.md` (pós-implementação) | ✅ Escrito | 2026-08-02 |

## Decisões travadas (Fase 0)
- Lista **isolada por blog**; disparo **manual + agendado**; remetente **Gmail próprio
  por blog**; editor **texto rico (TipTap)**.

## Achados que mudam o plano original
- O "bypass de LGPD" do prompt **já foi corrigido** (commit `b6d58b8`). O escopo real é
  **desacoplar** a inscrição do cookie de analytics + persistir inscrito + **double
  opt-in** (não existe hoje).
- Já existe SMTP sem dependências (`api-server/src/lib/mailer.ts`) — reusar, não criar
  do zero. Falta exportar/parametrizar por blog e des-chumbar a marca (`BRAND`).
- Sem n8n/fila externa — motor = tabela-fila Postgres + worker in-process (espelhar
  `deliveryWorker.ts`/`backoff.ts`).

## Fase 1 — o que entrou (2026-07-31)
- Tabela `newsletter_subscribers` (schema `lib/db` + autocriação em `ensureSchema.ts`).
- Rota pública `POST /api/newsletter/subscribe` (persiste `pending` com IP/UA/origem,
  idempotente, fora do gate de analytics) e `GET /api/newsletter/confirm?token=`
  (double opt-in → `confirmed`, página pública).
- Front: helper `subscribeNewsletter` (`brasilia-agora/src/lib/newsletter.ts`), fiado
  em `Footer.tsx` e `HomeCustomBlocks.tsx` ao lado da métrica `trackNewsletter` (mesmo
  markup → CLS=0). Inscrição sai sempre; métrica segue atrás do gate.
- **Pendente por design até a Fase 3:** o e-mail de confirmação ainda NÃO é
  disparado (depende da fila+worker). Na Fase 1 o inscrito nasce `pending` com token
  pronto e a confirmação é feita abrindo o link (validação por SQL/curl na VPS). O
  site não regride: antes o e-mail caía efêmero em `behavior_events` e nunca era usado.
- Local: `lib/db` `tsc -b` ✅, api-server typecheck ✅ + 232 testes ✅ + esbuild ✅,
  frontend typecheck ✅.
- **Validação em prod (VPS sp011, 2026-07-31):** subscribe → linha `pending` com
  `consent_ip` + `source='footer'` (prova do desacoplamento do gate + consentimento
  LGPD); `confirm?token=` → `confirmed` com `confirmed_at`. Filtro de bot confirmado
  (curl puro = bot → `ok` silencioso sem persistir; UA de navegador persiste).

## Fase 2 — o que entrou (2026-07-31)
- **Subaba "Configurações" dentro da aba Newsletter** (`/admin/newsletter`) — o
  ÚNICO lugar onde o admin cadastra o remetente Gmail e o modelo do e-mail
  (decisão travada do usuário; NÃO fica na página global de Configurações).
  Subabas Inscritos/Campanhas presentes como placeholders (chegam nas Fases 3/4).
- Campos novos em `site_settings` (subconjunto newsletter): `newsletterEnabled`,
  `newsletterFromName/FromEmail`, `newsletterSmtpHost/Port/User`,
  **`newsletterSmtpPass` (SEGREDO — em `SECRET_FIELDS.site_settings`, encriptado
  at-rest, mascarado na leitura, redigido do `/api/site` público)**,
  `newsletterReplyTo`, `newsletterDailyCap` (450), `newsletterTemplate` (shell).
- Endpoint dedicado `GET/PUT /api/admin/newsletter/settings` (lê/grava só o
  subconjunto newsletter, sem dobrar no `PUT /settings`) + `POST
  /api/admin/newsletter/test` (dispara e-mail de teste ao admin logado).
- **Refactor de `mailer.ts`:** export `sendEmail(config, {to,subject,html,text,
  headers?})`; TLS endurecido (`rejectUnauthorized:true` + `servername`) no 465 e
  no upgrade STARTTLS; **timeout re-armado após o upgrade** + guarda `settled`;
  builder sempre injeta `Message-ID` e aceita headers extras (base de
  `List-Unsubscribe`/`List-Unsubscribe-Post` das Fases 3/4). `sendWelcomeEmail`
  segue por env como fallback.
- Shell de marca do e-mail (`lib/newsletter/email.ts`) parametrizado pelas
  settings do blog (nome/cor), NÃO por `BRAND`; rodapé já reserva o descadastro.
- Local: api-server typecheck ✅ + 232 testes ✅ + esbuild ✅; frontend typecheck ✅.
- **Validado em prod (VPS sp011, 2026-08-01):** remetente salvo → segredo
  `newsletterSmtpPass` gravado como `enc:v1:` (nunca em claro); config newsletter
  ausente do `/api/site` público; botão "Enviar e-mail de teste" entregou.

## Fase 3 — o que entrou (2026-08-01)
- **Duas tabelas novas por blog** (`lib/db` + autocriação em `ensureSchema.ts`):
  `newsletter_campaigns` (assunto/corpo/status/agenda/contadores) e
  `newsletter_send_queue` (espelha `deliveries`: `kind` campaign|confirmation,
  campaignId, subscriberId, status, attempts, next_retry_at, scheduled_at;
  UNIQUE(campaignId, subscriberId) para idempotência; índice (status, next_retry_at)).
- **Motor** (`lib/newsletter/dispatch.ts`): produtor `startCampaignSend` (fan-out
  só para inscritos `confirmed` = supressão por status) + worker
  `startNewsletterWorker` (poll 30s, `_timer.unref`, guarda `_running`, claim
  condicional, backoff `1m→5m→15m→1h→6h` 5→dead — módulo puro
  `newsletter/backoff.ts`). Wiring em `index.ts` (bootWithDb).
- **Teto diário** (`newsletter/schedule.ts`, puro/testado): `planCampaignSchedule`
  distribui o `scheduledAt` por dias CIVIS DO BLOG (`siteTimezone`) sem passar do
  teto; drip intra-dia controla a velocidade. O worker reforça o teto na hora do
  envio (conta `sent` de campanha no dia do blog) — só confirmações furam o teto
  (transacionais). Cinto e suspensório.
- **Confirmação (double opt-in)**: o `/subscribe` da Fase 1 agora ENFILEIRA a
  confirmação (`enqueueConfirmation`, sem SMTP no request — RNF-Perf-1); o worker
  envia com o link `GET /api/newsletter/confirm?token=`.
- **Descadastro** (RF5, adiantado da Fase 4 para não ter header mentiroso):
  `GET /api/newsletter/unsubscribe?token=` (página, clique humano) +
  `POST …?token=` (one-click RFC 8058, 204 sem redirect). Todo e-mail carrega o
  link no corpo E os headers `List-Unsubscribe` + `List-Unsubscribe-Post`.
- **Endpoints admin de campanha** (`newsletterAdmin.ts`, gate `settings.view`):
  `GET/POST /campaigns`, `GET/PUT /campaigns/:id`, `POST /campaigns/:id/send`
  (agora ou agendado), `POST /campaigns/:id/cancel`. Corpo sanitizado com o
  `sanitizeIngestHtml` isomórfico antes de gravar. (UI TipTap = Fase 4.)
- Local: `lib/db` `tsc -b` ✅, api-server typecheck ✅ + **240 testes** ✅
  (8 novos: backoff + teto diário/timezone) + esbuild ✅.
- **Validado em prod (VPS sp011, 2026-08-02):** confirmação (double opt-in)
  chegou na Principal do Gmail e o clique marcou `confirmed`. O ajuste
  transacional (commit `6d6331c`) tirou a confirmação da aba "Gerenciar
  inscrições". Motor de fila/worker/backoff no ar.

## Fase 4 — o que entrou (2026-08-02)
- **Subaba Campanhas** (`Newsletter.tsx`): lista de campanhas (assunto/status/
  envio/data), **editor TipTap** reaproveitando o `RichTextEditor` do artigo
  (upload de imagem via `/api/uploads/image`), ações **Salvar rascunho**,
  **Enviar agora** (confirmação) e **Agendar** (datetime-local → ISO), além de
  **Cancelar**. Campanhas já disparadas viram visualização read-only com o
  **progresso da fila** (na fila/enviando/enviados/falharam/descartados) lido de
  `GET /campaigns/:id`.
- **Subaba Inscritos** (RF6): lista paginada (50/pág.), **filtro por status**
  com contadores (Todos/Confirmados/Pendentes/Descadastrados), **busca por
  e-mail** (debounce), e **export CSV** por blob (auth Bearer, sem token na URL;
  BOM p/ acentos no Excel; guarda contra injeção de fórmula).
- **Backend novo** (`newsletterAdmin.ts`, gate `settings.view`):
  `GET /subscribers?status=&page=&q=` (página + total do filtro + contadores
  globais) e `GET /subscribers.csv?status=`.
- **Imagens em campanha**: `dispatch.ts` absolutiza URLs root-relativas
  (`src`/`href="/…"`) do corpo com a base pública do blog antes de compor o
  e-mail (imagem relativa não resolve em cliente de e-mail).
- Helpers/tipos no `adminApi.ts` (campanhas + inscritos + `downloadNewsletterSubscribersCsv`).
- **Modelo do e-mail editável + prévia ao vivo**: o shell (`email.ts`) ganhou
  cor do texto do cabeçalho, fundo da página, cor do corpo e **logo por imagem**
  (`logoMode:"image"`+`logoUrl`, absolutizada com a base pública). Rota
  `POST /newsletter/preview` compõe o shell com um corpo de exemplo usando a
  MESMA `renderNewsletterEmail` (fonte única → prévia fiel); a subaba
  Configurações mostra a prévia num `<iframe sandbox>` que atualiza com debounce
  conforme se edita. Segredo nenhum novo; template segue redigido do `/api/site`.
- Local: api-server typecheck ✅ + **240 testes** ✅ + esbuild ✅; frontend
  typecheck ✅.
- **Validado em prod (VPS sp011, 2026-08-02):** campanha real criada no admin →
  enviada → recebida (caiu em "Gerenciar inscrições" do Gmail, comportamento
  correto/esperado de e-mail de lista com `List-Unsubscribe`); descadastro pelo
  **link visível (GET)** → `unsubscribed`; **one-click (POST RFC 8058)** →
  `HTTP/2 204` sem redirect/HTML e status vira `unsubscribed`. Layout do admin
  em 2 colunas (config + prévia lado a lado; editor + ações lado a lado).
- **Não exercitado em prod (baixo risco, coberto por teste unitário):** teto
  diário com cap baixo distribuindo por dias; export CSV (endpoint pronto,
  conferir o botão).

## Pós-MVP — Biblioteca de molduras (templates de e-mail)
- **Objetivo (pedido do usuário):** poder criar/salvar várias molduras de e-mail
  (estrutura visual: cabeçalho/rodapé), inclusive por **código HTML**, e escolher
  a moldura por campanha. O **corpo** da campanha continua no editor de sempre.
- **Nova tabela `newsletter_templates`** (isolada por blog, autocriada em
  ensureSchema; jsonb `config` = `NewsletterTemplate`). A moldura **Padrão**
  segue em `site_settings.newsletterTemplate` (aba Configurações); a tabela guarda
  as molduras **extras**. `newsletter_campaigns.template_id` (NULL = Padrão).
- **HTML de cabeçalho/rodapé** (`headerHtml`/`footerHtml`) sanitizado por um
  sanitizador NOVO exclusivo de e-mail (`sanitizeEmailHtml` no news-engine): mesma
  allowlist por parser, mas **preserva `style` inline seguro** e atributos de
  tabela (e-mail só se estiliza inline) — sem tocar no sanitizador de artigo.
  As linhas automáticas de remetente + **descadastro** nunca somem (LGPD).
- **Rotas** `/api/admin/newsletter/templates` (CRUD) + `POST /preview` passou a
  renderizar a moldura recebida (com HTML). `renderNewsletterEmail` ganhou
  override de `template`; o worker resolve `template_id` da campanha.
- **UI**: nova subaba **Modelos** (lista + editor com campos + modo código +
  prévia ao vivo, componentes `ShellFields`/`ShellPreview` reaproveitados na
  Configurações), seletor **Moldura** no editor de campanha. **3 molduras de
  exemplo** semeadas no boot (uma via HTML) — semeadura idempotente por flag.
- Local: `lib/db`+`lib/news-engine` `tsc -b` ✅; api-server typecheck ✅ + **240
  testes** ✅ + esbuild ✅; news-engine **139 testes** ✅ (2 novos p/ e-mail);
  frontend typecheck ✅. **Falta validar em prod na VPS.**

## Modo atual
**Newsletter COMPLETA e validada em prod no sp011 (Fases 1–4).** Biblioteca de
molduras (pós-MVP) implementada e verde localmente — **validar na VPS**. Rollout ainda
só no sp011 (blogs replicados seguem na imagem anterior, sem as tabelas/UI de
newsletter até o próximo bump de imagem). Próximo passo: **rollout da rede**
(ver `RELATORIO-FINAL.md` §Rollout) — é um bump de `BLOG_IMAGE_VERSION` +
configurar remetente Gmail por blog (cada blog tem lista/segredo próprios).
