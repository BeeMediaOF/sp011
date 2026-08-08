# PRD-03 — Fronteiras de auth do blog: webhook key escopada, revogação de token, fail-closed e token do central fora do localStorage

> **Metadados** — Onda 2 | Prioridade: Médio Prazo | Esforço: Médio | Dependências: coordenar com **PRD-01a** (rotação de segredo) e **PRD-02 / PRD-04b** (central-web) | **REVISÃO HUMANA OBRIGATÓRIA** (fail-closed pode auto-bloquear login/admin; mexe em auth)
>
> Este PRD é **autocontido**. O agente que o implementar NÃO precisa da conversa que o gerou: todas as referências de arquivo:linha e comandos estão escritos abaixo. Todos os números de linha foram confirmados por leitura direta do repositório em 2026-07-21.

---

## Objetivo

Fechar quatro furos de fronteira de autenticação no **blog** (api-server) e no **painel central** (central-hub/central-web):

1. A **webhook API key** deixa de conceder **admin global** e passa a autorizar **somente os endpoints de publicação** (`POST /api/publish` e `POST /api/publish/:id`), sem acesso a `/api/admin/*`.
2. Tokens de sessão passam a ser **revogáveis**: trocar a senha OU dar logout invalida tokens emitidos antes; o logout deixa de ser no-op.
3. Os pontos **fail-open** da auth do blog (erro de DB → confia no papel embutido no token; erro de DB no rate limit → libera tudo) viram **fail-closed** com um fallback seguro e break-glass explícito.
4. O token de sessão do **central** sai do `localStorage` (lido pelo XSS do AP-1) e passa a viver em **cookie `HttpOnly`+`Secure`+`SameSite`** (ou memória + refresh curto).

O resultado remove o portador da webhook key como admin global (AP-4), corta o token roubado como sessão perpétua (AP-1/F14) e tira o token do central do alcance de JavaScript malicioso (AP-1/F4).

---

## Contexto / Evidência de origem

Três achados do mapa de riscos (`security-audit/02-mapa-riscos.md`) convergem aqui: **F7**, **F14** e a parte de armazenamento de token de **F4**. Attack paths: **AP-4** (`security-audit/03-threat-model.md:45`) e a cadeia-mãe **AP-1** (`security-audit/03-threat-model.md:42`).

### F7 — Webhook API key concede admin global (`02-mapa-riscos.md:55`)

Evidência real lida:

- `artifacts/api-server/src/middlewares/auth.ts:135-146` — o ramo da webhook key, ao casar o HMAC do token com o da key ativa, faz:
  - `auth.ts:141` → `req.userRole = "admin";`
  - `auth.ts:142` → `req.isWebhookKey = true;`
  - `auth.ts:143` → `next();` (segue como administrador pleno).
- `artifacts/api-server/src/middlewares/permissions.ts:7` — `if (req.userRole === "admin" || req.isWebhookKey) { next(); return; }` — a webhook key **fura toda checagem de permissão** por DOIS caminhos (papel admin embutido **e** flag `isWebhookKey`).
- `artifacts/api-server/src/middlewares/auth.ts:191-197` — `requireAdmin` só compara `req.userRole !== "admin"`; como o ramo da key setou `userRole = "admin"`, a key passa também por `requireAdmin` (ex.: `/api/admin/webhook-key`, `/api/admin/users/*`, retenção, migrações destrutivas).
- Onde a key deveria valer (única intenção legítima): `artifacts/api-server/src/routes/webhook.ts` — montado em `/api/publish` (`artifacts/api-server/src/routes/index.ts:41`); `webhook.ts:70` (`router.post("/", publishRateLimit, authMiddleware, …)`) e `webhook.ts:190` (`router.post("/:id", authMiddleware, …)`). O uso de `req.isWebhookKey` no restante do código é só auditoria: `webhook.ts:103,168,204`. **Nenhum outro endpoint** depende da webhook key (confirmado por `grep -rn "isWebhookKey" artifacts/api-server/src` → só `auth.ts`, `permissions.ts`, `webhook.ts`).

**Risco concreto:** quem obtém a webhook key (vazamento, valor fraco em `WEBHOOK_API_KEY`, log) vira **admin do blog inteiro** — cria/rebaixa usuários, lê/rotaciona a própria webhook key (`webhook-key.ts`), roda retenção/migração destrutiva, altera settings sensíveis. É uma credencial máquina-a-máquina com privilégio máximo. OWASP **A01:2021 – Broken Access Control**; **CWE-269** (Improper Privilege Management), **CWE-266** (Incorrect Privilege Assignment). CVSS aproximado **~8.2 (Alto)**. Attack path **AP-4** (`03-threat-model.md:45`): "Webhook key = admin global; token não-revogável (F14) impede corte".

### F14 — Sem revogação de token; logout no-op; fail-open (`02-mapa-riscos.md:62`)

Evidência real lida:

- `artifacts/api-server/src/middlewares/auth.ts:73-93` — `verifyToken` valida assinatura HMAC e expira só por **TTL de 8h** (`auth.ts:85` → `if (age > 28_800_000) return null; // 8 hours`). Retorna apenas `{ userId, role }` (descarta o timestamp de emissão em `parts[parts.length - 2]`). **Não há** consulta a `passwordChangedAt` nem a versão de token → um token roubado vale 8h **mesmo após troca de senha**.
- `artifacts/api-server/src/routes/admin.ts:285-293` — `POST /api/admin/logout` é **no-op**: só grava auditoria e responde `{ success: true }`; não invalida nada no servidor.
- `artifacts/api-server/src/middlewares/auth.ts:184-188` — **fail-open no erro de DB**: o `catch` da consulta de usuário faz `req.userRole = payload.role` (papel **embutido no token, não verificado no banco**) e `next()`. Um token de editor forjado/antigo com `role=admin` no payload passaria como admin durante qualquer indisponibilidade do banco.
- `artifacts/api-server/src/middlewares/auth.ts:243-271` — `checkRateLimit`; no `catch` (`auth.ts:267-270`) faz `return true` (**fail-open**): durante falha de DB o rate limit de login some → janela de brute force.
- Coluna já existente para suportar a correção: `lib/db/src/schema/users.ts:20` → `passwordChangedAt: timestamp("password_changed_at")`. E ela **já é atualizada** na troca de senha: `artifacts/api-server/src/routes/users.ts:160` (`passwordChangedAt: new Date()`). Não existe `tokenVersion`/`tokensValidFrom`.
- Cache que precisa ser considerado: `artifacts/api-server/src/middlewares/auth.ts:111-123` — `_userCache` guarda `{ status, role }` por 60s; `invalidateUserCache` (`auth.ts:121`) já existe, mas `users.ts` (troca de senha) **não** a chama.

**Risco concreto:** token roubado (via XSS do AP-1, log, backup) é uma sessão de 8h **irrevogável**; a vítima não consegue cortar o acesso trocando a senha nem deslogando. Somado ao fail-open, uma queda de DB rebaixa a auth para "confia no papel do token". OWASP **A07:2021 – Identification and Authentication Failures**; **CWE-613** (Insufficient Session Expiration), **CWE-636** (Not Failing Securely), **CWE-703**. CVSS aproximado **~6.5 (Médio)**. Amplifica AP-1 e AP-4.

### F4 (parte de armazenamento) — token do central em `localStorage` (`02-mapa-riscos.md:52`)

Evidência real lida:

- `artifacts/central-web/src/api.ts:3` → `const TOKEN_KEY = "central_token";`
- `artifacts/central-web/src/api.ts:6` → `return localStorage.getItem(TOKEN_KEY);` — token de sessão **legível por qualquer JavaScript** na página.
- `artifacts/central-web/src/api.ts:10-11` → `setToken` grava/remove em `localStorage`.
- `artifacts/central-web/src/pages/Login.tsx:21` → `setToken(res.token);` (o login recebe o token no corpo JSON e o grava em `localStorage`).
- `artifacts/central-web/src/App.tsx:8,67` — consome `getToken`/`setToken`.
- Backend correspondente: `artifacts/central-hub/src/routes/auth.ts:48-51` — `POST /api/auth/login` devolve `token` no corpo; `artifacts/central-hub/src/routes/auth.ts:101-104` — `logout` é no-op stateless; `artifacts/central-hub/src/middlewares/auth.ts:110-116` — `authMiddleware` lê o token **só** do header `Authorization: Bearer`, sem suporte a cookie; `artifacts/central-hub/src/app.ts` — usa `helmet` + `cors`, **sem `cookie-parser`**.

**Risco concreto:** este é o **passo de exfiltração da cadeia-mãe AP-1** (`03-threat-model.md:42`): "XSS no browser do admin → exfiltra `central_token` do localStorage → … rotaciona segredos/lê chaves/gerencia blogs". Tornar o token `HttpOnly` remove o alvo do JavaScript malicioso mesmo que um XSS ocorra. OWASP **A07:2021** / **A05:2021**; **CWE-522** (Insufficiently Protected Credentials), **CWE-1004** (Sensitive Cookie Without HttpOnly — o inverso do que queremos), **CWE-79** (XSS que explora). CVSS: contribui para a cadeia AP-1 (crítica).

### Coordenação com PRD-01a e re-chaveamento

Rotacionar `SESSION_SECRET` invalida **todos** os tokens de uma vez (revogação bruta, pois os tokens são HMAC assinados com o segredo). Este PRD entrega revogação **fina e rotineira** (por usuário, sem derrubar todo mundo) e **não** depende de rotação de segredo. Não duplicar trabalho: a revogação daqui é o mecanismo do dia a dia; a rotação de segredo (PRD-01a / eventual re-chaveamento) é o "botão de pânico" global. Ver `security-audit/05-estrategia-prd.md:56` ("OVERLAP: 01a ⇄ 03 — coordenar").

---

## Pré-condições

