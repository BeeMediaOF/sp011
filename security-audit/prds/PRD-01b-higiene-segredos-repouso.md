# PRD-01b — Higiene de segredos em repouso e purge do histórico git

> **Metadados:** Onda 2 | Prioridade: Médio Prazo | Esforço: Médio | Dependências: **PRD-01a** (rotação já concluída) | **⚠️ REVISÃO HUMANA OBRIGATÓRIA** (o passo de purge reescreve o histórico com `git filter-repo` + `force-push`).

---

## Objetivo

Eliminar as três exposições de segredo em repouso que sobraram após a rotação do PRD-01a: (1) `twoFactorSecret` gravado em **texto puro** no banco de cada blog, (2) a criptografia at-rest que **degrada silenciosamente para texto puro** quando não há chave, e (3) o segredo VAPID e o próprio arquivo `.replit` ainda presentes em **todo o histórico git**. Ao final, um segredo TOTP recém-gravado nasce cifrado (`enc:v1:`), a aplicação **falha no boot em produção** sem chave de envelope, e o valor VAPID antigo desaparece do histórico versionado.

---

## Contexto / Evidência de origem

Achados **F16** e **F1**, attack path **AP-7** (`security-audit/03-threat-model.md:48`): *"VAPID versionada e reusada em todos os blogs → forja de push notifications; fallback plaintext → db-config e twoFactorSecret em claro se a chave não estiver setada → comprometimento de tenant + bypass de 2FA. STRIDE: I, S, E. Mitiga: PRD-01a/01b."*

### Frente 1 — `twoFactorSecret` em claro (F16; A02:2021; CWE-312 Cleartext Storage of Sensitive Information; CVSS aprox. 5.9 Médio)
- Coluna definida como texto simples: `lib/db/src/schema/users.ts:26` → `twoFactorSecret: text("two_factor_secret"),` (também refletida em `lib/db/migrations/0000_init.sql:24` e `lib/db/migrations/meta/0000_snapshot.json:103-104`).
- **Ponto de ESCRITA (grava em claro):** `artifacts/api-server/src/routes/admin.ts:149` — rota `POST /2fa/setup`:
  `await db.update(usersTable).set({ twoFactorSecret: secret }).where(eq(usersTable.id, req.userId));` (o `secret` vem de `otpGenerateSecret()` na linha 145, sem cifragem).
- **Pontos de LEITURA (usam o segredo cru na verificação TOTP):**
  - `artifacts/api-server/src/routes/admin.ts:163-166` — `POST /2fa/verify`: seleciona `twoFactorSecret` e chama `otpVerifySync({ ... secret: user.twoFactorSecret, ... })`.
  - `artifacts/api-server/src/routes/admin.ts:182-185` — `POST /2fa/disable`: seleciona `twoFactorSecret` e verifica `secret: user.twoFactorSecret!`.
  - `artifacts/api-server/src/routes/admin.ts:211-214` — `POST /2fa/login`: `select().from(usersTable)` (linha completa) e verifica `secret: user.twoFactorSecret`.
- **Segunda escrita (limpa o segredo, já correta):** `artifacts/api-server/src/routes/admin.ts:187` grava `twoFactorSecret: null` ao desativar — não precisa de cifragem (é `null`).
- Risco concreto: um dump do banco do blog (ou acesso ao `pg-blogs`) expõe o segredo TOTP em claro, permitindo gerar códigos válidos e **burlar o 2FA** de qualquer admin/editor.

### Frente 2 — Cripto que degrada para texto puro (F16; A02:2021; CWE-311 Missing Encryption of Sensitive Data; CVSS aprox. 5.9 Médio)
- `artifacts/api-server/src/lib/crypto.ts:22-38` (`getKey()`): sem `SETTINGS_ENCRYPTION_KEY` **nem** `SESSION_SECRET`, emite apenas um `logger.warn` (linhas 29-35) e retorna `null`.
- `artifacts/api-server/src/lib/crypto.ts:51-60` (`encryptSecret`): com `key === null` retorna o **plaintext inalterado** (linha 54 `if (!key) return plaintext;`).
- Cópia-espelho idêntica em `lib/news-engine/src/crypto.ts:21-37` (getKey/warn), `:50-59` (encryptSecret). Os dois arquivos usam `PREFIX = "enc:v1:"` (`crypto.ts:15`) e o mesmo salt `sbc-settings-enc-v1` (`crypto.ts:16`).
- Risco concreto: uma implantação sem a chave configurada grava `db-config`, tokens Meta, `ingestSecretEnc`, chaves de IA e o `twoFactorSecret` (após a Frente 1) **em claro no banco**, sem interromper o boot — falha silenciosa que anula toda a proteção at-rest.

