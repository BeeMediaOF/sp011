# PRD-01a — Incidente: rotação de segredo exposto (VAPID) e confirmação da chave de envelope

> **Metadados** — Onda 0 | Prioridade: Quick Win | Esforço: Baixo | Dependências: nenhuma | **REVISÃO HUMANA OBRIGATÓRIA (mexe em segredo vivo)**
>
> Este PRD é autocontido. O agente que o implementar NÃO precisa da conversa que o gerou: todas as referências de arquivo/linha e comandos estão escritos abaixo.

---

## Objetivo

Neutralizar imediatamente a exposição de uma **chave privada VAPID real versionada no repositório** (`.replit:38`), reusada em todos os blogs, tratando o caso como **incidente**: rotacionar a chave (gera par novo por blog), retirar o valor do arquivo versionado, impedir novo versionamento e corrigir a documentação que mandava reusar a mesma chave. Em paralelo, confirmar que a chave de envelope (`SETTINGS_ENCRYPTION_KEY` ou, no mínimo, `SESSION_SECRET`) está definida em produção para que `crypto.ts` NÃO caia no fallback de texto puro.

A rotação neutraliza o abuso mesmo que o histórico git ainda contenha o valor antigo; o **purge do histórico é o PRD-01b (separado)** e NÃO faz parte deste PRD.

---

## Contexto / Evidência de origem

**Achado F1 (attack path AP-7).**

Evidências reais lidas neste repo:

- `.replit:37` — `VAPID_PUBLIC_KEY = "BO72XOWG...PO6gA"` (chave pública; é reusada por todos os blogs).
- `.replit:38` — `VAPID_PRIVATE_KEY = "<VALOR PRIVADO REAL>"` — **chave privada VAPID em texto puro, versionada** (bloco `[userenv.shared]` que começa em `.replit:36`). O valor real NÃO é reproduzido neste documento por política de segurança.
- `git ls-files -- .replit` → o arquivo `.replit` **está rastreado** pelo git (qualquer leitor do repo lê a chave privada).
- `.gitignore` (lidas as 56 linhas) — há um bloco `# Replit` (linhas 47–49: `.cache/`, `.local/`, `artifacts/api-server/data/store.json`), mas **`.replit` NÃO está ignorado**.
- `README_DEPLOY_HOSTINGER.md:92` — tabela manda `VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY | copie de [.replit](.replit) (push)`.
- `README_DEPLOY_HOSTINGER.md:324` — checklist final: `[ ] VAPID_* copiadas do .replit (push notifications)`.
- `.env.example:69` — comentário `# Reaproveite as chaves VAPID já existentes do projeto.` (linhas 70–71: `VAPID_PUBLIC_KEY=` / `VAPID_PRIVATE_KEY=`). Guia de reuso da MESMA chave em toda instância.
- `deploy/blog-template/.env.example:42` — **modelo já correto** a seguir: `# ── Web Push (opcional; gere um par NOVO por blog: npx web-push generate-vapid-keys)`.

Onde a chave VAPID é efetivamente usada (para mapear o que reconfigurar):

- `artifacts/api-server/src/routes/push.ts:10-11` — lê `process.env["VAPID_PUBLIC_KEY"]` / `process.env["VAPID_PRIVATE_KEY"]`.
- `artifacts/api-server/src/routes/push.ts:14-16` — `webpush.setVapidDetails(...)` só se ambas presentes.
- `artifacts/api-server/src/routes/push.ts:19-21` — `GET /api/push/vapid-public-key` devolve `{ publicKey: VAPID_PUBLIC }` ao frontend.
- `artifacts/api-server/src/routes/push.ts:57-58` — `sendPushToAll(...)` faz early-return se qualquer VAPID vazia (comportamento gracioso: sem chave, push apenas não dispara).
- `artifacts/brasilia-agora/src/components/PushSubscribeButton.tsx:4,53,56-58` — o navegador busca a chave pública em `/api/push/vapid-public-key` e chama `pushManager.subscribe({ applicationServerKey })`. Trocar a chave pública **invalida as `push_subscriptions` existentes** — os navegadores precisam se re-inscrever com a nova chave.

Confirmação do risco de envelope (liga com F16):

- `artifacts/api-server/src/lib/crypto.ts:22-38` — `getKey()` deriva a chave AES-256-GCM de `process.env["SETTINGS_ENCRYPTION_KEY"] || process.env["SESSION_SECRET"] || ""`; se ambas vazias, emite `logger.warn("Nenhuma SETTINGS_ENCRYPTION_KEY/SESSION_SECRET definida — segredos do banco NÃO serão criptografados.")` e retorna `null` → **segredos gravados em texto puro** (F16).

