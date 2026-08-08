# PRD-14 — Integridade do ingest e guarda de instalação (nonce, transação, adopt-guard)

> Metadados: **Onda 2** | **Médio Prazo** | **Esforço Médio** | **Dependências: nenhuma** | **Sem revisão humana obrigatória** (mas ver ressalva em "Notas de execução": toca o caminho de auth do ingest e a guarda de instalação — sinalizar o diff para conferência humana antes do deploy em produção).

---

## Objetivo

Fechar três falhas de integridade no canal central→blog e na instalação: (1) o anti-replay do ingest é só uma janela de 300s sem **nonce**, então a MESMA requisição assinada pode ser reenviada dentro da janela; (2) a idempotência por `centralId` tem **TOCTOU** (select → insert → update em statements separados) que, sob concorrência, cria artigo duplicado e devolve 500; (3) `adoptExistingInstall:true` deixa (por erro do operador) duas instâncias editarem o mesmo banco. A remediação adiciona nonce persistido, torna a checagem+inserção do `centralId` atômica pelo índice único já existente, e endurece o adopt-guard.

---

## Contexto / Evidência de origem

Achado de origem: **F15 + adopt-guard**. Attack path: **AP-6 — Forja/replay/duplicação de ingest (F15)** de `security-audit/03-threat-model.md` (linha 47: "Replay em 300s sem nonce + TOCTOU na idempotência → duplicação + 500. STRIDE: S, T, R, D. Mitiga: PRD-14"), com referência cruzada na matriz de ativos (linha 58: "Ingest HMAC … Nonce persistido + transação atômica" e linha 63: "hardening adopt-guard"). Ativo #1 (isolamento/db-config) e ativo #3 (integridade do ingest).

Evidências de código (arquivos e linhas REAIS, lidos em 2026-07-21):

- **F15-a — Replay dentro da janela, sem nonce.** `lib/news-engine/src/signing.ts`:
  - linha 14: `export const DEFAULT_MAX_SKEW_SEC = 300;`
  - linhas 51-55: `const ts = Number(timestamp); … if (Math.abs(nowSec - ts) > maxSkew) return { ok: false, reason: "timestamp_skew" };` — a ÚNICA defesa temporal é `|now − ts| > 300s`. Uma requisição assinada válida pode ser reenviada quantas vezes couберem em 300s; a função é pura e não guarda estado de "já visto".
  - `verifyIngestSignature` (linhas 42-70) faz comparação em tempo constante da assinatura, mas nada de nonce.
  - Consumo no blog: `artifacts/api-server/src/routes/ingest.ts` linhas 48-67 (`centralIngestAuth`) chama `verifyIngestSignature` (linhas 56-61) e, se ok, segue direto para `next()` (linha 66) — sem consumir nonce.
  - Risco: **CWE-294 (Authentication Bypass by Capture-replay)** / **CWE-323 (Reusing a Nonce)**. CVSS aproximado ~5.3 (AV:N/AC:H/PR:N — exige capturar uma requisição assinada em trânsito ou nos logs de um intermediário). STRIDE: S (spoofing de entrega repetida), T, R.

- **F15-b — TOCTOU na idempotência por `centralId`.** `artifacts/api-server/src/routes/ingest.ts`:
  - linhas 128-141: pre-`SELECT` por `centralId` → se existe, responde `replay`.
  - linhas 157-188: `articleService.createArticle({...})` — **não** passa `centralId` (confirmado em `artifacts/api-server/src/lib/articleService.ts` linhas 349-380: o `.insert(articlesTable).values({...})` NÃO inclui a coluna `centralId`).
  - linhas 190-194: um SEGUNDO statement `await db.update(articlesTable).set({ centralId: centralId.trim() }).where(eq(articlesTable.id, saved.id));` (comentário na linha 190: "Vincula o id central").
  - Janela de corrida: duas requisições concorrentes com o mesmo `centralId` passam ambas pelo pre-SELECT (nenhuma vê a outra), ambas fazem `createArticle` (DOIS artigos), e ambas fazem o `UPDATE`. O índice **parcial único já existe** — `artifacts/api-server/src/lib/ensureSchema.ts` linha 40: `CREATE UNIQUE INDEX IF NOT EXISTS articles_central_id_uniq ON articles (central_id) WHERE central_id IS NOT NULL` — então o segundo `UPDATE` viola a constraint (Postgres `23505`) e estoura como **500 não tratado**, deixando um artigo órfão sem `centralId` (duplicata visível ao leitor).
  - Risco: **CWE-367 (TOCTOU Race Condition)** + **CWE-362**. CVSS aproximado ~4.0 (integridade/disponibilidade parcial; requer concorrência real — retry do worker central, entrega dupla). STRIDE: T, R, D.