- [ ] Criar branch de trabalho:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011"
  git checkout -b fix/prd-03-fronteiras-auth-blog
  ```
- [ ] Rodar o **baseline de testes** e **registrar PASS/FAIL + contagem** em `security-audit/STATUS.md` (linha do PRD-03) ANTES de editar:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server"
  node --test
  ```
  (Suíte atual em `artifacts/api-server/test/*.test.ts`; imports de teste usam extensão `.ts` explícita. `vitest` não roda no Windows.)
- [ ] Registrar o baseline de typecheck dos pacotes que serão tocados:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/lib/db" && pnpm exec tsc -b
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && pnpm run typecheck
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-web" && pnpm run typecheck
  ```
- [ ] **Ler ANTES de editar** (releia mesmo já estando citado aqui, para não sobrescrever contexto):
  - `artifacts/api-server/src/middlewares/auth.ts` (foco: 73-93 verifyToken; 111-123 cache; 127-197 authMiddleware/requireAdmin; 135-146 ramo webhook; 184-188 fail-open DB; 243-271 checkRateLimit)
  - `artifacts/api-server/src/middlewares/permissions.ts` (linha 7)
  - `artifacts/api-server/src/routes/webhook.ts` (linhas 70 e 190 — onde `authMiddleware` protege o publish; 103/168/204 auditoria)
  - `artifacts/api-server/src/routes/webhook-key.ts` (rotas admin da key)
  - `artifacts/api-server/src/routes/admin.ts` (285-293 logout; 118 emissão de token no login; 296 `router.use(authMiddleware)`)
  - `artifacts/api-server/src/routes/users.ts` (150-178 troca de senha; 160 `passwordChangedAt`)
  - `lib/db/src/schema/users.ts` (20 `passwordChangedAt`)
  - `artifacts/api-server/src/lib/ensureSchema.ts` (linha 39: padrão `ALTER TABLE users ADD COLUMN IF NOT EXISTS …`)
  - `artifacts/central-web/src/api.ts` (1-67), `artifacts/central-web/src/pages/Login.tsx`, `artifacts/central-web/src/App.tsx`
  - `artifacts/central-hub/src/middlewares/auth.ts`, `artifacts/central-hub/src/routes/auth.ts`, `artifacts/central-hub/src/app.ts`
- [ ] Confirmar que `security-audit/STATUS.md` existe (criar se não) e que será atualizado ao final.

---

## Escopo (ações em ordem)

> Regras invioláveis: **NUNCA** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` (deriva a chave AES dos segredos) — isso é outro PRD. **NUNCA** imprimir/commitar valores reais de segredo/token. Preservar o isolamento por infra (não existe `blogId` no app; nada hardcodado por blog).

### Parte A — Escopar a webhook key a publish-only (F7 / AP-4)

**Objetivo da parte:** a webhook key só autoriza os endpoints de publicação; em todo o resto ela é rejeitada; ela **nunca** vira admin nem fura `requirePermission`.

1. **`artifacts/api-server/src/middlewares/auth.ts:135-146`** — **remover o ramo da webhook key de dentro de `authMiddleware`**. `authMiddleware` (middleware genérico usado em `/api/admin/*` e afins) deixa de reconhecer a webhook key: um token que não seja JWT-HMAC válido de usuário cai em `401`. Motivo: a key só pode valer nas rotas de publish, não em qualquer rota protegida por `authMiddleware`.

2. **`artifacts/api-server/src/middlewares/auth.ts`** — **criar e exportar** um middleware dedicado `publishAuth` (nome sugerido) que:
   - (a) calcula o HMAC do token recebido e compara, `timingSafeEqual`, com o HMAC da webhook key ativa (mesma lógica hoje em `auth.ts:137-139`, reaproveitando `getWebhookApiKey()` em `auth.ts:33-37`); se casar, seta **apenas** `req.isWebhookKey = true` (e `req.userId = undefined`) — **não** setar `req.userRole = "admin"` — e chama `next()`;
   - (b) se não casar, **delega** para o fluxo normal de token de usuário (chamar `authMiddleware`), de modo que um editor/admin logado continue podendo publicar por essas rotas.
   Motivo: concentrar o reconhecimento da key só onde ela deve valer, sem conceder papel administrativo.

3. **`artifacts/api-server/src/routes/webhook.ts:70` e `:190`** — trocar `authMiddleware` por `publishAuth` nas duas rotas de publicação (`router.post("/", publishRateLimit, publishAuth, …)` e `router.post("/:id", publishAuth, …)`). Manter `publishRateLimit` e a auditoria `if (req.isWebhookKey)` (linhas 103/168/204) intactas. Motivo: só o publish aceita a key.

4. **`artifacts/api-server/src/middlewares/permissions.ts:7`** — **remover o bypass da webhook key**. Trocar `if (req.userRole === "admin" || req.isWebhookKey) { next(); return; }` por `if (req.userRole === "admin") { next(); return; }`. Motivo: a key não deve furar `requirePermission` (e, com a Parte A itens 1-3, ela nem alcança rotas com `requirePermission`, mas o bypass fica eliminado em defesa em profundidade). **Não** alterar o `catch` de `permissions.ts:19-21`, que já é fail-closed (nega em erro de DB).

