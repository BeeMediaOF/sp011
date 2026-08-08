# PRD-04a — Sanitização canônica de HTML no write-path e gate de qualidade `enforce`

> **Metadados:** Onda 1 | Prioridade: Médio Prazo | Esforço: Alto | Dependências: nenhuma (soft-habilita o PRD-05) | **REVISÃO HUMANA OBRIGATÓRIA + CANÁRIO/SHADOW** (a etapa final passa a REJEITAR conteúdo).
>
> Este PRD é autocontido. Um agente futuro deve conseguir implementá-lo sem acesso à conversa que o gerou. Todas as referências de arquivo:linha abaixo foram lidas e confirmadas no commit atual.

---

## Objetivo

Eliminar o vetor de XSS armazenado do attack path AP-1 (fonte externa → injeção indireta → IA emite HTML perigoso → é gravado e distribuído). Para isso: (1) substituir os três sanitizadores por REGEX espelhados e divergentes por UMA política de allowlist canônica baseada em parser (robusta contra `svg/onload`, `math`, tags malformadas etc.), consumida por ingest, SSR e AMP; e (2) tornar o gate de qualidade `html_dangerous` bloqueante por padrão (`validationMode: "enforce"`), mas SÓ depois de uma fase de SHADOW em produção que meça a taxa de rejeição e monte a allowlist de tags legítimas — para não gerar artigos vazios/perdidos.

---

## Contexto / Evidência de origem

Achados **F3** (saída do modelo não validada/bloqueada — gate "log"; OWASP **LLM02/LLM05**, **CWE-79** via saída; CVSS ~8.1) e **F12** (sanitizadores por regex contornáveis, com drift entre espelhos). Ponto de armazenamento do **AP-1** (cadeia-mãe do threat model — `security-audit/03-threat-model.md`, seção 4: "IA emite HTML perigoso → gate default 'log' não bloqueia (F3) → armazenado ... Mitiga: PRD-04a/04b/05/02/03"; e seção 5, linha "Pipeline IA": "gate `enforce`").

Evidências concretas lidas no código (arquivo:linha reais):

1. **Gate default é "log" — não bloqueia.**
   - `artifacts/central-hub/src/lib/store.ts:140` → `validationMode: "log",` (default do `DEFAULT_SETTINGS`). O tipo e o comentário de rollback estão em `store.ts:79-86` ("'enforce' = issues block/coverage abaixo do piso entram no fluxo de retry→failed. Rollback instantâneo: voltar para 'log' (sem deploy).").
   - `artifacts/central-hub/src/services/rewriter.ts:73-75` → `function validationMode(s)` retorna `s.validationMode ?? "log"`.
   - `artifacts/central-hub/src/services/rewriter.ts:301` → `if (mode === "enforce" && blocks.some((i) => i.code === "html_dangerous")) { return "blocked"; }`. Ou seja: em "log" (default), um `html_dangerous` é apenas registrado (logEvent em `rewriter.ts:290-298`) e a reescrita é **gravada e distribuída** mesmo assim.

2. **Detecção de HTML perigoso por regex (contornável).**
   - `lib/news-engine/src/validate.ts:30-31` → `const DANGEROUS_HTML = /<script\b|<iframe\b|<object\b|<embed\b|<form\b|\son[a-z]+\s*=|javascript:/i;` — **não** cobre `<svg onload=...>`, `<math href=...>`, `data:`/`vbscript:` URLs, tags malformadas, handler sem espaço antes, `style="expression(...)"`, aninhamento. Uso em `validate.ts:95-97`.

3. **Três sanitizadores por regex espelhados (drift garantido).**
   - `artifacts/api-server/src/lib/ingestSanitize.ts:10-16` → `sanitizeIngestHtml` (write-path do ingest). Consumido em `artifacts/api-server/src/routes/ingest.ts:167` (`content: sanitizeIngestHtml(article.contentHtml.trim())`). O próprio arquivo declara ser "ESPELHO de `brasilia-agora/src/lib/sanitize.ts` ... Mudou lá, muda AQUI também" (comentário em `ingestSanitize.ts:7-8`) — drift por construção.
   - `artifacts/brasilia-agora/src/lib/sanitize.ts:57-63` → `stripDangerousHtml` (caminho SSR). O caminho do cliente usa DOMPurify (`sanitize.ts:8` importa `dompurify`; `sanitize.ts:71-75` `sanitizeArticleHtml` usa DOMPurify no browser e `stripDangerousHtml` no SSR).
   - `artifacts/api-server/src/routes/amp.ts:34-50` → `toAmpHtml` (saída AMP). **Agravante:** a rota AMP remove o cabeçalho CSP em `amp.ts:169` (`res.removeHeader("Content-Security-Policy")`) — HTML perigoso que escapar aqui roda sem rede de segurança de CSP.