- **Adopt-guard fraco.** `artifacts/api-server/src/routes/setup.ts`:
  - linhas 129-152: `existingInstallRefusal(probe)` (helper puro exportado) monta o 409 `existing_install`.
  - linhas 286-289: `if (probe.hasExistingInstall && body["adoptExistingInstall"] !== true) { res.status(409).json(existingInstallRefusal(probe)); return; }` — QUALQUER cliente que mande `adoptExistingInstall:true` no corpo pula a guarda, mesmo em produção, sem confirmação da identidade do site nem opt-in de ambiente.
  - linhas 331-335: há um `logger.warn` genérico ao concluir ("Instalação concluída…"), mas o uso de adopt não emite um registro dedicado/grepável.
  - Incidente real referenciado no próprio código (linhas 283-285): "incidente ksports×sp011, 2026-07-07" — duas instâncias editando o mesmo site.
  - Risco: **CWE-privilege/config (uso indevido por configuração)** — colagem de connection string errada. CVSS aproximado ~6.5 no contexto (integridade de dados de um blog vizinho). STRIDE: T, I, R.

---

## Pré-condições

- [ ] Criar branch: `git checkout -b fix/prd-14-integridade-ingest-instalacao`
- [ ] Rodar e REGISTRAR baseline de testes (todos devem passar ANTES de qualquer mudança):
  - `cd artifacts/api-server && pnpm test`
  - `cd lib/news-engine && pnpm test`
  - Anotar em `security-audit/STATUS.md` a contagem de testes verdes do baseline.
- [ ] Ler estes arquivos ANTES de editar (não editar sem ler):
  - `artifacts/api-server/src/routes/ingest.ts` (auth + handler do ingest)
  - `lib/news-engine/src/signing.ts` (módulo HMAC compartilhado — **NÃO alterar o esquema**; ler só para confirmar que o nonce fica FORA daqui)
  - `artifacts/api-server/src/routes/setup.ts` (adopt-guard)
  - `artifacts/api-server/src/lib/ensureSchema.ts` (índice `articles_central_id_uniq` já existe na linha 40; é onde nasce a nova tabela de nonce)
  - `artifacts/api-server/src/lib/articleService.ts` (linhas 323-383, `createArticle`)
  - `lib/db/src/schema/articles.ts` (coluna `centralId`, linha 59)
  - `artifacts/api-server/test/ingestSanitize.test.ts` e `lib/news-engine/test/signing.test.ts` (modelos de teste `node --test`)

---

## Escopo (ações em ordem)

### Parte A — Nonce persistido (anti-replay real)

1. **Nova tabela de nonce no banco do blog.** Em `artifacts/api-server/src/lib/ensureSchema.ts`, adicionar (junto aos demais statements idempotentes, sem remover nenhum existente) um `sql\`CREATE TABLE IF NOT EXISTS ingest_nonces (signature text PRIMARY KEY, seen_at timestamptz NOT NULL DEFAULT now())\``. Manter o `CREATE UNIQUE INDEX … articles_central_id_uniq …` da linha 40 intacto.
2. **Espelhar no schema Drizzle.** Em `lib/db/src/schema/` criar/registrar a tabela `ingestNoncesTable` (colunas `signature text primaryKey`, `seenAt timestamptz notNull defaultNow`) e exportá-la pelo índice do pacote `@workspace/db` (para typecheck e para futuros baselines). Após mexer em `lib/db`, rodar `pnpm exec tsc -b` dentro de `lib/db` antes de typecheckar o api-server (pacote TS composite).
3. **Módulo de nonce injetável (testável sem banco).** Criar `artifacts/api-server/src/lib/ingestNonce.ts` exportando:
   - uma interface `NonceStore` com `consume(signature: string): Promise<boolean>` (retorna `true` se é a PRIMEIRA vez — inserido; `false` se já visto — replay);
   - uma implementação em banco `dbNonceStore` que executa `INSERT INTO ingest_nonces (signature) VALUES ($1) ON CONFLICT (signature) DO NOTHING` e devolve `true` só quando `rowCount === 1`;
   - uma função de limpeza `cleanupNonces()` que roda `DELETE FROM ingest_nonces WHERE seen_at < now() - interval '600 seconds'` (TTL ≥ 2× a janela de 300s de `DEFAULT_MAX_SKEW_SEC`), chamada de forma best-effort (não bloquear a resposta; erro só loga).
   - Motivo de a lógica ficar aqui e NÃO em `signing.ts`: `signing.ts` é módulo PURO compartilhado com o central-hub (assina e verifica) e não pode acessar banco; o nonce é estado do blog receptor.