5. **Verificar `requireAdmin` (`auth.ts:191-197`)** — nenhuma mudança de código necessária: como a Parte A não seta mais `userRole = "admin"` para a key e a remove de `authMiddleware`, qualquer tentativa da key em rota `requireAdmin` (ex.: `webhook-key.ts`, `users.ts`, retenção em `admin.ts`) resulta em `401` (na camada `authMiddleware`) antes mesmo de `requireAdmin`. Confirmar por teste (Parte E).

### Parte B — Revogação de token e logout efetivo (F14)

**Objetivo da parte:** trocar senha OU logout invalida tokens emitidos antes.

6. **`lib/db/src/schema/users.ts`** — adicionar coluna `tokensValidFrom: timestamp("tokens_valid_from")` (nullable; `null` = sem revogação) à `usersTable`. Motivo: marca de corte para revogação por logout (a troca de senha já dispõe de `passwordChangedAt`).

7. **`artifacts/api-server/src/lib/ensureSchema.ts`** — adicionar, junto ao bloco de `ALTER TABLE users` (padrão da linha 39), a linha idempotente `sql\`ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_valid_from timestamp\``. Motivo: a coluna se autocria no boot (deploy não roda drizzle-kit push — ver CLAUDE.md §2/§17). Após mexer no schema `lib/db`, rodar `pnpm exec tsc -b` no `lib/db` antes de typecheckar o api-server.

8. **`artifacts/api-server/src/middlewares/auth.ts:68-93`** — estender `TokenPayload` com `issuedAt: number` e fazer `verifyToken` devolvê-lo (o timestamp já está em `parts[parts.length - 2]`, hoje descartado). **Não** alterar a verificação de assinatura nem o TTL de 8h (`auth.ts:85`). Motivo: `authMiddleware` precisa saber quando o token foi emitido para comparar com o corte de revogação.

9. **`artifacts/api-server/src/middlewares/auth.ts` (authMiddleware e cache 111-123, 166-183)** — implementar o **teste de revogação**:
   - incluir `passwordChangedAt` e `tokensValidFrom` no `_userCache` (hoje `{ status, role }`, `auth.ts:111`) e na consulta de DB (`auth.ts:167-170`);
   - após validar que o usuário está ativo, calcular `revokedAt = max(passwordChangedAt ?? 0, tokensValidFrom ?? 0)` e, se `payload.issuedAt < revokedAt`, responder `401` (`{ error: "Sessão revogada. Faça login novamente." }`) e retornar.
   Motivo: qualquer token emitido antes da última troca de senha/logout é rejeitado.

10. **`artifacts/api-server/src/routes/admin.ts:285-293` (`POST /logout`)** — tornar o logout **efetivo**: `await db.update(usersTable).set({ tokensValidFrom: new Date() }).where(eq(usersTable.id, req.userId))` e `invalidateUserCache(req.userId)` (função já exportada em `auth.ts:121`); manter a auditoria existente. Motivo: logout passa a cortar as sessões daquele usuário. (Logout aqui é **global por usuário** — aceitável para painel de operador solo.)

11. **`artifacts/api-server/src/routes/users.ts:150-178` (troca de senha)** — após o `UPDATE` que já grava `passwordChangedAt` (`users.ts:160`), chamar `invalidateUserCache(id)` (importar de `../middlewares/auth.js`). Motivo: sem isso, o cache de 60s (`auth.ts:113`) atrasaria a revogação; com a invalidação, o corte é imediato.

12. **(Opcional — NÃO obrigatório)** encurtar o TTL de 8h (`auth.ts:85`) só se um fluxo de refresh token for implementado junto; **caso contrário, manter 8h** para não degradar a UX (logout/re-login manual). Se não implementar refresh, deixar como está e registrar a decisão no STATUS.md. Refresh token completo fica **fora de escopo** deste PRD.

### Parte C — Fail-open → fail-closed (F14) — **REVISÃO HUMANA (pode auto-bloquear)**

**Objetivo da parte:** falha de infra não pode virar bypass de auth nem sumiço do rate limit — mas também não pode causar outage autoinfligido. Fail-safe, não fail-open.

13. **`artifacts/api-server/src/middlewares/auth.ts:184-188`** (catch da consulta de usuário) — **parar de confiar no papel embutido no token**. No erro de DB:
    - se houver entrada **fresca** de `_userCache` para o usuário (dentro do TTL), usar `cached.role`/`cached.status` (comportamento já disponível em `auth.ts:154-164`);
    - se **não** houver cache, **negar** com `503` (`{ error: "Serviço de autenticação indisponível. Tente novamente." }`) — **nunca** setar `req.userRole = payload.role`.
    Motivo: elimina a escalada "DB caiu → papel do token vira verdade". O cache fresco evita derrubar sessões legítimas durante blip curto de DB.

