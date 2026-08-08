# PRD-02 — RBAC do painel central e trilha de auditoria de ações privilegiadas

> **Metadados** — Onda 2 | Prioridade: Quick Win | Esforço: Médio | Dependências: nenhuma | **REVISÃO HUMANA OBRIGATÓRIA (risco de lockout operacional)**
>
> Este PRD é autocontido. O agente que o implementar NÃO precisa da conversa que o gerou: todas as referências de arquivo/linha e comandos estão escritos abaixo. Confirme os números de linha relendo os arquivos (a base de código pode ter mudado desde a redação).

---

## Objetivo

Fechar a fronteira de autorização inexistente no painel central (**F8 / AP-5**): hoje qualquer usuário central autenticado pode gerenciar blogs, rotacionar segredos de ingest e ler/gravar chaves de IA — não há distinção de papel apesar de o campo `role` existir e ser propagado. Este PRD (1) cria e aplica um middleware de autorização por papel (`requireCentralRole`) nas rotas sensíveis, e (2) adiciona uma **trilha de auditoria** persistente (quem executou cada ação privilegiada), tapando a lacuna de **repúdio (STRIDE-R)** do AP-5 — "sem auditoria de quem fez". Não altera o esquema de autenticação (token HMAC nem HMAC de ingest); só adiciona autorização e auditoria.

---

## Contexto / Evidência de origem

**Achado F8 — attack path AP-5** (`security-audit/03-threat-model.md:46`): *"Central → blog / extração de segredos (F8). Usuário central baixo-privilégio (ou token do AP-1) → lê db-config/rotaciona ingest secret/lê chaves → forja ingest e publica em nome do blog, ou conecta ao DB. STRIDE: E, T, I, R (sem auditoria de quem fez)."* Reforçado em `security-audit/03-threat-model.md:24` (trust boundary 3: *"central: **sem fronteira**, F8"*) e `security-audit/03-threat-model.md:59` (tabela STRIDE do central-hub: *"Guards RBAC + trilha de auditoria (02)"*).

Evidências reais lidas neste repo:

- `artifacts/central-hub/src/middlewares/auth.ts:110` — `authMiddleware` é o único guard; valida o token (linha 118), checa `isActive` (linha 139) e popula `req.centralUserId` (linha 144) e `req.centralUserRole` (linha 145).
- `artifacts/central-hub/src/middlewares/auth.ts:126-136` — o `role` vem do **banco** (cache TTL 60s, `centralUsersTable.role`), NÃO do token. `req.centralUserRole` é sempre o valor atual do banco (o token embute `role` em `generateToken` linha 52-57, mas o middleware o ignora para autorização). Logo, mudar `role` no banco reflete em ≤60s, ou imediatamente via `invalidateUserCache` (linha 104).
- `artifacts/central-hub/src/middlewares/auth.ts:88-96` — `req.centralUserId?`/`req.centralUserRole?` já declarados no namespace `Express.Request`.
- `grep -rn "requireRole\|requireAdmin\|requireCentralRole" artifacts/central-hub/src` → **0 ocorrências**: nenhum router consulta `req.centralUserRole`. Todos os routers montam apenas `router.use(authMiddleware)`.
- `lib/central-db/src/schema/central_users.ts:9` — `role: text("role").notNull().default("admin")`. Único campo de papel; sem enum. Na prática todos os usuários existentes têm `role='admin'` (seed: `artifacts/central-hub/src/lib/seed.ts:32-33` cria o primeiro admin com `role: "admin"`; **não existe rota de gestão de usuários que altere papéis**).
- `artifacts/central-hub/src/routes/index.ts:20-30` — routers montados: `/auth`, `/blogs`, `/sources`, `/settings`, `/news`, `/rules`, `/deliveries`, `/usage`, `/logs`, `/stats`, `/social`.

Rotas privilegiadas hoje acessíveis por **qualquer** usuário autenticado (sem checar papel):