**Risco concreto:** qualquer leitor do repositório (colaborador, vazamento de clone, insider) usa a `VAPID_PRIVATE_KEY` para **forjar/assinar Web Push autenticadas em nome de todos os blogs** (mesmo par reusado) — spoofing/phishing via notificação, e envio para toda a base de inscritos. Se `SETTINGS_ENCRYPTION_KEY`/`SESSION_SECRET` não estiverem definidas em produção, os segredos do banco (chaves de IA, `centralIngestSecret`, tokens Meta) e o `db-config.enc` ficam em claro.

- OWASP: **A05:2021 – Security Misconfiguration** / **A02:2021 – Cryptographic Failures**.
- CWE: **CWE-798** (Use of Hard-coded Credentials), **CWE-321** (Use of Hard-coded Cryptographic Key), **CWE-312/CWE-540** (Cleartext Storage / Information in Source Code).
- CVSS aproximado: **~9.1 (Crítico)** — conforme `security-audit/04-plano-auditorias.md:56`.
- Attack path: **AP-7** (`security-audit/03-threat-model.md:48`) — "Segredos em repouso/VCS (F1/F16). VAPID versionada e reusada em todos os blogs → forja de push notifications; fallback plaintext → db-config e twoFactorSecret em claro".

---

## Pré-condições

- [ ] Criar branch de trabalho:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011"
  git checkout -b fix/prd-01a-rotacao-segredo-vapid
  ```
- [ ] Rodar o baseline de testes do pacote que contém o consumidor VAPID e **registrar o resultado** (este PRD não altera código de runtime, então o baseline deve permanecer idêntico ao final):
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server"
  node --test
  ```
  Registre "PASS/FAIL + contagem" em `security-audit/STATUS.md` (linha do PRD-01a) antes de editar qualquer arquivo.
- [ ] Ler ANTES de editar (todos já confirmados neste PRD; releia para não sobrescrever contexto):
  - `.replit` (foco nas linhas 34–41; bloco `[userenv.shared]` 36–38)
  - `.gitignore` (56 linhas; bloco `# Replit` 47–49)
  - `README_DEPLOY_HOSTINGER.md` (linhas 79–98 e checklist final ~313–326)
  - `.env.example` (linhas 68–71)
  - `deploy/blog-template/.env.example` (linhas 42–44) — modelo correto de referência
  - `artifacts/api-server/src/routes/push.ts` (linhas 10–21, 57–58)
  - `artifacts/api-server/src/lib/crypto.ts` (linhas 22–38)
- [ ] Confirmar que `security-audit/prds/` existe (este arquivo já está nela) e que `security-audit/STATUS.md` será criado/atualizado ao final.

---

## Escopo (ações em ordem)

> Regras invioláveis para todo o escopo: **NUNCA** imprimir/colar o valor real de qualquer segredo em comandos, logs, commits ou neste repo. **NUNCA** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` (isso re-chavearia os segredos cifrados — fora do escopo deste PRD). A rotação de chave de produção é executada pelo operador na VPS (runbook abaixo), sob revisão humana.

### Parte A — Código/repo (o agente executa e commita)

1. **`.replit`** — remover do arquivo de trabalho o **bloco de segredo VAPID**: apagar as linhas `VAPID_PUBLIC_KEY = "..."` (`.replit:37`) e `VAPID_PRIVATE_KEY = "..."` (`.replit:38`) e o cabeçalho `[userenv.shared]` (`.replit:36`) que ficaria vazio. Manter `[userenv]` (`.replit:34`) e `[nix]` (`.replit:40`) intactos. Resultado: `grep -n "VAPID" .replit` deve retornar 0 ocorrências. (Motivo: a chave privada não pode permanecer no arquivo, nem mesmo local; a app lê VAPID do `.env`, não do `.replit`, em produção.)

2. **`.gitignore`** — adicionar `.replit` à seção `# Replit` (após a linha `# Replit`, linha 47), para impedir que o arquivo volte a ser versionado. Não remover as entradas existentes. (Motivo: `.replit` é config exclusiva do ambiente Replit e não deve versionar segredos.)

3. **`git rm --cached .replit`** — parar de rastrear o arquivo sem apagá-lo do disco:
   ```bash
   cd "c:/Users/Usuario(a) Master/sp011"
   git rm --cached .replit
   ```
   Resultado esperado: `git ls-files -- .replit` deve retornar vazio (0 linhas). (Motivo: neutralizar a exposição no working tree/índice; o purge do histórico fica no PRD-01b.)

