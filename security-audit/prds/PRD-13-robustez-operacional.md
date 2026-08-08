# PRD-13 — Robustez operacional — handler de erro global, ensureSchema fail-loud, alerting

> **Metadados:** Onda 4 | Prioridade: **Médio Prazo** | Esforço: **Médio** | Dependências: **nenhuma** | **REVISÃO HUMANA obrigatória** (o fail-loud do `ensureSchema` pode manter em 503 — ou reiniciar em loop — um serviço que estava servindo, se uma migração crítica falhar no boot).
>
> Este PRD é **autocontido**. Um agente futuro deve conseguir implementá-lo sem acesso à conversa que o gerou. Todas as referências `arquivo:linha` abaixo foram lidas e confirmadas no commit atual do repo (`c:/Users/Usuario(a) Master/sp011`, branch `main`). Números de linha podem ter deslocado alguns pontos se outro PRD já mexeu no arquivo — reconfirme com `grep` antes de editar.

---

## Objetivo

Fechar as três lacunas de **robustez operacional / observabilidade** do achado **F19** (o braço não-DoS de F19; o braço de rate-limit é o PRD-11): (1) **não existe handler de erro global no Express** em nenhum dos dois apps (blog `api-server` e `central-hub`) — erros não tratados caem no default do Express (stack em texto) e **três rotas devolvem `err.message` cru ao cliente**, vazando detalhe interno; (2) o `ensureSchema` **engole silenciosamente** qualquer falha de migração (só `warn`), permitindo o app rodar contra uma coluna/tabela ausente e quebrar em runtime; (3) `logSecurity` grava eventos de segurança no banco mas **não há consumidor nem alerta** — lockouts, rate-limit e 401 de ingest passam despercebidos. A remediação: (a) adicionar um handler de erro global (4 args) em ambos os apps que responde JSON padronizado **sem** stack/`err.message` em produção e loga o detalhe internamente, e corrigir as três rotas que vazam `err.message`; (b) tornar o `ensureSchema` **fail-loud validado por drift** (só degrada o health/impede servir quando uma migração **crítica de verdade** ficou ausente, não a cada erro transitório de statement); (c) adicionar um **sink de alerta** que consome eventos `logSecurity` de alto sinal e notifica (webhook opt-in), incluindo emitir um evento no 401 de ingest.

---

## Contexto / Evidência de origem

**Achado F19** (registro de riscos `security-audit/02-mapa-riscos.md`, linha 67): "Sem handler de erro global (vaza `err.message`); ensureSchema engole falhas; rate limit ausente | `ensureSchema.ts:73-78`; vários catch | Médio | 3 | Fato/Alta". A parte **rate limit ausente** é tratada pelo **PRD-11**; **este PRD (13)** trata os outros três sub-itens.

**Attack path de origem (AP-8)** (`security-audit/03-threat-model.md`, seção 4, linha 49): "**AP-8 — Exaustão de custo/IA (F13/F11/F19).** … STRIDE: **D**." F19 está listado em AP-8; os sub-itens deste PRD são a face de **observabilidade/robustez** (detecção tardia, drift silencioso, vazamento de informação em erro) que amplifica a resposta a **todos** os attack paths — sem alerta de segurança, os sinais de AP-1/AP-4/AP-5/AP-6 (lockouts, rate-limit, 401 de ingest) não chegam ao operador.

**Classificação (plano de auditorias `security-audit/04-plano-auditorias.md`):**
- Sem handler de erro global (vaza `err.message`) — **A05:2021 (Security Misconfiguration)**; **CWE-209 (Information Exposure Through an Error Message)**; severidade **Baixo-Médio**; **CVSS aprox. ~4.3** (F19 → PRD-13). (linha 118)
- `ensureSchema` engole falhas de migração — **CWE-703 (Improper Check or Handling of Exceptional Conditions)** (correlato: **CWE-390 Detection of Error Condition Without Action**); severidade **Baixo**; **CVSS aprox. ~3.5** (F19 → PRD-13). (linha 119)
- Sem alerting de segurança (`logSecurity` sem consumidor) — **A09:2021 (Security Logging and Monitoring Failures)**; **CWE-778 (Insufficient Logging)** (correlato: **CWE-223 Omission of Security-relevant Information**); severidade **Médio**; **CVSS aprox. ~5.3** (F19 → PRD-13). (linha 120)

**Evidências concretas lidas no código (`arquivo:linha` reais):**

1. **Nenhum handler de erro global — blog.** `artifacts/api-server/src/app.ts` termina em `app.use("/api", router);` (**linha 189**) e `export default app;` (**linha 193**). **Não existe** nenhum `app.use((err, req, res, next) => …)` (middleware de 4 argumentos) no arquivo. Qualquer exceção não capturada em um handler cai no error handler default do Express, que em `NODE_ENV` não-production expõe o stack como texto na resposta.

2. **Nenhum handler de erro global — central.** `artifacts/central-hub/src/app.ts` termina em `app.use("/api", router);` (**linha 25**) e `export default app;` (**linha 30**). Também **sem** middleware de erro de 4 args.