- `artifacts/central-hub/src/routes/blogs.ts:12` (`router.use(authMiddleware)`): `POST /` criar blog (linha 47), `PATCH /:id` (linha 85), `DELETE /:id` (linha 111), **`POST /:id/rotate-secret`** rotaciona o segredo de ingest (linha 121, grava `ingestSecretEnc` novo e devolve o segredo em claro na resposta linha 133).
- `artifacts/central-hub/src/routes/settings.ts:9`: `PUT /` grava chaves de IA/segredos (linha 42; campos `openaiApiKey`, `perplexityApiKey`, `apifyToken`, `metaAppSecret`, `bufferApiKey` — linhas 64-69), `POST /gemini-keys|openai-keys|perplexity-keys` adiciona chave ao pool (linha 79), `DELETE /:pool/:hint` remove chave (linha 97), `PUT /prompts` (linha 120). GET só devolve máscara (`maskSettings`, linha 12).
- `artifacts/central-hub/src/routes/sources.ts:11`: `POST /` (linha 27), `PATCH /:id` (linha 52), `DELETE /:id` (linha 68), `POST /:id/run` (linha 81), `POST /run-cycle` (linha 91).
- `artifacts/central-hub/src/routes/rules.ts:8`: `POST /` (linha 26), `PATCH /:id` (linha 53), `DELETE /:id` (linha 75).
- `artifacts/central-hub/src/routes/news.ts:56`: `POST /manual` publica em blogs reais criando 1 entrega por blog (linha 210), `PUT /manual/:id` idem (linha 268), `POST /manual/autofill` gasta IA (linha 386).
- `artifacts/central-hub/src/routes/social.ts:49`: mutações de credenciais por blog que gravam **segredos cifrados** — `PUT /connections/:blogId/buffer` (linha 458, grava `bufferApiKeyEnc`), `PUT /connections/:blogId/meta-app` (linha 508, grava `metaAppSecretEnc`), `POST /meta/oauth/exchange` (linha 597) e `POST /meta/oauth/save` (linha 656, grava `metaAccessTokenEnc`).

Trilha de auditoria hoje: `artifacts/central-hub/src/lib/eventLog.ts:11` (`logEvent`) grava em `central_event_logs`, mas **não registra o usuário autor** — não recebe `userId`, e nenhuma chamada em `blogs.ts`/`settings.ts` inclui quem fez. Portanto ações como "Segredo rotacionado" (`blogs.ts:132`) não têm autor → repúdio (o "R" do AP-5).

**Risco concreto:** um usuário central de baixo privilégio (papel operador, futuro) ou um **token roubado** (cadeia AP-1: XSS no central-web exfiltra `central_token` do localStorage) vira administrador efetivo de todo o ecossistema — rotaciona o segredo de ingest de qualquer blog, lê as flags de chaves de IA e grava chaves novas, cria/remove blogs — e **nada registra quem foi**.

- OWASP: **A01:2021 – Broken Access Control** (falta de autorização por função) e **A09:2021 – Security Logging and Monitoring Failures** (ausência de trilha de quem executou ação privilegiada).
- CWE: **CWE-862** (Missing Authorization), **CWE-306** (Missing Authentication for Critical Function — aqui, autorização), **CWE-778** (Insufficient Logging).
- CVSS aproximado: **~8.1 (Alto)** — escalonamento de privilégio pós-autenticação sobre segredos e integridade dos portais.
- Attack path: **AP-5** (`security-audit/03-threat-model.md:46`).

---

## Pré-condições

- [ ] Criar branch de trabalho:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011"
  git checkout -b fix/prd-02-rbac-central-auditoria
  ```
- [ ] Rodar o baseline de testes do pacote afetado e **registrar o resultado** (PASS/FAIL + contagem) em `security-audit/STATUS.md` na linha do PRD-02, ANTES de editar qualquer arquivo:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub"
  node --test
  ```