4. **`README_DEPLOY_HOSTINGER.md:92`** — trocar a instrução de reuso. Substituir o valor da coluna de `VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY` de `copie de [.replit](.replit) (push)` por: **gerar um par NOVO com `npx web-push generate-vapid-keys` (nunca reusar entre blogs)**. (Motivo: a doc mandava propagar a mesma chave privada.)

5. **`README_DEPLOY_HOSTINGER.md:324`** — no checklist final, trocar `[ ] VAPID_* copiadas do .replit (push notifications)` por `[ ] VAPID_* GERADAS novas para esta instância (npx web-push generate-vapid-keys)`. (Motivo: mesma razão do item 4.)

6. **`.env.example:69`** — trocar o comentário `# Reaproveite as chaves VAPID já existentes do projeto.` por instrução de gerar par novo por instância (`# Gere um par NOVO por instância: npx web-push generate-vapid-keys — nunca reuse a mesma chave entre blogs.`), alinhando com `deploy/blog-template/.env.example:42`. Não alterar as linhas 70–71 (`VAPID_PUBLIC_KEY=` / `VAPID_PRIVATE_KEY=` vazias). (Motivo: o `.env.example` também induzia reuso.)

7. **`security-audit/STATUS.md`** — criar (se não existir) e registrar o andamento do PRD-01a (baseline, ações concluídas, itens que dependem do operador na VPS). Formato sugerido: uma linha por PRD com estado (`EM ANDAMENTO` / `CONCLUÍDO (código)` / `BLOQUEADO: <motivo>`).

### Parte B — Runbook de produção (REVISÃO HUMANA — o operador executa na VPS; o agente apenas documenta e não colhe segredos)

> O agente NÃO executa esta parte automaticamente. Escrever estes passos como bloco pronto para o operador colar, seguindo o padrão do repo (cd no início, valor do usuário como variável no topo, sem heredoc, grep de conferência no fim). Sinalizar para revisão humana antes de aplicar em produção.

8. **Rotacionar VAPID por blog** — para o blog mãe (`/opt/sp011`) e para CADA blog replicado (`/opt/blogs/<id>`), gerar um par NOVO e independente:
   ```bash
   # gera um par NOVO (rode uma vez por blog; NÃO reuse o mesmo par entre blogs)
   npx --yes web-push generate-vapid-keys
   ```
   Copiar `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` gerados para o `.env` **daquele** blog (nunca para `.replit`, nunca commitado). Editar via `nano`/`sed -i` no `.env` local do blog.

9. **Aplicar a nova chave** — recriar o serviço para reler o `env_file` (restart NÃO relê env):
   ```bash
   cd /opt/sp011        # ou cd /opt/blogs/<id>
   docker compose up -d --force-recreate api
   ```

10. **Efeito nas inscrições existentes** — as `push_subscriptions` gravadas com a chave antiga deixam de validar; os navegadores se **re-inscrevem automaticamente** ao abrir o site (o frontend busca a nova `publicKey` em `/api/push/vapid-public-key` e refaz o `subscribe`). Documentar isso no runbook; não é necessário apagar a tabela.

11. **Confirmar a chave de envelope em produção (liga F16)** — verificar, no runtime da VPS, que `SETTINGS_ENCRYPTION_KEY` (ou ao menos `SESSION_SECRET`) está definida, **sem imprimir o valor**:
    ```bash
    cd /opt/sp011
    docker compose exec -T api sh -lc 'test -n "$SETTINGS_ENCRYPTION_KEY" && echo "SETTINGS_ENCRYPTION_KEY: definido" || echo "SETTINGS_ENCRYPTION_KEY: AUSENTE"; test -n "$SESSION_SECRET" && echo "SESSION_SECRET: definido" || echo "SESSION_SECRET: AUSENTE"'
    ```
    Sucesso: ao menos uma das duas retorna "definido" (idealmente `SETTINGS_ENCRYPTION_KEY`). Se ambas ausentes, `crypto.ts` está no fallback de texto puro → **PARAR e escalar** (tratar em conjunto com o PRD que trata F16; NÃO trocar SESSION_SECRET aqui). Repetir a checagem para cada blog replicado relevante trocando `cd /opt/sp011` por `cd /opt/blogs/<id>`.

---

## Fora de escopo