3. **Três rotas devolvem `err.message` cru ao cliente — `artifacts/api-server/src/routes/admin.ts`:**
   - **Linha 380**: `res.status(500).json({ error: err instanceof Error ? err.message : "AI rewrite failed" });`
   - **Linha 474**: `res.status(500).json({ error: err instanceof Error ? err.message : "autofill failed" });`
   - **Linha 1341**: `res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar artigo" });`
   Todas em rotas de IA/scraping (rewrite/autofill/article-from-url) cujo `err.message` pode conter URL interna, string de conexão, resposta de provider, etc. O arquivo já importa `logger` (**linha 16**) e `logSecurity`/`logAudit`/`getClientIp` (**linha 14**).

4. **`ensureSchema` do blog engole toda falha — `artifacts/api-server/src/lib/ensureSchema.ts`.** O loop **linhas 72-78**:
   ```ts
   for (const stmt of statements) {
     try {
       await target.execute(stmt);
     } catch (err) {
       logger.warn({ err }, "ensureSchema: falha ao aplicar ALTER TABLE (não-fatal)");
     }
   }
   ```
   O próprio cabeçalho (**linhas 9-13**) avisa que rodar ANTES de qualquer `SELECT ..., social_title` é obrigatório "porque o Drizzle gera `SELECT ..., social_title` … e isso falharia se a coluna ainda não existisse". Ou seja: se o `ALTER TABLE … ADD COLUMN social_title` falhar, o `warn` some no log e o próximo `SELECT` derruba a rota — o pior de dois mundos (falha tardia, sem sinal).

5. **`ensureSchema` da central idem — `artifacts/central-hub/src/lib/ensureSchema.ts`, linhas 309-316** (`catch` → `logger.warn({ err, statement: stmt.name }, "ensureSchema: statement falhou (não-fatal)")`, **linha 314**). Cada statement tem um `name` legível (bom para o fail-loud identificar qual objeto crítico faltou).

6. **Mecanismo de degradação já existe no blog (reaproveitar).** `artifacts/api-server/src/index.ts`: `ensureSchema()` roda dentro de `bootWithDb()` (**linha 145**); se `bootWithDb()` lançar, o `catch` do `app.listen` (**linhas 123-132**) chama `scheduleBootRetry()` e o gate de `/api` em `app.ts` (**linhas 174-187**, `isDbReady`/`isStoreHydrated`) responde **503 `db_unavailable`** até uma execução completar. **Conclusão:** basta o `ensureSchema` **lançar** num drift crítico que o blog já degrada para 503 + retry a cada 15s — sem código novo de gate.

7. **Central NÃO tem esse gate.** `artifacts/central-hub/src/index.ts`: `await ensureSchema()` roda no callback do `app.listen` **sem** `try/catch` e **sem** gate de 503. Um throw ali rejeita o callback async (unhandled) mas o servidor já está escutando e serve o `/api` normalmente — o fail-loud da central precisa de tratamento próprio (ver Escopo, Parte B2).

8. **`logSecurity` grava mas ninguém consome — `artifacts/api-server/src/lib/audit.ts`, linhas 44-60.** `logSecurity(params)` faz `db.insert(securityLogsTable)` e nada mais; não há job, webhook, email ou tela que leia `securityLogsTable` para alertar. Eventos de alto sinal que **já são emitidos** hoje:
   - `rate_limit_exceeded` (severity `high`) — `artifacts/api-server/src/routes/admin.ts:33-34` e `artifacts/api-server/src/middlewares/endpointRateLimit.ts:82`.
   - `account_locked` (severity `high`/`medium`) — `admin.ts:62-63` e `admin.ts:85-86`.
   - `failed_login` (severity `low`/`medium`) — `admin.ts:125`, `admin.ts:218`.
   - **Ausente:** o 401 de ingest **não** emite `logSecurity` hoje — `artifacts/api-server/src/routes/ingest.ts:63` faz `res.status(401).json({ ok:false, error: … "invalid_signature" })` sem registrar o evento. É exatamente o sinal "401 de ingest" que o alerting deveria pegar (tentativa de forjar publicação em nome do blog).

**Risco concreto:** (a) em qualquer ambiente sem `NODE_ENV=production` bem setado, e mesmo em produção nas três rotas do item 3, um `err.message` interno vaza para o cliente (CWE-209) — reconhecimento gratuito para um atacante; (b) um `git pull` que renomeia/quebra uma migração faz o app subir "saudável" e só quebra no primeiro `SELECT` da coluna faltante, em horário aleatório, sem alerta (CWE-703/390); (c) um ataque de força bruta ao login, um flood no ingest ou uma rajada de rate-limit acontece **em silêncio** — o operador só descobre depois (CWE-778 / A09). STRIDE predominante: **I** (information disclosure) + **R/D** (repúdio por falta de trilha / indisponibilidade tardia).

