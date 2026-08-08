# PRD-06b — SSRF autenticado — `article-from-url` e `scrape`

> **Metadados:** Onda 2 | Prioridade: **Médio Prazo** | Esforço: **Baixo** | Dependências: **PRD-06a** (reutiliza o util `safeFetch`) | **CANÁRIO** (a exigência de `https` + bloqueio de IP pode rejeitar o fetch de uma fonte de notícia legítima — observar a taxa de falha de `article-from-url` e da coleta após o deploy; NÃO quebrar fontes legítimas).
>
> Este PRD é **autocontido**. Uma sessão futura e autônoma do Claude Code deve conseguir implementá-lo sem acesso à conversa que o gerou. Todas as referências `arquivo:linha` abaixo foram lidas e confirmadas no commit atual do repo (`c:/Users/Usuario(a) Master/sp011`, branch `main`).
>
> **Reutilização:** este PRD **consome** o util `safeFetch` / `assertAllowedTarget` / `isPrivateOrReservedIp` entregue pelo **PRD-06a** em `artifacts/api-server/src/lib/safeFetch.ts`. Ele NÃO recria o util para o api-server; apenas o aplica. Para o pacote `lib/news-engine` (fronteira de composite, ver §Escopo) é criado um espelho mínimo do mesmo guarda.

---

## Objetivo

Fechar o **SSRF autenticado** (achado F5) na rota `POST /api/admin/article-from-url` (`artifacts/api-server/src/routes/admin.ts:1214-1343`) e nas funções de scraping que ela invoca: hoje a rota aceita uma URL arbitrária com validação mínima (`url.startsWith("http")`, `admin.ts:1220`), sem allowlist e sem bloqueio de faixas de IP internas, e a repassa a `fetch` diretos e a `scrapeArticle`/`scrapeWithDiffbot`. Um usuário com a permissão `articles.create` consegue fazer o servidor buscar `http://169.254.169.254/latest/meta-data/...` (metadados de nuvem), `http://pg-blogs:5432`, `http://ollama:11434` e `http://central:8090` (serviços internos da rede Docker). A remediação aplica o util `safeFetch` do **PRD-06a** a **todos** os fetch de URL **fornecida pelo usuário** (página do artigo, fallback de og:tags, página do YouTube e `scrapeArticle`), adiciona um **portão de validação síncrono no topo do handler** que rejeita IP literal interno / protocolo não-`https` **antes de qualquer requisição** (inclusive antes de repassar a URL ao Diffbot), e cobre a mesma superfície na cópia de `scrapeArticle` de `lib/news-engine/src/scrape.ts` (usada pela coleta da central). O IP-block é inegociável; a exigência de `https` é o botão de canário.

---

## Contexto / Evidência de origem

**Achado F5** — *SSRF autenticado (`article-from-url`, sem allowlist)* (mapa de riscos `security-audit/02-mapa-riscos.md`, linha 53: "SSRF autenticado (`article-from-url`, sem allowlist) | `api-server/src/routes/admin.ts:1215-1343` | **Alto** | Fato/Alta"). Também em `security-audit/01-entendimento-sistema.md:94` ("`/api/admin/*` … SSRF `article-from-url` (F5)").

**Classificação** (`security-audit/04-plano-auditorias.md`, Domínio 3, linha 50): OWASP **A10:2021 (SSRF)**; **CWE-918** (Server-Side Request Forgery); **CVSS aproximado ~7.2 (autenticado)** — exige a permissão `articles.create`, por isso menor que o F6/06a não-autenticado (~8.6).

**Attack path AP-2 (variante autenticada)** (`security-audit/03-threat-model.md`, seção 4): "**AP-2 — SSRF público (proxy de imagem, F6).** Não-auth → segue redirect sem revalidar host, aceita http, sem bloqueio de IP privado → `169.254.169.254`/metadados, pg-blogs, ollama, central:8090. STRIDE: **I, S, D**. Mitiga: PRD-06a." F5 é a **variante autenticada** do mesmo AP-2 (mapa `02-mapa-riscos.md:71`: "F5/F6 = AP-2"): mesmo destino interno (metadados, `pg-blogs`, `ollama`, `central:8090`), mas alcançado por um ator que já tem `articles.create` em vez de anônimo. STRIDE: **I** (leitura de recurso interno), **S** (o servidor age como o atacante), **D** (martelar serviços internos).

