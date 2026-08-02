# RELATÓRIO FINAL — Newsletter (captura + disparo)

> PRD: `PRD-NEWSLETTER-01-captura-e-disparo.md`. Estado: **COMPLETA e validada em
> prod no sp011 (Fases 1–4)**, 2026-08-02. Rollout da rede pendente (§Rollout).
> Runbook vivo do projeto: `deploy/README.md`; contexto: `CLAUDE.md`.

## 1. O que foi entregue

Newsletter ponta a ponta, **isolada por blog**, sem dependência externa nova
(SMTP artesanal do próprio repo + fila em Postgres + worker in-process):

- **Captura + consentimento (LGPD/double opt-in)** — o formulário do site
  persiste o inscrito `pending` com IP/UA/origem, **desacoplado do cookie de
  analytics**; o clique no e-mail de confirmação marca `confirmed` (prova do
  opt-in). A métrica antiga (`trackNewsletter`) continua atrás do gate.
- **Admin — remetente + modelo** na subaba **Configurações** da aba Newsletter
  (único lugar; nunca na página global de Configurações): Gmail por blog (senha
  de app **encriptada**), teto diário, e o **modelo do e-mail** editável (cores,
  logo por imagem) com **pré-visualização ao vivo**.
- **Motor de disparo assíncrono** — fila `newsletter_send_queue` + worker
  (poll 30s), backoff `1m→5m→15m→1h→6h` (5 → dead), **drip** (velocidade) e
  **teto diário** por dias civis do blog (volume). Só roda com `newsletterEnabled`.
- **Campanhas** — UI com editor TipTap (reusa o do artigo), **Enviar agora** /
  **Agendar** / **Cancelar**, e progresso da fila por campanha.
- **Inscritos** — lista paginada, filtro por status com contadores, busca por
  e-mail e **export CSV**.
- **Descadastro** — link visível (GET) + **one-click RFC 8058** (POST 204, o
  botão nativo do Gmail/Yahoo); `List-Unsubscribe`/`-Post` nas campanhas.

## 2. Arquitetura (resumo)

- **Dados (no banco de cada blog, autocriados por `ensureSchema.ts`):**
  `newsletter_subscribers`, `newsletter_campaigns`, `newsletter_send_queue`
  (espelha `deliveries`; UNIQUE(campaignId, subscriberId) = idempotência).
- **Backend (`api-server`):** rotas públicas `POST /api/newsletter/subscribe`,
  `GET /confirm`, `GET|POST /unsubscribe`; admin `/api/admin/newsletter/*`
  (settings, test, preview, campaigns, subscribers, subscribers.csv). Motor em
  `lib/newsletter/{dispatch,schedule,backoff,email}.ts`; SMTP endurecido em
  `lib/mailer.ts` (`sendEmail`). Worker ligado em `index.ts`.
- **Frontend (`brasilia-agora`):** página `/admin/newsletter` com 3 subabas
  (Configurações, Campanhas, Inscritos); helper público `subscribeNewsletter`.
- **Segredo:** `newsletterSmtpPass` em `SECRET_FIELDS.site_settings`
  (AES-256-GCM derivado do `SESSION_SECRET`), redigido do `/api/site` público.

## 3. Validação em prod (VPS sp011)

| Fase | Evidência | Data |
|---|---|---|
| 1 — Captura + opt-in | `subscribe` grava `pending` com `consent_ip`/`source` (cookie recusado); `confirm?token=` → `confirmed` | 2026-07-31 |
| 2 — Admin config | `newsletterSmtpPass` gravado `enc:v1:` (nunca em claro); ausente do `/api/site`; e-mail de teste chegou | 2026-08-01 |
| 3 — Motor | confirmação (transacional) na caixa Principal; clique → `confirmed`; fila/worker/backoff no ar | 2026-08-02 |
| 4 — Ponta a ponta | campanha criada no admin → enviada → recebida; descadastro **GET** → `unsubscribed`; **one-click POST** → `204` + `unsubscribed` | 2026-08-02 |