4. **Consumir o nonce no auth do ingest.** Em `artifacts/api-server/src/routes/ingest.ts`, dentro de `centralIngestAuth` (linhas 48-67), DEPOIS de `verifyIngestSignature` retornar `ok` (após a linha 65) e ANTES de `next()` (linha 66): usar a assinatura crua do header `x-central-signature` como chave de nonce; chamar `nonceStore.consume(signature)`; se retornar `false`, responder `res.status(401).json({ ok: false, error: "replay" })` e NÃO chamar `next()`. Como `centralIngestAuth` passou a ter I/O, converter a função para `async` e ajustar as rotas que a usam (`/test` na linha 81 e `/` na linha 105) — Express aceita middleware async desde que erros sejam capturados (envolver em try/catch e responder 503 `nonce_unavailable` em falha de banco, para NÃO abrir brecha de replay caso o store falhe: fail-closed).
5. **Disparar a limpeza.** Chamar `cleanupNonces()` de forma best-effort (ex.: a cada N requisições ou com `void cleanupNonces()` após aceitar uma entrega) — nunca no caminho crítico de resposta.

### Parte B — Fim do TOCTOU na idempotência

6. **Passar `centralId` para o insert atômico.** Em `artifacts/api-server/src/lib/articleService.ts`, no `createArticle` (`.values({...})`, linhas 351-379), adicionar `centralId: data.centralId ?? null`. Incluir `centralId` no tipo aceito por `createArticle` (o parâmetro `data`, linhas 323-325) e no tipo `Article`/insert correspondente, se necessário, para typecheck.
7. **Remover o UPDATE em dois passos.** Em `artifacts/api-server/src/routes/ingest.ts`, passar `centralId: centralId.trim()` dentro do objeto de `articleService.createArticle({...})` (linhas 157-188) e REMOVER o bloco separado das linhas 190-194 (o `await db.update(articlesTable).set({ centralId: centralId.trim() })…` e seu comentário "Vincula o id central" da linha 190).
8. **Tratar o conflito único como replay (não como 500).** Envolver a chamada `createArticle` do ingest num `try/catch`. No `catch`, detectar violação de unicidade da constraint `articles_central_id_uniq` (código Postgres `23505`); ao detectar, re-SELECT por `centralId` e responder `200 { ok:true, result:"replay", articleId, url }` (mesmo shape das linhas 133-140). Qualquer outro erro segue como 500 normal. Manter o pre-SELECT das linhas 128-141 como fast-path para reenvios sequenciais; a nova guarda de conflito cobre a corrida concorrente. O índice parcial único de `ensureSchema.ts` linha 40 já é a fonte da atomicidade — NÃO criar transação manual adicional.

### Parte C — Endurecer o adopt-guard

