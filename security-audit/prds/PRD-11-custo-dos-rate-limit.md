# PRD-11 — Custo/DoS — teto de cota default, rate limits faltantes e limites anti-bomba

> **Metadados:** Onda 3 | Prioridade: **Médio Prazo** | Esforço: **Médio** | Dependências: **nenhuma** (dura) | **CANÁRIO** (o teto de cota default pode estrangular publicação legítima; o rate limit do proxy público de imagem pode disparar 429 em pageview legítimo). Sinalizar revisão humana antes do merge por tocar em economia de custo de IA e no worker de render.
>
> Este PRD é **autocontido**. Um agente futuro deve conseguir implementá-lo sem acesso à conversa que o gerou. Todas as referências `arquivo:linha` abaixo foram lidas e confirmadas no commit atual do repo (`c:/Users/Usuario(a) Master/sp011`, branch `main`).

---

## Objetivo

Fechar o vetor de exaustão de custo/disponibilidade **AP-8**: (a) o portão de economia da central **nunca fecha** se qualquer blog ativo com regra ativa não tem `maxPostsPerDay` — collector e rewriter seguem gastando scraping + tokens de IA indefinidamente; (b) o rate limit só existe em login/ingest/publish — está **ausente** em `/api/admin/article-from-url`, `/api/image`, `/api/uploads/*` (rotas caras/abusáveis); (c) não há limite **anti-bomba** de pixels/tempo no `sharp` nem timeout/limite de concorrência de recurso no `Playwright` — uma imagem-bomba ou um HTML pesado pode travar workers e estourar memória da VPS. A remediação aplica um teto de cota default configurável (permitindo o portão sempre fechar), aplica rate limit às rotas faltantes, e impõe limites duros de decodificação/renderização.

---

## Contexto / Evidência de origem

**Attack path AP-8** (`security-audit/03-threat-model.md`, seção 4, linha 49): "**AP-8 — Exaustão de custo/IA (F13/F11/F19).** Portão nunca fecha sem `maxPostsPerDay`; rate limit ausente; bombas sharp/Playwright → consumo ilimitado / travamento de workers. STRIDE: **D**. Mitiga: PRD-11."

**Achados (mapa de riscos `security-audit/02-mapa-riscos.md`):**
- **F13** (linha 61): "Portão de economia nunca fecha sem `maxPostsPerDay` | `central-hub/src/lib/dailyQuota.ts:92` | **Médio** | (custo) | Fato/Alta".
- **F19** (linha 66): "Sem handler de erro global (vaza err.message); ensureSchema engole falhas; **rate limit ausente** | ... | Médio | 3 | Fato/Alta". (A parte "rate limit ausente" é o que este PRD trata; o handler de erro global / ensureSchema é PRD-13.)
- **F11 — aspecto bombas de mídia** (tratado como sub-item deste PRD; o aspecto *backup* de F11 é PRD-09/AP-9). A linha F11 do mapa (59) fala de backups, mas o **plano de auditorias** separa o sub-item de bombas de mídia sob "F11 → PRD-11".

**Classificação (plano de auditorias `security-audit/04-plano-auditorias.md`, Domínio 7 "Disponibilidade / custo / DoS", linhas 81-87, e linha 31):**
- Teto de cota default ausente (custo IA): **OWASP LLM10 (Unbounded Consumption)**; **OWASP API04:2023 (Unrestricted Resource Consumption)**; **CWE-770 (Allocation of Resources Without Limits)**; **CVSS aprox. ~6.5** (F13 → PRD-11). (linhas 31 e 87)
- Rate limit ausente (admin/proxy/upload): **A04:2021 (Insecure Design)**; **API04:2023**; **CWE-770**; **CVSS aprox. ~6.5** (F19 → PRD-11). (linha 85)
- Bombas de mídia/decompressão (sharp/Playwright/upload): **A04:2021**; **CWE-409 (Improper Handling of Highly Compressed Data / Decompression Bomb)** / **CWE-400 (Uncontrolled Resource Consumption)**; **CVSS aprox. ~6.5** (F11 → PRD-11). (linha 86)

**Evidências concretas lidas no código (`arquivo:linha` reais):**

1. **Portão de economia nunca fecha sem teto — `artifacts/central-hub/src/lib/dailyQuota.ts:92`.**
   - Em `compute()`, após filtrar `candidates` (blogs ativos COM regra ativa, linhas 68-89), a linha 92 é:
     ```ts
     // Blog sem teto diário = demanda ilimitada → não há o que saturar.
     if (candidates.some((b) => !b.maxPostsPerDay)) return null;
     ```
   - `return null` significa "há vaga → NUNCA pausa". Basta **um** blog ativo com regra ativa e `maxPostsPerDay` nulo/0 (o schema `lib/central-db/src/schema/blogs.ts:30` — `maxPostsPerDay: integer("max_posts_per_day")` — é **nullable, sem default**) para o portão nunca fechar.
   - Consumidores: `artifacts/central-hub/src/services/collector.ts:347` (`const quotaReason = await dailyQuotaFilledReason();`) e `artifacts/central-hub/src/services/rewriter.ts:662` (`if (await dailyQuotaFilledReason()) return;`). Com `null`, ambos seguem coletando/reescrevendo → gasto de scraping + tokens de IA sem teto. O cabeçalho do próprio arquivo (linhas 9-13) documenta a semântica "sem maxPostsPerDay (null/0) → demanda ilimitada → o pipeline NUNCA pausa".