### Frente 3 — Segredo VAPID no histórico git (F1; A05/A02:2021; CWE-798 Use of Hard-coded Credentials / CWE-321 Use of Hard-coded Cryptographic Key; ATT&CK T1552.001; CVSS aprox. 9.1 Crítico rebaixado a Médio-alto após rotação do PRD-01a)
- `.replit:37-38` contém `VAPID_PUBLIC_KEY` e **`VAPID_PRIVATE_KEY`** em texto puro dentro do bloco `[userenv.shared]` (confirmado por leitura direta do arquivo).
- `.replit` **está versionado**: `git ls-files --error-unmatch .replit` retorna o arquivo; `git log --oneline -- .replit` lista múltiplos commits (o valor está em todo o histórico, não só no `HEAD`).
- `.gitignore` (arquivo lido) **não** ignora `.replit` (só ignora `.env` e `.env.*`, linhas 52-55).
- Referências cruzadas: `security-audit/02-mapa-riscos.md:49` (`.replit:38`, Crít), `security-audit/01-entendimento-sistema.md:50`, `security-audit/04-plano-auditorias.md:56` (F1 → PRD-01a).
- Risco concreto: mesmo após rotacionar o valor (PRD-01a), a chave antiga permanece recuperável no histórico versionado — qualquer clone antigo ou fork mantém a chave privada que assinava push notifications de **todos** os blogs (reuso confirmado em AP-7).

**Observação de escopo confirmada por leitura:** `lib/central-db/src/schema/central_users.ts` (lido na íntegra) **não** possui coluna de segredo 2FA — os usuários do painel central não têm TOTP. A Frente 1 toca **apenas** `lib/db` + `artifacts/api-server`.

---

## Pré-condições

- [ ] **PRD-01a concluído** (rotação do VAPID e da chave de envelope já feita e verificada em `security-audit/STATUS.md`). Sem isso, o purge apenas remove um valor que ainda está ativo — não execute a Frente 3 antes.
- [ ] Criar branch de trabalho:
  ```bash
  git checkout -b fix/prd-01b-higiene-segredos-repouso
  ```