- [ ] Compilar o lib composite base e registrar que compila limpo (será alterado — nova tabela):
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/lib/central-db"
  pnpm exec tsc -b
  ```
- [ ] Ler ANTES de editar (confirmar cada linha citada acima):
  - `artifacts/central-hub/src/middlewares/auth.ts` (foco 88-96, 104, 110-147; onde `requireCentralRole` será adicionado)
  - `artifacts/central-hub/src/routes/index.ts` (montagem dos routers)
  - `artifacts/central-hub/src/routes/blogs.ts` (12, 47, 85, 111, 121-134)
  - `artifacts/central-hub/src/routes/settings.ts` (9, 42-74, 78-110, 120-125)
  - `artifacts/central-hub/src/routes/sources.ts` (11, 27, 52, 68, 81, 91)
  - `artifacts/central-hub/src/routes/rules.ts` (8, 26, 53, 75)
  - `artifacts/central-hub/src/routes/deliveries.ts` (16, 99, 119, 134, 181, 220)
  - `artifacts/central-hub/src/routes/news.ts` (56, 210, 268, 386)
  - `artifacts/central-hub/src/routes/social.ts` (49, 458, 481, 492, 508, 527, 597, 656)
  - `artifacts/central-hub/src/lib/eventLog.ts` (padrão fire-and-forget a espelhar no `logAudit`)
  - `artifacts/central-hub/src/lib/ensureSchema.ts` (array `STATEMENTS` linha 11; `central_event_logs` 197-208; padrão `CREATE TABLE IF NOT EXISTS`)
  - `lib/central-db/src/schema/central_event_logs.ts` e `lib/central-db/src/schema/index.ts` (modelo p/ a nova tabela Drizzle + export)
  - `lib/central-db/src/schema/central_users.ts` (campo `role`)
  - `artifacts/central-hub/src/lib/seed.ts` (papel do admin semeado — base do break-glass)
  - `artifacts/central-hub/test/rules.test.ts` (modelo de teste unitário puro, imports `.ts` explícitos)

---

## Escopo (ações em ordem)

> Regras invioláveis: **NÃO** alterar `generateToken`/`verifyToken`/parse do payload nem o HMAC de ingest (F8 é autorização, não autenticação). **NUNCA** gravar valor de segredo na trilha de auditoria — só o **fato** (ação, alvo, autor) e, no máximo, o hint de 4 chars que o código já expõe. Autorização deve ler `req.centralUserRole` (valor do banco, fresco), NUNCA o `role` embutido no token.

### Parte A — Modelo de papéis (definir e documentar)

1. **Definir dois papéis** (`role` em `central_users`): `admin` (acesso total) e `operator` (operacional, sem tocar segredos/estrutura de blogs). Todos os usuários existentes já são `admin` (default do schema + seed) → **aplicar os guards NÃO tranca ninguém**. `operator` nasce sem usuários; é o papel que passa a existir para conceder menos privilégio no futuro.
2. **Registrar a matriz de autorização** neste PRD (tabela abaixo) e replicá-la como comentário no topo do `requireCentralRole` em `auth.ts`. Papéis desconhecidos/legados (`role` fora de `{admin, operator}`) devem ser tratados como **sem privilégio** por `requireCentralRole` — como o default do schema é `admin`, linhas legadas continuam admin; só um `operator` explícito é restringido.

**Matriz (o que cada papel pode):**

| Rota / grupo | admin | operator | Guard a aplicar |
|---|:-:|:-:|---|
| `blogs` POST/PATCH/DELETE, `POST /:id/rotate-secret` | ✅ | ❌ | `requireCentralRole("admin")` |
| `blogs` `POST /:id/test`, `GET /` | ✅ | ✅ | authMiddleware (sem gate extra) |
| `settings` `PUT /`, pools de chave POST/DELETE, `PUT /prompts` | ✅ | ❌ | `requireCentralRole("admin")` |
| `settings` GETs (mascarados), `GET /ai-quota`, `GET /prompts` | ✅ | ✅ | authMiddleware |
| `sources` POST/PATCH/DELETE/run/run-cycle | ✅ | ❌ | `requireCentralRole("admin")` *(política ajustável — ver §Fora de escopo)* |
| `rules` POST/PATCH/DELETE | ✅ | ❌ | `requireCentralRole("admin")` *(idem)* |
| `social` mutações de credencial (`buffer`, `meta-app`, `meta/oauth/exchange`, `meta/oauth/save`) | ✅ | ❌ | `requireCentralRole("admin")` |
| `deliveries` approve/reject/retry/publish-now/cancel; `news` `POST/PUT /manual`, `/manual/autofill` | ✅ | ✅ | authMiddleware (operacional) |
| `usage`, `logs`, `stats`, todas as GET de leitura | ✅ | ✅ | authMiddleware |

### Parte B — Tabela e helper de auditoria

3. **Criar o schema Drizzle da trilha** — novo arquivo `lib/central-db/src/schema/central_audit_log.ts` com a tabela `central_audit_log`, seguindo o estilo de `central_event_logs.ts`:
   - colunas: `id serial PK`, `ts timestamptz notNull defaultNow`, `userId text` (`user_id`), `userEmail text` (`user_email`), `action text notNull` (ex.: `"blog.rotate_secret"`, `"settings.update"`, `"ai_key.add"`, `"news.manual_publish"`), `targetType text` (`target_type` — `"blog"|"settings"|"ai_key"|"news"|"social_connection"`), `targetId text` (`target_id`), `meta jsonb` (**somente fatos não-sensíveis**; nunca valores de segredo).
   - índices: `central_audit_log_ts_idx` em `(ts)` e `central_audit_log_user_ts_idx` em `(user_id, ts)`.
   - exportar `centralAuditLogTable` e os tipos `$inferSelect`/`$inferInsert`.
4. **Exportar a tabela** em `lib/central-db/src/schema/index.ts` (adicionar `export * from "./central_audit_log";`).
5. **Recompilar o lib composite**: `cd lib/central-db && pnpm exec tsc -b` (obrigatório antes de o central-hub enxergar a tabela; `dist` é gitignored).
6. **Adicionar o `CREATE TABLE IF NOT EXISTS` ao boot** — em `artifacts/central-hub/src/lib/ensureSchema.ts`, acrescentar ao array `STATEMENTS` (padrão idêntico ao bloco `central_event_logs` em 197-210) um statement `central_audit_log` + os dois índices. Cada statement é não-fatal (o loop já trata erro). Assim um rebuild cria a tabela sem passo manual.
7. **Criar o helper `logAudit`** — novo arquivo `artifacts/central-hub/src/lib/auditLog.ts`, espelhando o padrão fire-and-forget de `eventLog.ts` (nunca derruba o fluxo; `.catch` loga warn). Assinatura sugerida:
   ```
   logAudit(req, { action, targetType?, targetId?, meta? })
   ```
   Lê `req.centralUserId` (autor) e insere na `central_audit_log`. Extrair uma função **pura** `buildAuditRow({ userId, userEmail, action, targetType, targetId, meta })` (sem I/O) que monta o objeto de insert — para ser testável sem banco e para centralizar a garantia de que `meta` nunca carrega segredo (documentar essa invariante em comentário).

### Parte C — Middleware de autorização

8. **Adicionar `requireCentralRole`** em `artifacts/central-hub/src/middlewares/auth.ts` (co-locado com `authMiddleware`, para reusar tipos). Fábrica que recebe papéis permitidos e devolve um middleware Express **puro** (sem I/O — lê só `req.centralUserRole`):
   - se `req.centralUserRole` ∈ papéis permitidos → `next()`.
   - senão → `res.status(403).json({ error: "Acesso negado. Requer papel: <lista>." })` e **não** chama `next()`.
   - deve ser montado SEMPRE **depois** de `authMiddleware` (que popula `req.centralUserRole`).
   - exportar a função.

### Parte D — Aplicar guards + auditoria nas rotas

> Em cada router, `authMiddleware` continua no `router.use(...)`. Aplicar `requireCentralRole("admin")` **por rota** (2º argumento do handler, ex.: `router.post("/", requireCentralRole("admin"), async (req,res)=>{...})`) nas rotas admin-only da matriz. Adicionar `logAudit(req, {...})` nas ações privilegiadas.

9. **`blogs.ts`** — aplicar `requireCentralRole("admin")` em `POST /` (linha 47), `PATCH /:id` (85), `DELETE /:id` (111), `POST /:id/rotate-secret` (121). Adicionar `logAudit(req, { action, targetType:"blog", targetId })` em: criação (`action:"blog.create"`), remoção (`"blog.delete"`) e rotação (`"blog.rotate_secret"` — **meta sem o segredo**; apenas `{ blogName }`). Deixar `POST /:id/test` e `GET /` sem gate extra.
10. **`settings.ts`** — `requireCentralRole("admin")` em `PUT /` (42), nos POST/DELETE dos pools (`for`-loop, 79 e 97) e em `PUT /prompts` (120). Adicionar `logAudit`: `action:"settings.update"` com `meta:{ changedKeys: <nomes das chaves enviadas, NUNCA valores> }`; `"ai_key.add"`/`"ai_key.remove"` com `meta:{ provider, hint }` (o hint de 4 chars que o código já loga); `"prompts.update"`. GETs sem gate.
11. **`sources.ts`** — `requireCentralRole("admin")` em POST (27), PATCH (52), DELETE (68), `POST /:id/run` (81), `POST /run-cycle` (91). *(Política ajustável — ver §Fora de escopo; default recomendado é admin-only.)*
12. **`rules.ts`** — `requireCentralRole("admin")` em POST (26), PATCH (53), DELETE (75). *(idem política.)*
13. **`social.ts`** — `requireCentralRole("admin")` em `PUT /connections/:blogId/buffer` (458), `DELETE /connections/:blogId/buffer` (481), `DELETE /connections/:blogId/meta` (492), `PUT /connections/:blogId/meta-app` (508), `DELETE /connections/:blogId/meta-app` (527), `POST /meta/oauth/exchange` (597), `POST /meta/oauth/save` (656). `logAudit` em cada uma (`action:"social_connection.update"|"social_connection.delete"`, `targetType:"social_connection"`, `targetId: blogId`, **sem segredo em meta**). Manter `GET /video-file/:name` (35, pública, antes do auth) e as GET de leitura intactas.
14. **`news.ts`** — NÃO adicionar gate de admin (é operacional). Adicionar `logAudit` na publicação manual: em `POST /manual` quando `!isDraft` (linha 228+, `action:"news.manual_publish"`, `targetType:"news"`, `targetId: newsId`, `meta:{ blogIds }`) e em `PUT /manual/:id` quando `publishing` (296+, mesma `action`). Deixar `authMiddleware` na linha 56 e a rota pública de imagem (42) intactos.
15. **`deliveries.ts`** — NÃO adicionar gate de admin (operacional). Opcional: `logAudit` em `publish-now` (181) e `approve` (99). `approve`/`publish-now` já gravam `approvedBy = req.centralUserId` (105, 200) — manter.

### Parte E — Teste + break-glass + STATUS

16. **Criar `artifacts/central-hub/test/rbac.test.ts`** (modelo `rules.test.ts`, `node:test` + `assert/strict`, import `.ts` explícito de `../src/middlewares/auth.ts`). Testar `requireCentralRole` como função pura com req/res/next falsos:
    - `requireCentralRole("admin")` com `req.centralUserRole="operator"` → `res.status(403)` chamado, `next` NÃO chamado.
    - com `req.centralUserRole="admin"` → `next` chamado, sem `res.status`.
    - com `req.centralUserRole` `undefined` → 403.
    - `requireCentralRole("admin","operator")` com `"operator"` → `next` chamado.
    - Se `logAudit` expõe `buildAuditRow`, testar que o objeto montado **não** contém nenhuma chave com valor de segredo (ex.: passar `meta:{ hint:"...1234" }` e afirmar que não há campo com o segredo cru).
17. **Documentar o break-glass anti-lockout** (procedimento do operador, runbook para colar na VPS — sinalizado para revisão humana). Promover um usuário a admin direto no banco central e conferir que existe ≥1 admin ativo (a mudança reflete em ≤60s pelo cache do `authMiddleware`):
    ```bash
    cd /opt/sp011
    EMAIL='COLE_O_EMAIL_DO_USUARIO'
    DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
    docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "UPDATE central_users SET role='admin', updated_at=now() WHERE email='$EMAIL';"
    docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS admins_ativos FROM central_users WHERE role='admin' AND is_active=true;"
    ```
    Sucesso: `admins_ativos >= 1`. (Não há rota de gestão de papéis; papéis mudam só por este caminho ou pelo seed. Documentar que o seed cria `role='admin'`.)
18. **Atualizar `security-audit/STATUS.md`** — criar se não existir; registrar o andamento do PRD-02 (baseline, ações concluídas, itens de operador/revisão humana pendentes).

---

## Fora de escopo

- **Não alterar o esquema de autenticação**: `generateToken`/`verifyToken`/`authMiddleware` (parse do token, TTL, cache, `isActive`) e o **HMAC de ingest** dos blogs ficam intactos. Este PRD é só autorização + auditoria.
- **RBAC do blog** (api-server) — o blog já tem `admin`/`editor` (`requireAdmin`); não é este PRD.
- **Rota/UI de gestão de usuários e papéis** no central (criar operador pela interface, seletor de papel) — fica para PRD próprio. Aqui, papéis mudam só por SQL/seed (break-glass).
- **Revogação/rotação de token** (F14) e mover token do localStorage (AP-1) — PRD-03/04b.
- **Rotacionar segredos** (VAPID/IA/ingest) — PRDs 01a/01b/14.
- **Decisão final sobre `sources`/`rules` serem admin-only vs. operator** — o default recomendado é admin-only (moldam a distribuição de toda a rede), mas é uma **política ajustável**: se o operador precisar mexer em fontes/regras no dia a dia, rebaixar esses dois grupos para `authMiddleware` (operator+admin) é uma mudança de uma palavra por rota. Registrar a decisão em STATUS.md; não bloquear o PRD por isso.
- **Não** remover `logEvent` existente; a trilha de auditoria é **adicional** (a `central_event_logs` continua para eventos de pipeline).

---

## Comandos de verificação

Rodar nesta ordem. Para cada um, o resultado que caracteriza SUCESSO está anotado.

```bash
cd "c:/Users/Usuario(a) Master/sp011"