9. **Opt-in de ambiente para adopt.** Em `artifacts/api-server/src/routes/setup.ts`, extrair a decisão de adoção para um helper PURO e exportado (ex.: `adoptDecision(probe, body, env): { allow: boolean; reason?: string }`) para ser testável sem banco. Regra:
   - se `!probe.hasExistingInstall` → `allow: true` (instalação limpa, fluxo normal);
   - se `probe.hasExistingInstall` e `body["adoptExistingInstall"] !== true` → `allow: false` (recusa 409 `existing_install`, como hoje);
   - se `probe.hasExistingInstall` e `body["adoptExistingInstall"] === true` MAS `env["NODE_ENV"] === "production"` e `env["SETUP_ALLOW_ADOPT"] !== "true"` → `allow: false` (em produção, adotar exige opt-in explícito de ambiente além da flag do corpo);
   - caso contrário (existing install + flag do corpo + opt-in de ambiente OU ambiente não-produção) → `allow: true`.
10. **Aplicar o helper.** Substituir a condição inline das linhas 286-289 por `adoptDecision(...)`; quando `allow === false`, responder `res.status(409).json(existingInstallRefusal(probe))`.
11. **Log dedicado e grepável do adopt.** Quando a instalação PROSSEGUIR sobre um banco com instalação existente (`probe.hasExistingInstall === true` e adopt permitido), emitir ANTES da gravação um `logger.warn` dedicado e inequívoco (ex.: mensagem contendo o texto literal `ADOPT_EXISTING_INSTALL`) incluindo `existingSiteName`, `existingUsers`, `existingArticles` do probe — para que o incidente seja rastreável por `grep` nos logs. Manter o `logger.warn` de conclusão das linhas 331-335.

### Parte D — Testes

12. Criar `artifacts/api-server/test/ingestNonce.test.ts` (padrão `node --test` + `assert/strict`, import com extensão `.ts` explícita como em `test/ingestSanitize.test.ts`): usando um `NonceStore` fake em memória, verificar que `consume(sig)` retorna `true` na 1ª vez e `false` na 2ª (mesma assinatura = replay rejeitado).
13. Criar `artifacts/api-server/test/setupAdoptGuard.test.ts`: testar `adoptDecision` puro nos 4 casos — (a) sem instalação existente → allow; (b) instalação existente sem flag → deny; (c) instalação existente + flag + `NODE_ENV=production` + `SETUP_ALLOW_ADOPT` ausente → deny; (d) instalação existente + flag + `SETUP_ALLOW_ADOPT=true` → allow.
14. (Opcional, se extrair a lógica de "conflito 23505 → replay" num helper puro) adicionar teste que, dado um erro com `code: "23505"`, o helper retorne o caminho `replay`; caso contrário, propague.

---

## Fora de escopo

- **Rate limit / custo do ingest** — pertence ao **PRD-11**. Não mexer em `endpointRateLimit` nem em tetos.
- **NÃO trocar o esquema HMAC nem o segredo.** `lib/news-engine/src/signing.ts` fica intacto (só é lido como evidência); o nonce vive no blog, fora dele. Não alterar `computeIngestSignature`/`signIngestRequest`/`verifyIngestSignature` nem `CENTRAL_INGEST_SECRET`.
- **NÃO trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`** (derivam a chave AES dos segredos).
- Não mexer no dedup local (`isDuplicateArticle`, linhas 143-148 do ingest) nem na sanitização de HTML (`sanitizeIngestHtml`, PRD-04a/F7).
- Não introduzir `blogId` no app nem hardcodar conteúdo por blog (isolamento é por infra).

---

## Comandos de verificação

```bash
# Rodar a partir da raiz do repo: c:/Users/Usuario(a) Master/sp011
# (caminhos relativos; cada bloco declara o que caracteriza SUCESSO)

# 1) Testes do api-server (nonce, adopt-guard, suites existentes)
cd artifacts/api-server && pnpm test
#   SUCESSO: todos os testes passam, incluindo ingestNonce.test.ts e setupAdoptGuard.test.ts.

# 2) Testes do news-engine (signing intacto)
cd lib/news-engine && pnpm test
#   SUCESSO: todos passam SEM alteração no arquivo signing.test.ts (esquema HMAC inalterado).

# 3) Rebuild do lib/db (TS composite) após mexer no schema
cd lib/db && pnpm exec tsc -b
#   SUCESSO: build sem erros; dist regenerado.

# 4) Typecheck por pacote
cd lib/db && pnpm run typecheck
cd artifacts/api-server && pnpm run typecheck
#   SUCESSO: exit 0, zero erros de tipo.