**Evidências concretas lidas no código** (`arquivo:linha` reais, confirmadas):

1. **Validação de entrada mínima, sem allowlist, sem bloqueio de IP.**
   - `artifacts/api-server/src/routes/admin.ts:1215` → `router.post("/article-from-url", requirePermission("articles.create"), async (req, res) => {` — a única barreira é a permissão.
   - `admin.ts:1220` → `if (!url || !url.startsWith("http")) { ... 400 "URL inválida" ... }` — aceita qualquer coisa que comece com `http` (inclui `http://169.254.169.254/`, `http://pg-blogs:5432/`, `http://ollama:11434/`, `http://central:8090/`). **Nenhuma** checagem de host, IP privado/reservado, ou protocolo `https`.

2. **Fetch cru da URL do usuário (dois pontos no handler).**
   - `admin.ts:1275-1278` (bloco de fallback og:tags de artigo web):
     ```ts
     const pageRes = await fetch(url, {
       headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0)" },
       signal: AbortSignal.timeout(10_000),
     });
     ```
     `url` é a URL crua do usuário; a resposta HTML é lida (`admin.ts:1280` `await pageRes.text()`) e parseada por regex.
   - `admin.ts:1192-1195` (dentro de `scrapeYouTube`, chamada só no ramo YouTube):
     ```ts
     const pageRes = await fetch(url, {
       headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0)" },
       signal: AbortSignal.timeout(12_000),
     });
     ```

3. **`scrapeArticle` — a cópia realmente usada por `article-from-url` está no api-server.**
   - `admin.ts:18` → `import { rewriteWithAI, scrapeArticle, scrapeWithDiffbot, getAIQuotaStatus } from "../lib/rssProcessor.js";` — o handler usa `scrapeArticle`/`scrapeWithDiffbot` de **`rssProcessor.ts`**, NÃO de news-engine.
   - `admin.ts:1267` → `const scraped = await scrapeArticle(url);`
   - `artifacts/api-server/src/lib/rssProcessor.ts:786-791` → `scrapeArticle` faz `fetch(url, { headers, signal: AbortSignal.timeout(12_000) })` (fetch cru em `rssProcessor.ts:788`), lê `await res.text()` (`:793`).

4. **`scrapeWithDiffbot` e o oEmbed/HEAD vão a HOST FIXO — não são SSRF direto da nossa infra.**
   - `rssProcessor.ts:758-764` (e o espelho `lib/news-engine/src/scrape.ts:31-37`): `scrapeWithDiffbot` faz `fetch("https://api.diffbot.com/v3/article?url=<user>&token=<key>…")` — o `fetch` vai a `api.diffbot.com` (host público fixo) com a URL do usuário só como **query param**; quem busca a URL alvo é o servidor da Diffbot, não o nosso. Não é SSRF a partir da nossa rede. Idem oEmbed `admin.ts:1169-1172` (`https://www.youtube.com/oembed?url=<user>&format=json` → host fixo `www.youtube.com`) e o HEAD de thumbnail `admin.ts:1154` (`https://img.youtube.com/vi/<videoId>/…` → host fixo `img.youtube.com`). **Estes NÃO são o vetor**; ver §Fora de escopo.

5. **Cópia em `lib/news-engine` (superfície da coleta da central).**
   - `lib/news-engine/src/scrape.ts:59-68` → `scrapeArticle(url, userAgent)` faz `fetch(url, { headers, signal: AbortSignal.timeout(12_000) })` (fetch cru em `scrape.ts:64`). É importada por `lib/news-engine/src/rss.ts:9` e chamada em `rss.ts:175` e `rss.ts:234`, consumida pelo **collector do central-hub**. Os links vêm de itens de feeds RSS externos (semi-confiáveis) — SSRF de menor severidade que F5, mas da mesma classe; a direção da auditoria pede cobrir `scrapeArticle`/`scrape` aqui também.