# 1) O guard existe e é aplicado nas rotas sensíveis (blogs/settings no mínimo).
#    SUCESSO = >= 1 ocorrência em blogs.ts E em settings.ts (e nas demais aplicadas).
grep -rn "requireCentralRole" artifacts/central-hub/src/routes/blogs.ts
grep -rn "requireCentralRole" artifacts/central-hub/src/routes/settings.ts
grep -rn "requireCentralRole" artifacts/central-hub/src/routes | wc -l
# SUCESSO: blogs.ts e settings.ts aparecem; a contagem total cobre também
#          sources/rules/social conforme a matriz.

# 2) O guard foi definido no middleware e é exportado.
grep -n "export function requireCentralRole\|export const requireCentralRole" artifacts/central-hub/src/middlewares/auth.ts
# SUCESSO: imprime a definição exportada.

# 3) Autenticação NÃO foi tocada (HMAC/token intactos). Diff dessas funções vazio.
git diff -- artifacts/central-hub/src/middlewares/auth.ts | grep -E "generateToken|verifyToken|createHmac|TOKEN_TTL_MS|timingSafeEqual"
# SUCESSO: nenhuma dessas linhas aparece como + / - (o diff só ADICIONA
#          requireCentralRole; se aparecer, revisar — não pode mudar auth).