- [ ] Rodar e **registrar** o baseline de testes (deve passar ANTES de qualquer mudança). Comandos exatos:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test "test/**/*.test.ts"
  cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && node --test "test/**/*.test.ts"
  ```
  Anotar em `security-audit/STATUS.md` o resultado (nº de testes passados) como linha de base.
- [ ] Ler ANTES de editar (READ-ONLY):
  - `artifacts/api-server/src/lib/crypto.ts`
  - `lib/news-engine/src/crypto.ts`
  - `artifacts/api-server/src/routes/admin.ts` (bloco 2FA, linhas ~136-224)
  - `lib/db/src/schema/users.ts`
  - `lib/central-db/src/schema/central_users.ts` (confirmar ausência de coluna 2FA)
  - `artifacts/api-server/src/index.ts` (sequência de boot; `resolveDatabase()` na linha 95, `bootWithDb()` na linha 142)
  - `artifacts/central-hub/src/index.ts` (sequência de boot do central)
  - `lib/news-engine/test/crypto.test.ts` (formato dos testes de cripto)
  - `.replit`, `.gitignore`

---

## Escopo (ações em ordem)

> Execute na ordem. As Frentes 1 e 2 são de código (reversíveis por `git revert`). A Frente 3 é destrutiva (reescrita de histórico) e SÓ pode ser executada após aprovação humana registrada — ver Notas de execução.

### Frente 1 — Cifrar `twoFactorSecret` at-rest

1. Em `artifacts/api-server/src/routes/admin.ts`, garantir o import do envelope no topo do arquivo: adicionar `encryptSecret` e `decryptSecret` de `../lib/crypto.js` (confira se já há import de `crypto.js`; se não, criar `import { encryptSecret, decryptSecret } from "../lib/crypto.js";`).
2. Em `artifacts/api-server/src/routes/admin.ts:149` (rota `POST /2fa/setup`), trocar a escrita crua pela cifrada:
   - de `.set({ twoFactorSecret: secret })`
   - para `.set({ twoFactorSecret: encryptSecret(secret) })`.
   Não alterar a linha 150 (`res.json({ secret, qrDataUrl })`) — o `secret` em claro precisa ir para o QR/entrada manual do usuário; só o que é **persistido** é cifrado.
3. Em `artifacts/api-server/src/routes/admin.ts:166` (rota `POST /2fa/verify`), decifrar antes de verificar: trocar `secret: user.twoFactorSecret` por `secret: decryptSecret(user.twoFactorSecret)`.
4. Em `artifacts/api-server/src/routes/admin.ts:185` (rota `POST /2fa/disable`), trocar `secret: user.twoFactorSecret!` por `secret: decryptSecret(user.twoFactorSecret!)`.
5. Em `artifacts/api-server/src/routes/admin.ts:214` (rota `POST /2fa/login`), trocar `secret: user.twoFactorSecret` por `secret: decryptSecret(user.twoFactorSecret)`.
   - **Nota de compatibilidade:** `decryptSecret` é no-op para valores legados em texto puro (não prefixados com `enc:v1:`) — ver `crypto.ts:63-64`. Logo, os passos 3-5 continuam validando corretamente segredos antigos ainda-não-migrados; nada quebra o 2FA de usuários existentes.
6. Criar migração idempotente única para cifrar os segredos já gravados. Adicionar uma função `migrateTwoFactorSecrets()` em novo módulo `artifacts/api-server/src/lib/migrateTwoFactorSecrets.ts` (ou dentro de `ensureSchema.ts`, seguindo o padrão local) que:
   - seleciona todos os usuários com `twoFactorSecret` não nulo;
   - para cada um, se `isEncrypted(value)` for `false` (import de `./crypto.js`), atualiza a linha com `encryptSecret(value)`;
   - é idempotente (rodar de novo não re-cifra o que já tem prefixo `enc:v1:`) e tolerante a re-execução no boot de cada blog replicado.
7. Chamar `migrateTwoFactorSecrets()` dentro de `bootWithDb()` em `artifacts/api-server/src/index.ts`, **após** `await ensureSchema();` (linha 145) e envolto em try/catch com `logger.warn` (não-fatal, mesmo padrão de `migrateJsonContent` nas linhas 171-175) — a migração roda em cada boot mas só escreve enquanto houver valor em claro.

### Frente 2 — Fail-closed permanente da cripto em produção

8. Em `artifacts/api-server/src/lib/crypto.ts`, adicionar e exportar uma função `assertEncryptionConfigured(): void` que:
   - chama `getKey()`; se retornar `null` **e** `process.env["NODE_ENV"] === "production"`, faz `throw new Error("SETTINGS_ENCRYPTION_KEY/SESSION_SECRET ausente em produção — segredos NÃO podem ser gravados em texto puro. Configure a chave de envelope antes de subir.");`
   - fora de produção (dev), apenas retorna (mantendo o `logger.warn` já existente em `getKey()` para não quebrar o desenvolvimento local).
   - **Não** remover nem enfraquecer o fallback dev existente (`getKey` continua retornando `null` em dev). A mudança é só o gate de produção.
9. Replicar a MESMA função `assertEncryptionConfigured()` em `lib/news-engine/src/crypto.ts` (usando `console.warn`/`console.error` como o restante do arquivo). Os dois `crypto.ts` são cópias-espelho e devem permanecer idênticos em lógica (o comentário do topo de cada arquivo documenta esse espelhamento). Após editar, um diff funcional entre os dois deve mostrar apenas a diferença de logger (pino vs console) já existente.
10. Chamar `assertEncryptionConfigured()` no boot do api-server, em `artifacts/api-server/src/index.ts`, **antes** de `await resolveDatabase();` (linha 95) — assim a aplicação recusa subir em produção sem chave antes de tocar o banco.
11. Chamar o equivalente no boot do central em `artifacts/central-hub/src/index.ts` (importando `assertEncryptionConfigured` de `@workspace/news-engine`), no início da sequência de boot, antes de qualquer uso de `encryptSecret`/`decryptSecret`. Confirmar por leitura o ponto exato de boot desse arquivo e inserir a chamada o mais cedo possível.
12. Após mexer em `lib/news-engine` (pacote TS composite), rebuildar o lib antes de typecheckar quem depende:
   ```bash
   cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && pnpm exec tsc -b
   ```

### Frente 3 — Purge do histórico git (⚠️ DESTRUTIVO — só após aprovação humana registrada)

13. Adicionar `.replit` ao `.gitignore` para impedir recommit futuro (acrescentar uma linha `.replit` na seção apropriada, próxima às regras de ambiente nas linhas 52-55). Commitar essa mudança **separadamente** das Frentes 1-2, ainda na branch.
14. **Backup completo do repositório antes de reescrever histórico** (espelho bare, fora da árvore de trabalho):
    ```bash
    cd "c:/Users/Usuario(a) Master" && git clone --mirror "c:/Users/Usuario(a) Master/sp011" "c:/Users/Usuario(a) Master/sp011-backup-prd01b.git"
    ```
    Confirmar que o diretório `sp011-backup-prd01b.git` foi criado e contém `refs/`.
15. Reescrever o histórico removendo `.replit` de **todos** os commits, **preferindo `git filter-repo`** (fallback: BFG). Comando com `git filter-repo`:
    ```bash
    cd "c:/Users/Usuario(a) Master/sp011" && git filter-repo --force --invert-paths --path .replit
    ```
    - Se `git filter-repo` não estiver instalado, instalar (`pip install git-filter-repo`) ou usar BFG: `java -jar bfg.jar --delete-files .replit` seguido de `git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
    - `filter-repo` remove o `origin`; reconfigurar o remote depois: `git remote add origin https://github.com/BeeMediaOF/sp011.git` (ajustar à URL real do remoto).