**Atenuante que ajuda o canário:** falhas de scrape já degradam para vazio/erro tratado (`scrapeArticle` retorna `{ text:"", imageUrl:"", description:"" }` em catch; o handler retorna `422 "Não foi possível extrair conteúdo desta URL…"` em `admin.ts:1314-1317` quando não há título nem texto). Uma rejeição de SSRF vira "não extraiu conteúdo" — sem crash. Isso torna a taxa de 422/erro de `article-from-url` o sinal de canário.

---

## Pré-condições

- [ ] **PRD-06a concluído (ou ao menos o `safeFetch` entregue e mergeado).** Confirmar que existe `artifacts/api-server/src/lib/safeFetch.ts` exportando `safeFetch`, `assertAllowedTarget` e `isPrivateOrReservedIp`. Se não existir, **PARAR** — este PRD depende dele (registrar em `security-audit/STATUS.md`).
- [ ] **Ler o PRD-06a** (`security-audit/prds/PRD-06a-ssrf-proxy-imagem.md`) para confirmar a assinatura EXATA do util entregue: `assertAllowedTarget(url, isAllowedHost, opts?)`, `safeFetch(url, init)` (retorna `{ status, headers, body: Buffer }`), os códigos de erro (`ssrf_blocked`, `host_not_allowed`, `protocol_not_allowed`) e a opção `allowHttp`. **Usar a assinatura real; não presumir.**
- [ ] Criar branch: `git checkout -b fix/prd-06b-ssrf-autenticado`
- [ ] Rodar e **registrar** o baseline de testes (devem passar ANTES de qualquer mudança). Comandos EXATOS:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
  cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && node --test
  cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && pnpm exec tsc -b
  ```
- [ ] Ler estes arquivos ANTES de editar (todos mapeados neste PRD):
  - `security-audit/prds/PRD-06a-ssrf-proxy-imagem.md` — contrato do `safeFetch`.
  - `artifacts/api-server/src/lib/safeFetch.ts` — util a reutilizar (assinaturas reais).
  - `artifacts/api-server/src/routes/admin.ts` — handler `article-from-url` (1214-1343), portão de entrada (1220), fetch cru og-fallback (1275-1278), `scrapeYouTube` fetch cru (1192-1195), Diffbot/oEmbed/HEAD host-fixo (1154, 1169-1172, 1236-1263), import de scrape (18).
  - `artifacts/api-server/src/lib/rssProcessor.ts` — `scrapeArticle` (786-833+, fetch cru 788) e `scrapeWithDiffbot` (758-781).
  - `lib/news-engine/src/scrape.ts` — `scrapeArticle` (59-236, fetch cru 64) e `scrapeWithDiffbot` (31-54).
  - `lib/news-engine/src/rss.ts:9,175,234` — quem consome `scrapeArticle` no lib.
  - Um teste existente para copiar o padrão: `artifacts/api-server/test/ingestSanitize.test.ts` e `lib/news-engine/test/dedup.test.ts` (`node --test`, import com extensão `.ts` explícita).
- [ ] Confirmar que `security-audit/STATUS.md` existe (criar se não existir — ver "Notas de execução para o agente").

---

## Escopo (ações em ordem)

> **Decisão de fronteira de pacote (ler antes de codar).** Há DUAS cópias de `scrapeArticle`: a do api-server (`rssProcessor.ts`, importada pelo handler F5) e a do lib (`lib/news-engine/src/scrape.ts`, usada pela central). O util `safeFetch` do 06a vive em `artifacts/api-server` — o **api-server pode importá-lo** (mesmo pacote). Mas `lib/news-engine` é um pacote composite de **camada mais baixa**: o api-server depende de news-engine, nunca o contrário — então `scrape.ts` **NÃO pode** importar `../../artifacts/api-server/...`. Para o lib, criar um **espelho mínimo** do guarda em `lib/news-engine/src/safeFetch.ts` (mesma lógica de `assertAllowedTarget`/`safeFetch`/`isPrivateOrReservedIp`, sem nada específico de imagem). Isso segue o padrão de "cópia" já existente no repo (o próprio `scrape.ts` é cópia de `rssProcessor.ts`). Manter as duas implementações do guarda **semanticamente idênticas**.

> **Política de allowlist para `article-from-url` (CANÁRIO).** Ao contrário do proxy de imagem (06a, allowlist estrita de CDNs), o `article-from-url` recebe uma URL de notícia **arbitrária** colada pelo admin — restringir a um allowlist de domínios **quebraria** o caso de uso legítimo. Portanto o predicado de host passado ao `safeFetch`/`assertAllowedTarget` deve **aceitar qualquer host público** (`isAllowedHost: () => true`); a proteção real é: (a) bloqueio de IP privado/reservado (literal e por resolução de DNS), (b) revalidação de cada hop de redirect, (c) exigência de `https` (canário), (d) limites de tempo/tamanho. NÃO adicionar allowlist de domínios de fonte aqui (fica em §Fora de escopo).

1. **Adicionar o portão de validação síncrono no topo do handler `article-from-url`** — `artifacts/api-server/src/routes/admin.ts`, imediatamente **após** o check `if (!url || !url.startsWith("http"))` (`admin.ts:1220-1223`) e **antes** de qualquer chamada de rede (antes do ramo Diffbot em `:1236`/`:1256`). Importar `assertAllowedTarget` de `../lib/safeFetch.js`. Envolver em `try/catch`:
   - `assertAllowedTarget(url, () => true, { allowHttp: false })` — rejeita URL cujo host seja **IP literal** privado/reservado (`169.254.169.254`, `127.0.0.1`, `10/8`, `172.16/12`, `192.168/16`, etc.) e rejeita protocolo não-`https`.
   - Em caso de throw: `res.status(400).json({ error: "URL inválida" })` e `return` **sem** nenhuma request (isto garante que uma URL com IP interno literal NUNCA chega ao Diffbot/oEmbed/scrape).
   - Objetivo: barrar o vetor mais óbvio (IP literal + downgrade http) antes de tudo, e não repassar URL interna ao Diffbot.

2. **Trocar o fetch cru do fallback og:tags por `safeFetch`** — `admin.ts:1275-1278`. Substituir o `fetch(url, { headers, signal: AbortSignal.timeout(10_000) })` por `safeFetch(url, { isAllowedHost: () => true, allowHttp: false, timeoutMs: 10_000, maxBytes: <ver nota>, headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0)" } })`. Adaptar o consumo da resposta: `safeFetch` retorna `{ status, headers, body: Buffer }` — usar `status` no lugar de `pageRes.ok` (`>= 200 && < 300`) e decodificar o HTML com `body.toString("utf8")` no lugar de `await pageRes.text()`. Manter o `try/catch { /* ignore */ }` existente (`admin.ts:1274,1302`) para que uma rejeição de SSRF simplesmente não preencha og:tags (degradê já existente).

3. **Trocar o fetch cru de `scrapeYouTube` por `safeFetch`** — `admin.ts:1192-1195`. Substituir o `fetch(url, {...})` por `safeFetch(url, { isAllowedHost: () => true, allowHttp: false, timeoutMs: 12_000, maxBytes: <ver nota>, headers: {...} })`, adaptando `pageRes.ok`→`status` e `pageRes.text()`→`body.toString("utf8")`. Manter o `try/catch` (`admin.ts:1191,1203`).

4. **Trocar o fetch cru de `scrapeArticle` (api-server) por `safeFetch`** — `artifacts/api-server/src/lib/rssProcessor.ts:788`. Importar `safeFetch` de `./safeFetch.js`. Substituir o `fetch(url, { headers, signal: AbortSignal.timeout(12_000) })` por `safeFetch(url, { isAllowedHost: () => true, allowHttp: false, timeoutMs: 12_000, maxBytes: <ver nota>, headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0; +https://sbcagora.com.br)" } })`. Adaptar `res.ok`→`status`, `await res.text()`→`body.toString("utf8")`. Manter a assinatura pública `scrapeArticle(url): Promise<{ text; imageUrl; description }>` e o `try/catch` que já retorna `{ text:"", imageUrl:"", description:"" }` em falha (`rssProcessor.ts:792`, fim da função).

5. **Criar o espelho do guarda no lib** — `lib/news-engine/src/safeFetch.ts`. Copiar a lógica de `artifacts/api-server/src/lib/safeFetch.ts` (funções `isPrivateOrReservedIp`, `assertAllowedTarget`, `safeFetch`), **sem** nada específico de imagem e com a MESMA semântica. Usar `dns.promises.lookup` do Node, `undici`/`fetch` global com `redirect:"manual"`, e o retorno `{ status, headers, body: Buffer }`. Regra do repo: nunca usar unicode literal em regex (usar `\uXXXX`). Import interno do lib usa extensão `.ts` explícita quando referenciado por outros arquivos do lib.

6. **Trocar o fetch cru de `scrapeArticle` (news-engine) por `safeFetch`** — `lib/news-engine/src/scrape.ts:64`. Importar `safeFetch` de `./safeFetch.ts`. Substituir o `fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(12_000) })` por `safeFetch(url, { isAllowedHost: () => true, allowHttp: false, timeoutMs: 12_000, maxBytes: <ver nota>, headers: { "User-Agent": userAgent } })`. Adaptar `res.ok`→`status`, `await res.text()`→`body.toString("utf8")`. Manter a assinatura `scrapeArticle(url, userAgent?)` e o `try/catch` de fallback (`scrape.ts:233`).

7. **Escrever testes — api-server** em `artifacts/api-server/test/ssrfArticleFromUrl.test.ts` (`node --test`, import `.ts` explícito). Cobrir **sem rede**:
   - `assertAllowedTarget(u, () => true, { allowHttp: false })` **lança** para: `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1/`, `http://10.0.0.5/`, `http://192.168.1.1/`, `http://172.16.0.1/`, e para qualquer `http://<host>` (protocolo não-https, `allowHttp:false`); e para `ftp://x/`/`file:///etc/passwd`.
   - `assertAllowedTarget("https://g1.globo.com/…", () => true, { allowHttp:false })` **não lança** (host público, https).
   - (Se o handler foi refatorado para extrair o portão numa função pura testável, testar essa função diretamente; caso contrário, o teste acima sobre `assertAllowedTarget` cobre o guarda que o handler chama.)

8. **Escrever testes — news-engine** em `lib/news-engine/test/ssrfScrape.test.ts` (`node --test`, import `.ts` explícito, mesmo padrão de `dedup.test.ts`). Cobrir a mesma bateria do item 7 sobre o `assertAllowedTarget`/`isPrivateOrReservedIp` do espelho `./safeFetch.ts` (IP privado literal → lança; host público https → não lança; protocolo/http bloqueado).

> **Nota `maxBytes`:** usar um teto de corpo de página razoável (ex.: **5 MB**). `scrapeArticle` já trunca o texto extraído para 8000 chars, mas hoje lê o HTML inteiro em memória — o `maxBytes` evita OOM por resposta gigante de um alvo malicioso. Se o `safeFetch` do 06a já impõe um `maxBytes` padrão, apenas confirmar/ajustar o valor.

> **Nota de charset:** o `fetch` global (`res.text()`) decodifica conforme o `Content-Type`/charset; ao passar a `body.toString("utf8")` assume-se UTF-8. Portais de notícia BR são predominantemente UTF-8, então a regressão é improvável; se surgir mojibake numa fonte latin1, é um follow-up (decodificar pelo charset do header) — registrar como resíduo, não bloquear o PRD.

---

## Fora de escopo

- **`scrapeWithDiffbot`** (`rssProcessor.ts:758-764` e `scrape.ts:31-37`), **oEmbed** (`admin.ts:1169-1172`) e **HEAD de thumbnail** (`admin.ts:1154`): vão a **hosts FIXOS** (`api.diffbot.com`, `www.youtube.com`, `img.youtube.com`) com a URL do usuário só como query param — **não são SSRF a partir da nossa rede** (quem busca a URL alvo é o serviço remoto). O portão do item 1 do §Escopo já impede que uma URL com IP interno literal seja repassada ao Diffbot. NÃO envolver estes fetch com `safeFetch` (envolvê-los só validaria o host fixo — inócuo — e poderia quebrar). Se, em revisão futura, quiser-se hardening extra, é item separado.
- **Allowlist de domínios de fontes de notícia** para `article-from-url`: **não** implementar — quebraria o caso de uso (admin cola URL arbitrária). A proteção é IP-block + https + revalidação de redirect (herdada do `safeFetch`).
- **Proxy de imagem público `/api/image`** (F6): é o **PRD-06a**. NÃO tocar em `image.ts`/`newsImage.ts` aqui.
- **Reescrever o pipeline de scraping/cheerio** (seletores, sentinelas, extração de parágrafos em `rssProcessor.ts`/`scrape.ts`): só trocar a **porta de rede** (o `fetch`), preservando toda a lógica de parsing e as assinaturas públicas.
- **Rewrite/prompts espelhados** (`prompts.ts` ↔ `rssProcessor.ts`): não alterar — este PRD não mexe em IA.
- **Rate limit / auth da rota** (`requirePermission("articles.create")` permanece como está): PRD de rate limit é o 11.
- **NÃO** trocar `SESSION_SECRET` / `SETTINGS_ENCRYPTION_KEY`.
- **NÃO** recriar o `safeFetch` do api-server (é do 06a); só criar o espelho do lib (item 5) por causa da fronteira de pacote.

---

## Comandos de verificação

```bash
# Rodar a partir da raiz do repo.
cd "c:/Users/Usuario(a) Master/sp011"

# 1) O util do 06a existe (dependência). SUCESSO: o arquivo existe.
ls artifacts/api-server/src/lib/safeFetch.ts

# 2) O espelho do guarda no lib existe. SUCESSO: o arquivo existe.
ls lib/news-engine/src/safeFetch.ts

# 3) O handler article-from-url chama o guarda e usa safeFetch.
#    SUCESSO: >=1 ocorrencia de assertAllowedTarget E >=1 de safeFetch em admin.ts.
grep -rn "assertAllowedTarget" artifacts/api-server/src/routes/admin.ts
grep -rn "safeFetch" artifacts/api-server/src/routes/admin.ts

# 4) Nao resta fetch cru da URL do usuario no handler (og-fallback e scrapeYouTube).
#    SUCESSO: 0 ocorrencias de "await fetch(url" em admin.ts
#    (os fetch de host fixo restantes usam URL de template/endpoint, nao a var `url` crua).
grep -rn "await fetch(url" artifacts/api-server/src/routes/admin.ts

# 5) scrapeArticle (as duas copias) passa a usar safeFetch e nao fetch cru de `url`.
#    SUCESSO: >=1 safeFetch em cada arquivo; 0 ocorrencias de "fetch(url," (fetch cru da url) neles.
grep -rn "safeFetch" artifacts/api-server/src/lib/rssProcessor.ts
grep -rn "safeFetch" lib/news-engine/src/scrape.ts
grep -rn "fetch(url," artifacts/api-server/src/lib/rssProcessor.ts
grep -rn "fetch(url," lib/news-engine/src/scrape.ts

# 6) Diffbot/oEmbed/HEAD de host fixo continuam intactos (fora de escopo).
#    Observacao manual: estes fetch devem permanecer (host fixo), nao viram safeFetch.
grep -n "api.diffbot.com\|youtube.com/oembed\|img.youtube.com" artifacts/api-server/src/routes/admin.ts artifacts/api-server/src/lib/rssProcessor.ts lib/news-engine/src/scrape.ts

# 7) Composite build do lib ANTES de typecheckar quem depende (regra do repo).
#    SUCESSO: tsc -b sem erro.
cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && pnpm exec tsc -b

# 8) Testes + typecheck do api-server. SUCESSO: node --test 0 failing; typecheck sem erro.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck

# 9) Testes do news-engine. SUCESSO: node --test 0 failing.
cd "c:/Users/Usuario(a) Master/sp011/lib/news-engine" && node --test

# 10) (VPS, pos-deploy - CANARIO) Observar por ~24-72h a taxa de erro/422 de
#     /api/admin/article-from-url e a taxa de falha da coleta da central.
#     SUCESSO: nao ha aumento relevante de 422 "Nao foi possivel extrair conteudo"
#     em URLs de fontes LEGITIMAS (https). Registrar os numeros no STATUS.
```

> Nota de ambiente: `vite`/build do frontend NÃO roda no Windows — mas este PRD não toca `brasilia-agora`, então não há build de frontend envolvido. api-server (esbuild/`node --test`) e news-engine (`node --test`/`tsc -b`) rodam localmente no Windows.

---

## Critérios de aceite

- [ ] O handler `article-from-url` chama `assertAllowedTarget(url, () => true, { allowHttp:false })` **antes** de qualquer chamada de rede (Diffbot/oEmbed/scrape/fetch) e retorna 400 sem request quando ela lança — comprovado por `grep` (item 3) + inspeção de que a chamada está logo após `admin.ts:1220`.
- [ ] `grep -rn "await fetch(url" artifacts/api-server/src/routes/admin.ts` = **0** (nenhum fetch cru da URL do usuário resta no handler).
- [ ] `grep -rn "fetch(url," artifacts/api-server/src/lib/rssProcessor.ts` = **0** e `grep -rn "fetch(url," lib/news-engine/src/scrape.ts` = **0** (as duas cópias de `scrapeArticle` roteiam pelo `safeFetch`).
- [ ] `grep -rn "safeFetch" artifacts/api-server/src/routes/admin.ts` ≥ 1, em `rssProcessor.ts` ≥ 1, em `lib/news-engine/src/scrape.ts` ≥ 1.
- [ ] Existe `lib/news-engine/src/safeFetch.ts` com `isPrivateOrReservedIp`/`assertAllowedTarget`/`safeFetch` semanticamente idênticos ao util do api-server.
- [ ] Diffbot/oEmbed/HEAD de host fixo permanecem como fetch a host fixo (não viraram `safeFetch`) — item 6 mostra os hosts intactos.
- [ ] Teste `ssrfArticleFromUrl.test.ts` (api-server) e `ssrfScrape.test.ts` (news-engine) verdes: IP privado literal (169.254.169.254, 127.0.0.1, 10/8, 172.16/12, 192.168/16) e protocolo não-https/`http` são rejeitados; host público https é aceito.
- [ ] `pnpm exec tsc -b` do `lib/news-engine` sem erro; `node --test` do `lib/news-engine` verde.
- [ ] `node --test` do `artifacts/api-server` verde e `pnpm run typecheck` do `artifacts/api-server` sem erro.
- [ ] (VPS, canário) Taxa de 422/erro de `article-from-url` e de falha da coleta em fontes **legítimas** não sobe de forma relevante pós-deploy — número registrado no STATUS.

---

## Definition of Done

Todo fetch de **URL fornecida pelo usuário** em `article-from-url` e nas duas cópias de `scrapeArticle` (api-server + news-engine) roteado por `safeFetch` (IP privado/reservado bloqueado por literal e por resolução de DNS, redirect revalidado em cada hop, `https` exigido salvo decisão de canário, limites de tempo/tamanho), com o portão síncrono `assertAllowedTarget` no topo do handler barrando IP literal/`http` **antes de qualquer request** (inclusive antes do Diffbot). Diffbot/oEmbed/HEAD de host fixo mantidos como estão. Testes `node --test` verdes em api-server e news-engine, `tsc -b` do lib e `pnpm run typecheck` do api-server sem erro, todos os `grep` de ausência retornando 0. Mergeado na `main`. Canário de `article-from-url`/coleta observado na VPS por ≥24h com número registrado em `security-audit/STATUS.md`.

---

## Dependências

- **Depende de PRD-06a** (SSRF no proxy de imagem + util `safeFetch`): 06b reutiliza `safeFetch`/`assertAllowedTarget`/`isPrivateOrReservedIp`. **06a deve estar mergeado (ou ao menos o `safeFetch` entregue) antes** de iniciar 06b. Se 06a ainda não entregou o util, PARAR e registrar no STATUS.
- Sem dependência de outros PRDs. Pode rodar em paralelo com PRDs de outras ondas que não toquem `admin.ts`, `rssProcessor.ts` ou `lib/news-engine/src/scrape.ts`.

---

## Prioridade e esforço

- **Prioridade:** **Médio Prazo** (Onda 2) — vetor **autenticado** (exige `articles.create`), portanto menos urgente que o F6 não-auth (06a, Onda 1), mas alcança os mesmos alvos internos (metadados, `pg-blogs`, `ollama`, `central:8090`).
- **Esforço:** **Baixo** — o util pesado (`safeFetch`) já existe (06a); aqui é aplicá-lo em 4 pontos de fetch + 1 portão de entrada + 1 espelho pequeno no lib + testes de guarda. Sem mudança de dados nem de auth.

---

## Plano de rollback

- **Reverter código:** `git revert <hash-do-merge>` do branch `fix/prd-06b-ssrf-autenticado`. Isso restaura os `fetch` crus em `admin.ts`, `rssProcessor.ts` e `scrape.ts` e remove o portão e o espelho `lib/news-engine/src/safeFetch.ts`. (O `safeFetch` do api-server é do 06a e permanece.)
- **Rebuild direcionado na VPS** (mapeamento CLAUDE.md §5: `artifacts/api-server` e `lib/db` → `api`; `lib/news-engine` → `central-api`):
  ```bash
  cd /opt/sp011
  git pull
  docker compose build api central-api
  docker compose up -d api central-api
  ```
- **Mitigação de canário sem revert total:** se fontes **legítimas** por `http://` estiverem falhando (taxa de 422 subiu), trocar `allowHttp: false` por `allowHttp: true` nos pontos de `article-from-url`/`scrapeArticle` — mantendo o bloqueio de IP privado/reservado e a revalidação de redirect (o núcleo do AP-2). Só reverter o PRD inteiro em último caso.

---

## Notas de execução para o agente

- Trabalhe **somente neste PRD** (PRD-06b). Não misture com 06a/07/11. Se o `safeFetch` do 06a não existir/estiver incompleto, **PARE** e registre no STATUS — não recrie o util do api-server aqui.
- **Regras do repo a respeitar:** imports de teste com extensão `.ts` explícita; `node --test` dentro do pacote; após mexer em `lib/news-engine` (composite) rodar `pnpm exec tsc -b` no lib **antes** de typecheckar/buildar quem depende (central-hub); typecheck por pacote (filtro da raiz não casa no Windows); nunca unicode literal em regex (usar `\uXXXX`); commit direto na `main` (dev solo, sem PR) só após verificação verde.
- **Nunca** testar exploit ativo contra serviços internos reais (`pg-blogs`, `ollama`, `central`, `169.254.169.254`): os testes de SSRF devem ser determinísticos e **sem rede** (classificador de IP + `assertAllowedTarget` isolado).
- **Preserve as assinaturas públicas** de `scrapeArticle` (`(url)` no api-server; `(url, userAgent?)` no lib) e os `try/catch` de degradê existentes — o comportamento de falha (retornar vazio / 422) é o degradê de canário.
- Se **qualquer** critério de aceite falhar após implementar, **NÃO marque como concluído**: registre o motivo exato (comando, saída, `arquivo:linha`) em `security-audit/STATUS.md` (criar o arquivo se não existir, uma entrada por PRD) e **PARE**.
- Ao concluir com sucesso, atualize `security-audit/STATUS.md` registrando: PRD-06b, hash(es) de commit, resultado dos comandos de verificação, decisão sobre `http`/`https` (canário) e o número observado de 422/falha de coleta pós-deploy.
- **Sinalização de revisão humana:** este PRD é **autenticado** e de esforço **Baixo**, não troca segredos nem toca no fluxo de auth (mantém `requirePermission("articles.create")`) — não exige aprovação humana obrigatória para o merge do código. Porém, por tocar numa superfície de rede sensível (SSRF), **sinalizar ao operador** o momento do deploy para acompanhar o canário (taxa de 422 de `article-from-url` e falha de coleta) antes de considerar o PRD encerrado.