# 4) A trilha de auditoria existe no schema e no boot.
grep -rn "central_audit_log\|centralAuditLogTable" lib/central-db/src/schema
grep -n "central_audit_log" artifacts/central-hub/src/lib/ensureSchema.ts
grep -n "logAudit" artifacts/central-hub/src/lib/auditLog.ts
# SUCESSO: tabela exportada no lib, CREATE TABLE no ensureSchema, helper definido.

# 5) logAudit é chamado nas ações privilegiadas-chave.
grep -rn "logAudit" artifacts/central-hub/src/routes/blogs.ts artifacts/central-hub/src/routes/settings.ts
# SUCESSO: pelo menos rotate-secret/create/delete (blogs) e update/keys (settings).

# 6) Nenhum valor de segredo cru entra na trilha (heurística: meta não recebe
#    os campos de segredo diretamente). Revisão manual do diff de auditLog + rotas.
grep -rn "logAudit" artifacts/central-hub/src/routes | grep -iE "ingestSecret|apiKey|metaAppSecret|accessToken|passwordHash"
# SUCESSO = 0 ocorrências (nenhuma chamada de logAudit passa um segredo).

# 7) lib composite compila (nova tabela).
cd "c:/Users/Usuario(a) Master/sp011/lib/central-db"
pnpm exec tsc -b
# SUCESSO: termina sem erro de tipo.