2. **Rate limit existe só em 3 rotas — middleware `artifacts/api-server/src/middlewares/endpointRateLimit.ts`.**
   - `endpointRateLimit(endpointName)` (linha 18) com constantes **fixas**: `LIMIT=10` (linha 10), `WINDOW_MS=60_000` (11), `BLOCK_MS=60*60_000` (12). Incrementa em **toda** requisição (não só falhas — roda como middleware antes do handler) e bloqueia o IP por 1h após 10 req/min. Fail-open em erro de DB (catch → `next()`, linhas 97-99).
   - Aplicado **apenas** em: `/api/ingest` (`artifacts/api-server/src/routes/ingest.ts:39`) e `/api/publish` (`artifacts/api-server/src/routes/webhook.ts:9`, montado em `webhook.ts:70`). O login tem limitador próprio (`checkRateLimit` em `artifacts/api-server/src/routes/admin.ts:31`).
   - **Ausente** em (montagem em `artifacts/api-server/src/routes/index.ts`): `/api/uploads` (linha 35 → `uploadsRouter`), `/api/admin` (linha 40 → `adminRouter`), `/api/image` (linha 64 → `imageRouter`, rota pública **não-autenticada**).
   - Rota cara autenticada sem limite: `POST /api/admin/article-from-url` (`artifacts/api-server/src/routes/admin.ts:1215`, `router.post("/article-from-url", requirePermission("articles.create"), ...)`) — faz scraping (`scrapeArticle`/`scrapeWithDiffbot`) + reescrita com IA. Uma conta comprometida ou abusiva queima orçamento de IA/scraping em loop.

3. **Sem limite anti-bomba no `sharp` — `artifacts/api-server/src/lib/imageTransform.ts:83-94`.**
   - `transformImage()`:
     ```ts
     const pipeline = sharp(raw).resize({ width: w, withoutEnlargement: true });
     if (fmt === "avif") return pipeline.avif({ quality: q, effort: 1 }).toBuffer();
     return pipeline.webp({ quality: q, effort: 1 }).toBuffer();
     ```
     — **sem** `limitInputPixels` explícito (aceita o default largo do sharp, ~268 MP) e **sem** `.timeout(...)`. É o **único ponto de decodificação** compartilhado por `routes/image.ts` (proxy externo, allowlist) e `routes/uploads.ts` (upload do portal) — o lugar certo para o limite.
   - No proxy, `artifacts/api-server/src/routes/image.ts:158` (`Buffer.from(await resp.arrayBuffer())`) lê o corpo de origem **sem limite de bytes** (o cap de bytes do fetch de origem é território do **PRD-06a** `safeFetch`; aqui garantimos que, mesmo se um buffer grande chegar, o `sharp` recuse por pixels/tempo).

4. **Upload sem verificação de dimensão/decompressão — `artifacts/api-server/src/routes/uploads.ts`.**
   - `multer({ storage: multer.memoryStorage(), limits: { fileSize: VIDEO_MAX } })` (linhas 144-146): há cap de **tamanho de arquivo** (`IMAGE_MAX=8MB` linha 140, `VIDEO_MAX=100MB` linha 141), mas o buffer é gravado cru em disco (`writeFileSync`, linhas 193 e 225) **sem** decodificar/validar dimensões — um PNG/WebP de poucos KB pode expandir para centenas de MP na decodificação posterior (bomba de decompressão), decodificada só no GET de transformação (linhas 276-286).

5. **Playwright sem timeout global / limite de concorrência / recycle — `artifacts/api-server/src/lib/social/renderTemplate.ts`.**
   - `getBrowser()` (linha 28) mantém **um** Chromium "quente" reusado. `renderArt()` (linha 69) cria um `context`/`page` novo por chamada; único timeout é `page.setContent(html, { waitUntil: "load", timeout: 30_000 })` (linha 82). Não há: (i) timeout global do render (screenshot/`page.evaluate` podem pendurar — o loop de fit tem `guard=400` na linha 105, mas o resto não), (ii) limite de renders concorrentes (uma rajada abre N contextos → memória sem teto no VPS), (iii) recycle periódico do browser (memória cresce). O Chromium roda com `--no-sandbox` (linha 38) — travar/estourar o worker de render afeta a publicação social de todos os blogs (imagem compartilhada).