14. **`artifacts/api-server/src/middlewares/auth.ts:243-271` (`checkRateLimit`, catch 267-270)** — trocar o `return true` (fail-open) por um **fallback de rate limit em memória** (mesmo espírito do `checkLoginRateLimit` do central em `artifacts/central-hub/src/middlewares/auth.ts:149-162`): um `Map<ip, {count, resetAt}>` process-local, janela de 1 min, teto `RATE_LIMIT_MAX` (`auth.ts:203`). Se nem o fallback puder decidir, **negar** (retornar `false` → o chamador em `admin.ts:31` responde `429`). Motivo: durante falha de DB, o login continua limitado (fail-closed com fallback), sem abrir brute force e sem travar totalmente logins válidos.

15. **Break-glass explícito (documentar, não ligar por padrão)** — descrever no PRD/STATUS que, se o fail-closed causar bloqueio indevido em produção, a saída controlada é: (a) restaurar o DB/rate-limit; ou (b) reiniciar o serviço para limpar caches; **nunca** reintroduzir o fail-open silencioso. Não criar flag de env que reative o fail-open sem revisão humana.

### Parte D — Token do central fora do localStorage (F4 / AP-1) — **REVISÃO HUMANA; coordenar com PRD-02 e PRD-04b**

**Objetivo da parte:** o `central_token` não é mais legível por JavaScript.

16. **`artifacts/central-hub/src/app.ts`** — adicionar `cookie-parser` (instalar a dependência no `artifacts/central-hub`) e `app.use(cookieParser())` **antes** de `app.use("/api", router)`. Se optar por não usar `cookie-parser`, ler o cookie manualmente do header — mas o parser é o caminho padrão. Ajustar o `cors` (`app.ts:21`) para permitir credenciais quando `CENTRAL_ALLOWED_ORIGINS` estiver setado (`{ origin: allowedOrigins, credentials: true }`); em mesma-origem (Caddy servindo painel e API sob o mesmo host) o cookie já flui sem CORS. Motivo: habilitar cookie de sessão.

17. **`artifacts/central-hub/src/routes/auth.ts:16-52` (`POST /login`)** — no sucesso, **setar o cookie** `central_token` com `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age=28800` (8h, alinhado ao `TOKEN_TTL_MS` em `central-hub/src/middlewares/auth.ts:50`) via `res.cookie(...)`. **Parar de devolver o `token` no corpo** (devolver só `user`) para que o valor nunca chegue ao JavaScript. Motivo: token entregue por canal que o JS não lê.

18. **`artifacts/central-hub/src/middlewares/auth.ts:110-116`** — aceitar o token **do cookie** `central_token` quando o header `Authorization: Bearer` estiver ausente (`const token = bearer ?? req.cookies?.central_token`). Manter o suporte a Bearer para compatibilidade de ferramentas/máquina. Motivo: o middleware passa a validar a sessão via cookie.

19. **`artifacts/central-hub/src/routes/auth.ts:101-104` (`POST /logout`)** — limpar o cookie: `res.clearCookie("central_token", { path: "/" })`. (A revogação server-side stateless do central fica fora deste PRD; aqui basta remover o cookie do browser.) Motivo: logout apaga a credencial no cliente.

20. **`artifacts/central-web/src/api.ts:3-12`** — remover `TOKEN_KEY`/`getToken`/`setToken` baseados em `localStorage`. As chamadas `fetch` (`api.ts:29` e `apiUpload` `api.ts:54`) passam a enviar `credentials: "same-origin"` (o cookie viaja sozinho) e **não** montam mais o header `Authorization` a partir do `localStorage`. Manter o tratamento de `401` (redirect para `/login`). Motivo: o frontend deixa de manipular o token.

21. **`artifacts/central-web/src/pages/Login.tsx:21`** — remover `setToken(res.token)`; após `POST /auth/login` bem-sucedido (que agora seta o cookie), apenas prosseguir para a área logada (guardar o `user` em `artifacts/central-web/src/user.ts`, que já existe, se necessário). **`artifacts/central-web/src/App.tsx:8,67`** — remover os usos de `getToken`/`setToken`; o gating de "logado?" passa a se basear numa chamada a `GET /api/auth/me` (200 = logado) em vez de presença de token no `localStorage`. Motivo: o app não depende mais de token em JS.

22. **CSRF** — com `SameSite=Strict`, requisições cross-site não carregam o cookie, mitigando CSRF para as rotas de escrita. Registrar essa decisão; se algum fluxo legítimo quebrar com `Strict`, avaliar `Lax` + token anti-CSRF (não implementar token anti-CSRF neste PRD salvo necessidade comprovada). Coordenar com **PRD-04b** (DOMPurify/CSP no central-web) e **PRD-02** (RBAC do central): a defesa de saída (04b) reduz a chance do XSS; o cookie `HttpOnly` daqui protege o token mesmo se o XSS ocorrer.

### Parte E — Testes e STATUS

