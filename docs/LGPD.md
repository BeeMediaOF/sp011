# LGPD — Registro de tratamento, base legal e retenção (rede sp011)

> Documento único de conformidade LGPD (Lei nº 13.709/2018). Fonte da verdade
> do tratamento de **dados pessoais** da plataforma. Mantê-lo atualizado quando
> surgirem novos tratamentos. Entregue pelo **PRD-12** (achado F18 / AP-10).
>
> **Controlador / DPO:** `<preencher: razão social do controlador>` — canal do
> titular: `<preencher: e-mail do DPO>`. (Não versionar dados de contato reais
> aqui sem revisão do operador.)

---

## 1. Registro de tratamento (inventário de dados pessoais)

| Dado | Tabela / coluna | Finalidade | Base legal (Art. 7) | Retenção |
|---|---|---|---|---|
| Nome, e-mail, assunto, mensagem | `contact_messages.name/email/subject/message` (`lib/db/src/schema/contact_messages.ts:5-12`) | Responder a solicitação enviada pelo formulário de contato | **Art. 7, V** (execução de procedimento a pedido do titular) | Corpo mantido; **IP/UA anonimizados após 180 dias** (ver §4) |
| IP e User-Agent do contato | `contact_messages.ip_address/user_agent` (`:9-10`), gravados no POST público (`artifacts/api-server/src/routes/msgs.ts:24-31`) | Anti-abuso/rastreio da origem da mensagem | **Art. 7, IX** (legítimo interesse — segurança), com minimização | Anonimizados (NULL) após 180 dias |
| IP (chave de rate-limit de login) | `login_attempts.ip` (`lib/db/src/schema/login_attempts.ts:3-8`) | Limitar tentativas de login (anti-brute-force) | **Art. 7, IX** (legítimo interesse — segurança) | Removido após 7 dias do `reset_at` (estado já expirado) |
| IP / User-Agent (rate-limit de endpoint) | `endpoint_rate_limits.ip_address/user_agent` | Limitar abuso de rotas caras (ingest/publish/uploads) | **Art. 7, IX** (segurança) | Removido após 7 dias do `reset_at` |
| IP / User-Agent (auditoria e segurança) | `audit_logs`/`security_logs.ip_address/user_agent` (`artifacts/api-server/src/lib/audit.ts:23-24,52-53`) | Trilha de auditoria e detecção de incidentes | **Art. 7, IX** (segurança) e **Art. 37** (registro de operações) | **Fora do expurgo automático** — retenção mais longa legítima; exclusão manual sob revisão |
| Visitante anônimo, cidade/região, UTM | `analytics_events.visitor_id/city/region/utm_*` (`lib/db/src/schema/analytics.ts`) | Métricas de audiência do próprio site | **Art. 7, I / Art. 8** (consentimento — banner) | **Sem IP persistido** (ver §6) |
| E-mail e segredo de 2FA do painel | `users.email`, `users.two_factor_secret` | Autenticação de admins/editores | **Art. 7, V** (execução de contrato/serviço) | E-mail enquanto a conta existir; `two_factor_secret` **cifrado at-rest** (PRD-01b) |

---

## 2. Bases legais (LGPD Art. 7)

- **Contato** (`contact_messages`): execução de procedimento preliminar/atendimento a pedido do titular (Art. 7, V).
- **Rate-limit, auditoria e segurança** (`login_attempts`, `endpoint_rate_limits`, `audit_logs`, `security_logs`): legítimo interesse do controlador em segurança da informação (Art. 7, IX), com teste de proporcionalidade e minimização.
- **Analytics** (`analytics_events`): consentimento do titular via banner (Art. 7, I / Art. 8).
- **Autenticação** (`users`): execução do serviço (Art. 7, V).

---

## 3. Transferência internacional (LGPD Art. 33)

- **Provider primário in-country:** a reescrita por IA usa por padrão o **Ollama self-hosted** na própria VPS (`lib/news-engine/src/ai/rewrite.ts:253-256`) — **sem** transferência internacional.
- **Transferência ao exterior (EUA) ocorre apenas no fallback / lane de reforço:**
  - Gemini (Google) no fallback automático quando o Ollama cai — `lib/news-engine/src/ai/rewrite.ts:267-272` e `:322-326`.
  - OpenAI-compatível — `rewrite.ts:169-210` (endpoint `api.openai.com`).
  - Perplexity — `lib/news-engine/src/ai/perplexity.ts:51` (envia título + texto do artigo).
