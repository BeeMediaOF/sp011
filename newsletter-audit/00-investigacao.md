# Fase 0 — Investigação (Newsletter: captura + disparo)

> Data: 2026-07-31. Modo Planejamento (somente leitura sobre código de produção).
> Base: `docs/PRD_NEWSLETTER_PLANEJAMENTO.md`. Evidência sempre `arquivo:linha`.

## Resumo executivo

1. **A captura já existe em dois pontos** (rodapé + bloco de home) e **hoje só vira
   métrica efêmera** — o e-mail cai em `behavior_events.value` e é apenas contado
   (`newsletterSignups`). **Não existe tabela de inscritos.** Não há backend de mailing.
2. **O "bypass de LGPD" do prompt já foi corrigido** (commit `b6d58b8`): no HEAD a
   newsletter passa pelo mesmo gate de consentimento dos outros eventos. **Mas isso criou
   um problema novo, que é o verdadeiro escopo de LGPD deste PRD** (ver §Achado LGPD).
3. **Já existe um cliente SMTP artesanal e sem dependências** (`mailer.ts`) — Gmail com
   senha de app funciona nele hoje. O envio **não é "do zero"**; o que falta é
   multi-tenant (config por blog), fila/worker e admin.
4. **Não há n8n nem fila externa** (Redis/Rabbit). O padrão consolidado da casa é
   **tabela-fila no Postgres + worker in-process (`setInterval` + guarda `_running`) +
   backoff**. O motor de disparo deve espelhar isso, não introduzir n8n.

---

## 1. Captura de newsletter hoje

- Rodapé — `NewsletterForm`: `artifacts/brasilia-agora/src/components/Footer.tsx:50-82`;
  render em `:194-199` (light) e `:262-267` (dark), gated por `f.showNewsletter`
  (default `true` em `artifacts/brasilia-agora/src/lib/footerConfig.ts:190`).
- Bloco de home — `NewsletterBlock`:
  `artifacts/brasilia-agora/src/components/blocks/HomeCustomBlocks.tsx:354-461`; tipo de
  bloco `"newsletter"` em `artifacts/brasilia-agora/src/lib/homeBlocks.ts:16-20,138-142`;
  despacho em `artifacts/brasilia-agora/src/pages/Home.tsx:508`. **Já é editável no
  editor de Blocos da Home** (título=`name`, subtítulo=`caption`, CTA=`buttonLabel`,
  nota=`linkLabel`): paleta em `HomeBlocksManager.tsx:83`, form em `:1002-1011`.
- Submit dos dois → **mesma** função `trackNewsletter`:
  `artifacts/brasilia-agora/src/hooks/useAnalytics.ts:302-306` → `sendBehavior`
  (`:277-287`) → `POST /api/analytics/behavior`.
- Handler: `artifacts/api-server/src/routes/analytics.ts:268-306` (insert em
  `behavior_events` `:292-300`); `newsletter` é tipo permitido em
  `artifacts/api-server/src/lib/analyticsShared.ts:47-48`.
- **Não há persistência de inscrito.** Schema: `lib/db/src/schema/behavior_events.ts:3-20`
  (e-mail na coluna genérica `value`). Inventário `lib/db/src/schema/index.ts` **não tem**
  `newsletter`/`subscribers`/`mailing`. Agregação só conta:
  `analyticsShared.ts:709-751` (`newsletterSignups++`). Comentário explícito em
  `useAnalytics.ts:298-301`: *"É SÓ métrica — não há backend de mailing."*
- **CLS:** o form é markup estático sem mídia → sem CLS de load. A troca
  `form → agradecimento` é pós-interação (excluída da métrica). Referência de tratamento
  de CLS com caixa reservada no mesmo arquivo: `HomeCustomBlocks.tsx:109-123` (ImageBlock).

## Achado LGPD (o verdadeiro escopo, corrigindo o prompt)

O prompt assume que a captura **ignora** o gate de consentimento. **Isso já foi corrigido**
no commit `b6d58b8` — hoje `sendBehavior` barra em `useAnalytics.ts:278`
(`if (getConsent() !== "accepted") return;`), gate definido em
`artifacts/brasilia-agora/src/components/LGPDConsent.tsx:9-15`
(`localStorage["bee_analytics_consent"]`).

**Porém**, essa correção gerou o problema que este PRD precisa resolver: hoje a
inscrição está **acoplada ao consentimento de _cookies de analytics_**. Um visitante que
**recusa cookies** mas **quer** assinar a newsletter tem o submit **silenciosamente
descartado**. LGPD trata isso como **duas bases distintas**:

- **Assinar newsletter** = ação de primeira parte, **consentimento explícito próprio**
  (o clique no "Quero receber", com o aviso "sem spam / cancelar quando quiser" já
  presente). Deve funcionar **independentemente** do cookie de analytics.
- **Disparar o evento de métrica** `newsletter` = pode continuar atrás do gate de
  analytics.

Conclusão: o escopo de LGPD deste PRD **não** é "adicionar um gate" (já existe), é
**separar o consentimento de marketing do consentimento de analytics**, persistir o
inscrito com consentimento explícito (timestamp + IP + origem) e adicionar **double
opt-in** (confirmação por e-mail) como prova de consentimento — hoje inexistente.

## 2. Infra de e-mail

- **Nenhuma lib npm de e-mail** instalada (busca em todos os `package.json` +
  `pnpm-lock.yaml`: zero). `nodemailer` aparece só como *external* defensivo do bundler:
  `artifacts/api-server/build.mjs:33-34,60`.
- **MAS existe SMTP pronto e sem dependências:** `artifacts/api-server/src/lib/mailer.ts`.
  - `smtpSend` (`mailer.ts:37-192`): genérico — recebe `host/port/user/pass/from/to/
    subject/html/text`; faz STARTTLS (587) **ou** TLS implícito (465), `AUTH LOGIN`,
    `multipart/alternative` (texto+HTML), assunto/corpo base64 UTF-8, timeout 15s. É
    exatamente o fluxo do **Gmail com senha de app**.
  - Limitações a tratar: `smtpSend` **não é exportado** (só `sendWelcomeEmail`,
    `:303-335`, preso a env vars `SMTP_*`); abre **1 conexão por e-mail** (sem pool);
    o template `welcomeEmailHtml` (`:199-296`) **chumba a marca** "BRASÍLIA AGORA" via
    `BRAND` (`:29`) — para multi-blog, marca/cores/rodapé precisam vir das settings.

### Revisão do código a reutilizar (`mailer.ts`) — achados que a execução deve tratar

Núcleo `smtpSend` é assíncrono/não-bloqueante e o protocolo está correto (STARTTLS/TLS
implícito, `AUTH LOGIN`, `multipart/alternative`, resposta multi-linha `:88`, timeout 15s
`:184`). **Antes de virar remetente de newsletter, corrigir:**

1. **[Segurança] TLS sem validação de certificado** — `rejectUnauthorized: false` em
   `:112` (STARTTLS) e `:175` (TLS implícito). Ligar (`true`) e passar `servername: host`
   no upgrade do STARTTLS. Gmail tem certificado válido; hoje o remetente aceita MITM.