23. **`artifacts/api-server/test/`** — adicionar testes `node --test` (arquivos `*.test.ts`, imports com extensão `.ts` explícita) cobrindo, no mínimo:
    - `verifyToken` devolve `issuedAt` e continua rejeitando assinatura inválida e TTL expirado;
    - lógica de revogação: token com `issuedAt < revokedAt` é rejeitado; `issuedAt > revokedAt` é aceito (testar a função de decisão isolada, sem exigir DB real — extrair um helper puro se necessário);
    - `publishAuth` reconhece a webhook key (seta `isWebhookKey`, **não** seta `userRole="admin"`) e delega ao token de usuário quando a key não casa;
    - `permissions.requirePermission` **não** libera por `isWebhookKey`.
    Onde um teste exigir servidor/DB, documentar como teste de integração manual no STATUS (não forçar dependência de DB no `node --test`).
24. **`security-audit/STATUS.md`** — registrar baseline, ações concluídas por parte, e sinalizar **REVISÃO HUMANA** para as Partes C e D antes de merge/deploy.

---

## Fora de escopo

- **Trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`** ou re-chavear segredos (é PRD-01a / re-chaveamento). A rotação de segredo é a revogação bruta global; aqui entregamos a revogação fina.
- **Refresh tokens** e encurtamento de TTL (item 12 é opcional e só se refresh for feito) — desenho maior, adiado.
- **Token do painel admin do BLOG** (`brasilia-agora`) em storage — este PRD trata só o token do **central** (`central-web`), conforme os arquivos-alvo. O storage do token do blog-admin é candidato a PRD futuro.
- **RBAC do central-hub** (F8) — é o **PRD-02**; aqui só se move o token para cookie (coordenar).
- **DOMPurify/CSP no central-web** (F4 saída) — é o **PRD-04b**.
- **SSRF do `article-from-url`** e demais achados de `admin.ts` (F5) — PRD-06b.
- **Anti-replay/nonce do ingest** (F15) — PRD-14.
- Não alterar o comportamento gracioso do `getWebhookApiKey()` (fallback para `WEBHOOK_API_KEY` do env em `auth.ts:33-37`) além do escopo da Parte A.

---

## Comandos de verificação

Rodar nesta ordem. Para cada comando, o resultado que caracteriza **SUCESSO** está anotado. Rodar da raiz salvo indicação.

```bash
cd "c:/Users/Usuario(a) Master/sp011"

# 1) A webhook key NÃO seta mais papel admin em lugar nenhum da auth.
#    SUCESSO = 0 ocorrências da atribuição `req.userRole = "admin"`.
grep -rn 'userRole *= *"admin"' artifacts/api-server/src/middlewares/auth.ts; echo "rc=$?"
# SUCESSO: rc=1, nenhuma linha (a única atribuição, antes em auth.ts:141, foi removida).

# 2) O bypass da webhook key sumiu do gate de permissões.
#    SUCESSO = 0 ocorrências de isWebhookKey em permissions.ts.
grep -rn "isWebhookKey" artifacts/api-server/src/middlewares/permissions.ts; echo "rc=$?"
# SUCESSO: rc=1, nenhuma linha.

# 3) authMiddleware não reconhece mais a webhook key; existe um middleware dedicado ao publish.
#    SUCESSO = 'publishAuth' (ou nome equivalente) existe em auth.ts E é usado no webhook.ts.
grep -rn "publishAuth" artifacts/api-server/src/middlewares/auth.ts artifacts/api-server/src/routes/webhook.ts
# SUCESSO: aparece na definição (auth.ts) e nas duas rotas de publish (webhook.ts).

# 4) A coluna de revogação por logout existe no schema e no ensureSchema.
grep -rn "tokens_valid_from\|tokensValidFrom" lib/db/src/schema/users.ts artifacts/api-server/src/lib/ensureSchema.ts
# SUCESSO: aparece nos dois arquivos (schema Drizzle + ALTER idempotente).

# 5) verifyToken expõe issuedAt e a revogação é consultada na auth.
grep -rn "issuedAt" artifacts/api-server/src/middlewares/auth.ts
grep -rn "passwordChangedAt\|tokensValidFrom" artifacts/api-server/src/middlewares/auth.ts
# SUCESSO: issuedAt aparece em verifyToken/authMiddleware; a comparação de revogação está presente.

# 6) Logout deixou de ser no-op (grava corte + invalida cache).
grep -rn "tokensValidFrom\|invalidateUserCache" artifacts/api-server/src/routes/admin.ts
# SUCESSO: o handler de POST /logout seta tokensValidFrom e chama invalidateUserCache.

# 7) Troca de senha invalida o cache do usuário.
grep -rn "invalidateUserCache" artifacts/api-server/src/routes/users.ts
# SUCESSO: aparece no handler PUT /:id/password.

# 8) Não há mais fail-open confiando no papel do token no erro de DB.
#    SUCESSO = 0 ocorrências da atribuição do papel embutido no catch.
grep -rn 'req.userRole *= *payload.role' artifacts/api-server/src/middlewares/auth.ts; echo "rc=$?"
# SUCESSO: rc=1, nenhuma linha.

# 9) checkRateLimit não retorna mais 'true' incondicional no catch (fail-open).
grep -n "return true" artifacts/api-server/src/middlewares/auth.ts
# SUCESSO: nenhuma dessas ocorrências está no bloco catch do checkRateLimit (antes em auth.ts:269);
#          o catch agora usa o fallback em memória.