- **Base legal da transferência:** legítimo interesse na disponibilidade do pipeline editorial, restrita a **conteúdo jornalístico já público/reescrito** (não a PII de titulares). Para qualquer fluxo que processe **dados pessoais de terceiros identificáveis**, a **postura recomendada é Ollama-only** (in-country).
- **Mecanismo Ollama-only (já existente, sem flip de default):** setar `fallbackToGemini=false` mantém o processamento in-country (`rewrite.ts:227,268,323`). O **default (`true`) NÃO é alterado** — desligá-lo globalmente derrubaria a reescrita quando o Ollama estivesse fora. Reforça e é reforçado pela delimitação de conteúdo externo do **PRD-05**.

---

## 4. Política de retenção

| Tabela | Ação | Prazo (default) | Observação |
|---|---|---|---|
| `contact_messages` | Anonimizar `ip_address`/`user_agent` (NULL) | 180 dias (`created_at`) | Mantém o corpo/lead; minimiza a PID de rede |
| `contact_messages` | Deletar linha inteira | **desligado** (configurável, ex. 730 dias) | Só se o controlador decidir |
| `login_attempts` | Deletar linha | 7 dias (`reset_at`) | Estado de rate-limit já expirado |
| `endpoint_rate_limits` | Deletar linha | 7 dias (`reset_at`) | idem |
| `audit_logs` / `security_logs` | **Não expurga automaticamente** | — | Retenção forense; exclusão manual sob revisão |

Execução: `artifacts/api-server/src/scripts/retentionSweep.ts` (compilado em
`dist/scripts/retentionSweep.mjs`). **DRY-RUN por padrão** (só reporta contagens);
expurgo real exige a **dupla trava** `RETENTION_APPLY=1` + `--apply`, é **manual**
na VPS, **sob revisão humana** e com **backup recente (PRD-09)**. Nunca roda em
scheduler/boot.

---

## 5. Direitos do titular (LGPD Art. 18)

- **Acesso / confirmação (Art. 18, I/II):** consulta de leitura por e-mail —
  `SELECT ... FROM contact_messages WHERE email = '<titular>'` e
  `SELECT id, name, email FROM users WHERE email = '<titular>'` (no banco do blog, via `psql` — CLAUDE.md §12).
- **Correção (Art. 18, III):** `UPDATE` direcionado por id, sob revisão.
- **Eliminação / anonimização (Art. 18, IV/VI):** usar o `retentionSweep` ou um
  `DELETE`/`UPDATE` direcionado por id/e-mail, **sob revisão humana** e com backup.
  Registros de auditoria/segurança podem ser retidos por obrigação legal (Art. 18, §4 c/c Art. 7, IX).
- **Canal:** o DPO/controlador do §cabeçalho responde às solicitações no prazo legal.

---

## 6. Analytics sem IP (controle a preservar)

O `analytics_events` **não** persiste IP (`lib/db/src/schema/analytics.ts` — só
`visitor_id`/`city`/`region`/UTM; `docs/ANALYTICS.md:111-112`). **Não** adicionar
persistência de IP em analytics.

---

## 7. Consentimento (decisão explícita)

O consentimento do site é **tudo-ou-nada** (`bee_analytics_consent` único —
`artifacts/brasilia-agora/src/components/LGPDConsent.tsx:5,30-39`), porque o site
coleta **apenas analytics próprio** (sem cookies de terceiros / ad-targeting real).
Os toggles de categoria hoje são **cosméticos** (`LGPDConsent.tsx:82-96`;
`docs/ANALYTICS.md:121-122`) e **induzem a erro** — devem ser **removidos/relabelados**
para refletir honestamente o tudo-ou-nada (mudança de frontend opcional, build no
Docker da VPS). Enquanto não ajustado, a política aqui é a fonte da verdade honesta.