2. **[Entregabilidade — crítico] Faltam headers de bulk** — o builder (`:59-80`) não põe
   `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058)
   nem `Message-ID`. Gmail/Yahoo **exigem** `List-Unsubscribe` de remetente em massa
   (regra 2024+) — sem isso a campanha cai em spam/é barrada. Casa com o descadastro LGPD.
3. **[Reuso] `smtpSend` não exportado** — extrair/exportar `sendEmail(config, msg)`.

Menores: timeout não re-armado após upgrade TLS (`:184` fica no socket antigo, `:112-117`
não re-arma); sem guarda `settled` (máquina de estados continua após `reject`);
`no-case-declarations` no `case 2` (`:111`); template não reaproveitável (parametrizar
por blog, não usar `BRAND`).

## 3. n8n e workers assíncronos

- **n8n não existe** na infra. As 4 menções são texto de planejamento
  (`docs/PRD_NEWSLETTER_PLANEJAMENTO.md`) ou string de UI de webhook
  (`artifacts/brasilia-agora/src/pages/admin/Webhook.tsx:159,266,268`;
  `Settings.tsx:1685,1752`). Serviços do compose: `api, web, central-api, central-web,
  pg-blogs, ollama, caddy` — sem n8n/redis/fila.
- **Padrão a espelhar** = tabela-fila no Postgres + worker in-process:
  - `deliveryWorker` da central (modelo mais completo):
    `artifacts/central-hub/src/services/deliveryWorker.ts` — poll `15s`/`BATCH=5`
    (`:27-28`), `setInterval`+`unref()`+guarda `_running` (`:206-211,160-161`), **claim
    condicional** `UPDATE ... WHERE status='pending' RETURNING` (`:35-40`), round-robin
    justo entre blogs (`:194`), envio (`blogClient.ts:27-74`), backoff puro
    `artifacts/central-hub/src/lib/backoff.ts:3-11` (`[1,5,15,60,360]` min, máx 5),
    schema-fila `lib/central-db/src/schema/deliveries.ts:7-35` (índice `(status,
    next_retry_at)`, `UNIQUE(newsItemId, blogId)`).
  - Fila do blog: `lib/db/src/schema/social_publication_queue.ts:3-17` +
    `artifacts/api-server/src/lib/social/queueProcessor.ts:280-318` (cron 5 min) +
    produtor/agendador `autoScheduler.ts:363-454` (dedup + drip com `scheduledAt`
    escalonado). Wiring de boot: `artifacts/api-server/src/index.ts:194-200`.
- **Limites de container** (o worker roda dentro do `api`): `mem_limit: 2g`
  (`docker-compose.yml:46`; blog replicado `deploy/blog-template/compose.yml:28`),
  `cap_drop: ALL` + `no-new-privileges`, `healthcheck` a cada 30s em `:8080`. Logo: worker
  leve, lotes pequenos, **sem carregar a lista toda em memória**, **sem bloquear o event
  loop**, fila em Postgres (não há fila externa).

## 4. Settings, segredos e admin

- Tabela **`settings`** (key/value): `lib/db/src/schema/settings.ts:3-7`. As settings do
  site vivem no JSON da row `site_settings`. Campo novo = adicionar em `SiteSettings`
  (`artifacts/brasilia-agora/src/lib/adminApi.ts:317-428`) **e** no espelho do servidor
  (`artifacts/api-server/src/lib/store.ts`), sem mudar SQL. `getSettings`/`updateSettings`:
  `store.ts:858-903`; rotas `artifacts/api-server/src/routes/admin.ts:920-948`.
- **Segredos** `enc:v1:` AES-256-GCM: `artifacts/api-server/src/lib/crypto.ts:15,25-99`;
  lista `SECRET_FIELDS` em `store.ts:35-42` (encripta/decripta no boundary de persistência,
  cache sempre plaintext). Um segredo novo (senha de app do Gmail) = adicionar o campo em
  `SiteSettings` + no array `SECRET_FIELDS.site_settings`; input `type="password"`,
  mascarado na leitura pública (padrão `social.ts:54-72`).
- **Colunas novas do blog se autocriam no boot** (`ensureSchema.ts`) — tabelas novas
  seguem esse caminho, sem migração manual (CLAUDE.md §17).
- **Aba nova de admin**: (A) página no menu — rota lazy em
  `artifacts/brasilia-agora/src/App.tsx` (ver AdsManager `:67,287-289`), item em
  `AdminLayout.tsx:24-36` (`NAV_MAIN`), label em `adminI18n.ts`; ou (B) aba dentro de
  Configurações (`Settings.tsx:22-37`). Newsletter pede **página própria** (inscritos +
  campanhas + config).
- Padrão "global vs por-blog" para credencial: blob `social_config` (single-row) vs tabela
  dedicada `social_accounts` (`lib/db/src/schema/social_accounts.ts`).

---

## Perguntas da Fase 0 — respondidas pelo usuário (2026-07-31)

| Pergunta | Resposta |
|---|---|
| Lista de inscritos isolada por blog ou compartilhada? | **Isolada por blog** (cada blog no seu próprio DB, como as demais tabelas do blog). |
| Disparo manual, agendado ou os dois? | **Manual + agendado** (produtor enfileira com `scheduledAt`; worker pega as vencidas). |
| Remetente Gmail: conta por blog ou compartilhada? | **Gmail próprio por blog** (SMTP por blog em `site_settings`, senha de app como segredo). |
| Editor do "Modelo de Layout": visual ou texto rico? | **Editor de texto rico** (reaproveita o editor de artigo TipTap; sistema injeta cabeçalho/rodapé/descadastro). |

**Não perguntado (assunção declarada):** volume. Assumo **baixo volume por blog**
(centenas a poucos milhares de inscritos), coerente com Gmail (limite ~500/dia conta
comum). O motor nasce com **drip/pacing configurável** e o PRD desenha a evolução para
provedor transacional quando o volume passar do teto do Gmail.

## Bloqueios

Nenhum. Fase 0 completa; seguir para o PRD.