# 10) O token do central saiu do localStorage.
#     SUCESSO = 0 ocorrências de localStorage em central-web/src/api.ts.
grep -n "localStorage" artifacts/central-web/src/api.ts; echo "rc=$?"
# SUCESSO: rc=1, nenhuma linha.

# 11) O backend do central seta/lê/limpa o cookie HttpOnly.
grep -rn "central_token\|res.cookie\|clearCookie\|cookieParser\|req.cookies" artifacts/central-hub/src
# SUCESSO: login seta cookie HttpOnly+Secure+SameSite; authMiddleware lê req.cookies; logout limpa; app.ts usa cookie-parser.

# 12) Login.tsx não grava mais token em JS.
grep -rn "setToken\|localStorage" artifacts/central-web/src/pages/Login.tsx; echo "rc=$?"
# SUCESSO: rc=1, nenhuma linha (setToken removido).

# 13) Typecheck de todos os pacotes tocados (build vite do frontend NÃO roda no Windows — só typecheck).
cd "c:/Users/Usuario(a) Master/sp011/lib/db" && pnpm exec tsc -b
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && pnpm run typecheck
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-web" && pnpm run typecheck
# SUCESSO: os quatro terminam com código 0, sem erros.

# 14) Testes do api-server (baseline + novos) verdes.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
# SUCESSO: 0 fail; contagem de PASS >= baseline registrado nas Pré-condições, com os novos testes de auth.

# 15) STATUS.md atualizado.
cd "c:/Users/Usuario(a) Master/sp011"
grep -n "PRD-03\|03 " security-audit/STATUS.md
# SUCESSO: imprime a linha de status do PRD-03.
```

> Verificações de comportamento (integração, rodadas no ambiente da VPS após deploy, documentadas no STATUS): (a) `curl` com a webhook key em `GET /api/admin/webhook-key` retorna **401/403** (antes: 200); (b) a mesma key em `POST /api/publish` continua **201/200**; (c) após `POST /api/admin/logout`, reusar o token antigo retorna **401**; (d) após trocar a senha de um usuário, um token dele emitido antes retorna **401**; (e) no central, o cookie `central_token` aparece com flags `HttpOnly; Secure; SameSite=Strict` no `Set-Cookie` do login e **não** é acessível via `document.cookie`.

---

## Critérios de aceite

- [ ] `grep -rn 'userRole *= *"admin"' artifacts/api-server/src/middlewares/auth.ts` → 0 ocorrências (comando 1).
- [ ] `grep -rn "isWebhookKey" artifacts/api-server/src/middlewares/permissions.ts` → 0 ocorrências (comando 2).
- [ ] `publishAuth` (ou equivalente) definido em `auth.ts` e usado nas duas rotas de `webhook.ts`; `authMiddleware` não reconhece mais a key (comando 3).
- [ ] Coluna `tokens_valid_from` presente no schema Drizzle e no `ensureSchema.ts` (comando 4).
- [ ] `verifyToken` expõe `issuedAt` e `authMiddleware` compara contra `max(passwordChangedAt, tokensValidFrom)` (comando 5).
- [ ] `POST /logout` grava `tokensValidFrom` e chama `invalidateUserCache` (comando 6); troca de senha chama `invalidateUserCache` (comando 7).
- [ ] Fail-open removido: sem `req.userRole = payload.role` no catch (comando 8) e sem `return true` incondicional no catch do `checkRateLimit` (comando 9).
- [ ] `grep -n "localStorage" artifacts/central-web/src/api.ts` → 0 ocorrências (comando 10); backend do central seta/lê/limpa cookie `HttpOnly` (comando 11); `Login.tsx` não grava token em JS (comando 12).
- [ ] Typecheck dos 4 pacotes com código 0 (comando 13).
- [ ] `node --test` no api-server: 0 fail, com os novos testes de auth (comando 14).
- [ ] `security-audit/STATUS.md` tem a linha do PRD-03 (comando 15).
- [ ] Partes C e D explicitamente **sinalizadas para revisão humana** no STATUS antes de merge/deploy.
- [ ] Nenhum valor real de segredo/token em arquivos, diff ou mensagem de commit.

---

## Definition of Done

Todos os critérios de aceite marcados; na branch `fix/prd-03-fronteiras-auth-blog`:
- a webhook key só autoriza `POST /api/publish` e `POST /api/publish/:id` e recebe 401/403 em qualquer rota admin (verificado por teste unitário e, na VPS, por `curl`);
- trocar senha ou dar logout invalida tokens emitidos antes (verificado);
- os dois pontos fail-open viraram fail-closed com fallback seguro, sem flag que reative o fail-open;
- o `central_token` vive em cookie `HttpOnly`+`Secure`+`SameSite` e não é mais lido do `localStorage` (typecheck + inspeção do `Set-Cookie`);
- `node --test` e os 4 typechecks passam;
- `security-audit/STATUS.md` reflete o estado e as Partes C/D estão marcadas para revisão humana.

Itens que dependem de observação no runtime da VPS (curl com a key, cookie no browser) ficam documentados no STATUS como verificação pós-deploy sob revisão humana — o agente não conclui sozinho o que depende da VPS.

---

## Dependências

- **Coordenar com PRD-01a** (`security-audit/prds/PRD-01a-…`): rotação de `SESSION_SECRET` já é revogação bruta global; a revogação fina daqui é complementar. Não depender de rotação de segredo para revogação rotineira; não derrubar sessões duas vezes.
- **Coordenar com PRD-02** (RBAC do central) e **PRD-04b** (DOMPurify/CSP no central-web) para a Parte D — mesma superfície `central-web`/`central-hub`. Podem correr em paralelo; se PRD-04b já mexer em `api.ts`, alinhar os diffs.
- Não bloqueia nem é bloqueado pelas Partes A/B/C (essas são só api-server + lib/db) — podem ser commitadas antes da Parte D se necessário.

---

## Prioridade e esforço

- **Prioridade:** Médio Prazo (Onda 2). F7/AP-4 é Alto; F14 é Médio; a parte de token do central alimenta a cadeia crítica AP-1.
- **Esforço:** Médio. Partes A/B/C são cirúrgicas no api-server + uma coluna auto-criada em `lib/db`. Parte D é a mais cara (cookie-parser + login/logout/middleware no central-hub + refatoração de `api.ts`/`Login.tsx`/`App.tsx` no central-web) e o frontend só typecheca no Windows (build vite é no Docker da VPS).

---

## Plano de rollback

Por partes, na branch:

```bash
cd "c:/Users/Usuario(a) Master/sp011"
# reverter arquivos específicos ao estado do HEAD (antes do commit):
git checkout HEAD -- \
  artifacts/api-server/src/middlewares/auth.ts \
  artifacts/api-server/src/middlewares/permissions.ts \
  artifacts/api-server/src/routes/webhook.ts \
  artifacts/api-server/src/routes/admin.ts \
  artifacts/api-server/src/routes/users.ts \
  artifacts/api-server/src/lib/ensureSchema.ts \
  lib/db/src/schema/users.ts \
  artifacts/central-hub/src/app.ts \
  artifacts/central-hub/src/middlewares/auth.ts \
  artifacts/central-hub/src/routes/auth.ts \
  artifacts/central-web/src/api.ts \
  artifacts/central-web/src/pages/Login.tsx \
  artifacts/central-web/src/App.tsx