# 8) Typecheck do central-hub.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub"
pnpm run typecheck
# SUCESSO: 0 erros.

# 9) Testes do central-hub (rbac.test.ts + suíte existente) verdes.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub"
node --test
# SUCESSO: novos testes de requireCentralRole passam; contagem de PASS >= baseline;
#          0 fail.

# 10) STATUS.md atualizado.
cd "c:/Users/Usuario(a) Master/sp011"
grep -n "PRD-02\|02 " security-audit/STATUS.md
# SUCESSO: imprime a linha de status do PRD-02.
```

Verificação de runtime (operador na VPS — objetiva, após deploy do `central-api`): executar UMA ação privilegiada real (ex.: rotate-secret de um blog de teste ou salvar Configurações) e conferir que gerou **exatamente 1 linha nova** com o autor:

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT ts, user_id, action, target_type, target_id FROM central_audit_log ORDER BY ts DESC LIMIT 5;"
# SUCESSO: a ação executada aparece no topo, com user_id preenchido e SEM
#          nenhum valor de segredo na coluna meta.
```

Verificação de 403 (operador, opcional): com um token de usuário `operator` (criado por SQL para teste), `POST /blogs` deve retornar HTTP 403; com token `admin`, 201.

---

## Critérios de aceite

- [ ] `requireCentralRole` definido e exportado em `auth.ts` (comando 2) e aplicado em `blogs.ts` e `settings.ts` no mínimo (comando 1), conforme a matriz da Parte A.
- [ ] `git diff` de `auth.ts` **não** altera `generateToken`/`verifyToken`/HMAC/TTL (comando 3) — só adiciona o guard.
- [ ] Tabela `central_audit_log` existe no schema Drizzle, é exportada (comando 4) e é criada no boot via `ensureSchema` (comando 4).
- [ ] `logAudit` chamado nas ações privilegiadas-chave (rotate-secret, create/delete de blog, update de settings/chaves) (comando 5) e **nenhuma** chamada passa valor de segredo (comando 6).
- [ ] `pnpm exec tsc -b` do `lib/central-db` compila (comando 7) e `pnpm run typecheck` do central-hub passa (comando 8).
- [ ] `node --test` do central-hub verde, com os novos testes de `requireCentralRole` (403 p/ não-admin, next p/ admin) passando; 0 fail (comando 9).
- [ ] Break-glass documentado (Parte E, passo 17) e `admins_ativos >= 1` confirmável; STATUS.md atualizado (comando 10).
- [ ] Runtime: uma ação privilegiada gera exatamente 1 linha em `central_audit_log` com `user_id` preenchido e sem segredo em `meta` (verificação de runtime) — registrado como pendente de operador se não executado localmente.
- [ ] Nenhum valor de segredo real aparece em código, teste, diff ou mensagem de commit.