# 5) Build local do api-server (esbuild roda no Windows)
cd artifacts/api-server && pnpm run build
#   SUCESSO: build conclui sem erro.

# 6) NEGATIVO — o UPDATE em dois passos do centralId sumiu do ingest
grep -n "Vincula o id central" artifacts/api-server/src/routes/ingest.ts
#   SUCESSO: 0 ocorrências (o bloco das linhas 190-194 foi removido).

# 7) POSITIVO — centralId agora entra no insert do createArticle
grep -n "centralId" artifacts/api-server/src/lib/articleService.ts
#   SUCESSO: >= 1 ocorrência dentro do .values({...}) de createArticle.

# 8) POSITIVO — tabela de nonce criada idempotentemente no boot
grep -n "ingest_nonces" artifacts/api-server/src/lib/ensureSchema.ts
#   SUCESSO: >= 1 ocorrência (CREATE TABLE IF NOT EXISTS ingest_nonces ...).

# 9) POSITIVO — nonce é consumido no auth do ingest
grep -n "consume" artifacts/api-server/src/routes/ingest.ts
#   SUCESSO: >= 1 ocorrência (nonceStore.consume(...) dentro de centralIngestAuth).

# 10) POSITIVO — adopt exige opt-in de ambiente em produção e loga
grep -n "SETUP_ALLOW_ADOPT" artifacts/api-server/src/routes/setup.ts
grep -n "ADOPT_EXISTING_INSTALL" artifacts/api-server/src/routes/setup.ts
#   SUCESSO: >= 1 ocorrência em cada (gate de ambiente + log grepável).