> **Atenuantes existentes (preservar):** o gate `503 db_unavailable` + boot-retry do blog (item 6) já existe e é a base do fail-loud — **não** reescrevê-lo; o `logSecurity`/`logAudit` já grava com `try/catch` fail-open (nunca derruba o request — `audit.ts:27-29,57-59`); `getClientIp` já usa `req.ip` confiável (trust proxy 1). Este PRD **soma** observabilidade e endurece o erro, sem remover nada disso.

---

## Pré-condições

- [ ] Criar branch: `git checkout -b fix/prd-13-robustez-operacional`
- [ ] Rodar e **registrar** o baseline de testes (devem passar ANTES de qualquer mudança). Copiar a saída para o STATUS:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && pnpm run typecheck
  ```
- [ ] Ler estes arquivos ANTES de editar (todos já mapeados neste PRD):
  - `artifacts/api-server/src/app.ts` — fim do pipeline: `app.use("/api", router)` (189), `export default app` (193). É AQUI que entra o handler de erro (DEPOIS de `app.use("/api", router)`).
  - `artifacts/central-hub/src/app.ts` — `app.use("/api", router)` (25), `export default app` (30). Handler entra logo antes do export.
  - `artifacts/api-server/src/routes/admin.ts` — os três leaks: linhas **380**, **474**, **1341**; `logger` já importado (16).
  - `artifacts/api-server/src/lib/ensureSchema.ts` — `statements` (24-71), loop swallow (72-78), header pré-SELECT-crítico (9-13).
  - `artifacts/central-hub/src/lib/ensureSchema.ts` — `STATEMENTS` com `name` (11-306), loop swallow (309-316).
  - `artifacts/api-server/src/index.ts` — `bootWithDb()` (142+), `ensureSchema()` (145), catch do listen (123-132), `scheduleBootRetry` — e o gate em `app.ts:174-187`.
  - `artifacts/central-hub/src/index.ts` — `app.listen` callback com `await ensureSchema()` (sem catch/gate).
  - `artifacts/api-server/src/lib/audit.ts` — `logSecurity` (44-60), `SecurityParams` (32-42), `getClientIp` (69-71).
  - `artifacts/api-server/src/routes/ingest.ts` — o 401 (63) e o entorno (para inserir o `logSecurity` sem quebrar o fluxo HMAC).
  - `artifacts/api-server/src/middlewares/endpointRateLimit.ts:82` — exemplo de chamada `logSecurity` já existente (padrão a espelhar).
  - Um teste existente para copiar o padrão `node --test` com import `.ts` explícito: `artifacts/api-server/test/readingTime.test.ts` (`import { test } from "node:test"; import assert from "node:assert/strict"; import { fn } from "../src/lib/xxx.ts";`). **Não há supertest** no repo — testar **funções puras** e o middleware com `req`/`res` mockados (objetos simples que capturam `status`/`json`), nunca subindo o Express.
- [ ] Confirmar que `security-audit/STATUS.md` existe (criar se não existir — ver "Notas de execução para o agente").

---

## Escopo (ações em ordem)

> **Divisão por pacote/serviço:** Partes A2 (leaks admin.ts), B1 (fail-loud blog), C (alerting) e o handler de erro do blog são **api-server** (deploy → `api`). O handler de erro da central e B2 (fail-loud central) são **central-hub** (deploy → `central-api`). **Nenhum** `lib/*` composite é tocado.

### Parte A — Handler de erro global (ambos os apps) + fim do vazamento de `err.message`

1. **Criar uma função pura de saneamento de erro (testável)** em `artifacts/api-server/src/lib/errorResponse.ts` (novo arquivo):
   - `export function errorResponseBody(err: unknown, isProd: boolean, requestId?: string): { status: number; body: Record<string, unknown> }`.
   - Mapeamento de status: erro com `status`/`statusCode` numérico (ex.: 400/403/413) → usar esse; erro de parse de JSON do body-parser (`err.type === "entity.parse.failed"`) → **400**; payload grande (`err.type === "entity.too.large"`) → **413**; erro de CORS (mensagem contém "não permitida"/"not allowed" vindo do `corsOrigin` cb em `app.ts:72,83`) → **403**; senão → **500**.
   - Corpo em **produção** (`isProd === true`): `{ error: "internal_error", requestId }` (para 500) ou `{ error: <código curto>, requestId }` para 4xx conhecidos — **sem** `err.message`, **sem** `stack`.
   - Corpo em **dev** (`isProd === false`): incluir `message` (e opcionalmente `stack`) para DX.
   - `requestId` vem de `req.id` (o `pinoHttp` já injeta — ver `app.ts:112`).
2. **Substituir os três leaks de `err.message`** em `artifacts/api-server/src/routes/admin.ts` (linhas **380**, **474**, **1341**): trocar `err instanceof Error ? err.message : "<fallback>"` por a **string estática de fallback** (`"AI rewrite failed"` / `"autofill failed"` / `"Erro ao gerar artigo"`) e adicionar, imediatamente antes do `res.status(500).json(...)`, um `logger.error({ err }, "<rota>: falha")` para preservar o detalhe **no log interno**. (Essas rotas capturam e respondem elas mesmas — nunca chegam ao handler global; por isso o fix é no local.)
3. **Registrar o handler de erro global do blog** em `artifacts/api-server/src/app.ts`, **depois** de `app.use("/api", router);` (linha 189) e **antes** de `export default app;` (linha 193): um middleware de **4 argumentos** `app.use((err, req, res, next) => { … })` que:
   - loga o erro completo internamente: `logger.error({ err, reqId: req.id }, "unhandled route error")`;
   - se `res.headersSent` → `return next(err)` (deixa o Express finalizar);
   - senão calcula `const { status, body } = errorResponseBody(err, isProd, req.id)` (usando o `isProd` já definido em `app.ts:11`) e responde `res.status(status).json(body)`.
4. **Registrar o handler de erro global da central** em `artifacts/central-hub/src/app.ts`, **depois** de `app.use("/api", router);` (linha 25) e antes do `export default app;` (linha 30). A central **não** tem o helper do api-server (pacote separado — não importar cross-package): criar um `artifacts/central-hub/src/lib/errorResponse.ts` **espelho** do item 1 (mesma lógica; a central usa Bearer sem cookies, então o ramo CORS é opcional) e registrar o middleware de 4 args igual ao item 3, com `isProd = process.env["NODE_ENV"] === "production"`.

### Parte B — `ensureSchema` fail-loud validado por drift

> **Princípio de segurança do canário:** NÃO transformar "um statement deu erro" em hard-fail (um `ALTER` pode errar por permissão mesmo com a coluna já presente → derrubaria um serviço são). O hard-fail dispara **só** quando a **verificação pós-loop** prova que um objeto **crítico** está **de fato ausente** (drift real). Objetos aditivos que o app degrada com segurança quando ausentes **continuam** apenas `warn`.

5. **Blog — `artifacts/api-server/src/lib/ensureSchema.ts`:**
   - Manter o loop `try/catch → warn` (72-78) **inalterado** (cada statement segue tolerante).
   - Definir, no módulo, uma lista **mínima e conservadora** `CRITICAL_COLUMNS: { table: string; column: string }[]` contendo **apenas** as colunas que o schema Drizzle já referencia em `SELECT` de caminho quente (as que o cabeçalho 9-13 chama de pré-SELECT-crítico) — no mínimo `{ table: "articles", column: "social_title" }` e `{ table: "articles", column: "central_id" }`. Na dúvida sobre uma coluna, **NÃO** incluí-la (mantê-la só-`warn`) — a lista deve ser curta.
   - Após o loop, rodar **uma** query de verificação contra `information_schema.columns` (via `target.execute(sql\`SELECT table_name, column_name FROM information_schema.columns WHERE …\`)`) e montar o conjunto de colunas presentes.
   - Extrair a decisão como **função pura** exportada `export function missingCritical(present: Set<string>, critical: { table: string; column: string }[]): string[]` (retorna os `"table.column"` ausentes) — testável sem DB.
   - Se `missingCritical(...)` retornar não-vazio → **lançar** `Error("[FATAL] schema drift: colunas críticas ausentes: <lista>")`. O throw propaga para `bootWithDb()` (index.ts:145) → catch do listen (123-132) → `scheduleBootRetry()` → gate `503 db_unavailable` (app.ts:174-187). **Não** criar gate novo; reaproveitar o existente.
   - Se vazio → `logger.info("ensureSchema: colunas críticas verificadas")` e seguir (comportamento atual preservado).
6. **Central — `artifacts/central-hub/src/lib/ensureSchema.ts` + `index.ts`:**
   - No `ensureSchema.ts`: manter o loop `warn` (309-316) inalterado; definir `CRITICAL_OBJECTS` **mínimo** (tabelas que o `initStore` lê no boot — no mínimo `blogs`, `central_settings`; validar via `information_schema.tables`); extrair `missingCritical` pura análoga; **lançar** se algum objeto crítico estiver ausente.
   - No `index.ts`: como a central **não** tem gate 503 (evidência item 7), envolver a cadeia de boot do callback do `app.listen` (`await ensureSchema(); await initStore(); …`) em `try/catch`. No `catch`: `logger.error({ err }, "[FATAL] boot da central falhou (schema drift?) — não iniciando workers")`, **não** iniciar os workers (collector/rewriter/etc.) e **degradar**. Escolher UM dos dois modos (documentar no STATUS qual foi usado):
     - **(preferido) Health-gate:** setar um flag de módulo `schemaHealthy=false` e adicionar um middleware leve no topo do `app.ts` da central que, com o flag falso, responde `503 { error: "schema_unhealthy" }` para tudo exceto uma rota `GET /api/health`; agendar um retry (`setTimeout` re-executando a cadeia de boot a cada ~15s, espelhando `scheduleBootRetry` do blog). Assim um serviço que estava são não entra em crash-loop.
     - **(alternativa aceitável) Crash controlado:** `process.exit(1)` — o restart policy do container relança; **só** usar se o compose tiver `restart: unless-stopped` (checar `docker-compose.yml`) para não deixar a central morta.
   - **REVISÃO HUMANA:** esta é a mudança que pode manter a central em 503/retry se um objeto crítico ficar ausente. A lista `CRITICAL_OBJECTS` deve ser **curta** e revisada por humano antes do deploy.

### Parte C — Sink de alerta consumindo `logSecurity`

7. **Criar o sink de alerta** em `artifacts/api-server/src/lib/securityAlert.ts` (novo arquivo):
   - Função pura testável `export function shouldAlert(evt: { eventType: string; severity: string }, minSeverity: "low"|"medium"|"high"|"critical"): boolean` — alerta quando `severity >= minSeverity` (ordem low<medium<high<critical) **ou** `eventType` estiver numa allowlist fixa de alto sinal (`["account_locked","rate_limit_exceeded","ingest_signature_invalid"]`).
   - Função pura de dedupe `export function alertDedupeKey(evt): string` (ex.: `` `${evt.eventType}:${evt.ipAddress ?? "-"}` ``) + um mapa em memória com janela de silêncio (ex.: `ALERT_DEBOUNCE_MS = 300_000`) para **não** floodar (um lockout repetido do mesmo IP gera 1 alerta / 5 min).
   - `export async function dispatchAlert(evt): Promise<void>` — **fail-open** (try/catch que só loga; nunca lança): se `process.env["SECURITY_ALERT_WEBHOOK_URL"]` estiver setado, faz `POST` JSON com um resumo **sem PII sensível** (eventType, severity, route, ipAddress, timestamp — **nunca** senha/token/payload cru); se não estiver setado, é **no-op** (apenas `logger.warn` do evento). Config opcional `SECURITY_ALERT_MIN_SEVERITY` (default `"high"`).
8. **Ligar o sink ao `logSecurity`** em `artifacts/api-server/src/lib/audit.ts` (dentro de `logSecurity`, 44-60): **após** o `db.insert` bem-sucedido, chamar `dispatchAlert(params)` **sem `await` bloqueante** (fire-and-forget: `void dispatchAlert(params).catch(() => {})`) e **dentro** do `try` existente ou num bloco próprio que jamais derrube o request (o alerting é best-effort; o insert do log é a fonte da verdade). Aplicar `shouldAlert`/dedupe **dentro** do `dispatchAlert` (mantém `logSecurity` enxuto).
9. **Emitir `logSecurity` no 401 de ingest** em `artifacts/api-server/src/routes/ingest.ts:63`: antes (ou junto) do `res.status(401)…`, chamar `await logSecurity({ eventType: "ingest_signature_invalid", severity: "high", description: <motivo: invalid_signature|timestamp_skew>, route: "/api/ingest", ipAddress: getClientIp(req) })`. Importar `logSecurity`/`getClientIp` de `../lib/audit.js` se ainda não importados. Isso dá ao alerting o sinal "401 de ingest" (tentativa de forjar publicação). **Não** alterar a lógica HMAC nem o corpo/status da resposta (só adicionar o registro).

### Parte D — Testes

10. **Teste do saneamento de erro (api-server)** em `artifacts/api-server/test/errorResponse.test.ts`:
    - `errorResponseBody(new Error("segredo interno: postgres://user:pass@host"), true)` → `body` **não** contém `"segredo"`/`message`/`stack`; `body.error === "internal_error"`; `status === 500`.
    - `errorResponseBody(mesmo erro, false)` → `body.message` presente (dev expõe).
    - erro `{ type: "entity.too.large" }` → `status === 413`; `{ type: "entity.parse.failed" }` → `status === 400`; erro com mensagem de CORS "não permitida" → `status === 403`.
    - **Middleware com res mockado:** invocar o handler de 4 args com `err`, `req = { id: "abc" }`, e um `res` fake (`{ headersSent:false, status(c){this._c=c; return this}, json(b){this._b=b; return this} }`) sob `isProd=true` → `res._c===500` e `res._b` sem `err.message`.
11. **Teste do fail-loud (api-server e central)** em `artifacts/api-server/test/ensureSchemaDrift.test.ts` e `artifacts/central-hub/test/ensureSchemaDrift.test.ts`:
    - `missingCritical(new Set(["articles.social_title","articles.central_id"]), CRITICAL)` → `[]` (nada ausente → **não** lança).
    - `missingCritical(new Set([]), CRITICAL)` → lista não-vazia (drift → o boot deve lançar).
    - (Sem DB — a função é pura; o throw em si é derivado dela.)
12. **Teste do alerting (api-server)** em `artifacts/api-server/test/securityAlert.test.ts`:
    - `shouldAlert({eventType:"failed_login",severity:"low"}, "high")` → `false`.
    - `shouldAlert({eventType:"account_locked",severity:"high"}, "high")` → `true`.
    - `shouldAlert({eventType:"failed_login",severity:"medium"}, "high")` → `true` só se `eventType` estiver na allowlist? — **não** está → `false` (prova que medium não vaza alerta sem allowlist).
    - `shouldAlert({eventType:"ingest_signature_invalid",severity:"high"}, "high")` → `true`.
    - `dispatchAlert` **sem** `SECURITY_ALERT_WEBHOOK_URL` no ambiente → resolve **sem lançar** (no-op fail-open) — garantir que não faz `fetch`.

---

## Fora de escopo

- **Rate limit ausente (admin/proxy/upload), teto de cota default, bombas sharp/Playwright** — é **PRD-11** (o braço de DoS de F19/AP-8). NÃO tocar em `endpointRateLimit.ts`, `dailyQuota.ts`, `imageTransform.ts`, `renderTemplate.ts`, `uploads.ts` para limites de recurso.
- **RBAC/auditoria da central** — é **PRD-02**. Aqui só se adiciona o handler de erro e o fail-loud da central; **não** adicionar guards de permissão nem trilha de auditoria de ações.
- **Nonce/transação/anti-replay do ingest** — é **PRD-14**. Em `ingest.ts` **só** adicionar o `logSecurity` do 401 (item 9); **não** mexer no HMAC, timestamp skew, idempotência.
- **Backups/durabilidade do pg-blogs** — é **PRD-09**.
- **Segredos em repouso / rotação** — é **PRD-01a/01b**. O `SECURITY_ALERT_WEBHOOK_URL` é config de infra opcional; **NÃO** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`.
- **Tela/consumo de `securityLogsTable` no admin** (dashboard de eventos) — desejável, mas **fora**; este PRD entrega o **sink de alerta** (push), não uma UI de leitura.
- **Não** hardcodar conteúdo/limite por blog na imagem compartilhada (isolamento é por infra; a config de alerta é global via env, não por blog no código).
- **Não** reescrever o gate `503 db_unavailable`/`scheduleBootRetry` do blog — apenas reaproveitá-lo.

---

## Comandos de verificação

```bash
# Rodar a partir da raiz do repo.
cd "c:/Users/Usuario(a) Master/sp011"

# ── Parte A: handler de erro global + fim do leak de err.message ─────────────
# 1) Handler de 4 args registrado nos DOIS apps (cada >=1).
grep -rn "errorResponseBody" artifacts/api-server/src/app.ts artifacts/central-hub/src/app.ts
grep -rn "errorResponseBody" artifacts/api-server/src/lib/errorResponse.ts artifacts/central-hub/src/lib/errorResponse.ts
# 2) Nenhuma rota devolve err.message ao cliente (o padrão vulnerável sumiu).
#    SUCESSO: 0 ocorrências.
grep -rn "err.message" artifacts/api-server/src/routes/admin.ts
#    SUCESSO: o fallback estático permanece nas 3 rotas (>=1 de cada string).
grep -rn "AI rewrite failed\|autofill failed\|Erro ao gerar artigo" artifacts/api-server/src/routes/admin.ts

# ── Parte B: ensureSchema fail-loud validado por drift ──────────────────────
# 3) A função pura de drift e a verificação existem nos dois ensureSchema (cada >=1).
grep -rn "missingCritical\|information_schema" artifacts/api-server/src/lib/ensureSchema.ts
grep -rn "missingCritical\|information_schema" artifacts/central-hub/src/lib/ensureSchema.ts
#    SUCESSO: o hard-fail (throw) existe em cada um (>=1).
grep -rn "schema drift\|throw new Error" artifacts/api-server/src/lib/ensureSchema.ts artifacts/central-hub/src/lib/ensureSchema.ts
#    SUCESSO: a central tem o tratamento de boot (try/catch + gate/exit) — >=1.
grep -rn "schema_unhealthy\|schemaHealthy\|process.exit(1)" artifacts/central-hub/src

# ── Parte C: alerting de segurança ──────────────────────────────────────────
# 4) sink de alerta e enganche no logSecurity (cada >=1).
grep -rn "dispatchAlert\|shouldAlert\|SECURITY_ALERT_WEBHOOK_URL" artifacts/api-server/src/lib/securityAlert.ts
grep -rn "dispatchAlert" artifacts/api-server/src/lib/audit.ts
#    SUCESSO: o 401 de ingest agora emite logSecurity (>=1).
grep -rn "ingest_signature_invalid\|logSecurity" artifacts/api-server/src/routes/ingest.ts

# ── Parte D: testes + typecheck (SUCESSO: 0 failing / sem erro de tipo) ──────
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && node --test
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && pnpm run typecheck

# ── Smoke pós-deploy (VPS) ──────────────────────────────────────────────────
# 5) (VPS) Erro genérico em produção: forçar um 500 numa rota de IA sem provider
#    configurado e confirmar que o corpo NÃO traz err.message/stack:
#    curl -s -X POST https://<dominio>/api/admin/... (rota que cai no 500) | jq .
#    SUCESSO: body = {"error":"internal_error"|"AI rewrite failed",...} sem detalhe interno.
# 6) (VPS) Alerta de segurança: com SECURITY_ALERT_WEBHOOK_URL setado, disparar um
#    lockout de teste (>N logins falhos) e confirmar que UM alerta chega ao webhook.
#    SUCESSO: 1 alerta recebido; repetição no mesmo IP dentro de 5min NÃO duplica.
# 7) (VPS, revisão humana) Fail-loud: NÃO simular drift em produção. Validar em
#    staging/local que, removendo uma coluna crítica, o blog responde 503
#    db_unavailable (e a central responde schema_unhealthy) em vez de 200 com dados errados.
```

> Nota de ambiente: o build do frontend (`vite`) NÃO roda no Windows; nada aqui toca o frontend. **Não há supertest** — os testes exercitam funções puras e o middleware com `res` mockado. `node --test`/`esbuild` do api-server e central-hub rodam localmente no Windows. Reconfirme os números de linha citados com `grep` antes de editar (outro PRD pode ter deslocado).

---

## Critérios de aceite

- [ ] Existe `errorResponseBody` (função pura) em `artifacts/api-server/src/lib/errorResponse.ts` **e** em `artifacts/central-hub/src/lib/errorResponse.ts`, e um middleware de erro de 4 args está registrado **depois** de `app.use("/api", router)` em ambos os `app.ts` — grep ≥1 de `errorResponseBody` em cada `app.ts`.
- [ ] `grep -rn "err.message" artifacts/api-server/src/routes/admin.ts` = **0** (nenhum vazamento de `err.message` na resposta), e as três strings de fallback (`AI rewrite failed`/`autofill failed`/`Erro ao gerar artigo`) permanecem — com `logger.error({ err }, …)` interno em cada uma.
- [ ] Em produção (`isProd=true`), `errorResponseBody` retorna corpo **sem** `message`/`stack` para 500 (`{ error: "internal_error", … }`) e mapeia 400/403/413 corretamente — provado por `errorResponse.test.ts` verde.
- [ ] `ensureSchema` (blog e central) mantém o loop `warn` por statement **e** faz verificação pós-loop via `information_schema`, lançando **só** quando `missingCritical(...)` acusa objeto crítico ausente — grep ≥1 de `missingCritical`/`information_schema`/`throw` em cada, e `ensureSchemaDrift.test.ts` verde (presente→`[]`; ausente→lista).
- [ ] O blog degrada para **503 `db_unavailable`** (via `bootWithDb` throw → boot-retry existente) e a central para o modo de degradação escolhido (`schema_unhealthy` 503 + retry, **ou** `process.exit(1)` com restart policy) — grep ≥1 do marcador de degradação da central.
- [ ] Existe o sink `securityAlert.ts` com `shouldAlert`/`dispatchAlert` fail-open e dedupe; `logSecurity` (audit.ts) chama `dispatchAlert` fire-and-forget; sem `SECURITY_ALERT_WEBHOOK_URL` é no-op — `securityAlert.test.ts` verde.
- [ ] O 401 de ingest (`ingest.ts:63`) emite `logSecurity({ eventType: "ingest_signature_invalid", severity: "high", … })` sem alterar HMAC/status/corpo — grep ≥1.
- [ ] `node --test` verde e `pnpm run typecheck` sem erro em **ambos** `artifacts/api-server` e `artifacts/central-hub`.
- [ ] (Smoke VPS) Registrado no STATUS: (a) rota que dá 500 devolve corpo genérico sem detalhe interno; (b) 1 alerta por lockout com dedupe; (c) validação de fail-loud feita em staging/local (não em produção).

---

## Definition of Done

Mergeado na `main`: (1) handler de erro global de 4 args nos dois apps, respondendo JSON padronizado **sem** `err.message`/stack em produção e logando o detalhe internamente; (2) os três `err.message` de `admin.ts` (380/474/1341) substituídos por fallback estático + `logger.error`; (3) `ensureSchema` (blog e central) fail-loud **validado por drift** — só derruba o health quando um objeto crítico (lista mínima) está de fato ausente, reaproveitando o gate 503+retry no blog e um gate/exit novo na central; (4) sink `securityAlert` fail-open + dedupe enganchado no `logSecurity`, com o 401 de ingest passando a emitir evento de alto sinal; (5) `node --test` verde nos dois pacotes cobrindo saneamento de erro, drift crítico e alerting, e `pnpm run typecheck` sem erro; (6) smoke pós-deploy registrado em `security-audit/STATUS.md` e **revisão humana aprovada** para o fail-loud antes do deploy.

---

## Dependências

- **Nenhuma dependência dura.** Pode rodar em paralelo com qualquer PRD.
- **Complementaridade (não bloqueante) com PRD-11:** ambos derivam de F19/AP-8 mas em braços disjuntos (11 = rate-limit/DoS; 13 = erro global/fail-loud/alerting). Não há sobreposição de arquivos de lógica (11 toca `dailyQuota`/`endpointRateLimit`/`imageTransform`/`renderTemplate`; 13 toca `app.ts`/`ensureSchema`/`audit`/`ingest`). Se ambos forem tocar `admin.ts`, coordenar o merge (11 adiciona rate limit à rota `article-from-url`; 13 corrige o leak da linha 1341 na mesma vizinhança).
- **Sinergia com PRD-02:** o handler de erro da central e o alerting reforçam a observabilidade que o PRD-02 (RBAC/auditoria central) também endereça — mas são independentes.

---

## Prioridade e esforço

- **Prioridade:** **Médio Prazo** (Onda 4) — não está no caminho direto aos 4 ativos inegociáveis, mas é **defesa em profundidade transversal**: reduz vazamento de informação (CWE-209), elimina drift silencioso (CWE-703) e dá visibilidade a incidentes (A09/CWE-778) que hoje passam despercebidos.
- **Esforço:** **Médio** — mudanças em dois pacotes (api-server + central-hub), um refator pequeno para testabilidade (funções puras: saneamento, `missingCritical`, `shouldAlert`), e o gate de degradação novo na central que exige cuidado para não virar crash-loop. Sem migração de dados; sem mudança de auth/segredos.

---

## Plano de rollback

- **Reverter código:** `git revert <hash-do-merge>` do branch `fix/prd-13-robustez-operacional`. Isso remove os handlers de erro, restaura os três `err.message` de `admin.ts`, volta o `ensureSchema` a só-`warn` e desliga o sink de alerta.
- **Rebuild direcionado na VPS** (mapeamento CLAUDE.md §5: `artifacts/api-server` → `api`; `artifacts/central-hub` → `central-api`):
  ```bash
  cd /opt/sp011
  git pull
  docker compose build api central-api
  docker compose up -d api central-api
  ```
- **Mitigação sem revert total:**
  - Se o **fail-loud da central** entrar em 503/retry ou crash-loop por uma lista `CRITICAL_OBJECTS` larga demais: reduzir a lista (remover o objeto que está sendo acusado indevidamente) e redeploy `central-api`; em emergência, comentar o `throw` da verificação (voltando ao só-`warn`) sem reverter o resto do PRD.
  - Se o **fail-loud do blog** deixar `/api` em 503 por drift falso-positivo: idem — reduzir `CRITICAL_COLUMNS`; o boot-retry a cada 15s destrava sozinho quando a coluna existir.
  - Se o **webhook de alerta** floodar: desetar `SECURITY_ALERT_WEBHOOK_URL` (`docker compose up -d --force-recreate api` — restart não relê env_file) → o sink volta a no-op sem tocar código.

---

## Notas de execução para o agente

- Trabalhe **somente neste PRD** (PRD-13). Não misture com 11 (rate-limit/DoS), 02 (RBAC central), 14 (nonce do ingest), 09 (backup), 01a/01b (segredos).
- **Regras do repo a respeitar:** imports de teste com extensão `.ts` explícita; `node --test` dentro do pacote (`artifacts/api-server` e `artifacts/central-hub` separadamente); typecheck por pacote (o filtro da raiz não casa no Windows); **não há supertest** — testar funções puras e o middleware com `res` mockado; nunca unicode literal em regex (usar `\uXXXX`); commit direto na `main` (dev solo, sem PR) só **após** verificação verde e revisão humana do fail-loud.
- **Fonte única:** o helper de saneamento de erro é por-pacote (api-server e central-hub são pacotes distintos, sem lib compartilhada entre eles) — replicar a lógica, não importar cross-package. O `MAX`/lista crítica de cada `ensureSchema` fica no próprio arquivo.
- **Fail-open no alerting é inegociável:** `dispatchAlert` **nunca** pode lançar nem bloquear o request — é fire-and-forget com `try/catch`. O insert do `securityLogsTable` continua sendo a fonte da verdade.
- **Lista crítica mínima e conservadora:** na dúvida, deixe a coluna/tabela como só-`warn`. Um hard-fail por objeto que o app tolera é pior que a lacuna original.
- Se **qualquer** critério de aceite falhar após implementar, **NÃO marque como concluído**: registre o motivo exato (comando, saída, `arquivo:linha`) em `security-audit/STATUS.md` (criar o arquivo se não existir, uma entrada por PRD) e **PARE**.
- Ao concluir com sucesso, atualize `security-audit/STATUS.md` registrando: PRD-13, hashes de commit, resultado dos comandos de verificação, o modo de degradação escolhido para a central (health-gate vs exit), a lista final de objetos críticos de cada `ensureSchema`, e o resultado dos smokes pós-deploy.
- **Sinalização de REVISÃO HUMANA (obrigatória):** o fail-loud (Parte B) pode **impedir um serviço são de servir** (blog em 503, central em 503/exit) se a lista crítica estiver errada ou uma migração falhar transitoriamente no boot. Sinalizar ao operador para revisar a lista `CRITICAL_COLUMNS`/`CRITICAL_OBJECTS` e o modo de degradação da central **antes do merge/deploy**, e validar o comportamento de drift em **staging/local** (nunca simular drift em produção). O `SECURITY_ALERT_WEBHOOK_URL` é infra — combinar com o operador o destino do webhook antes de ativar.