**Risco concreto:** uma das ~16 fontes RSS de esporte (ou uma página scraped) injeta, via texto que a IA reproduz no `content_html`, um vetor que a regex não pega (ex.: `<svg onload=fetch(...)>`). Com gate "log", isso é gravado em `rewrites.contentHtml`, distribuído a N blogs e renderizado — no admin do central-web (sink do AP-1, tratado no PRD-04b) e em qualquer consumidor novo (AMP sem CSP, feeds, API). STRIDE do AP-1: **T, E, I**.

---

## Pré-condições

- [ ] Criar branch: `git checkout -b fix/prd-04a-sanitizacao-writepath`
- [ ] Rodar e **registrar** o baseline de testes (devem passar ANTES de qualquer mudança):
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && pnpm exec tsc -b && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && node --test
  ```
- [ ] Ler estes arquivos ANTES de editar (todos já mapeados neste PRD):
  - `artifacts/central-hub/src/lib/store.ts` (default do gate; linha 140)
  - `artifacts/central-hub/src/services/rewriter.ts` (uso do gate; linhas 267, 286-304)
  - `lib/news-engine/src/validate.ts` (regex `DANGEROUS_HTML`; linhas 30-31, 95-97)
  - `lib/news-engine/src/quality.ts` (`ExtractedAI`, `plainTextOf`, `plainTextLength`)
  - `lib/news-engine/src/index.ts` e `lib/news-engine/package.json` (exports)
  - `artifacts/api-server/src/lib/ingestSanitize.ts` (regex; linhas 10-16)
  - `artifacts/api-server/src/routes/ingest.ts` (consumo; linha 167)
  - `artifacts/brasilia-agora/src/lib/sanitize.ts` (regex SSR + DOMPurify cliente; linhas 8, 57-75)
  - `artifacts/api-server/src/routes/amp.ts` (regex AMP + remoção de CSP; linhas 34-50, 169)
  - Testes existentes a estender: `lib/news-engine/test/validate.test.ts` (caso `html_dangerous` em 134-143), `artifacts/api-server/test/ingestSanitize.test.ts`, `artifacts/brasilia-agora/src/lib/sanitize.test.ts`
- [ ] Confirmar que `security-audit/STATUS.md` existe (criar se não existir — ver "Notas de execução").

---

## Escopo (ações em ordem)

> **Divida em FASE A (drift/sanitização — só STRIP, não rejeita conteúdo) e FASE B (gate `enforce` — passa a REJEITAR). A FASE B só é executada após o SHADOW e a revisão humana.**

### FASE A — Política de sanitização canônica única (não rejeita conteúdo)

1. **Escolher o motor canônico e adicioná-lo ao `lib/news-engine`.**
   - Recomendação: **DOMPurify server-side via jsdom** (o cliente do blog JÁ usa DOMPurify com `{ USE_PROFILES: { html: true } }` em `brasilia-agora/src/lib/sanitize.ts:74`; usar o MESMO motor garante paridade de saída SSR≡cliente e evita reintroduzir o hydration mismatch React #418 descrito em `sanitize.ts:49-56`). Adicionar `dompurify` + `jsdom` como dependências de `lib/news-engine` (`pnpm --filter @workspace/news-engine add dompurify jsdom` e `@types/*` como devDependencies). Alternativa aceitável: `sanitize-html`, OU construir sobre o `cheerio` já presente em `lib/news-engine` (evita dep nova) — desde que o resultado neutralize toda a bateria de bypass do critério de aceite. **Adicionar dependência é superfície de supply chain: sinalizar para revisão humana (ver `.npmrc` de defesas do repo).**
   - Requer rede para `pnpm install`. O build do frontend (vite) só roda no Docker da VPS (limitação do repo) — a validação final do bundle é na VPS.

2. **Criar `lib/news-engine/src/sanitizeHtml.ts`** com UMA allowlist de tags/atributos (fonte única da política) e exportar:
   - `sanitizeArticleHtml(html: string): string` — allowlist de conteúdo editorial (parágrafos, headings h2-h6, listas, `a[href]`, `img[src|alt]`, ênfase, blockquote, tabelas). Remove `script/style/iframe/object/embed/form/link/meta/base/svg/math`, TODOS os atributos `on*`, e URLs não-`http(s)` em `href`/`src` (`javascript:`, `data:`, `vbscript:`). Deve produzir saída equivalente ao DOMPurify html-profile do cliente.
   - `sanitizeAmpHtml(html: string): string` — allowlist AMP estrita (sem `script/style/iframe/object/embed/form/svg/math/link/meta/base`, sem atributos `style`, sem `on*`, só URLs `http(s)`), preservando a transformação `<img>`→`<amp-img>` (ou aplicando-a após a sanitização).
   - `containsDangerousHtml(html: string): boolean` — detector **por parser** (não regex) para o gate `enforce`: retorna `true` se o material contém tag executável/perigosa (`script/iframe/object/embed/form/svg/math/style/link/meta/base`), atributo `on*`, ou URL `javascript:`/`data:`/`vbscript:` em `href`/`src`. Implementar inspecionando o que o sanitizador removeu (ex.: `DOMPurify.removed`) ou percorrendo o DOM parseado — **nunca** por igualdade string (normalização benigna geraria falso-positivo).
   - Documentar no topo do arquivo que este é a **fonte única** da política e que os três consumidores (ingest, SSR, AMP) e o detector do gate importam daqui.

3. **Exportar o módulo canônico do `lib/news-engine`.**
   - Adicionar `export * from "./sanitizeHtml.ts";` (ou export nomeado) em `lib/news-engine/src/index.ts`.
   - Adicionar em `lib/news-engine/package.json` no bloco `exports` a entrada `"./sanitize": "./src/sanitizeHtml.ts"` (padrão dos subpaths existentes `./signing`, `./quality`, `./score`).
   - Rodar `pnpm exec tsc -b` DENTRO de `lib/news-engine` (pacote TS composite; obrigatório antes de typecheckar quem depende).

4. **Reescrever `artifacts/api-server/src/lib/ingestSanitize.ts`** para delegar ao canônico.
   - Substituir o corpo de `sanitizeIngestHtml` (as 4 cadeias `.replace(...)` em `ingestSanitize.ts:11-15`) por uma chamada a `sanitizeArticleHtml` do `@workspace/news-engine` (ou `@workspace/news-engine/sanitize`). Manter a assinatura `(html: string): string` para não tocar em `ingest.ts:167`.
   - Atualizar o comentário de cabeçalho (`ingestSanitize.ts:1-9`) para refletir que a política agora é única e canônica (não mais "espelho a manter manualmente").

5. **Reescrever `artifacts/api-server/src/routes/amp.ts` `toAmpHtml`** (`amp.ts:34-50`) para usar `sanitizeAmpHtml` do canônico + a transformação `<img>`→`<amp-img>`. Remover as cadeias `.replace(...)` de sanitização por regex (linhas 40-48), mantendo apenas a lógica de transformação AMP que não é sanitização (a substituição `<img>`→`<amp-img>` das linhas 36-39, se não já coberta pelo canônico). O resultado deve continuar sendo AMP válido.

6. **Atualizar `artifacts/brasilia-agora/src/lib/sanitize.ts` (caminho SSR)** para eliminar o drift.
   - Fazer o ramo SSR de `sanitizeArticleHtml` (`sanitize.ts:73`, `typeof window === "undefined"`) usar a MESMA política canônica (DOMPurify-via-jsdom com config idêntica à do cliente em `sanitize.ts:74`), substituindo `stripDangerousHtml` (`sanitize.ts:57-63`). **Manter o caminho do cliente em DOMPurify** (`sanitize.ts:74`) inalterado.
   - **Restrição dura (não quebrar):** a saída do SSR deve ser byte-equivalente à do cliente para o subconjunto seguro (evita React #418 — ver `sanitize.ts:49-56`), e a dependência server-only (jsdom) **não pode entrar no bundle do cliente** (usar módulo/branch server-only; ex.: import dinâmico no ramo SSR, ou pré-sanitizar o HTML de settings no servidor SSR antes do render). Se não for possível manter `sanitizeArticleHtml` síncrono com import dinâmico, pré-sanitizar no ponto de render SSR (Node) e passar HTML já limpo ao React. A validação de bundle/#418 é na VPS (vite só builda lá).
   - Atualizar o comentário do arquivo para refletir a fonte única.

7. **Trocar a detecção do gate por parser** em `lib/news-engine/src/validate.ts`.
   - Remover a constante regex `DANGEROUS_HTML` (`validate.ts:30-31`) e substituir seu uso em `validate.ts:95-97` por `containsDangerousHtml(x.content)` do módulo canônico (`./sanitizeHtml.ts`). O issue continua sendo `{ code: "html_dangerous", severity: "block" }`. Nada mais em `validateRewrite` muda.

8. **Estender os testes (bateria de bypass).** Cada payload abaixo deve ser NEUTRALIZADO (sanitizado) e DETECTADO (`containsDangerousHtml === true`):
   - `lib/news-engine/test/` — novo arquivo `sanitizeHtml.test.ts` (`node --test`, imports com extensão `.ts` explícita, padrão do repo): para cada vetor `[<svg onload=alert(1)>, <math href="javascript:alert(1)">, <img src=x onerror=alert(1)> (sem aspas/sem espaço), <a href="javascript:alert(1)">, <a href="data:text/html,<script>...">, <div style="expression(alert(1))">, <scr<script>ipt>alert(1)</script> (aninhado/malformado), <IFRAME SRC=...>, <p onclick=x()>]` assert que `sanitizeArticleHtml` remove o executável e `containsDangerousHtml` retorna `true`; e que HTML editorial normal passa intacto e `containsDangerousHtml` retorna `false`.
   - `lib/news-engine/test/validate.test.ts` — ampliar o caso `html_dangerous` (hoje em 134-143) para incluir `<svg onload=...>` e `<math href=javascript:...>` (que a regex antiga NÃO pegava) e assertar `severity: "block"`.
   - `artifacts/api-server/test/ingestSanitize.test.ts` — adicionar os mesmos vetores svg/math/malformado, assertando que não sobrevivem; manter o caso "HTML editorial normal passa intacto".

### FASE B — Gate `enforce` (passa a REJEITAR; gated em SHADOW + revisão humana)

9. **SHADOW / report-diff em produção (obrigatório antes de virar o default).**
   - Fazer deploy das FASES A e 7 mantendo `validationMode: "log"` (default atual em `store.ts:140`). Nesse modo, um `html_dangerous` detectado pelo NOVO detector é apenas logado via `logEvent` (ver `rewriter.ts:290-298`; módulo `rewriter`), sem rejeitar.
   - Rodar por uma janela de ≥72h. Medir quantas reescritas seriam bloqueadas (contar eventos com `html_dangerous` no log de eventos da central — tabela do `eventLog` em `artifacts/central-hub/src/lib/eventLog.ts`, também visível no painel). Montar/ajustar a allowlist de tags legítimas que a IA realmente produz, para que a taxa de rejeição legítima seja ~0 (evitar artigos vazios/perdidos).
   - **Revisão humana obrigatória** dos números da janela antes de prosseguir.

10. **Virar o default para `enforce` (mudança que passa a rejeitar).**
    - Alterar `artifacts/central-hub/src/lib/store.ts:140` de `validationMode: "log",` para `validationMode: "enforce",`.
    - Confirmar que o fluxo de rejeição já existente em `rewriter.ts:301` (`return "blocked"`) e `rewriter.ts:493-526` (blocked → retry até MAX_ATTEMPTS → `failReason: "validation_blocked"`) segue funcionando (não precisa reescrever esse fluxo — já existe).
    - **Rollback instantâneo disponível sem deploy:** setar `validationMode` de volta para `"log"` na tela de Configurações do central-web (o valor persistido em `central_settings` sobrepõe o default — ver `store.ts:206` e comentário `store.ts:79-85`). Documentar isso na entrega.

---

## Fora de escopo

- **Defesa de saída no central-web** (renderização crua do HTML no admin — o sink do AP-1). É o **PRD-04b**. NÃO tocar em `artifacts/central-web/*` aqui.
- **Delimitação/validação da injeção indireta de prompt** (marcar conteúdo externo no prompt). É o **PRD-05**. Este PRD apenas soft-habilita o 05 ao entregar o gate `enforce`.
- **Token do admin fora do localStorage / CSP de borda** (PRD-03 / PRD-08 / PRD-04b).
- **SSRF do proxy de imagem** (PRD-06a).
- **NÃO** alterar o caminho do cliente DOMPurify em `brasilia-agora/src/lib/sanitize.ts:74` (só o ramo SSR).
- **NÃO** trocar `SESSION_SECRET` / `SETTINGS_ENCRYPTION_KEY`.
- **NÃO** alterar os demais campos de `HubSettings` nem outros gates (`too_short`, `off_topic`, thresholds) — só o comportamento do `html_dangerous` e o default de `validationMode`.

---

## Comandos de verificação

```bash
# 0) Baseline já registrado nas pré-condições. Rodar tudo abaixo a partir da raiz do repo.
cd "c:/Users/Usuario(a) Master/sp011"

# 1) A política canônica é importada pelos TRÊS consumidores + detector do gate.
#    SUCESSO: cada grep abaixo retorna >=1 ocorrência (o módulo canônico é a fonte única).
grep -rn "news-engine/sanitize\|sanitizeArticleHtml\|sanitizeAmpHtml\|containsDangerousHtml" \
  artifacts/api-server/src/lib/ingestSanitize.ts \
  artifacts/api-server/src/routes/amp.ts \
  artifacts/brasilia-agora/src/lib/sanitize.ts \
  lib/news-engine/src/validate.ts

# 2) As regex antigas de sanitização sumiram dos consumidores.
#    SUCESSO: retorna 0 (ingestSanitize não tem mais cadeias .replace de sanitização).
grep -c "\.replace(" artifacts/api-server/src/lib/ingestSanitize.ts
#    SUCESSO: retorna 0 (a constante regex do gate foi removida).
grep -c "const DANGEROUS_HTML" lib/news-engine/src/validate.ts

# 3) Novo módulo canônico existe e é exportado.
#    SUCESSO: arquivo existe e package.json expõe o subpath.
ls lib/news-engine/src/sanitizeHtml.ts
grep -n "\"./sanitize\"" lib/news-engine/package.json

# 4) Build composite do lib + testes do news-engine (inclui a bateria de bypass).
#    SUCESSO: tsc sem erro; node --test com 0 failing; casos svg/math/malformado passam.
cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && pnpm exec tsc -b && node --test

# 5) Testes e typecheck do api-server (ingestSanitize + AMP).
#    SUCESSO: 0 failing; typecheck sem erro.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test && pnpm run typecheck

# 6) Testes do central-hub (rewriter/gate não regrediram).
#    SUCESSO: 0 failing.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && node --test

# 7) SÓ APÓS FASE B (shadow + revisão humana): default virou enforce.
#    SUCESSO: a linha de default mostra "enforce".
grep -n "validationMode:" "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub/src/lib/store.ts"
```

> Observação: o build do frontend (`vite`) NÃO roda no Windows — a validação de que o bundle do cliente NÃO inclui `jsdom` e de que não há hydration mismatch (#418) é feita no Docker da VPS após o deploy de `web`. Registrar essa checagem manual como parte do aceite.

---

## Critérios de aceite

- [ ] Existe `lib/news-engine/src/sanitizeHtml.ts` exportando `sanitizeArticleHtml`, `sanitizeAmpHtml` e `containsDangerousHtml`, e é a ÚNICA definição de política (allowlist) do repo.
- [ ] `lib/news-engine/package.json` expõe o subpath `"./sanitize"` e `pnpm exec tsc -b` no `lib/news-engine` passa sem erro.
- [ ] `ingestSanitize.ts`, `amp.ts` (`toAmpHtml`) e o ramo SSR de `brasilia-agora/src/lib/sanitize.ts` consomem o módulo canônico; `grep -c "\.replace(" ingestSanitize.ts` = 0; `grep -c "const DANGEROUS_HTML" validate.ts` = 0.
- [ ] A bateria de bypass (svg/onload, math/href, `data:`/`vbscript:`, tag malformada/aninhada, handler sem espaço, `style=expression`) é NEUTRALIZADA por `sanitizeArticleHtml`/`sanitizeAmpHtml` e DETECTADA por `containsDangerousHtml` — comprovado por `node --test` verde em `lib/news-engine` e `artifacts/api-server`.
- [ ] HTML editorial legítimo (h2/p/ul/a[href https]/img/b) passa intacto (sem regressão de conteúdo válido) nos testes.
- [ ] Testes de `api-server` e `central-hub` continuam verdes (`node --test`) e `pnpm run typecheck` do `api-server` passa.
- [ ] (VPS) Após deploy, o bundle do cliente do blog NÃO contém `jsdom` e a home SSR não gera hydration mismatch (#418) — checagem manual registrada.
- [ ] **FASE B:** janela de SHADOW de ≥72h em `log` executada; contagem de eventos `html_dangerous` revisada por humano; allowlist ajustada; SÓ então `store.ts:140` = `"enforce"` (comprovado pelo grep do passo 7).
- [ ] Em `enforce`, uma reescrita com `html_dangerous` NÃO é gravada como `ok`: segue o fluxo `blocked → retry → failReason: "validation_blocked"` (`rewriter.ts:493-526`) — comprovável por teste unitário do gate ou observação de log.

---

## Definition of Done

FASE A + passos 7/8 mergeados na `main` com todos os testes (`node --test` em `lib/news-engine`, `artifacts/api-server`, `artifacts/central-hub`) verdes, os três consumidores importando a política canônica única (0 regex de sanitização remanescente nos consumidores), e a bateria de bypass comprovadamente neutralizada. FASE B (default `enforce`) concluída SOMENTE após janela de SHADOW ≥72h + revisão humana dos números + allowlist ajustada, com rollback instantâneo (voltar a `log` pela UI, sem deploy) documentado na entrega e registrado em `security-audit/STATUS.md`.

---

## Dependências

- **Nenhuma dependência dura.** Pode rodar em paralelo com qualquer outro PRD da Onda 1.
- **Soft-habilita o PRD-05** (injeção indireta de prompt): o 05 assume o gate `enforce` entregue aqui.
- **Independente do PRD-04b** (defesa de saída no central-web) — codebases distintos; 04b não é pré-requisito para este.

---

## Prioridade e esforço

- **Prioridade:** Médio Prazo (Onda 1).
- **Esforço:** **Alto** — toca `lib/news-engine` (composite), `api-server` (ingest + AMP) e o SSR do frontend (`brasilia-agora`), com a sutileza dura do bundle server-only/#418, além da fase operacional de SHADOW.

---

## Plano de rollback

- **Reverter código (FASE A/7/8):** `git revert <hash-do-merge>` do branch `fix/prd-04a-sanitizacao-writepath`; rebuild dos serviços afetados na VPS (`api`, `central-api`, `web` — ver mapeamento abaixo).
- **Reverter só o gate `enforce` (FASE B) SEM deploy:** na tela de Configurações do central-web, setar `validationMode` de volta para `log` (o valor persistido em `central_settings` sobrepõe o default do código — `store.ts:206`; comentário `store.ts:79-85`). Este é o rollback preferencial e instantâneo para a parte que rejeita conteúdo.
- **Rebuild direcionado após revert de código** (na VPS, `cd /opt/sp011; git pull`):
  ```bash
  docker compose build api central-api web
  docker compose up -d api central-api web
  ```
  (Mapeamento: `lib/news-engine` → `api` E `central-api`; `artifacts/api-server` → `api`; `artifacts/brasilia-agora` → `web`.)

---

## Notas de execução para o agente

- Trabalhe **somente neste PRD** (PRD-04a). Não misture com 04b/05/03/06a.
- **Ordem inegociável:** FASE A + detector (passo 7) + testes (passo 8) primeiro; SÓ depois FASE B. Nunca virar `enforce` sem a janela de SHADOW e a revisão humana — virar cedo pode gerar artigos vazios/perdidos em produção.
- **Sinalização de revisão humana (obrigatória antes do merge/deploy):** (a) a mudança do default para `enforce` passa a REJEITAR conteúdo do pipeline; (b) foi adicionada dependência nova (supply chain — `jsdom`/`sanitize-html`). Ambas exigem aprovação humana + execução em canário/shadow antes de ir para produção.
- Se **qualquer** critério de aceite falhar após implementar, **NÃO marque como concluído**: registre o motivo exato (comando, saída, arquivo:linha) em `security-audit/STATUS.md` (criar o arquivo se não existir, com uma entrada por PRD) e **PARE**.
- Ao concluir com sucesso, atualize `security-audit/STATUS.md` registrando: PRD-04a, fase concluída (A e/ou B), hashes de commit, resultado dos comandos de verificação, e a data/duração da janela de SHADOW.
- Regras do repo a respeitar: imports de teste com extensão `.ts` explícita; nunca unicode literal em regex (usar `\uXXXX`); após mexer em `lib/*` composite, `pnpm exec tsc -b` no lib antes de typecheckar dependentes; commit direto na `main` (dev solo, sem PR) só após verificação verde e, para as partes sinalizadas, aprovação humana.