# se já houver commit(s) deste PRD:
git revert <hash_do_commit_do_PRD-03>
```

Notas de rollback:
- A coluna `tokens_valid_from` é aditiva e idempotente (`ADD COLUMN IF NOT EXISTS`) — reverter o código não exige dropar a coluna; ela fica inerte.
- **Parte C (fail-closed):** se, após deploy, o fail-closed bloquear login/admin indevidamente, o rollback correto é **restaurar o DB/rate-limit ou reiniciar o serviço**, NÃO reintroduzir o fail-open. Só reverter o código como último recurso e sob revisão humana.
- **Parte D (cookie):** ao reverter, o central volta a devolver o token no corpo e o `central-web` volta ao `localStorage`. Reverter reexpõe o token ao JavaScript — só reverta em emergência.
- Deploy direcionado por serviço (CLAUDE.md §5): api-server/lib/db → `api`; central-hub → `central-api`; central-web → `central-web`. Mudança de `.env` não se aplica aqui.

---

## Notas de execução para o agente

- Trabalhar **somente neste PRD (03)**. Não iniciar PRD-02 (RBAC central), PRD-04b (DOMPurify) nem PRD-06b (SSRF) — apenas coordenar diffs se colidirem em `central-web/src/api.ts`.
- **Nunca** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`. **Nunca** imprimir/commitar valores reais de webhook key, token ou segredo — usar placeholders.
- Ordem sugerida: Parte A → Parte B → Parte E (testes A/B) → Parte C → Parte D. Rodar o typecheck do pacote tocado após cada parte; após mexer em `lib/db`, `pnpm exec tsc -b` no `lib/db` **antes** de typecheckar o api-server.
- Se **qualquer** critério de aceite falhar após implementar: **NÃO** marcar como concluído. Registrar o motivo exato em `security-audit/STATUS.md` (linha do PRD-03) e **PARAR**.
- Ao concluir com sucesso (todos os comandos verdes que não dependem da VPS), atualizar `security-audit/STATUS.md` para `CONCLUÍDO (código) — verificação de runtime na VPS pendente`.
- **Partes C e D mexem em auth e podem auto-bloquear (fail-closed) ou tocar credencial de sessão (cookie): SINALIZAR PARA REVISÃO HUMANA antes de qualquer merge/deploy.** O agente entrega o código e o runbook de verificação; a validação em produção (curl com a key, inspeção do cookie, teste de bloqueio durante falha de DB) é do operador sob revisão humana.
- Este é um sistema de operador solo: logout "global por usuário" é aceitável; não introduzir complexidade de sessão-por-dispositivo sem pedido explícito.