---

## Definition of Done

Todos os critérios de aceite marcados; na branch `fix/prd-02-rbac-central-auditoria` o commit adiciona `requireCentralRole` (autorização por papel) nas rotas admin-only da matriz sem tocar o esquema de autenticação, cria a tabela `central_audit_log` (schema Drizzle + export + `ensureSchema`) e o helper `logAudit`, instrumenta as ações privilegiadas para registrar autor/ação/alvo **sem segredos**, e inclui `rbac.test.ts` verde. O typecheck do central-hub e o `tsc -b` do `lib/central-db` passam. O break-glass anti-lockout está documentado e sinalizado para revisão humana. A verificação de runtime (1 linha de auditoria por ação, 403 para operador) é condição de fechamento, mas sua execução em produção é do operador sob revisão humana — o agente entrega o código, registra o estado em STATUS.md e não conclui sozinho o que depende da VPS.

---

## Dependências

- **Nenhuma** para começar (Onda 2). Não bloqueia nem é bloqueado.
- **Paralelo** a PRD-01a/01b (segredos em repouso) e PRD-03 (auth do blog / webhook key) — superfícies distintas.
- **Relaciona-se** com AP-1/AP-5: a trilha de auditoria e os guards reduzem o impacto de um token roubado (mitigado à parte por PRD-03/04b, revogação/token fora do localStorage). A gestão de usuários/papéis pela UI é PRD futuro.