**Não exercitado em prod (baixo risco):** teto diário com cap baixo distribuindo
por dias (coberto por 8 testes unitários de `schedule`/`backoff`) e o botão de
export CSV (endpoint pronto e testado). Local: api typecheck + **240 testes** +
esbuild; frontend typecheck — todos verdes.

## 4. Decisões e refinamentos (durante a execução)

- **Confirmação = transacional:** o e-mail de double opt-in **não** leva
  `List-Unsubscribe` nem rodapé de descadastro (a pessoa ainda nem é assinante).
  Esses sinais faziam o Gmail arquivá-lo em "Gerenciar inscrições", tirando-o da
  Principal — justo o e-mail que precisa do clique. Refina o literal do RF5
  (header em TODO e-mail), mantido **nas campanhas**, onde é exigido.
- **Campanha em "Gerenciar inscrições":** é o comportamento **correto/esperado**
  de e-mail de lista com `List-Unsubscribe` (não é spam; é a caixa de newsletter
  do Gmail). Forçar a Principal removendo o header **não** é recomendado (regra
  de bulk do Gmail/Yahoo 2024 + risco de "denunciar spam" → reputação). O que
  leva à Principal é engajamento do destinatário (arrastar p/ Principal, salvar
  contato) e conteúdo menos "banner".
- **Imagens em campanha e logo:** URLs root-relativas são **absolutizadas** com
  a base pública do blog antes de compor o e-mail (relativas não resolvem em
  cliente de e-mail).
- **Admin em 2 colunas:** configuração + prévia lado a lado; editor de campanha
  + ações/estatísticas lado a lado (usa a largura da tela, menos rolagem).

## 5. Segurança / LGPD (invariantes preservadas)

- Consentimento com **timestamp + IP + origem**; **double opt-in**; **supressão**
  por status (`unsubscribed`/`bounced`/`complained` nunca entram no fan-out);
  descadastro em toda campanha; inscrição desacoplada do cookie de analytics.
- `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` **intactos**; segredo do SMTP via
  `SECRET_FIELDS`. CLS=0 no formulário; nenhum SMTP no caminho do `subscribe`.
- Multi-blog: tabelas + settings + remetente por blog; nada cruza entre blogs.

## 6. Rollout para a rede (próximo passo)

O sp011 roda a imagem `blog-api`/`blog-web` recém-buildada; os blogs replicados
seguem na imagem anterior (sem as tabelas/UI de newsletter). Para levar a
newsletter a um blog replicado:

1. **Bump de imagem** (CLAUDE.md §6): subir `BLOG_IMAGE_VERSION`, `docker compose
   build api web`, `up -d api web` no sp011; canário; depois o loop dos blogs
   com `BLOG_IMAGE_TAG=$N`. As 3 tabelas se autocriam no boot (`ensureSchema.ts`).
2. **Por blog** (no admin do próprio blog → Newsletter → Configurações):
   cadastrar o **remetente Gmail** (senha de app **daquele** blog), teto diário,
   e ajustar o **modelo** (cores/logo); **Ativar** + **Salvar**; "Enviar e-mail
   de teste". `APP_URL`/`PUBLIC_URL` do blog precisa estar setado (links de
   confirmação/descadastro).
3. **Conferir** (por blog): `subscribe` grava `pending`; confirmação chega;
   uma campanha de teste é recebida; one-click devolve 204.

Cada blog tem **lista e remetente próprios** — nenhum dado cruza. Ligar/desligar
por blog é `newsletterEnabled` (rollback = desligar).

## 7. Evolução (fora do MVP)

Gmail → **provedor transacional** (Resend/SES/Postmark) trocando `sendEmail` por
API + webhooks de bounce/complaint → supressão automática (status já previstos);
SPF/DKIM/DMARC no domínio próprio; pool de conexões/envio em massa; variação de
corpo por campanha. O modelo de dados (status + fila + supressão) comporta a
troca sem migração destrutiva.