- **Purge do histórico git** da chave antiga (BFG/`git filter-repo`, force-push) — é o **PRD-01b**. Este PRD só neutraliza via rotação + untrack.
- **Trocar `SESSION_SECRET` ou `SETTINGS_ENCRYPTION_KEY`** — re-chaveamento de envelope é outro PRD; trocar aqui tornaria ilegíveis os segredos já cifrados.
- **Alterar o código de `push.ts` / `PushSubscribeButton.tsx`** — o comportamento gracioso (sem chave, push não dispara) já é seguro; não mexer.
- **Corrigir o fallback de texto puro do `crypto.ts` (F16)** — aqui apenas se **verifica** que a env está setada em produção; a correção do fallback (falhar em vez de degradar) é PRD próprio.
- **`twoFactorSecret` em claro** (parte de F16/AP-7) — fora deste PRD.
- Rotacionar segredos não-VAPID (chaves de IA, Meta, `centralIngestSecret`).

---

## Comandos de verificação

Rodar na raiz do repo, nesta ordem. Para cada um, o resultado que caracteriza SUCESSO está anotado.

```bash
cd "c:/Users/Usuario(a) Master/sp011"

# 1) Nenhuma referência a VAPID sobra no .replit (bloco de segredo removido).
#    SUCESSO = 0 linhas (nenhuma saída).
grep -n "VAPID" .replit; echo "rc=$?"
# SUCESSO: grep não encontra nada (rc=1) e não imprime linhas.

# 2) O valor privado não existe mais em NENHUM arquivo rastreado do working tree
#    (fora do histórico git, que é o PRD-01b). Busca pelo NOME da variável em .replit.
#    SUCESSO = 0 ocorrências.
grep -rn "VAPID_PRIVATE_KEY" .replit; echo "rc=$?"
# SUCESSO: rc=1, nenhuma linha.

# 3) .replit deixou de ser rastreado pelo git.
#    SUCESSO = saída vazia (0 linhas).
git ls-files -- .replit
# SUCESSO: nada é impresso.

# 4) .replit está ignorado pelo git (não voltará a ser adicionado).
#    SUCESSO = imprime ".replit" (git check-ignore confirma o match).
git check-ignore .replit
# SUCESSO: imprime ".replit".

# 5) A documentação não manda mais copiar/reusar VAPID do .replit.
#    SUCESSO = 0 ocorrências das frases antigas.
grep -rn "copie de .replit\|copiadas do .replit\|Reaproveite as chaves VAPID" README_DEPLOY_HOSTINGER.md .env.example; echo "rc=$?"
# SUCESSO: rc=1, nenhuma linha.

# 6) A documentação passou a instruir geração de par novo.
#    SUCESSO = pelo menos 2 ocorrências (README + .env.example) mencionando generate-vapid-keys.
grep -rn "generate-vapid-keys" README_DEPLOY_HOSTINGER.md .env.example
# SUCESSO: aparece nas duas fontes.

# 7) Baseline de testes do api-server permanece verde (nenhum código de runtime mudou).
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server"
node --test
# SUCESSO: mesma contagem de PASS do baseline registrado nas Pré-condições; 0 fail.

# 8) STATUS.md atualizado com o PRD-01a.
cd "c:/Users/Usuario(a) Master/sp011"
grep -n "01a" security-audit/STATUS.md
# SUCESSO: imprime a linha de status do PRD-01a.
```

> Verificações de produção (Parte B) são objetivas mas rodadas pelo operador na VPS: (a) `curl -s https://<dominio>/api/push/vapid-public-key` retorna a **nova** `publicKey` (diferente de `BO72XOWG...`); (b) inscrição push no navegador conclui sem erro; (c) o comando do passo 11 imprime "definido" para a chave de envelope.

---

## Critérios de aceite

- [ ] `grep -n "VAPID" .replit` retorna 0 linhas (comando 1).
- [ ] `grep -rn "VAPID_PRIVATE_KEY" .replit` retorna 0 ocorrências (comando 2).
- [ ] `git ls-files -- .replit` retorna vazio — `.replit` não é mais rastreado (comando 3).
- [ ] `git check-ignore .replit` imprime `.replit` — arquivo ignorado (comando 4).
- [ ] `grep` das frases antigas de reuso em `README_DEPLOY_HOSTINGER.md` e `.env.example` retorna 0 (comando 5).
- [ ] `README_DEPLOY_HOSTINGER.md` e `.env.example` mencionam `generate-vapid-keys` (comando 6).
- [ ] `node --test` em `artifacts/api-server` continua com a mesma contagem de PASS do baseline, 0 fail (comando 7).
- [ ] `security-audit/STATUS.md` tem a linha do PRD-01a (comando 8).
- [ ] Runbook da Parte B (rotação por blog + confirmação da env de envelope) está escrito no PRD/STATUS e **sinalizado para revisão humana** antes de aplicar na VPS.
- [ ] Nenhum valor de segredo real aparece em qualquer arquivo criado/editado, no diff ou na mensagem de commit.