16. Após a reescrita, **force-push coordenado** para a `main` (janela de manutenção; avisar que todos os clones/CI precisarão re-clonar):
    ```bash
    cd "c:/Users/Usuario(a) Master/sp011" && git push origin --force --all && git push origin --force --tags
    ```
17. Registrar no `STATUS.md` que o valor VAPID antigo foi invalidado no PRD-01a (rotação) e agora removido do histórico — a dupla ação (rotacionar + purgar) é o que efetivamente neutraliza F1.

---

## Fora de escopo

- **NÃO** rotacionar nem gerar novos valores VAPID/`SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` — isso é o PRD-01a (pré-requisito, já feito). Este PRD assume a rotação concluída.
- **NÃO** trocar `SESSION_SECRET` nem `SETTINGS_ENCRYPTION_KEY` — trocar torna ilegíveis todos os segredos já cifrados no envelope AES. Re-chaveamento é o PRD-15 (condicional).
- **NÃO** adicionar coluna/segredo 2FA em `central_users` — o painel central não tem TOTP (confirmado em `lib/central-db/src/schema/central_users.ts`).
- **NÃO** alterar o formato do envelope (`enc:v1:`), o salt (`sbc-settings-enc-v1`) nem o algoritmo (AES-256-GCM) — mexer quebra a compatibilidade com todos os segredos já gravados.
- **NÃO** mexer nos outros consumidores de `encryptSecret`/`decryptSecret` (store do blog, `dbConfig.ts`, rotas `social.ts`, `blogs.ts`, `blogClient.ts`, `videoPublisher.ts`, store do central) — já cifram corretamente; este PRD só adiciona o gate de boot e o caso do TOTP.
- **NÃO** remover o fallback de texto puro em ambiente de desenvolvimento (dev continua funcionando sem chave).

---

## Comandos de verificação

