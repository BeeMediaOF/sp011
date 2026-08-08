# PRD-12 — LGPD e privacidade de dados

> **Metadados:** Onda 4 | **Médio Prazo** | Esforço **Médio** | Dependências: **nenhuma** (soft-tie com PRD-05) | **⚠️ REVISÃO HUMANA OBRIGATÓRIA** — este PRD toca **dados pessoais** e prevê **exclusão/anonimização de dados**: toda deleção roda **em dry-run** por padrão; qualquer expurgo real só ocorre depois de um humano revisar as contagens do dry-run e autorizar. Sinalizar para revisão humana antes de merge/deploy.
> **Achado de origem:** **F18** (mapa de riscos) / **AP-10** (threat model). Domínio 10 do plano de auditorias.
> Este PRD é **autocontido**: toda referência a arquivo/linha e todo comando estão escritos aqui. Leia-o sem depender de nenhuma outra conversa.

---

## Objetivo

Fechar as três lacunas de conformidade LGPD do sistema — (1) **transferência internacional** de conteúdo às IAs estrangeiras (OpenAI/Gemini/Perplexity) **sem base legal documentada** (LGPD Art. 33), (2) **ausência de prazo de retenção (TTL) e de expurgo** de dados pessoais em `contact_messages`, `login_attempts` e `endpoint_rate_limits`, e (3) **consentimento com granularidade cosmética** no banner do site — entregando (a) um **registro de tratamento + política de retenção + base legal documentados**, (b) um **job de expurgo/anonimização que roda SEMPRE em dry-run** (reporta contagens sem deletar), e (c) uma **decisão explícita e honesta sobre o consentimento**. É um PRD **majoritariamente documental + um job de retenção seguro**; nenhuma deleção automática acontece sem revisão humana.

---

## Contexto / Evidência de origem