**Risco concreto:** (a) um único blog sem `maxPostsPerDay` mantém collector+rewriter rodando 24/7 gastando tokens de IA e scraping mesmo com a fila do dia cheia; (b) um atacante externo martela `/api/image?url=...` (não-auth) forçando fetch+sharp repetidos, ou um autenticado abusa de `/api/admin/article-from-url` para queimar orçamento de IA; (c) uma imagem-bomba (poucos KB → centenas de MP) trava o processo do api-server em `sharp`; (d) uma rajada de renders sociais abre dezenas de contextos Chromium `--no-sandbox` e estoura a RAM. STRIDE do AP-8: **D** (Denial of Service / exaustão de custo).

> **Atenuantes existentes (preservar):** já há cota diária de IA + cooldown/parking de chave na central (mapa STRIDE `03-threat-model.md`, seção "Já mitigado"); o `endpointRateLimit` já é fail-open (não derruba usuário legítimo em erro de DB); o cap de tamanho de arquivo do upload (8/100 MB) permanece. Este PRD **soma** limites, não remove os existentes.

---

## Pré-condições

- [ ] Criar branch: `git checkout -b fix/prd-11-custo-dos-rate-limit`
- [ ] Rodar e **registrar** o baseline de testes (devem passar ANTES de qualquer mudança). Copiar a saída para o STATUS:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && pnpm run typecheck
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
  ```
- [ ] Ler estes arquivos ANTES de editar (todos já mapeados neste PRD):
  - `artifacts/central-hub/src/lib/dailyQuota.ts` — `compute()` 68-111; capless→null na linha **92**; loop de saturação 105-109; consumidores collector.ts:347 / rewriter.ts:662.
  - `artifacts/central-hub/src/lib/store.ts` — como `getSettings()`/`HubSettings` e `central_settings` (key/jsonb) funcionam (para expor o default configurável). Ler também um consumidor, ex.: `rewriter.ts:408` / `deliveryWorker.ts:163`.
  - `artifacts/api-server/src/middlewares/endpointRateLimit.ts` — assinatura e constantes `LIMIT/WINDOW_MS/BLOCK_MS` (10-12).
  - `artifacts/api-server/src/routes/ingest.ts:39` e `artifacts/api-server/src/routes/webhook.ts:9,70` — padrão de uso do `endpointRateLimit` (aplicar igual, sem quebrar ingest/publish).
  - `artifacts/api-server/src/routes/index.ts` — montagem: uploads (35), admin (40), image (64).
  - `artifacts/api-server/src/routes/admin.ts:1214-1343` — a rota `article-from-url` (POST na 1215).
  - `artifacts/api-server/src/routes/uploads.ts` — multer 144-151; POST /image 180-203; POST /media 210-235; caps 140-141.
  - `artifacts/api-server/src/lib/imageTransform.ts:83-94` — `transformImage` (ponto do `sharp`).
  - `artifacts/api-server/src/routes/image.ts` — rota `/image` (202), `fetchOriginRaw` (141-159), `getPlaceholder` (134-138).
  - `artifacts/api-server/src/lib/social/renderTemplate.ts` — `getBrowser` (28), `renderArt` (69-121), `closeRenderBrowser` (124-129).
  - Um teste existente para copiar o padrão `node --test` com import `.ts` explícito: `artifacts/central-hub/test/fairBatch.test.ts` (função pura extraída, testada) e `artifacts/central-hub/test/rules.test.ts`; no api-server ver `artifacts/api-server/test/*.test.ts`.
- [ ] Confirmar que `security-audit/STATUS.md` existe (criar se não existir — ver "Notas de execução para o agente").

---

## Escopo (ações em ordem)

> **Divisão por pacote/serviço:** dailyQuota é **central-hub** (deploy → `central-api`). Rate limits, sharp, uploads e Playwright são **api-server** (deploy → `api`). Nenhum `lib/*` composite é tocado.

### Parte A — Teto de cota default (central-hub) — **CANÁRIO principal**

1. **Extrair a decisão de saturação para uma função pura testável** em `artifacts/central-hub/src/lib/dailyQuota.ts`. Criar, no mesmo arquivo, uma função exportada `isDailyQuotaFilled(candidates: { id: string; name: string; maxPostsPerDay: number | null }[], occupiedByBlog: Map<string, number>, defaultCap: number): string | null` que:
   - Para cada `candidate`, calcula `cap = (b.maxPostsPerDay && b.maxPostsPerDay > 0) ? b.maxPostsPerDay : defaultCap` (o **default substitui** o nulo/0 — nunca mais "ilimitado").
   - Se algum blog tem `occupied < cap` → retorna `null` (ainda há vaga).
   - Se todos têm `occupied >= cap` → retorna a string de motivo (mesma mensagem da linha 110 atual).
   - **Não** contém chamada de DB (recebe dados prontos) — espelha o padrão de `selectFairBatch`/`rules` (funções puras testadas).
2. **Reescrever `compute()`** em `dailyQuota.ts` para: (i) manter as consultas de blogs/regras/contagens (linhas 69-103); (ii) **remover a linha 92** (`if (candidates.some((b) => !b.maxPostsPerDay)) return null;`) que curto-circuita para "ilimitado"; (iii) montar `occupiedByBlog` a partir de `byBlog` (waiting + deliveredToday) e delegar a decisão a `isDailyQuotaFilled(candidates, occupiedByBlog, defaultCap)`.
3. **Expor o teto default configurável e ALTO.** Ler o default nesta ordem de precedência, na `compute()`:
   - `getSettings()` da central (`store.ts`) — adicionar um campo opcional `defaultMaxPostsPerDay?: number` em `HubSettings` (persistido em `central_settings`), se existir e for `> 0`;
   - senão, env `CENTRAL_DEFAULT_MAX_POSTS_PER_DAY` (parse int, se `> 0`);
   - senão, uma constante `DEFAULT_MAX_POSTS_PER_DAY` no topo do módulo com valor **ALTO** (usar **500**) para NÃO estrangular publicação legítima (canário) — o objetivo é que o portão *possa* fechar, não apertar a operação.
   - Registrar em `logEvent`/`logger` (aproveitar o evento já existente nas linhas 56-64) quando o portão fechar por conta do default (para o canário distinguir "fechou pelo teto real" de "fechou pelo default").
4. **Não** pausar localizer nem deliveryWorker (o cabeçalho do arquivo, linhas 16-17, exige que a fila existente continue andando) — só collector/rewriter consultam este módulo; manter assim.

### Parte B — Rate limits nas rotas faltantes (api-server)

5. **Parametrizar `endpointRateLimit`** em `artifacts/api-server/src/middlewares/endpointRateLimit.ts`: mudar a assinatura para `endpointRateLimit(endpointName: string, opts?: { limit?: number; windowMs?: number; blockMs?: number })`, usando as constantes atuais (`LIMIT=10`, `WINDOW_MS=60_000`, `BLOCK_MS=3_600_000`) como **defaults** — assim `ingest.ts:39` e `webhook.ts:9` continuam byte-idênticos em comportamento. Ajustar o `INTERVAL '1 minute'` do SQL (linha 39) para derivar de `windowMs` (ou manter 1 min e documentar que o reset é sempre 1 min — aceitável se `windowMs` ficar em 60_000 nos usos deste PRD).
6. **Aplicar rate limit a `POST /api/admin/article-from-url`** (rota mais cara: scraping + IA) em `artifacts/api-server/src/routes/admin.ts:1215`: inserir `endpointRateLimit("/api/admin/article-from-url", { limit: 20, windowMs: 60_000, blockMs: 15 * 60_000 })` como **primeiro** middleware da rota (antes de `requirePermission`).
7. **Aplicar rate limit aos uploads** em `artifacts/api-server/src/routes/uploads.ts`: criar `const uploadRateLimit = endpointRateLimit("/api/uploads", { limit: 60, windowMs: 60_000 })` e inseri-lo como **primeiro** middleware das rotas `POST /image` (linha 180) e `POST /media` (linha 210), antes de `authMiddleware`.
8. **Aplicar rate limit ao proxy público de imagem** `GET /api/image` (**CANÁRIO secundário**) em `artifacts/api-server/src/routes/image.ts:202`: criar `const imageRateLimit = endpointRateLimit("/api/image", { limit: 240, windowMs: 60_000 })` e inseri-lo como middleware da rota. **Justificativa do número alto:** um pageview legítimo dispara dezenas de `/api/image` em rajada; um limite baixo (ex.: 10/min) quebraria o site. Começar generoso (240/min por IP) e observar 429 no canário; se aparecer 429 em usuário real, aumentar o limite (os hits de cache MEM/disco são baratos — o alvo é o path de miss/fetch). Não aplicar 429 a assets de cache; se necessário, no futuro, isentar cache hits (fora do escopo deste PRD).
9. **Não** aplicar rate limit blanket em `router.use("/admin", ...)`: o painel admin faz múltiplas chamadas por interação e um limite de 10/min derrubaria a UI. Limitar **apenas** as rotas caras enumeradas (ação 6). (A cobertura ampla de `/api/admin/*` por permissão/RBAC é PRD-02/03, não este.)

### Parte C — Limites anti-bomba de `sharp` (api-server, ponto compartilhado)

10. **Adicionar limite de pixels e timeout ao `sharp`** em `artifacts/api-server/src/lib/imageTransform.ts:83-94` (`transformImage`):
    - Definir no topo do módulo `export const MAX_INPUT_PIXELS` (usar **50_000_000** = 50 MP — muito acima de qualquer imagem editorial real com `MAX_WIDTH=1600`, bem abaixo do default ~268 MP) e `const SHARP_TIMEOUT_S = 15`.
    - Trocar `sharp(raw)` por `sharp(raw, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })` e encadear `.timeout({ seconds: SHARP_TIMEOUT_S })` no `pipeline`. Um input acima do cap faz o `sharp` **lançar** — o erro já é tratado a montante (proxy: `image.ts:256-271` degrada para placeholder; upload GET: `uploads.ts:291-297` cai para streaming cru; ambos NÃO derrubam o processo).
    - **Opcional/recomendado:** endurecer `getPlaceholder()` (`image.ts:134-138`) com o mesmo `limitInputPixels` (o SVG é confiável, então é só defesa em profundidade — não obrigatório para o critério de aceite).

11. **Rejeitar bomba de decompressão no upload** em `artifacts/api-server/src/routes/uploads.ts`: antes do `writeFileSync` das rotas `POST /image` (linha 193) e `POST /media` (linha 225) — **somente para `mediaType === "image"`** — decodificar o cabeçalho com `sharp(req.file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()` num `try/catch`; se lançar OU se `width * height > MAX_INPUT_PIXELS`, responder `422`/`413` com mensagem clara e NÃO gravar. Vídeos (`VIDEO_TYPES`) pulam essa checagem. Importar `MAX_INPUT_PIXELS` de `imageTransform.ts` (fonte única do cap).

### Parte D — Limites de recurso do Playwright (api-server)

12. **Timeout global + concorrência + recycle** em `artifacts/api-server/src/lib/social/renderTemplate.ts`:
    - Extrair um helper **pequeno e testável** (ex.: `runWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T>` via `Promise.race` com timer que rejeita) e um **semáforo de concorrência** (`acquireRenderSlot()/release()`, com `MAX_CONCURRENT_RENDERS = 2`) — ambos como funções puras exportáveis (sem Chromium) para teste `node --test`.
    - Em `renderArt()` (linha 69): (i) **adquirir** um slot do semáforo antes de `browser.newContext()` e **liberar** no `finally`; (ii) envolver o corpo (`setContent` + `evaluate` + `screenshot`) em `runWithTimeout(..., RENDER_TIMEOUT_MS)` com `RENDER_TIMEOUT_MS = 20_000` — no timeout, fechar o `context` (o `finally` na linha 118-120 já fecha) e rejeitar; (iii) manter `page.setContent(..., { timeout: 30_000 })` ou reduzir para 15_000 (coerente com o timeout global).
    - **Recycle periódico:** contador de renders no módulo; a cada `RENDERS_BEFORE_RECYCLE = 200` renders bem-sucedidos, chamar `closeRenderBrowser()` (linha 124) para o próximo render relançar o Chromium — cap na deriva de memória do browser quente no VPS.
    - **Não** alterar os args de launch (linha 35-41) nem remover `--no-sandbox` (isso é **PRD-07**, hardening de container — fora de escopo aqui).

### Parte E — Testes

13. **Teste da cota (central-hub)** em `artifacts/central-hub/test/dailyQuota.test.ts` (`node --test`, import `.ts` explícito — padrão do repo). Cobrir `isDailyQuotaFilled` **sem DB**:
    - Blog com `maxPostsPerDay: null` e `defaultCap: 500`, `occupied: 500` → retorna string de motivo (**o portão FECHA** — regressão do F13).
    - Mesmo blog com `occupied: 499` → retorna `null` (ainda há vaga).
    - Blog com `maxPostsPerDay: 10`, `occupied: 10` e outro com `null`/`occupied: 5`/`defaultCap: 500` → retorna `null` (o capless com default alto não satura).
    - Default alto (500) + ocupação baixa → `null` (não estrangula — prova de canário).
14. **Teste do sharp (api-server)** em `artifacts/api-server/test/imageTransform.bomb.test.ts`: gerar uma imagem sintética com `sharp({ create: { width: N, height: N, channels: 3, background: ... } }).png().toBuffer()` (N tal que `N*N` seja pequeno, ex.: 2000×2000 = 4 MP) e chamar `transformImage` com um cap de pixels **abaixo** de `N*N` (parametrizar o cap para teste, ou testar via `sharp(buf, { limitInputPixels: 1_000_000 })` diretamente para provar que decodificar 4 MP com cap 1 MP **lança**); e com cap acima → sucesso. Objetivo: provar que o `limitInputPixels` está em vigor no caminho de transformação.
15. **Teste dos helpers do Playwright (api-server)** em `artifacts/api-server/test/renderGuards.test.ts`: testar `runWithTimeout` (uma task que resolve rápido → resolve; uma que demora além do `ms` → rejeita) e o semáforo (`MAX_CONCURRENT_RENDERS` respeitado: a (N+1)-ésima aquisição espera uma liberação) — **sem** lançar Chromium.

---

## Fora de escopo

- **SSRF / cap de bytes do fetch de origem** do proxy e do `article-from-url` — é **PRD-06a** (`safeFetch`, `maxBytes`) e **PRD-06b**. NÃO reescrever `fetchOriginRaw` para SSRF aqui; este PRD só adiciona o limite de pixels/tempo no `sharp` (defesa independente de decodificação).
- **Remover `--no-sandbox` / rodar container non-root / `mem_limit`/healthcheck do compose** — é **PRD-07** (hardening de runtime). Não tocar em `docker-compose.yml`, `deploy/blog-template/compose.yml` nem nos args de launch do Chromium.
- **Handler de erro global / vazamento de `err.message` / ensureSchema que engole falhas / alerting de `logSecurity`** — é **PRD-13** (o outro braço de F19). Não tocar.
- **Backups do pg-blogs (durabilidade)** — é **PRD-09** (aspecto backup de F11). Não tocar.
- **RBAC/cobertura ampla de `/api/admin/*`** — é PRD-02/03. Aqui só se limita as rotas caras enumeradas; **não** aplicar rate limit blanket que quebre o painel.
- **Nonce/transação do ingest** — movido para **PRD-14** (integridade), conforme `05-estrategia-prd.md:20`. Não tocar em `ingest.ts` além de deixá-lo intacto.
- **NÃO** trocar `SESSION_SECRET` / `SETTINGS_ENCRYPTION_KEY`.
- **NÃO** hardcodar conteúdo/limite por blog na imagem compartilhada (isolamento é por infra; o teto default é global/configurável, não por blog no código).

---

## Comandos de verificação

```bash
# Rodar a partir da raiz do repo.
cd "c:/Users/Usuario(a) Master/sp011"

# ── Parte A: dailyQuota ─────────────────────────────────────────────────────
# 1) A linha que curto-circuitava para "ilimitado" (capless → return null) foi removida.
#    SUCESSO: retorna 0 ocorrências.
grep -rn "maxPostsPerDay) return null" artifacts/central-hub/src/lib/dailyQuota.ts
#    SUCESSO: a função pura existe (>=1 ocorrência).
grep -rn "isDailyQuotaFilled" artifacts/central-hub/src/lib/dailyQuota.ts
#    SUCESSO: o default configurável existe (>=1 ocorrência de cada).
grep -rn "DEFAULT_MAX_POSTS_PER_DAY\|defaultMaxPostsPerDay\|CENTRAL_DEFAULT_MAX_POSTS_PER_DAY" artifacts/central-hub/src

# ── Parte B: rate limits ────────────────────────────────────────────────────
# 2) endpointRateLimit agora aplicado nas rotas antes descobertas (cada >=1).
grep -rn "endpointRateLimit" artifacts/api-server/src/routes/admin.ts
grep -rn "endpointRateLimit" artifacts/api-server/src/routes/uploads.ts
grep -rn "endpointRateLimit" artifacts/api-server/src/routes/image.ts
#    SUCESSO: ingest e publish continuam usando o middleware (não regrediram).
grep -rn "endpointRateLimit" artifacts/api-server/src/routes/ingest.ts artifacts/api-server/src/routes/webhook.ts

# ── Parte C: anti-bomba sharp ───────────────────────────────────────────────
# 3) limitInputPixels e timeout presentes no ponto compartilhado do sharp (cada >=1).
grep -rn "limitInputPixels" artifacts/api-server/src/lib/imageTransform.ts
grep -rn "\.timeout(" artifacts/api-server/src/lib/imageTransform.ts
#    SUCESSO: o upload valida dimensão antes de gravar (>=1 de metadata()/limitInputPixels em uploads.ts).
grep -rn "limitInputPixels\|\.metadata(" artifacts/api-server/src/routes/uploads.ts

# ── Parte D: Playwright ─────────────────────────────────────────────────────
# 4) timeout global, semáforo de concorrência e recycle presentes (cada >=1).
grep -rn "runWithTimeout\|RENDER_TIMEOUT_MS" artifacts/api-server/src/lib/social/renderTemplate.ts
grep -rn "MAX_CONCURRENT_RENDERS\|RENDERS_BEFORE_RECYCLE" artifacts/api-server/src/lib/social/renderTemplate.ts

# ── Parte E: testes + typecheck (SUCESSO: 0 failing / sem erro de tipo) ──────
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && node --test
cd "c:/Users/Usuario(a) Master/sp011/artifacts/central-hub" && pnpm run typecheck
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck

# ── Canário pós-deploy (VPS) ────────────────────────────────────────────────
# 5) (VPS) Confirmar que o portão de economia PODE fechar mesmo com blog sem teto:
#    observar o eventLog/coleta da central por ~24-72h — o collector/rewriter
#    devem pausar quando a fila do dia enche (mensagem de "Economia: ... pausadas").
#    SUCESSO: gasto de IA/scraping não cresce indefinidamente com a fila cheia; e
#    NENHUM blog legítimo é estrangulado pelo default (deliveredToday não bate 500).
# 6) (VPS) Amostrar respostas 429 de /api/image e /api/uploads:
#    SUCESSO: 429 aparece só sob abuso; usuário/pageview legítimo NÃO recebe 429.
#    Registrar os números no STATUS.
```

> Nota de ambiente: o build do frontend (`vite`) NÃO roda no Windows; nada aqui toca o frontend. Playwright **não** é lançado nos testes locais (só os helpers puros são testados) — o smoke real de render é VPS/pós-deploy. `node --test`/`esbuild` do api-server e central-hub rodam localmente no Windows.

---

## Critérios de aceite

- [ ] `grep -rn "maxPostsPerDay) return null" artifacts/central-hub/src/lib/dailyQuota.ts` = **0** (o curto-circuito "ilimitado" foi removido).
- [ ] Existe `isDailyQuotaFilled` (função pura) em `dailyQuota.ts`, e existe um default configurável ALTO (`DEFAULT_MAX_POSTS_PER_DAY`/`defaultMaxPostsPerDay`/`CENTRAL_DEFAULT_MAX_POSTS_PER_DAY`, valor 500) — comprovado por grep e por `node --test`.
- [ ] Teste `dailyQuota.test.ts` verde: blog capless com `occupied >= defaultCap` → portão FECHA (retorna motivo); `occupied < defaultCap` → `null`; ocupação baixa com default alto → `null` (não estrangula).
- [ ] `endpointRateLimit` aplicado (grep ≥1 em cada): `admin.ts` (rota `article-from-url`), `uploads.ts` (POST /image e /media), `image.ts` (GET /image). `ingest.ts` e `webhook.ts` inalterados em comportamento (defaults preservados).
- [ ] `transformImage` cria `sharp(raw, { limitInputPixels: MAX_INPUT_PIXELS, ... })` com `MAX_INPUT_PIXELS = 50_000_000` e `.timeout({ seconds: 15 })` — grep ≥1 de `limitInputPixels` e de `.timeout(` em `imageTransform.ts`.
- [ ] Upload de imagem valida dimensão/decodificação (`sharp(...).metadata()` com `limitInputPixels`) e **rejeita** (`413`/`422`) antes de gravar quando `width*height > MAX_INPUT_PIXELS` ou a decodificação lança — grep ≥1 em `uploads.ts`.
- [ ] `renderTemplate.ts` tem timeout global (`runWithTimeout`/`RENDER_TIMEOUT_MS`), semáforo de concorrência (`MAX_CONCURRENT_RENDERS`) e recycle (`RENDERS_BEFORE_RECYCLE`) — grep ≥1 de cada. Teste `renderGuards.test.ts` verde (timeout rejeita; semáforo bloqueia acima do limite).
- [ ] Teste `imageTransform.bomb.test.ts` verde: decodificar acima do cap de pixels lança; abaixo, sucesso.
- [ ] `node --test` verde e `pnpm run typecheck` sem erro em **ambos** `artifacts/central-hub` e `artifacts/api-server`.
- [ ] (VPS, canário) Registrado no STATUS: (a) o portão fecha com a fila cheia mesmo sem teto por blog e nenhum blog legítimo bate o default; (b) taxa de 429 em `/api/image` e `/api/uploads` não afeta tráfego legítimo.

---

## Definition of Done

Mergeado na `main`: (1) `dailyQuota.ts` sem o curto-circuito "capless → ilimitado", usando `isDailyQuotaFilled` pura + default configurável alto (500) — o portão de economia **sempre pode fechar**; (2) `endpointRateLimit` parametrizado e aplicado a `article-from-url`, uploads e proxy de imagem, sem regressão em ingest/publish e sem quebrar o painel admin; (3) `sharp` com `limitInputPixels=50 MP` + `timeout` no ponto compartilhado e validação de dimensão no upload; (4) Playwright com timeout global + semáforo de concorrência + recycle periódico; (5) `node --test` verde nos dois pacotes cobrindo cota, bomba de sharp e guards de render, e `pnpm run typecheck` sem erro; (6) canário observado ≥24h na VPS (portão fecha sem estrangular; 429 só sob abuso) com números registrados em `security-audit/STATUS.md`.

---

## Dependências

- **Nenhuma dependência dura.** Pode rodar em paralelo com qualquer PRD.
- **Relação (não bloqueante) com PRD-06a:** o cap de **bytes** do fetch de origem do proxy é do 06a (`safeFetch`); este PRD adiciona a defesa de **pixels/tempo** no `sharp`, independente e complementar. Se 06a já tiver mergeado, não duplicar o cap de bytes aqui.
- **Relação (não bloqueante) com PRD-07:** o hardening de container (non-root, remover `--no-sandbox`, `mem_limit`) reforça a mesma superfície do Playwright; este PRD trata só o nível de aplicação (timeout/concorrência/recycle).

---

## Prioridade e esforço

- **Prioridade:** **Médio Prazo** (Onda 3) — risco de disponibilidade/custo (STRIDE **D**), fora do caminho direto aos 4 ativos inegociáveis, mas com impacto financeiro real (tokens de IA) e de estabilidade (workers).
- **Esforço:** **Médio** — mudanças em dois pacotes (central-hub + api-server), refator para testabilidade da cota, parametrização do rate limit sem regredir ingest/publish, e limites de recurso do Playwright que exigem cuidado (semáforo/timeout/recycle). Sem migração de dados; sem mudança de auth.

---

## Plano de rollback

- **Reverter código:** `git revert <hash-do-merge>` do branch `fix/prd-11-custo-dos-rate-limit`. Isso restaura o `dailyQuota.ts` anterior (capless → ilimitado), remove os rate limits novos e os limites de sharp/Playwright.
- **Rebuild direcionado na VPS** (mapeamento CLAUDE.md §5: `artifacts/api-server`/`lib/db` → `api`; `artifacts/central-hub`/`lib/central-db`/`lib/news-engine` → `central-api`):
  ```bash
  cd /opt/sp011
  git pull
  docker compose build api central-api
  docker compose up -d api central-api
  ```
- **Mitigação de canário sem revert total:**
  - Se o **teto default** estrangular um blog legítimo (deliveredToday batendo 500 e faltando publicar): aumentar `DEFAULT_MAX_POSTS_PER_DAY`/`CENTRAL_DEFAULT_MAX_POSTS_PER_DAY` (ou setar `defaultMaxPostsPerDay` nas Configurações da central), OU definir `maxPostsPerDay` explícito e alto no blog afetado — sem reverter o PRD (o portão continua capaz de fechar).
  - Se o **rate limit do proxy de imagem** disparar 429 em pageview legítimo: aumentar o `limit` de `/api/image` (ação 8) e redeployar `api`; só reverter o PRD inteiro em último caso.

---

## Notas de execução para o agente

- Trabalhe **somente neste PRD** (PRD-11). Não misture com 06a/06b (SSRF), 07 (container), 09 (backup), 13 (erro global/alerting), 14 (nonce do ingest).
- **Regras do repo a respeitar:** imports de teste com extensão `.ts` explícita; `node --test` dentro do pacote (`artifacts/central-hub` e `artifacts/api-server` separadamente); typecheck por pacote (o filtro da raiz não casa no Windows); nunca unicode literal em regex (usar `\uXXXX`); commit direto na `main` (dev solo, sem PR) só após verificação verde; `MAX_INPUT_PIXELS` é fonte única em `imageTransform.ts` (importar em `uploads.ts`, não duplicar o número).
- **Preservar comportamento de ingest/publish:** os defaults do `endpointRateLimit` parametrizado devem manter `LIMIT=10`/`WINDOW=60s`/`BLOCK=1h` — validar por diff que `ingest.ts:39` e `webhook.ts:9,70` seguem idênticos em efeito.
- **Não** aplicar rate limit blanket em `/api/admin/*` — quebraria o painel; limitar só as rotas caras enumeradas.
- **Escolha do default de cota é canário:** usar valor ALTO (500) e observar; o objetivo é o portão *poder* fechar, não apertar a operação. Documentar o valor escolhido e a observação no STATUS.
- Se **qualquer** critério de aceite falhar após implementar, **NÃO marque como concluído**: registre o motivo exato (comando, saída, `arquivo:linha`) em `security-audit/STATUS.md` (criar o arquivo se não existir, uma entrada por PRD) e **PARE**.
- Ao concluir com sucesso, atualize `security-audit/STATUS.md` registrando: PRD-11, hashes de commit, resultado dos comandos de verificação, o valor de default de cota escolhido, os limites usados (rate limits, `MAX_INPUT_PIXELS`, timeouts do Playwright) e os números dos dois canários pós-deploy (portão fecha sem estrangular; 429 só sob abuso).
- **Sinalização de revisão humana:** este PRD **muda a economia de custo de IA** (portão de cota) e o **worker de render social** compartilhado por todos os blogs — sinalizar ao operador para revisão/observação **antes do merge/deploy** e acompanhar os dois canários em produção antes de considerar o PRD encerrado. Esforço Médio; não toca auth/segredos, mas o impacto operacional (estrangular publicação legítima) exige olho humano no rollout.