---

## Prioridade e esforço

- **Prioridade:** Quick Win (Onda 2) — escalonamento de privilégio Alto (CVSS ~8.1) sobre segredos e integridade da rede, com correção localizada (middleware + tabela aditiva + guards por rota).
- **Esforço:** Médio — toca ~7 arquivos de rota + 1 middleware + 1 helper + 1 schema Drizzle + `ensureSchema` + 1 teste; sem migração destrutiva (tabela aditiva `IF NOT EXISTS`, guards não trancam usuários atuais que já são admin).

---

## Plano de rollback

Reverter na branch (tudo é aditivo — reverter restaura o comportamento anterior):

```bash
cd "c:/Users/Usuario(a) Master/sp011"
# antes de commitar:
git checkout HEAD -- artifacts/central-hub/src lib/central-db/src
# se já houver commit deste PRD:
git revert <hash_do_commit_do_PRD-02>
```

A tabela `central_audit_log` é inofensiva se permanecer (não precisa ser removida no rollback; `ensureSchema` é idempotente).

> **ATENÇÃO — lockout operacional:** se, em produção, um usuário legítimo tomar 403 indevido (ex.: alguém ficou `operator` sem querer, ou papel legado inesperado), **NÃO** reverta o PRD (isso reabre F8). Use o **break-glass** (Parte E, passo 17): promover o usuário a `admin` via SQL no banco central; a mudança reflete em ≤60s pelo cache do `authMiddleware` (ou imediatamente ao reiniciar o `central-api`). Reverter só em falha estrutural (erro de deploy que quebre o login/autorização de todos).

Deploy após merge (serviço afetado = `central-api`, pois muda `artifacts/central-hub` + `lib/central-db`):

```bash
cd /opt/sp011
git pull
docker compose build central-api
docker compose up -d central-api
```

---

## Notas de execução para o agente

- Trabalhar **somente neste PRD (02)**. Não criar UI/rota de gestão de usuários, não mexer em token/HMAC, não rotacionar segredos.
- **Nunca** imprimir, passar para `logAudit`/`meta`, ou commitar valor de segredo (ingest secret, chaves de IA, tokens Meta/Buffer, `passwordHash`). Ao auditar, registrar apenas o fato + hint de 4 chars quando já existir no código.
- Ler `req.centralUserRole` (banco/fresco), **nunca** o `role` do token, para decidir autorização.
- Após alterar `lib/central-db`, rodar `pnpm exec tsc -b` no lib ANTES de typecheckar o central-hub (composite; `dist` gitignored).
- Se **qualquer** critério de aceite falhar após implementar: **NÃO** marcar como concluído. Registrar o motivo exato em `security-audit/STATUS.md` (linha do PRD-02) e **PARAR**.
- Ao concluir com sucesso (comandos 1–10 verdes), atualizar `security-audit/STATUS.md` para `CONCLUÍDO (código) — verificação de runtime/break-glass pendente de operador/revisão humana`.
- Esta mudança **mexe em autorização de dados sensíveis (segredos)** e tem **risco de lockout operacional**: **sinalizar para REVISÃO HUMANA antes do merge/deploy**. Confirmar com o revisor a política de `sources`/`rules` (admin-only vs. operator) e a existência de ≥1 admin ativo antes de subir em produção.