# 11) CONTROLE — signing.ts NÃO foi tocado
git diff --stat lib/news-engine/src/signing.ts
#   SUCESSO: nenhuma linha alterada em signing.ts.
```

Verificação de integração pós-deploy (observação objetiva, na VPS — não bloqueia o merge local, mas confirma o fim do TOCTOU/replay em runtime):

```bash
# Na VPS, no banco do blog alvo (via wizard/psql). Após o rollout:
# a) Duas entregas concorrentes do MESMO centralId → exatamente 1 artigo:
#    SELECT central_id, count(*) FROM articles WHERE central_id IS NOT NULL
#    GROUP BY central_id HAVING count(*) > 1;
#    SUCESSO: 0 linhas (nenhum centralId duplicado).
# b) Logs da api do blog não mostram 500 no /api/ingest sob reenvio;
#    reenvio da mesma requisição assinada dentro de 300s → resposta 401 "replay"
#    (nonce) ou 200 result:"replay" (idempotência), NUNCA 201 duplicado.
```

---

## Critérios de aceite

- [ ] `cd artifacts/api-server && pnpm test` passa, com `ingestNonce.test.ts` e `setupAdoptGuard.test.ts` verdes (comando 1).
- [ ] `cd lib/news-engine && pnpm test` passa sem editar `signing.test.ts` (comando 2).
- [ ] `git diff --stat lib/news-engine/src/signing.ts` mostra 0 alterações (comando 11).
- [ ] `grep -n "Vincula o id central" …/ingest.ts` retorna 0 ocorrências (comando 6).
- [ ] `grep -n "ingest_nonces" …/ensureSchema.ts` e `grep -n "consume" …/ingest.ts` retornam ≥ 1 (comandos 8 e 9).
- [ ] `grep -n "SETUP_ALLOW_ADOPT" …/setup.ts` e `grep -n "ADOPT_EXISTING_INSTALL" …/setup.ts` retornam ≥ 1 (comando 10).
- [ ] `pnpm exec tsc -b` no `lib/db` e `pnpm run typecheck` em `lib/db` e `artifacts/api-server` saem com exit 0 (comandos 3 e 4).
- [ ] `pnpm run build` do api-server conclui (comando 5).
- [ ] Teste unitário confirma: 2º `consume` da mesma assinatura → `false` (replay rejeitado).
- [ ] Teste unitário confirma: adopt em `NODE_ENV=production` sem `SETUP_ALLOW_ADOPT=true` → `allow:false`.

---

## Definition of Done

Todos os itens de "Critérios de aceite" marcados; branch `fix/prd-14-integridade-ingest-instalacao` com os commits; `signing.ts` comprovadamente inalterado; `security-audit/STATUS.md` atualizado com o resultado (baseline + pós-implementação). Comportamento garantido: (a) requisição assinada repetida dentro de 300s é recusada por nonce; (b) duas entregas concorrentes do mesmo `centralId` produzem 1 artigo e nenhum 500; (c) adotar banco de instalação existente em produção exige `adoptExistingInstall:true` NO corpo E `SETUP_ALLOW_ADOPT=true` no ambiente, e gera log grepável `ADOPT_EXISTING_INSTALL`.

---

## Dependências

- **Nenhuma** dependência bloqueante. Pode rodar em paralelo com os demais PRDs da Onda 2. Complementa (não depende de) o **PRD-11** (rate limit/custo do ingest) e o **PRD-01b** (higiene de segredos / fail-closed do db-config); coordenar apenas para evitar conflito de merge nos mesmos arquivos (`ingest.ts`, `setup.ts`, `ensureSchema.ts`) — se PRD-11 tocar `ingest.ts`, mergear na ordem e re-rodar os testes.

---

## Prioridade e esforço

- **Onda 2 — Médio Prazo.**
- **Esforço: Médio.** Toca api-server (`ingest.ts`, `setup.ts`, `ensureSchema.ts`, `articleService.ts`, novos módulos/testes) e `lib/db` (schema + rebuild composite). Sem migração destrutiva (tabela nova via `CREATE TABLE IF NOT EXISTS`; índice único já existe). Frontend não muda.

---

## Plano de rollback

- Reverter o merge/commits do branch: `git revert <hash-do-commit-de-merge>` (ou `git revert <hash>` de cada commit da Parte A–D, na ordem inversa) e re-deploy do serviço `api` (mapeamento: `artifacts/api-server` + `lib/db` → serviço `api`; `lib/news-engine` não foi tocado, então `central-api` não precisa rebuild).
- Bloco de rollback na VPS:
  ```bash
  cd /opt/sp011
  git revert --no-edit <hash>
  git push origin main
  docker compose build api
  docker compose up -d api
  ```
- A tabela `ingest_nonces` pode permanecer no banco sem efeito colateral após o revert (código deixa de usá-la); se quiser removê-la explicitamente: `DROP TABLE IF EXISTS ingest_nonces;` no banco do blog (opcional, não obrigatório).
- Para reativar adopt em produção temporariamente sem reverter código: definir `SETUP_ALLOW_ADOPT=true` no `.env` do blog e `docker compose up -d --force-recreate api` (restart NÃO relê env_file). Remover a variável depois.
- **Não** há mudança de `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` — rollback não afeta a decifração de segredos.

---

## Notas de execução para o agente

- Trabalhar SOMENTE neste PRD (PRD-14). Não iniciar outros PRDs na mesma sessão.
- Se QUALQUER critério de aceite falhar após implementar: **não** marcar como concluído. Registrar em `security-audit/STATUS.md` o critério que falhou, o comando exato e a saída observada, e **PARAR** para diagnóstico — não tentar contornar com força bruta.
- Ao concluir com SUCESSO (todos os critérios verdes): atualizar `security-audit/STATUS.md` marcando PRD-14 como concluído, com a data e o resumo do que mudou.
- `signing.ts` é módulo compartilhado e PURO — não adicionar estado/DB ali. O nonce mora no api-server do blog. Se em algum momento parecer necessário mexer em `signing.ts`, reavaliar: quase certamente há uma abordagem que mantém o módulo intacto.
- **Fail-closed:** se o `NonceStore` falhar (banco indisponível), o ingest deve RECUSAR (503 `nonce_unavailable`), nunca aceitar sem checar nonce — recusar é o comportamento seguro.
- Ressalva de revisão humana: embora o cabeçalho marque "Sem revisão humana obrigatória", este PRD toca o **caminho de autenticação do ingest** (`centralIngestAuth`) e a **guarda de instalação** (`adopt`). Sinalizar o diff para conferência humana antes do deploy em produção (não bloqueante) e, no rollout, começar por UM blog (canário, ex.: `resenhavip`) confirmando que ingest legítimo continua entregando (`result:"created"`) antes de propagar aos demais.