---

## Definition of Done

Todos os critérios de aceite acima marcados; o commit da Parte A na branch `fix/prd-01a-rotacao-segredo-vapid` remove o segredo do índice/working tree, ignora `.replit`, corrige as três fontes de doc (`README_DEPLOY_HOSTINGER.md` ×2, `.env.example` ×1) e atualiza `security-audit/STATUS.md`; e o runbook da Parte B (rotação de produção + confirmação da chave de envelope) está documentado e explicitamente marcado como pendente de execução/revisão humana na VPS. A rotação efetiva em produção é condição de fechamento do **incidente**, mas sua execução é do operador sob revisão humana — o agente registra o estado, não conclui sozinho o que depende da VPS.

---

## Dependências

- **Nenhuma** para começar (Onda 0).
- **PRD-01b** (purge do histórico git) deve vir **depois** deste — a rotação aqui neutraliza o abuso; o purge remove o valor antigo do histórico. Não bloqueia este PRD.
- Relaciona-se com o PRD que trata **F16** (fallback de texto puro do `crypto.ts`): aqui só se **verifica** que a env de envelope está definida; a correção do comportamento de fallback é daquele PRD.

---

## Prioridade e esforço

- **Prioridade:** Quick Win (Onda 0) — exposição crítica (CVSS ~9.1) com correção de baixo custo.
- **Esforço:** Baixo — edições pontuais de config/doc + um `git rm --cached`; a rotação de produção é rápida (par novo por blog) mas exige acesso à VPS e **revisão humana**.

---

## Plano de rollback

Parte A (repo) — reverter na branch:

```bash
cd "c:/Users/Usuario(a) Master/sp011"
# desfazer o untrack (retorna .replit ao índice como estava)
git checkout HEAD -- .replit .gitignore README_DEPLOY_HOSTINGER.md .env.example
# se já houver commit deste PRD, reverter o commit inteiro:
git revert <hash_do_commit_do_PRD-01a>
```

> ATENÇÃO: reverter a Parte A **reexpõe** a chave privada versionada. Só reverta em emergência e, nesse caso, priorize a rotação da Parte B (a chave rotacionada torna o valor antigo inútil, então o rollback do repo não reexpõe segredo ativo).

Parte B (produção) — se a nova chave causar problema de push, restaurar o `.env` do blog a partir do backup e recriar o serviço:

```bash
cd /opt/sp011        # ou /opt/blogs/<id>
# restaurar .env do backup do operador (nunca a chave antiga versionada), depois:
docker compose up -d --force-recreate api
```

Não há rollback de `crypto.ts`/envelope neste PRD (nada foi alterado ali).

---

## Notas de execução para o agente

- Trabalhar **somente neste PRD (01a)**. Não iniciar o PRD-01b (purge de histórico) nem tocar `crypto.ts`.
- **Nunca** imprimir, colar ou commitar o valor real da `VAPID_PRIVATE_KEY` (nem em exemplos, logs ou mensagens de commit). Ao referenciá-la, usar placeholder.
- Se **qualquer** critério de aceite falhar após implementar: **NÃO** marcar como concluído. Registrar o motivo exato em `security-audit/STATUS.md` (linha do PRD-01a) e **PARAR**.
- Ao concluir a Parte A com sucesso (todos os comandos de verificação da Parte A verdes), atualizar `security-audit/STATUS.md` para `CONCLUÍDO (código) — Parte B pendente de operador/revisão humana`.
- Esta é uma mudança que **mexe em segredo vivo** (rotação da Parte B): **sinalizar para REVISÃO HUMANA antes de qualquer merge/deploy**. O agente não deve executar a rotação de produção nem colher segredos da VPS; apenas entregar o código e o runbook.
- Se o comando do passo 11 indicar que `SETTINGS_ENCRYPTION_KEY` e `SESSION_SECRET` estão **ambas ausentes** em produção, isso é um achado grave (F16 ativo): registrar em STATUS.md, sinalizar humano e **não** tentar corrigir aqui (não trocar SESSION_SECRET).