```bash
# --- Frente 1: cifragem do TOTP ---

# (V1) A escrita crua do segredo TOTP não existe mais → deve retornar 0 ocorrências
grep -rn "twoFactorSecret: secret }" "c:/Users/Usuario(a) Master/sp011/artifacts/api-server/src/routes/admin.ts"
# SUCESSO = nenhuma linha impressa (a escrita agora usa encryptSecret(secret))

# (V2) A escrita cifrada está presente → deve retornar >=1 ocorrência
grep -rn "twoFactorSecret: encryptSecret(secret)" "c:/Users/Usuario(a) Master/sp011/artifacts/api-server/src/routes/admin.ts"
# SUCESSO = pelo menos 1 linha impressa

# (V3) Os 3 pontos de verificação TOTP decifram antes de validar → deve retornar 3 ocorrências
grep -rc "decryptSecret(user.twoFactorSecret" "c:/Users/Usuario(a) Master/sp011/artifacts/api-server/src/routes/admin.ts"
# SUCESSO = contagem == 3 (rotas /2fa/verify, /2fa/disable, /2fa/login)

# (V4) A migração idempotente existe e é chamada no boot
grep -rn "migrateTwoFactorSecrets" "c:/Users/Usuario(a) Master/sp011/artifacts/api-server/src/index.ts"
# SUCESSO = pelo menos 1 linha (chamada dentro de bootWithDb, após ensureSchema)

# --- Frente 2: fail-closed em produção ---

# (V5) A função de asserção existe nas DUAS cópias de crypto.ts
grep -rln "assertEncryptionConfigured" "c:/Users/Usuario(a) Master/sp011/artifacts/api-server/src/lib/crypto.ts" "c:/Users/Usuario(a) Master/sp011/lib/news-engine/src/crypto.ts"
# SUCESSO = os DOIS caminhos impressos

# (V6) A asserção é chamada no boot dos dois serviços
grep -rn "assertEncryptionConfigured" "c:/Users/Usuario(a) Master/sp011/artifacts/api-server/src/index.ts" "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub/src/index.ts"
# SUCESSO = >=1 linha em CADA arquivo

# (V7) Rebuild do lib composite (news-engine) sem erro
cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && pnpm exec tsc -b
# SUCESSO = exit code 0, sem erros de TS

# (V8) Typecheck dos pacotes tocados
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && pnpm run typecheck
# SUCESSO = ambos exit code 0

# (V9) Testes de cripto e demais suites — devem passar
cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && node --test "test/**/*.test.ts"
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test "test/**/*.test.ts"
# SUCESSO = 0 failing em ambos (igual ou melhor que o baseline registrado nas pré-condições)

# --- Frente 3: purge do histórico (rodar SÓ após aprovação humana e backup) ---

# (V10) .replit está ignorado no working tree
grep -n "^\.replit$" "c:/Users/Usuario(a) Master/sp011/.gitignore"
# SUCESSO = 1 linha impressa

# (V11) .replit não existe mais em NENHUM commit do histórico (após purge + force-push)
cd "c:/Users/Usuario(a) Master/sp011" && git log --all --oneline -- .replit
# SUCESSO = nenhuma linha impressa (arquivo purgado de todo o histórico)

# (V12) O valor VAPID antigo não aparece em nenhum diff do histórico.
#   NÃO cole o valor real aqui: extraia-o do backup para uma variável de ambiente e busque por ela.
#   Ex.: OLD_VAPID="$(...)"   # trecho da VAPID_PRIVATE_KEY antiga, nunca literal no comando/commit
cd "c:/Users/Usuario(a) Master/sp011" && git log --all -p -S "$OLD_VAPID" | head -n 5
# SUCESSO = saída vazia (o valor não consta em nenhum commit)
```

---

## Criterios de aceite

- [ ] (V1) `grep` da escrita crua `twoFactorSecret: secret }` em `admin.ts` retorna **0 ocorrências**.
- [ ] (V2) `grep` de `twoFactorSecret: encryptSecret(secret)` retorna **>=1**.
- [ ] (V3) `grep -c` de `decryptSecret(user.twoFactorSecret` em `admin.ts` retorna **3**.
- [ ] (V4) `migrateTwoFactorSecrets` é referenciado em `index.ts` do api-server (chamada no boot, pós-`ensureSchema`).
- [ ] Observação objetiva no banco: após gravar um novo 2FA via `/2fa/setup`, `SELECT two_factor_secret FROM users WHERE ...` retorna um valor que **começa com `enc:v1:`** (verificar em um blog de teste; não usar em banco de produção sem revisão).
- [ ] (V5) `assertEncryptionConfigured` existe nas duas cópias de `crypto.ts`.
- [ ] (V6) `assertEncryptionConfigured` é chamada no boot de `api-server/src/index.ts` **e** `central-hub/src/index.ts`.
- [ ] Observação objetiva do fail-closed: subir o api-server com `NODE_ENV=production` e **sem** `SETTINGS_ENCRYPTION_KEY`/`SESSION_SECRET` faz o processo **falhar no boot** (throw) — e subir sem `NODE_ENV=production` (dev) continua funcionando com o warning.
- [ ] (V7) `pnpm exec tsc -b` do `lib/news-engine` conclui sem erro.
- [ ] (V8) `pnpm run typecheck` de api-server e central-hub concluem sem erro.
- [ ] (V9) `node --test` de `lib/news-engine` e `artifacts/api-server` sem falhas (>= baseline).
- [ ] (V10) `.replit` presente no `.gitignore`.
- [ ] (V11) `git log --all --oneline -- .replit` retorna **0 linhas** (só após purge aprovado).
- [ ] (V12) `git log --all -p -S "$OLD_VAPID"` retorna **vazio** (só após purge aprovado).