**Achado F18 — LGPD: transferência internacional sem base legal; `contact_messages` sem TTL; consentimento cosmético** (`security-audit/02-mapa-riscos.md:66`; severidade **Médio**, ativo **#4 (PII)**, confiança **Fato/Alta**). Attack path **AP-10** (`security-audit/03-threat-model.md:51`):
> "**AP-10 — LGPD/transferência internacional (F18).** PII (contact_messages IP/UA, sem TTL) → IAs estrangeiras sem base legal (Art. 33). STRIDE: **I, R**. Mitiga: PRD-12."

Domínio 10 do plano de auditorias (`security-audit/04-plano-auditorias.md:106-112`) detalha os três itens e suas referências:
- "Transferência internacional a IAs (Art. 33) sem base legal — LGPD Art. 33/7; A09 — Médio — F18 → PRD-12" (`:110`).
- "contact_messages IP/UA sem TTL de retenção — LGPD (minimização/retenção); CWE-212 — Médio — F18 → PRD-12" (`:111`).
- "Consentimento com granularidade cosmética — LGPD Art. 8/9 — Baixo-Médio — F18 → PRD-12" (`:112`).

Roadmap (`security-audit/06-roadmap-dimensionamento.md:52`): **Onda 4**, nota de execução explícita **"deleção em dry-run"**; milestone **M4** (`:55`) exige "base legal/retenção LGPD".

### Evidência confirmada por leitura direta dos arquivos (2026-07-21)

**(1) Transferência internacional a IAs estrangeiras — fallback transfere conteúdo para fora do BR.**
- **Ollama é o provider primário e roda self-hosted (in-country, na própria VPS)** — CLAUDE.md §10 e `lib/news-engine/src/ai/rewrite.ts:253-256` (`provider === "ollama"`, base default `http://ollama:11434`). Isso mitiga em parte, mas **o fallback e os providers alternativos transferem o texto ao exterior:**
  - **Perplexity (EUA):** `lib/news-engine/src/ai/perplexity.ts:51` faz `fetch("https://api.perplexity.ai/chat/completions", …)` enviando `title`+`text` do artigo (`:49`).
  - **OpenAI/compatível (EUA por default):** `lib/news-engine/src/ai/rewrite.ts:169-210` (`callOpenAI`), endpoint `https://api.openai.com` em `rewrite.ts:177`.
  - **Gemini (Google, EUA) via pool:** `rewrite.ts:290-294` e, sobretudo, o **fallback automático quando o Ollama cai**: `rewrite.ts:267-272` (`"Ollama indisponível — caindo para fallback Gemini"`) e `rewrite.ts:322-326` (mesmo fallback no `callTextModel`).
  - **O gatilho do fallback é o flag `fallbackToGemini` (default `true`):** `rewrite.ts:227` (`fallbackToGemini?: boolean; // … Default true.`), consumido em `rewrite.ts:268` e `rewrite.ts:323`. Ou seja, **existe HOJE um mecanismo para manter o processamento Ollama-only** (setar `fallbackToGemini=false`) — falta **documentar a base legal do fallback** e **a postura Ollama-only para fluxos sensíveis** (liga com PRD-05).
  - Nenhum documento no repo declara a **base legal da transferência internacional** (LGPD Art. 33) nem informa o titular. Risco: **A09 (Security Logging & Monitoring / accountability)**, **LGPD Art. 33 e Art. 7** (base legal de tratamento). CVSS não se aplica (risco **regulatório**, não de exploração remota).

**(2) `contact_messages`, `login_attempts` e `endpoint_rate_limits` guardam PII sem TTL nem expurgo.**
- **`contact_messages`** — `lib/db/src/schema/contact_messages.ts:9-10` define as colunas `ipAddress: text("ip_address")` e `userAgent: text("user_agent")` (além de `name`/`email`/`subject`/`message`, PII de contato). São gravadas no **POST público** do formulário de contato em `artifacts/api-server/src/routes/msgs.ts:24-31` (IP via `getClientIp`, UA truncado em 512 chars). **Não há nenhuma coluna de retenção, job de expurgo, nem captura de consentimento** nesse endpoint (`msgs.ts:10-38`). Retenção indefinida de IP/UA de quem só mandou uma mensagem viola **minimização/limitação de armazenamento** (LGPD Art. 6, III/V; **CWE-212 — Improper Removal of Sensitive Information**).
- **`login_attempts`** — `lib/db/src/schema/login_attempts.ts:3-8` tem **chave primária `ip` (PII)** + `resetAt`/`updatedAt`. As linhas só são apagadas **num login bem-sucedido** (`artifacts/api-server/src/middlewares/auth.ts:275` — `db.delete(loginAttemptsTable).where(eq(...ip, ip))`); **linhas de IPs que nunca logam com sucesso ficam para sempre**. Não há job de limpeza por idade.
- **`endpoint_rate_limits`** — grava `ipAddress`/`userAgent` (`artifacts/api-server/src/middlewares/endpointRateLimit.ts:86-87`); mesma ausência de expurgo por idade.
- **`audit_logs` / `security_logs`** também guardam `ipAddress`/`userAgent` (`artifacts/api-server/src/lib/audit.ts:23-24,52-53`) — mas são **registros de segurança/forense**: retenção mais longa é legítima; **ficam FORA do expurgo automático** (só retenção documentada + exclusão manual sob revisão).

**(3) Consentimento com granularidade cosmética.**
- `docs/ANALYTICS.md:121-122` (Limitação conhecida #2): *"Toggles de categoria do banner LGPD são cosméticos — aceite/rejeição é tudo-ou-nada (`bee_analytics_consent` único)."*
- Confirmado no componente: `artifacts/brasilia-agora/src/components/LGPDConsent.tsx:82-96` renderiza três linhas de categoria (essencial/analytics/ads) com **interruptores puramente visuais** (`bg-green-400`/`bg-gray-300`, **sem `onClick`/estado**); os botões escrevem **um único valor** — `accept()` grava `"accepted"` (`:30-34`) e `reject()` grava `"rejected"` (`:36-39`). O titular vê toggles que **sugerem controle granular que não existe** (LGPD **Art. 8/9** — consentimento **livre, informado e inequívoco**). Há uma categoria "ads" exibida sem qualquer efeito de consentimento de publicidade.

**(4) Ponto bom a PRESERVAR — Analytics NÃO persiste IP.** `lib/db/src/schema/analytics.ts` **não tem coluna de IP** (só `visitorId` em `:28`, `city`/`region` em `:25-26`, UTM em `:30-32`); `docs/ANALYTICS.md:111-112` confirma: *"IPs não são gravados em `analytics_events` (o campo `_ip` do buffer é transiente … e não vai ao banco)."* Este PRD deve **verificar e preservar** esse estado (não introduzir persistência de IP em analytics).

**Referências normativas:** **LGPD** Lei nº 13.709/2018 — **Art. 6** (princípios: finalidade, necessidade, minimização), **Art. 7** (bases legais), **Art. 8/9** (consentimento livre/informado), **Art. 18** (direitos do titular: acesso, correção, eliminação), **Art. 33** (transferência internacional). **OWASP** A09:2021 (Security Logging & Monitoring / accountability). **CWE-212** (Improper Removal of Sensitive Information Before Storage or Transfer), **CWE-359** (Exposure of Private Personal Information). Risco **regulatório/impacto-driven**, sem CVSS clássico (severidade **Médio**).

---

## Pré-condições

- [ ] **Branch dedicado:** `git checkout -b fix/prd-12-lgpd-privacidade`
- [ ] **Baseline de testes registrado.** Rodar o comando EXATO abaixo e anotar a saída (nº de testes, pass/fail) em `security-audit/STATUS.md` como linha-base **ANTES** de qualquer mudança:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run test
  ```
- [ ] **Baseline de typecheck registrado** (mesmo fim):
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
  ```
- [ ] **Ler ANTES de editar/criar** (para reancorar caminhos/linhas — números podem ter deslocado):
  - `lib/db/src/schema/contact_messages.ts` (colunas `ip_address`/`user_agent`, sem retenção — `:9-10`)
  - `lib/db/src/schema/login_attempts.ts` (PK `ip`, `resetAt` — `:3-8`)
  - `lib/db/src/schema/analytics.ts` (confirmar **ausência** de coluna de IP; `visitorId`/`city`/`region`/UTM)
  - `lib/db/src/schema/endpoint_rate_limits.ts` (colunas `ip_address`/`user_agent`)
  - `artifacts/api-server/src/routes/msgs.ts` (POST público insere IP/UA — `:24-31`)
  - `artifacts/api-server/src/middlewares/auth.ts` (`:248-275` — insert/delete de `login_attempts`)
  - `artifacts/api-server/src/lib/audit.ts` (`:23-24,52-53` — IP/UA em audit/security logs)
  - `lib/news-engine/src/ai/rewrite.ts` (`fallbackToGemini` em `:227`; fallback Gemini em `:267-272` e `:322-326`; OpenAI em `:169-210`)
  - `lib/news-engine/src/ai/perplexity.ts` (`fetch` para `api.perplexity.ai` — `:51`)
  - `docs/ANALYTICS.md` (§ "LGPD / privacidade" `:104-112`; Limitação #2 `:121-122`)
  - `artifacts/brasilia-agora/src/components/LGPDConsent.tsx` (toggles cosméticos `:82-96`; `accept`/`reject` `:30-39`)
  - `artifacts/brasilia-agora/src/pages/Privacidade.tsx` (página de política de privacidade existente — base para o texto ao titular)
  - `artifacts/api-server/build.mjs` (entry único `src/index.ts` em `:18` — precisará de um 2º entry para o script de expurgo)
  - CLAUDE.md §12 (acesso aos bancos), §13 (regras invioláveis: heredoc NÃO funciona no terminal do usuário; NUNCA trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`), §14 (dev Windows: build vite só no Docker; `node --test`/typecheck por pacote; nunca unicode literal em regex — usar `\uXXXX`), §18 (comandos de runbook completos p/ colar)
- [ ] **Confirmar acesso à VPS com o operador.** O código (doc + módulo + testes + script + entry no build) é criado e validado **localmente** (dev/Windows: esbuild e `node --test` rodam). O **dry-run contra o banco real** (Bloco 2) e qualquer **expurgo real** rodam **NA VPS**, pelo operador, e são **gated por revisão humana** — o operador cola as contagens no `security-audit/STATUS.md`.
- [ ] **Confirmar com o operador quem é o controlador/DPO e o canal do titular** (e-mail de contato do DPO) para constar no `docs/LGPD.md`. Não inventar dados de contato reais.

---

## Escopo (ações em ordem)

> **Regra de ouro deste PRD:** o expurgo/anonimização é **dry-run por padrão** e **nunca** deleta sem um flag explícito **`--apply`** presente **junto** de `RETENTION_APPLY=1`, e mesmo assim é uma **ação manual, humana e revisada** na VPS. Todo bloco copy-paste é auto-suficiente e **sem heredoc** (CLAUDE.md §13/§18). **Não** tocar em `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`, schema de auth, nem no default do fallback de IA em produção.

### A. Documentação de conformidade (o núcleo — documental)

1. **Criar `docs/LGPD.md`** — documento único de conformidade, em pt-BR, com estas seções obrigatórias (cada uma citando `arquivo:linha` real da evidência acima para rastreabilidade):
   - **Registro de tratamento (inventário de dados pessoais):** tabela `dado → tabela/coluna → finalidade → base legal (LGPD Art. 7) → retenção`. Cobrir no mínimo: `contact_messages` (name/email/subject/message/ip_address/user_agent — `lib/db/src/schema/contact_messages.ts:5-12`), `login_attempts.ip` (`:3-8`), `endpoint_rate_limits.ip_address/user_agent`, `audit_logs`/`security_logs.ip_address/user_agent` (`artifacts/api-server/src/lib/audit.ts`), `analytics_events` (visitor_id/city/region/UTM — **sem IP**, `lib/db/src/schema/analytics.ts`), `users` (email; e `two_factor_secret` — cross-ref PRD-01b).
   - **Base legal por tratamento** (Art. 7): ex. contato = execução de solicitação do titular; rate-limit/audit/security = legítimo interesse/segurança; analytics = consentimento.
   - **Transferência internacional (Art. 33):** declarar que **Ollama (self-hosted, in-country) é o provider primário** e que **OpenAI/Gemini/Perplexity (EUA)** só recebem conteúdo no **fallback/lane de reforço** (`lib/news-engine/src/ai/rewrite.ts:267-272,322-326`; `lib/news-engine/src/ai/perplexity.ts:51`); registrar a **base legal** dessa transferência e a **postura recomendada Ollama-only** para fluxos com PII (ver ação 4, liga com PRD-05).
   - **Política de retenção** (prazos por tabela — ver ação 5 para os defaults propostos).
   - **Direitos do titular (Art. 18):** runbook de **acesso**, **correção** e **eliminação** — com **templates SQL de LEITURA** para acesso (SELECT por e-mail em `contact_messages`/`users`) e a instrução de que **eliminação** usa o script de expurgo direcionado **sob revisão humana** (ação 6). Canal/DPO do controlador (confirmado na pré-condição).
   - **Consentimento:** registrar a **decisão explícita** da ação 7 (tudo-ou-nada honesto) e o motivo.
   - **Nota:** este documento é a fonte da verdade de conformidade; mantê-lo atualizado quando novos tratamentos surgirem.

### B. Transferência internacional — documentar + tornar a postura Ollama-only operacional (liga com PRD-05)

2. **Documentar em `docs/LGPD.md`** o fluxo de dados às IAs e a base legal (feito na ação 1, seção "Transferência internacional").
3. **NÃO** alterar o **default** de `fallbackToGemini` em produção (flipar para Ollama-only cegamente derrubaria o pipeline quando o Ollama cai — ver `rewrite.ts:267-272`). Em vez disso: **documentar** que setar `fallbackToGemini=false` (mecanismo já existente em `rewrite.ts:227,268,323`) mantém o processamento **in-country**, e **recomendar** essa postura para qualquer fluxo que processe **dados pessoais de terceiros/identificáveis** (soft-tie com PRD-05, que delimita/valida conteúdo externo).
4. **(Opcional, aditivo, sem flip de default)** Se e somente se o PRD-05 ainda não expôs isso, documentar no `docs/LGPD.md` como **configurar a rota Ollama-only** por ambiente (variável/setting) — **sem** alterar código de default. Se implicar mudança de código, **PARAR e sinalizar revisão humana** (toca o pipeline de IA).

### C. TTL de retenção + job de expurgo/anonimização (DRY-RUN por padrão)

5. **Criar `artifacts/api-server/src/lib/dataRetention.ts`** — **módulo PURO** (sem I/O), testável com `node --test`, que **planeja** a retenção. Deve exportar:
   - Um tipo `RetentionAction = { table: string; mode: "anonymize" | "delete"; column?: string; cutoff: Date; description: string }`.
   - Uma constante `DEFAULT_RETENTION` com os prazos **propostos** (o humano revisa/ajusta em `docs/LGPD.md`):
     - `contact_messages`: **anonimizar** `ip_address` e `user_agent` (setar `NULL`) para linhas com `created_at < now - 180 dias` (mantém o corpo/lead; minimiza a PID de rede). Opcionalmente **deletar** a linha inteira com `created_at < now - 730 dias` (configurável, **desligado por default**).
     - `login_attempts`: **deletar** linhas com `reset_at < now - 7 dias` (estado de rate-limit já expirado; chaveado por IP).
     - `endpoint_rate_limits`: **deletar** linhas com `reset_at < now - 7 dias`.
   - Uma função pura `planRetention(now: Date, cfg = DEFAULT_RETENTION): RetentionAction[]` que calcula os `cutoff` (= `now - dias`) e devolve a lista de ações. **Sem** tocar em `audit_logs`/`security_logs` (fora do expurgo automático).
6. **Criar `artifacts/api-server/src/scripts/retentionSweep.ts`** — **script CLI** (entry de build) que executa o plano. Comportamento **inegociável**:
   - **DRY-RUN por padrão.** Para cada `RetentionAction`, roda **apenas `SELECT count(*)`** com o mesmo predicado (nunca `DELETE`/`UPDATE`) e imprime uma tabela `table | mode | column | cutoff | rowsThatWouldChange`. Termina sem alterar nada.
   - **Deleção/anonimização real SOMENTE quando** `process.env.RETENTION_APPLY === "1"` **E** o argumento `--apply` estiver presente (dupla trava). Sem os dois, é impossível alterar dados. Mesmo com os dois, imprime as contagens antes e depois e loga a ação (via `req.log`/logger do processo). Este caminho é **ação humana revisada na VPS** — nunca em CI/boot.
   - **Nunca** é chamado automaticamente (não registrar em `startScheduler`/`index.ts`; é invocado à mão). Não imprime valores de segredo.
   - Usa a conexão do app (`@workspace/db`) para as contagens; encerra o processo ao final.
7. **Criar `artifacts/api-server/test/dataRetention.test.ts`** — testes `node --test` (imports com extensão `.ts` explícita, cf. `test/readingTime.test.ts:3`) que provam a lógica PURA:
   - `planRetention(now)` devolve `cutoff === now - Ndias` para cada ação (checar `contact_messages`=180d, `login_attempts`=7d, `endpoint_rate_limits`=7d).
   - Nenhuma ação alvo é `audit_logs`/`security_logs`.
   - A ação de `contact_messages` padrão é `mode:"anonymize"` nas colunas `ip_address`/`user_agent` (não `delete`).
   - (Se o módulo expuser um helper que decide "apply") sem `apply=true`, o plano executável não contém nenhum `DELETE`/`UPDATE`.
8. **Editar `artifacts/api-server/build.mjs`** — adicionar `path.resolve(artifactDir, "src/scripts/retentionSweep.ts")` ao array `entryPoints` (`build.mjs:18`), de forma que o esbuild gere `dist/scripts/retentionSweep.mjs` sem quebrar o bundle do servidor (`src/index.ts` continua sendo o entry principal). Não mudar mais nada no build.

### D. Consentimento — decisão explícita e honesta (documental; frontend opcional)

9. **Registrar em `docs/LGPD.md`** a decisão explícita: o consentimento do site é **tudo-ou-nada** (`bee_analytics_consent` único, `LGPDConsent.tsx:5,30-39`), justificado por o site coletar **apenas analytics próprio** (sem cookies de terceiros/ad-targeting real). Cross-ref `docs/ANALYTICS.md:121-122`.
10. **(Opcional — frontend, requer build no Docker da VPS, NÃO bloqueia o DoD deste PRD)** Tornar o banner **honesto** com a decisão: em `artifacts/brasilia-agora/src/components/LGPDConsent.tsx:82-96`, **OU** remover os toggles cosméticos de categoria (analytics/ads) que sugerem controle inexistente, **OU** wire-los de verdade (persistir escolha por categoria e fazer o `useAnalytics` respeitar). **Recomendado o caminho de remoção/relabel** (menor risco). Como o build do vite **não roda no Windows** (CLAUDE.md §14), essa mudança é **sinalizada ao operador** para build/deploy do serviço `web` na VPS — o agente deixa o patch pronto e documentado, mas o **critério de aceite do frontend é verificado por revisão de código**, não por build local.

### E. Preservar o estado bom do Analytics (verificação)

11. **Verificar (sem alterar)** que `lib/db/src/schema/analytics.ts` **não** ganhou coluna de IP e que `docs/ANALYTICS.md:111-112` continua verdadeiro. Registrar a checagem no `docs/LGPD.md` como controle existente a preservar. **Não** adicionar persistência de IP em analytics.

### F. Registro de status

12. **Atualizar `security-audit/STATUS.md`** (criar se não existir) com: PRD-12, hash de commit, baselines de teste/typecheck, resultado dos comandos de verificação (Bloco 1), e — quando o operador rodar na VPS — as **contagens do dry-run** (Bloco 2). Registrar explicitamente que **nenhuma deleção real foi executada** sem revisão humana.

---

## Fora de escopo

- **NÃO** alterar o **default** de `fallbackToGemini` nem qualquer código do pipeline de IA que mude o comportamento de fallback em produção (derrubaria a reescrita quando o Ollama cai). Só **documentar** e **recomendar** a postura Ollama-only (a delimitação/validação do conteúdo externo é do **PRD-05**).
- **NÃO** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` nem tocar em cripto de segredos (é PRD-01a/01b). `two_factor_secret` em claro é do **PRD-01b** — aqui só **listar** no registro de tratamento.
- **NÃO** incluir `audit_logs`/`security_logs` no expurgo automático (registros de segurança; só retenção documentada + exclusão manual sob revisão).
- **NÃO** adicionar coluna nova a nenhuma tabela (evita mexer em `ensureSchema.ts`/`lib/db` composite). Retenção é por **idade** (`created_at`/`reset_at`) + anonimização idempotente (IP/UA nulos) — sem flag de schema.
- **NÃO** adicionar persistência de IP em `analytics_events` (preservar o bom estado atual).
- **NÃO** ligar o `retentionSweep` em scheduler/boot; ele é **manual** e **dry-run por padrão**. Nada de expurgo automático.
- **NÃO** implementar automação de "esquecimento" ligada ao OAuth/redes sociais, nem RIPD formal completo (basta o registro de tratamento neste PRD).
- **NÃO** depender do build do `web` (vite) localmente — a mudança de frontend (ação 10) é opcional e validada por revisão de código, buildada na VPS.

---

## Comandos de verificação

> **Bloco 1 (estático, dev/Windows-Git Bash)** — executável pelo **agente**. **Bloco 2 (VPS, operador)** exige o banco real e é **gated por revisão humana**. Para cada comando está declarado o que caracteriza **SUCESSO**.

```bash
# === BLOCO 1 — estático (dev, Git Bash na raiz do repo) — executável pelo agente ===
cd "c:/Users/Usuario(a) Master/sp011"

# 1a) Artefatos criados nos lugares certos.
ls -1 docs/LGPD.md artifacts/api-server/src/lib/dataRetention.ts artifacts/api-server/src/scripts/retentionSweep.ts artifacts/api-server/test/dataRetention.test.ts
# SUCESSO: as 4 linhas existem (nenhum "No such file").

# 1b) docs/LGPD.md cobre as seções obrigatórias (registro de tratamento, base legal, transferência internacional, retenção, direitos do titular, consentimento).
grep -niE "registro de tratamento|base legal|transfer(ê|e)ncia internacional|Art\.?\s*33|reten(ç|c)(ã|a)o|direitos do titular|Art\.?\s*18|consentimento" docs/LGPD.md
# SUCESSO: aparecem linhas para cada um dos temas (>=6 blocos distintos).

# 1c) Analytics continua SEM persistir IP (bom estado a preservar).
grep -niE "ip_address|\"ip\"|ipAddress" lib/db/src/schema/analytics.ts
# SUCESSO: 0 ocorrências (nenhuma coluna de IP no schema de analytics).

# 1d) O mecanismo Ollama-only (fallbackToGemini) existe e está documentado, sem flip de default no código.
grep -n "fallbackToGemini" lib/news-engine/src/ai/rewrite.ts
# SUCESSO: aparece a declaração (default true) e os usos; nenhuma edição mudou o default.
grep -niE "Ollama-only|fallbackToGemini|Art\.?\s*33" docs/LGPD.md
# SUCESSO: docs/LGPD.md menciona a postura Ollama-only e a base legal da transferência.

# 1e) O script de expurgo é DRY-RUN por padrão e só altera dados com dupla trava (RETENTION_APPLY=1 E --apply).
grep -nE "RETENTION_APPLY|--apply|dry|DRY" artifacts/api-server/src/scripts/retentionSweep.ts
# SUCESSO: há checagem explícita de RETENTION_APPLY e de --apply antes de qualquer DELETE/UPDATE.
grep -nE "DELETE|UPDATE|\.delete\(|\.update\(" artifacts/api-server/src/scripts/retentionSweep.ts
# SUCESSO (observação): todo DELETE/UPDATE está DENTRO do ramo guardado pela dupla trava (revisar visualmente que nenhum roda no caminho default/dry-run).

# 1f) O módulo de retenção NÃO inclui audit_logs/security_logs no expurgo automático.
grep -niE "audit_logs|auditLogs|security_logs|securityLogs" artifacts/api-server/src/lib/dataRetention.ts
# SUCESSO: 0 ocorrências (registros de segurança ficam fora do expurgo automático).

# 1g) build.mjs registrou o novo entry sem remover o principal.
grep -nE "index\.ts|retentionSweep\.ts" artifacts/api-server/build.mjs
# SUCESSO: aparecem AMBOS (src/index.ts e src/scripts/retentionSweep.ts) no entryPoints.

# 1h) Typecheck do api-server passa.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
# SUCESSO: exit 0, sem erros de tipo (== baseline).

# 1i) Testes do api-server passam, incluindo os novos de retenção.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run test
# SUCESSO: todos os testes passam; a suíte inclui dataRetention.test.ts (novos casos verdes).

# 1j) Build esbuild gera o novo entry sem quebrar o bundle do servidor.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run build && ls -1 dist/scripts/retentionSweep.mjs dist/index.mjs
# SUCESSO: build termina exit 0 e os DOIS arquivos existem em dist/.

# 1k) git status confirma ausência de mudança em áreas proibidas (auth/cripto/schema de segredo).
cd "c:/Users/Usuario(a) Master/sp011" && git status --porcelain
# SUCESSO: mudanças só em docs/LGPD.md, artifacts/api-server/{src/lib/dataRetention.ts,src/scripts/retentionSweep.ts,test/dataRetention.test.ts,build.mjs}, security-audit/, e (se ação 10) LGPDConsent.tsx.
#          NENHUMA alteração em middlewares/auth.ts, lib/crypto.ts, .env, ou schema de segredos.
```

```bash
# === BLOCO 2 — DRY-RUN contra o banco real (VPS, operador) — GATED POR REVISÃO HUMANA ===
# Roda o expurgo em modo dry-run: reporta contagens SEM deletar nada.
cd /opt/sp011
docker compose exec -T api node dist/scripts/retentionSweep.mjs
# SUCESSO: imprime a tabela (table|mode|column|cutoff|rowsThatWouldChange) e termina exit 0.
#          NENHUMA linha foi alterada (é dry-run).

# 2a) Provar que o dry-run NÃO alterou dados: a contagem de contact_messages com IP não-nulo é a MESMA antes/depois.
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -Atqc "SELECT count(*) FROM contact_messages WHERE ip_address IS NOT NULL;"
# SUCESSO: o número é IDÊNTICO ao de antes de rodar o dry-run (o dry-run não anonimiza nada).

# 2b) (SOMENTE após revisão humana das contagens do dry-run) expurgo real — dupla trava.
#     NÃO EXECUTAR sem autorização humana registrada no STATUS.md.
# cd /opt/sp011 && RETENTION_APPLY=1 docker compose exec -T -e RETENTION_APPLY=1 api node dist/scripts/retentionSweep.mjs --apply
# SUCESSO (quando autorizado): imprime contagens antes/depois; as linhas fora do prazo foram anonimizadas/removidas conforme a política revisada.
```

---

## Critérios de aceite

- [ ] `docs/LGPD.md` existe e cobre: **registro de tratamento**, **base legal (Art. 7)**, **transferência internacional (Art. 33)** referenciando `rewrite.ts`/`perplexity.ts`, **política de retenção**, **direitos do titular (Art. 18)** e a **decisão de consentimento** (Bloco 1a/1b).
- [ ] `docs/LGPD.md` documenta a **postura Ollama-only** para PII e a **base legal do fallback**; o **default de `fallbackToGemini` NÃO foi alterado** no código (Bloco 1d).
- [ ] `artifacts/api-server/src/lib/dataRetention.ts` é um módulo **puro** com `planRetention` e `DEFAULT_RETENTION`; **não** inclui `audit_logs`/`security_logs` (Bloco 1f); testado em `test/dataRetention.test.ts` (Bloco 1i).
- [ ] `artifacts/api-server/src/scripts/retentionSweep.ts` é **dry-run por padrão** e só altera dados com **`RETENTION_APPLY=1` E `--apply`** (dupla trava); nenhum `DELETE`/`UPDATE` roda no caminho default (Bloco 1e).
- [ ] `build.mjs` registra o novo entry mantendo `src/index.ts`; `pnpm run build` gera `dist/scripts/retentionSweep.mjs` e `dist/index.mjs` (Bloco 1g/1j).
- [ ] `pnpm run typecheck` e `pnpm run test` do api-server passam (== baseline + novos testes verdes) (Bloco 1h/1i).
- [ ] `lib/db/src/schema/analytics.ts` continua **sem** coluna de IP (Bloco 1c); nenhuma persistência de IP foi adicionada em analytics.
- [ ] `git status` mostra mudança **apenas** nas áreas previstas; **nada** em `middlewares/auth.ts`, `lib/crypto.ts`, `.env` ou schema de segredos (Bloco 1k).
- [ ] **(VPS, operador)** O **dry-run** roda com exit 0 e **reporta contagens sem alterar dados** — a contagem de `contact_messages` com IP não-nulo é idêntica antes/depois (Bloco 2/2a). **Nenhum expurgo real** foi executado sem revisão humana registrada.
- [ ] **(Opcional, revisão de código)** Se a ação 10 foi feita, o banner `LGPDConsent.tsx` está **honesto** (toggles cosméticos removidos ou realmente funcionais) — verificado por leitura do diff; o build do `web` fica a cargo do operador na VPS.
- [ ] `security-audit/STATUS.md` atualizado com PRD-12, hash de commit, baselines, saídas do Bloco 1 e (quando houver) contagens do dry-run do Bloco 2, com a nota de que nenhuma deleção real ocorreu sem autorização.

---

## Definition of Done

Existe um **registro de tratamento + política de retenção + base legal** documentados em `docs/LGPD.md` (incluindo a transferência internacional às IAs sob Art. 33 e a postura Ollama-only para PII); um **job de expurgo/anonimização seguro** (`retentionSweep.ts`, dry-run por padrão, dupla trava para expurgo real) com **lógica pura testada** (`dataRetention.ts` + `dataRetention.test.ts`) e registrado no build (`dist/scripts/retentionSweep.mjs`); a **decisão de consentimento** está documentada de forma explícita e honesta; o **Analytics segue sem persistir IP** (verificado); `typecheck`/`test`/`build` do api-server passam; **nenhum código de auth/segredo/schema de segredo foi tocado**; e o **dry-run rodou na VPS reportando contagens sem deletar nada**, com **qualquer expurgo real condicionado a revisão humana**. A mudança está mergeada na `main` **após revisão humana** (dado que toca dados pessoais), e o `security-audit/STATUS.md` registra as evidências. Satisfaz o milestone **M4** ("base legal/retenção LGPD", `security-audit/06-roadmap-dimensionamento.md:55`).

---

## Dependências

- **Nenhuma dependência dura.** Pode rodar em paralelo com qualquer PRD (`security-audit/05-estrategia-prd.md:42`; `06-roadmap-dimensionamento.md:52`).
- **Soft-tie com PRD-05 (injeção indireta de prompt):** o PRD-05 delimita/valida o conteúdo externo que alimenta a IA; a **recomendação Ollama-only para fluxos com PII** deste PRD reforça e é reforçada por ele. Coordenar a redação, sem bloqueio.
- **Cross-ref PRD-01b (segredos em repouso):** o `two_factor_secret` em claro é tratado lá; aqui só entra no **registro de tratamento** como dado pessoal sensível a citar.

---

## Prioridade e esforço

- **Prioridade:** **Médio Prazo — Onda 4** (`security-audit/06-roadmap-dimensionamento.md:52,62`). Risco **regulatório** (ativo #4/PII), não de exploração externa imediata (`04-plano-auditorias.md:20`) — por isso não sobe às ondas de exposição, mas é exigência de conformidade.
- **Esforço:** **Médio.** Majoritariamente **documental** (`docs/LGPD.md`) + um **job de retenção** pequeno e seguro (módulo puro + testes + script dry-run + 1 linha no build). O que consome tempo é escrever o registro de tratamento correto e validar o dry-run na VPS com o operador.

---

## Plano de rollback

- **Reverter o código:** a maior parte é **aditiva** (arquivos novos: `docs/LGPD.md`, `dataRetention.ts`, `retentionSweep.ts`, `dataRetention.test.ts`). A única edição de arquivo existente é o `build.mjs` (1 entry) e, se feita, o `LGPDConsent.tsx`. Reverter:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011" && git revert <hash-do-commit>
  ```
  Nenhum serviço em produção depende desses artefatos novos — reverter **não** afeta o funcionamento dos blogs (o `retentionSweep` é manual e nunca é chamado no boot).
- **Se apenas o novo entry do build incomodar:** remover `src/scripts/retentionSweep.ts` do array `entryPoints` em `artifacts/api-server/build.mjs` e rebuildar — o bundle do servidor (`src/index.ts`) permanece intacto.
- **Reversão de deploy** (se já buildado na VPS): rebuild direcionado do serviço `api` a partir do commit anterior (CLAUDE.md §5 — `artifacts/api-server`/`lib/db` → `api`). O `web` só precisa rebuild se a ação 10 (opcional) foi aplicada.
- **Dados:** **não há rollback de dados a fazer** enquanto ninguém rodar o expurgo com a dupla trava. Se um expurgo real (anonimização) tiver sido executado, ele é **irreversível para as colunas IP/UA anonimizadas** — por isso o gate de revisão humana e o backup do PRD-09 são pré-requisitos operacionais antes de qualquer `--apply`.

---

## Notas de execução para o agente

- **Trabalhe SOMENTE neste PRD (PRD-12).** Não misture com PRD-05 (delimitação de prompt), PRD-01b (segredos em repouso) nem PRD-13 (robustez), mesmo que toquem temas próximos.
- **⚠️ REVISÃO HUMANA OBRIGATÓRIA antes de merge/deploy** — este PRD lida com **dados pessoais** e prevê **exclusão/anonimização**. O `retentionSweep` é **dry-run por padrão**; o caminho de expurgo real tem **dupla trava** (`RETENTION_APPLY=1` **E** `--apply`) e **nunca** deve ser executado sem um humano revisar as contagens do dry-run e autorizar (registrar a autorização no `STATUS.md`). **Não** ligar o sweep em scheduler/boot.
- **Regras do repo a respeitar:** blocos copy-paste **sem heredoc** (CLAUDE.md §13/§18) — `cd` no início, `grep`/`ls` de conferência; imports de teste com extensão **`.ts` explícita** (cf. `test/readingTime.test.ts:3`); `pnpm run test`/`pnpm run typecheck`/`pnpm run build` **dentro do pacote** `artifacts/api-server`; **nunca** unicode literal em regex — usar `\uXXXX` (§14); **nunca** incluir valores de segredo reais em comandos/exemplos; **nunca** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`.
- **Não flipe o default do fallback de IA** — só documente e recomende a postura Ollama-only (o pipeline cairia se o Ollama estivesse fora e o fallback estivesse desligado globalmente).
- **Isolamento:** nada de hardcodar conteúdo por blog; o registro de tratamento descreve tabelas/colunas genéricas (a imagem é compartilhada entre blogs).
- **O build do frontend (vite) NÃO roda no Windows** — a ação 10 (banner) é **opcional** e validada por **revisão de código**; deixe o patch pronto e sinalize ao operador para build/deploy do `web` na VPS. O DoD deste PRD **não** depende dela.
- **Se QUALQUER critério de aceite falhar após implementar, NÃO marque como concluído:** registre o motivo exato (comando, saída, `arquivo:linha`) em `security-audit/STATUS.md` (criar o arquivo se não existir; uma entrada por PRD) e **PARE**.
- **Ao concluir com sucesso, atualize `security-audit/STATUS.md`** com: PRD-12, hash de commit, baselines de teste/typecheck, saídas do Bloco 1, e — quando o operador rodar — as contagens do dry-run do Bloco 2, deixando explícito que **nenhuma deleção real foi executada sem revisão humana**.
- **Sinalize para revisão humana** (por ser mudança que toca dados sensíveis) **antes do merge**, e confirme que um **backup recente existe (PRD-09)** antes de qualquer `--apply` na VPS.