---

## Definition of Done

Frentes 1 e 2 mergeadas na `main` com todos os critérios V1-V9 e as observações de banco/boot satisfeitos; `.replit` no `.gitignore` (V10). A Frente 3 (purge + force-push, V11-V12) só é considerada Done após: aprovação humana registrada, backup-espelho criado, execução do `git filter-repo`, force-push coordenado e confirmação de que os critérios V11-V12 passam. `security-audit/STATUS.md` atualizado marcando PRD-01b como concluído (ou registrando o motivo da parada, se algum critério falhar).

---

## Dependencias

- **PRD-01a** (rotação de VAPID + chave de envelope) — **deve vir antes**. O purge do histórico só é seguro depois que o valor exposto já foi rotacionado e o antigo invalidado. Referência de dependência: `security-audit/05-estrategia-prd.md:29` e grafo em `:54` (`01a ─► 01b`).
- **Overlap com PRD-03** (revogação de token / fail-closed de auth do blog): PRD-01a rotaciona `SESSION_SECRET`, do qual a chave de envelope deriva — coordenar para não colidir com este PRD e o 03 (nota em `05-estrategia-prd.md:56`). Não é bloqueio, mas evitar rodar simultaneamente com troca de `SESSION_SECRET`.

---

## Prioridade e esforco

- **Onda 2 | Médio Prazo | Esforço Médio.**
- Frentes 1 e 2 são de baixo/médio esforço e reversíveis. A Frente 3 concentra o risco (reescrita de histórico + force-push) e exige janela coordenada + revisão humana.

---

## Plano de rollback

- **Frentes 1 e 2 (código):** reverter os commits da branch/main.
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011" && git revert <hash-do-commit-frente1-2>
  ```
  Reconstruir e redeployar os serviços afetados: `api` (api-server + lib/db) e `central-api` (central-hub + lib/news-engine) — ver mapeamento em CLAUDE.md §5. Como `decryptSecret` é no-op para valores legados e a migração só cifra o que estava em claro, reverter o código não corrompe segredos já cifrados (eles continuam legíveis enquanto a chave de envelope não mudar).
- **Frente 3 (purge — reescrita de histórico):** restaurar a partir do espelho bare criado no passo 14.
  ```bash
  cd "c:/Users/Usuario(a) Master" && rm -rf sp011-restore && git clone "c:/Users/Usuario(a) Master/sp011-backup-prd01b.git" sp011-restore
  # e, se o force-push já tiver ido para o remoto, restaurar o remoto a partir do espelho:
  cd "c:/Users/Usuario(a) Master/sp011-backup-prd01b.git" && git push origin --force --all && git push origin --force --tags
  ```
  ⚠️ Rollback de force-push é caótico se outros já re-clonaram — por isso a Frente 3 exige janela e aviso. O backup-espelho é a única rede de segurança; não apagá-lo até a Frente 3 estar estável.

---

## Notas de execucao para o agente

- Trabalhar **somente** neste PRD. Não abrir escopo para outros achados (F1 além do purge, RBAC, SSRF etc. têm PRDs próprios).
- **Ordem obrigatória:** implementar e verificar Frentes 1 e 2 (código, reversível) **primeiro**. Só depois, e apenas com **aprovação humana explícita registrada**, executar a Frente 3 (purge).
- **Este PRD toca autenticação (2FA), segredos e reescrita de histórico** → **sinalizar para REVISÃO HUMANA antes do merge/deploy** e, para a Frente 3, antes de qualquer `git filter-repo`/`force-push`. Não executar force-push por conta própria.
- Se **qualquer** critério de aceite falhar após a implementação: **não** marcar o PRD como concluído. Registrar em `security-audit/STATUS.md` qual critério falhou, o comando exato e a saída observada, e **PARAR**.
- Ao concluir com sucesso (Frentes 1-2 no mínimo; Frente 3 se aprovada): atualizar `security-audit/STATUS.md` marcando PRD-01b (e o estado da Frente 3, se ainda pendente de janela).
- Não incluir valores de segredo reais em nenhum comando, log, commit ou no STATUS.md — na verificação V12 usar variável de ambiente extraída do backup, nunca o literal.
- Após mexer em `lib/news-engine` (TS composite), sempre `pnpm exec tsc -b` no lib antes de typecheckar api-server/central-hub. O `vite build` do frontend não roda no Windows; nada aqui depende dele.
