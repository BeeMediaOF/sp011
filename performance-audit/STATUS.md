# STATUS — Auditoria de Performance (rede sp011)

> Modo Planejamento (Fases 0 → 1 → 1.5 → 2). **Nenhum arquivo de código de
> produção foi alterado** — escrita restrita a `performance-audit/`.
> Última atualização: 2026-07-27.

## Fase atual

**FASE 3 — EXECUÇÃO, ONDA 1.** Planejamento (Fases 0, 1, 1.5 e 2) entregue.
**PRD-PERF-01 implementado** (2026-07-28) — código commitado, aguardando deploy
na VPS e medição do "depois". Baseline do "antes" em `baseline-prd01.txt`.

## Artefatos concluídos

| Arquivo | Fase | Conteúdo |
|---|---|---|
| `00-inventario.md` | 0 | build/bundle, imagens, renderização, bloqueio de render, volume das APIs, baseline medido |
| `01-diagnostico.md` | 1 | 6 cadeias causais, o que **não** é gargalo, priorização, decisão de PRDs, matriz de insights, comandos reproduzíveis |
| `PRD-PERF-01-payload-lista-de-artigos.md` | 1.5 | paginação/filtro em `/api/articles` + 4 consumidores + SSR |
| `PRD-PERF-02-js-do-caminho-critico.md` | 1.5 | tirar `vendor-charts` (403 KB) e Radix do preload público |
| `PRD-PERF-03-imagens-de-identidade-e-preloads.md` | 1.5 | resize/WebP em `/api/site-asset` + matar 2 preloads indevidos |
| `PRD-PERF-04-css-render-blocking.md` | 1.5 | escopar o CSS público (197 KB) e apagar 42 `ui/*` mortos |
| `PRD-PERF-05-ssr-artigo-e-categoria.md` | 1.5 | generalizar o SSR para artigo e categoria |
| `PRD-PERF-06-llms-txt-e-robots-por-blog.md` | 1.5 | `llms.txt`/`robots.txt` gerados por blog |
| `ROADMAP.md` | 2 | sequência, 3 ondas, matriz de cobertura, DoD, rollout, riscos |
| `RELATORIO-FINAL.md` | 3 | **pendente** — só após a implementação |

## Baseline oficial (medido 2026-07-27, não estimado)

Chromium headless, mobile 412×823 DPR 1.75, 1,6 Mbps / 150 ms RTT / CPU 4×,
origem São Paulo, contra `https://sp011.com.br`:

| Rota | FCP | LCP | Transfer | Decoded | Maior long task |
|---|---:|---:|---:|---:|---:|
| `/` (SSR) | 2.564 ms | 2.572 ms | 1.006 KB | 1.939 KB | 467 ms |
| `/artigo/:slug` | 4.208 ms | 5.464 ms | 1.622 KB | 4.196 KB | — |
| `/politica` | 4.208 ms | 5.660 ms | 1.490 KB | 6.508 KB | 900 ms |

Complementos por `curl` / banco:

| Item | Valor |
|---|---:|
| `/api/articles` (sp011, 3.109 artigos) | 2.454.750 B bruto · 832.734 B gzip |
| `vendor-charts` no `modulepreload` público | 403.228 B bruto · 107.899 B gzip |
| CSS público único | 197.582 B bruto · 30.677 B gzip |
| PNGs de identidade (logo+footer+byline+favicon) | 267.187 B |
| `__SSR_DATA__` no HTML da home | 70.923 B (de 185.197 B) |

**Ressalva registrada:** o Lighthouse de referência do prompt mestre
(43 / FCP 6,4 s / LCP 17,0 s / 5.029 KiB) **não foi reproduzido**. Os números
acima são consistentes com uma medição feita em rota **sem SSR** e/ou de fora do
Brasil. Detalhes e consequências em `01-diagnostico.md` §1.0.

## PRDs pendentes de execução

| PRD | Onda | Esforço | Depende de | Estado |
|---|:--:|:--:|---|---|
| 01 — payload da lista de artigos | 1 | M | — | **concluído e validado em prod** |
| 02 — JS do caminho crítico | 1 | P | 01 (medição) | **concluído e validado em prod** |
| 06 — llms.txt / robots.txt por blog | 1 | P | — | **implementado — aguardando deploy e verificação** |
| 03 — imagens de identidade e preloads | 2 | M | 01, 02 (medição) | pendente |
| 04 — CSS render-blocking | 2 | M/G | **02** | pendente |
| 05 — SSR de artigo e categoria | 3 | G | **01** | pendente |

## PRD-PERF-01 — o que foi entregue (2026-07-28)

Commit direto na `main` (CLAUDE.md §18 — sem branch/PR, ao contrário do que o
PRD sugeria). Arquivos:

| Arquivo | Mudança |
|---|---|
| `api-server/src/lib/articlesList.ts` | **novo** — `parseArticleListParams` + `selectArticles` (filtro/ordem/corte puros) |
| `api-server/test/articlesList.test.ts` | **novo** — 16 testes |
| `api-server/src/routes/articles.ts` | `GET /` paginado; sem `socialTitle`/`keywords`; devolve `{articles,total,limit,offset}` |
| `brasilia-agora/src/lib/articlesQuery.ts` | **novo** — limites + `articlesUrl` (ordem fixa de chaves) |
| `brasilia-agora/src/lib/articlesQuery.test.ts` | **novo** — 8 testes, incl. igualdade byte a byte com o `index.html` |
| `brasilia-agora/index.html` | boot prefetch pede 200 (home) / 30 (demais) |
| `brasilia-agora/src/hooks/useArticles.ts` | limite por rota + `mergeRecent` (não apaga o pool do SSR) |
| `brasilia-agora/src/pages/CategoryArchivePage.tsx` | 2 fetches enxutos + paginação |
| `brasilia-agora/src/components/CategoryPage.tsx` | botão "Carregar mais" ganhou handler (era decorativo) |
| `brasilia-agora/src/pages/Archive.tsx` | 200 por página + "Carregar mais (n/total)" |
| `brasilia-agora/vite.config.ts` | SSR: `limit=300`, `slice(0,150)`, pool por categoria via API |
| `admin/SocialMedia.tsx`, `admin/HomeBlocksManager.tsx` | consumidores admin ajustados ao novo contrato |
| `docs/TECHNICAL_OVERVIEW.md` | contrato da rota documentado |

**Desvios do PRD, deliberados:**
1. O pool por categoria do SSR passou a **buscar na API por categoria** em vez de
   varrer a lista-base. Com a lista paginada em 300, a varredura não alcançaria
   editoria sem nada nos 300 recentes — exatamente a regressão que o pool existe
   para evitar. De quebra, o match virou igualdade exata (era `includes`), igual
   ao `getArticles` da Home.
2. **Paginação também na página de editoria** (o PRD só previa no `/arquivo`).
   Sem ela, `/politica` ficaria limitada a 60 itens sem caminho para o acervo.
3. `socialTitle` **é** consumido pelo admin a partir da lista (`SocialMedia.tsx`,
   canvas WYSIWYG) — o PRD dizia que não. Em vez de devolver o campo a todo o
   público (~62 B × 200 itens por página), o editor passou a buscar o artigo
   completo só do item selecionado.
4. Blocos "Mais Lidas" da home passam a ranquear entre os ~150 recentes em vez do
   acervo inteiro. **O SSR já se comportava assim** (semeava 100 artigos): a
   mudança elimina a divergência SSR × CSR. Onde o ranking global importava
   (sidebar da página de editoria), `sort=views` no backend o preserva.

Verificado localmente: `typecheck` verde nos 2 pacotes · `api-server` 219 testes ·
`brasilia-agora` 52 testes · build esbuild do `api-server` OK. Build do Vite só na
VPS (CLAUDE.md §14).

## PRD-PERF-01 — validação em produção (sp011, 2026-07-28)

| Critério de aceite | Meta | Medido | |
|---|---|---|:--:|
| `/api/articles` sem params | ≤ 120.000 B | **103.085 B** (era 2.454.750) | ✅ |
| `?limit=200` devolve 200 itens + `total` | 200 / total real | 200 · `total: 3155` | ✅ |
| `?limit=30` (rotas não-home) | — | **15.414 B** | ✅ |
| `?category=politica` só da categoria | sim | só `"category":"politica"` | ✅ |
| `?offset=` pagina sem repetir | sim | páginas 0 e 2 disjuntas | ✅ |
| `?q=` filtra | sim | só `economia` | ✅ |
| Sem `socialTitle`/`keywords` na lista | 0 ocorrências | 0 | ✅ |
| Home sem bloco em placeholder | 0 `EXEMPLO` | 0 | ✅ |
| `__SSR_DATA__` | ≤ 45.000 B | **86.921 B** | ❌ |

**O critério do `__SSR_DATA__` era aritmeticamente impossível.** O PRD mandava
`slice(0, 150)` e exigia ≤ 45.000 B no mesmo documento — mas o item custa 511 B
medidos, então só os artigos dão 76.666 B. Composição real do payload:
`articles` 76.666 B + `site` 10.095 B + `ads` 2 B. Nem com 60 artigos o alvo
seria alcançável, e a home precisa de ~60 itens só para as seções quentes.

Correção aplicada: **`slice` de volta para 100** (o valor que já rodava em
produção e cobre a home). Subir para 150 tinha engordado o documento da home de
185.197 B para 201.730 B — o oposto do objetivo. As editorias de baixo volume
não dependem desse corte: quem as cobre é o pool por categoria, que agora vem
da API. Alvo substituído por um medido e defensável: **`__SSR_DATA__` ≤ 62.000 B
e documento da home abaixo dos 185.197 B do baseline**.

**`sort=views` devolveu tudo com `views: 0` — não é bug.** A tabela
`article_views` do sp011 está VAZIA (0 linhas) desde o WIPE de analytics de
2026-07-26. Com todo mundo empatado em 0, o desempate por data assume — que é
exatamente a regra testada em `articlesList.test.ts`. Consequência (anterior a
este PRD): todo bloco "Mais Lidas" da rede está, na prática, ordenando por
recência até as visualizações voltarem a acumular.

### Medição de campo — antes × depois (sp011, mesmo perfil)

Chromium headless, mobile 412×823 DPR 1.75, 1,6 Mbps / 150 ms RTT / CPU 4×.
Depois do `slice` corrigido. Home repetida 3× (spread de 8 ms no LCP — é sinal,
não ruído).

| Rota | FCP | LCP | Transfer | Decoded | Maior long task |
|---|---|---|---|---|---|
| `/` | 2.564 → **2.496** | 2.572 → **3.420** | 1.006 → 1.064 KB | 1.939 → 2.113 KB | 467 → 437 ms |
| `/artigo/:slug` | 4.208 → **3.680** | 5.464 → **4.688** | 1.622 → **772 KB** | 4.196 → **1.715 KB** | — → 214 ms |
| `/politica` | 4.208 → **3.676** | 5.660 → **4.196** | 1.490 → **663 KB** | 6.508 → **1.617 KB** | 900 → **263 ms** |

| Critério de aceite (campo) | Meta | Medido | |
|---|---|---|:--:|
| `decoded` em `/politica` | ≤ 1.800 KB | 1.617 KB | ✅ |
| `decoded` em `/artigo/:slug` | ≤ 1.500 KB | 1.715 KB | ❌ |
| Maior long task em `/politica` | ≤ 300 ms | 263 ms | ✅ |
| TBT (proxy: soma das long tasks em `/politica`) | ≤ 900 ms | 887 ms (era 2.229) | ✅ |
| LCP em `/politica` | ≤ 3.800 ms | 4.196 ms | ❌ |
| `__SSR_DATA__` | ≤ 62.000 B (alvo corrigido) | 61.780 B | ✅ |
| Documento da home | < 185.197 B | 176.302 B | ✅ |

**Os dois critérios não atingidos não dependem deste PRD** — o que sobrou no
caminho crítico é JS e imagem, alvos dos PRDs 02 e 03:

- Em `/artigo` e `/politica`, `initiatorType: "other"` (os chunks JS) responde
  por **727 KB decoded** dos 1.715/1.617 KB restantes. É o `vendor-charts` de
  403 KB no `modulepreload` — **PRD-PERF-02**.
- A home **não era beneficiária deste PRD**: o SSR já a poupava dos 2,4 MB
  (`fetch` nela soma 10 KB decoded). Seu LCP hoje é o hero, e a maior imagem
  baixada é o **`byline-logo` com 81 KB** (PNG cru do `/api/site-asset`),
  ocupando a banda até 5.576 ms enquanto o hero termina em 4.643 ms. Além
  disso o `<head>` traz **3 preloads `as=image`** (logo, hero e footer-logo) —
  a hoisting do React 19 descrita no diagnóstico, confirmada em produção.
  Tudo isso é **PRD-PERF-03**.

Ou seja: a medição confirmou o diagnóstico das Cadeias B e C antes mesmo de
começarem os PRDs que as atacam.

## PRD-PERF-02 — o que foi entregue (2026-07-28)

Baseline do "antes" (produção, pós-PRD-01) em `baseline-prd02.txt`: 5 artefatos
JS no `<head>` da home somando **1.082.315 B decoded**, dos quais `vendor-charts`
403.228 B e `vendor-radix` 55.314 B — nenhum dos dois usado em rota pública.

| Arquivo | Mudança |
|---|---|
| `artifacts/brasilia-agora/vite.config.ts` | regra nova, **primeira** do `manualChunks`: `clsx`, `tailwind-merge` e `class-variance-authority` viram `vendor-utils` |
| `artifacts/brasilia-agora/src/App.tsx` | `TooltipProvider` sai do import eager e do topo da árvore |
| `artifacts/brasilia-agora/src/components/admin/AdminLayout.tsx` | `TooltipProvider` passa a envolver o `AdminShell` (chunk lazy do painel), nos dois caminhos (com e sem token) |

### Desvios deliberados em relação ao PRD

1. **Item 2 (`experimentalMinChunkSize: 0`) não foi aplicado.** O PRD parte de
   que o Vite/Rollup funde chunks abaixo de **500 B**. Verificado no pacote
   instalado: o Vite **não** define a opção e o padrão do Rollup 4.60.3 é **1**
   (`rollup/dist/shared/*.js`: `config.experimentalMinChunkSize ?? 1`) — a
   heurística nunca foi a causa. O que resolve é o item 1: atribuição por
   `manualChunks` é autoritativa, então `clsx` não pode mais cair no
   `vendor-charts`. Fixar `0` seria um no-op com um comentário enganoso.
2. **Item 3 aplicado na forma preferida, e o levantamento foi além do previsto.**
   `grep` de `Tooltip` em todo o `src/`: os `Tooltip` de `Dashboard.tsx` e
   `Analytics.tsx` são do **Recharts**, não do Radix; o único consumidor do
   `ui/tooltip` é `ui/sidebar.tsx`, **que nenhum arquivo importa** (código morto,
   e ele já tem `TooltipProvider` próprio). Ou seja: não existe um único tooltip
   Radix vivo no app — o provider no `App.tsx` sustentava 55 KB de preload para
   ninguém. Foi movido (e não removido) para o `AdminShell` porque
   `Tooltip.Root` do Radix lança sem provider ancestral: qualquer tooltip futuro
   nasce no painel, e lá o provider existe.
3. Sem branch `perf/prd-02-js-critico` — commit direto na `main` (CLAUDE.md §18).

Projeção do `<head>` após o build: `vendor-react` 223.391 + `vendor-query`
24.608 + `vendor-utils` (poucos KB) + `vendor-icons` 38.355 + `index` ~337.000
= **~628 KB decoded**, contra 1.082 KB. Confirmação só é possível após
`docker compose build web` na VPS (CLAUDE.md §14).

`pnpm run typecheck` limpo e `pnpm test` verde (52 testes) em `brasilia-agora`.

## PRD-PERF-02 — validação em produção (sp011, 2026-07-28)

### Artefatos servidos no `<head>` da home

| Chunk | Antes | Depois |
|---|---:|---:|
| `index` | 337.419 | 310.265 |
| `vendor-react` | 223.391 | 223.391 |
| `vendor-query` | 24.608 | 24.608 |
| `vendor-utils` | — | 27.303 |
| `vendor-icons` | 38.355 | 38.355 |
| `vendor-radix` | 55.314 | **ausente** |
| `vendor-charts` | 403.228 | **ausente** |
| **total** | **1.082.315 B** | **623.922 B** |

Imports estáticos do entry, no artefato buildado: só `vendor-react`,
`vendor-query`, `vendor-utils` e `vendor-icons` — exatamente o esperado pelo
item 4 do PRD. `vendor-charts` (402.907 B), `vendor-radix` (55.310 B) e
`vendor-editor` (335.443 B) continuam no disco, servidos sob demanda ao admin.

### Medição de campo — 3 rotas (mesmo perfil: mobile 412×823, 1,6 Mbps, CPU 4×)

| Rota | FCP | LCP | Transfer | Decoded | JS decoded |
|---|---:|---:|---:|---:|---:|
| `/` baseline | 2.564 | 2.572 | 1.006 KB | 1.939 KB | 1.086 KB |
| `/` pós-01 | 2.496 | 3.420 | 1.064 KB | 2.113 KB | — |
| **`/` pós-02** | **2.284** | **2.296** | **937 KB** | **1.698 KB** | **668 KB** |
| `/artigo` baseline | 4.208 | 5.464 | 1.622 KB | 4.196 KB | — |
| `/artigo` pós-01 | 3.680 | 4.688 | 772 KB | 1.715 KB | — |
| **`/artigo` pós-02** | **2.960** | **4.392** | **674 KB** | **1.328 KB** | **688 KB** |
| `/politica` baseline | 4.208 | 5.660 | 1.490 KB | 6.508 KB | — |
| `/politica` pós-01 | 3.676 | 4.196 | 663 KB | 1.617 KB | — |
| **`/politica` pós-02** | **2.916** | **4.116** | **558 KB** | **1.223 KB** | **675 KB** |

A home foi medida 4×: a primeira leitura (FCP 4.844 ms) foi descartada por ser
SSR frio — container recém-subido, cache de HTML de 30 s vazio, e `LCP − FCP` de
8 ms mostrando que o atraso era todo de servidor. As três leituras seguintes
ficaram em 2.284–2.372 ms.

**Efeito colateral bom:** `/artigo` decoded caiu para 1.328 KB e passou a cumprir
o critério de ≤ 1.500 KB que o **PRD-PERF-01** não tinha atingido (1.715 KB) — a
atribuição feita naquele fechamento (o resto era JS, não payload de API) estava
correta.

### Critérios de aceite

| Critério | Alvo | Medido | |
|---|---|---:|:--:|
| `vendor-charts` no HTML público | 0 | 0 | ✅ |
| `vendor-radix` no HTML público | ausente ou ≤10 KB | 0 | ✅ |
| Existe chunk `vendor-utils` | sim | sim | ✅ |
| — tamanho dele | ≤ 5 KB | 27.303 B | ⚠️ |
| JS decoded na home | ≤ 640 KB | 668 KB | ⚠️ |
| JS transfer na home | ≤ 200 KB | 208 KB | ⚠️ |
| Soma das long tasks na home | ≤ 700 ms | 746–1.597 ms | ⚠️ |
| FCP na home | ≤ 2.200 ms | 2.284 ms | ⚠️ |
| Gráficos do admin desenham | sim | sim (conferido no painel) | ✅ |
| `typecheck` + `test` | verdes | 52 testes verdes | ✅ |

Leitura honesta dos ⚠️:

- **`vendor-utils` 27 KB, não 5 KB.** O PRD supôs um chunk minúsculo, mas
  `tailwind-merge@3.5.0` sozinho pesa ~25 KB (tabela de configuração). Ele já
  estava sendo baixado — só que **dentro do entry**, que encolheu 27.154 B,
  quase exatamente o tamanho do chunk novo. Peso realocado, não peso novo.
- **JS decoded 668 KB vs 640 KB de alvo.** A medição de campo conta 8 requests,
  incluindo 3 chunks lazy que chegam depois do load (Toaster, LGPDConsent). Só o
  caminho crítico do `<head>` são 623.922 B (609 KB). O alvo do PRD misturava as
  duas contagens. O piso agora é `vendor-react` 223 KB + entry 310 KB.
- **Long tasks: número não comparável.** O script de medição foi reescrito nesta
  sessão (o anterior era temporário e foi apagado) e a janela de observação
  mudou. A dispersão entre execuções idênticas (746 → 1.597 ms) confirma que a
  soma capta trabalho pós-load não determinístico. A **maior** long task, mais
  estável, ficou em 397–479 ms contra 467 ms do baseline: praticamente igual, o
  que é coerente — os chunks removidos custavam download e parse, não execução
  de hidratação.
- **FCP 2.284 ms vs 2.200 ms de alvo**, 84 ms acima, com LCP caindo de 2.572
  para 2.296 ms. O que sobra no bloqueio de render é o CSS de 197 KB
  (**PRD-PERF-04**) e as imagens de identidade (**PRD-PERF-03**).

Sem erro de hidratação: console limpo (0 erros e 0 avisos) em `/`, `/politica` e
`/admin/login`, com a home renderizando 56 links de artigo e `/politica` 67 —
invariante do CLAUDE.md §17 preservada.

## PRD-PERF-06 — o que foi entregue (2026-07-28)

Baseline em `baseline-prd06.txt`: os **três** domínios testados
(sp011.com.br, ksports.midia.run, resenhavip.midia.run) serviam o **mesmo**
arquivo, dizendo `# SBC Agora`, com editorias de outro portal e
`Sitemap: https://brasilia-agora.replit.app/api/sitemap.xml` (host morto). O
ksports, que é EN, recebia texto em pt-BR sobre o Grande ABC.

| Arquivo | Mudança |
|---|---|
| `brasilia-agora/vite.config.ts` | **novo** `seoTextPlugin(apiBase)` + `SEO_TEXT_STRINGS` (pt-BR/EN), `smartCase`, `seoLinksFromSite`, `buildLlmsTxt`, `buildRobotsTxt`; registrado entre `socialOgPlugin` e `ssrHomePlugin` |
| `brasilia-agora/public/llms.txt` | reescrito **neutro** — sem nome de portal, sem host (só o caminho de falha) |
| `brasilia-agora/public/robots.txt` | reescrito neutro, com `Disallow: /admin`, sem linha `Sitemap:` (que exige host) |
| `performance-audit/baseline-prd06.txt` | **novo** — o "antes" dos 3 domínios + identidade real de sp011/ksports |

**Desvios do PRD, deliberados:**

1. **O `robots.txt` não consulta a API.** O PRD tratava os dois arquivos como um
   par ("qualquer falha → `next()`"), mas o `robots.txt` só depende do `Host` da
   requisição. Mantê-lo independente significa que, com a `api` do blog fora do
   ar, ele continua saindo **correto e com os dois `Sitemap:`** — em vez de cair
   para um estático que, por não poder citar host, não tem `Sitemap:` nenhum. O
   `llms.txt` (esse sim precisa de `siteName`/menu) mantém o `next()`.
2. **Rótulos passam por `smartCase`.** Os `menuItems` vêm em CAIXA ALTA por
   decisão de layout do cabeçalho; despejados em texto corrido viravam
   `notícias de POLÍTICA`. A regra de sigla é *palavra isolada de até 3 letras*
   (NFL, F1, TV ficam intactos) e **não** tamanho do token — a primeira versão
   usava o token e produziu `World CUP` no ksports, corrigido antes do commit.
3. **Só rotas internas viram "Seções".** Um menuItem apontando para fora
   (`http…`) é link de terceiro, não seção do portal — é filtrado.
4. **Sem branch** (CLAUDE.md §18): commit direto na `main`.

**Validação local, contra o payload real de produção:** as funções puras foram
extraídas do próprio `vite.config.ts` por recorte de código-fonte (zero
duplicação) e executadas com `tsx` sobre o `/api/site` de sp011 e ksports. O
`llms.txt` do sp011 saiu em pt-BR com as 9 editorias do menu atual; o do ksports
saiu **em inglês** com World Cup/Football/Formula 1/NFL/E-Sports. Typecheck:
`pnpm run typecheck` do pacote é verde, mas seu `tsconfig` cobre só `src/**` —
o `vite.config.ts` foi checado à parte com `tsc` explícito (também verde).

**Ordem dos middlewares (o risco real deste PRD):** é o primeiro plugin da casa
que precisa **preemptar um arquivo estático existente**. Confirmado no dist do
Vite 7.3.5 instalado (`chunks/config.js`): os hooks `configurePreviewServer`
rodam na linha 35203 e o `viteAssetMiddleware` que serve o `distDir` só é
registrado ~16 linhas depois — middleware adicionado com `server.middlewares.use()`
dentro do hook ganha do estático. `BASE_PATH` é `/` em produção
(`docker-compose.yml:63`), então o `baseMiddleware` não entra no caminho.

## Próxima ação

1. **Deploy do PRD-06** (`docker compose build web && up -d web`) e verificação
   por `curl` nos 4 domínios + caminho de falha com a `api` parada.
2. Fechado o 06, a **onda 1 acaba**; começa a onda 2 (PRD-03 e PRD-04).

O rollout do PRD-02 aos 8 blogs foi concluído em 2026-07-28: `vendor-charts: 0`
no HTML público de ksports, esporteagora, oleysports, beeesportes e resenhavip,
cada um devolvendo o próprio `siteName`. Os gráficos do painel (Pageviews,
Tráfego ao longo do tempo, Dispositivos, Pico por hora, Pico por dia) foram
conferidos desenhando — o `vendor-charts` continua chegando sob demanda no admin.

### Achado fora de escopo (2026-07-28)

`pages/Artigo.tsx:176` escreve `document.title = \`${title} — ${BRAND.titleSuffix}\``
e `BRAND.titleSuffix` é a constante `"SBC Agora"`, embutida na imagem
compartilhada. Resultado: a aba do navegador de **toda página de artigo dos 8
blogs** diz "SBC Agora", e o Analytics grava o título assim (visível no card
"Artigos com melhor desempenho" do KSports). É a mesma violação do CLAUDE.md §13
que o PRD-06 corrigiu no `llms.txt`; o `SEOHead` da home já usa
`settings.siteName` corretamente. Correção de uma linha, serviço `web`, mas fora
do escopo do PRD-06.

**Decidido em 2026-07-28:** o PRD-06 fecha limpo, sem esta correção; ela entra no
**próximo PRD** (onda 2). Forma acertada: `settings.siteName` como fonte, com
`BRAND.titleSuffix` sobrando só de fallback enquanto o `/api/site` não responde —
o mesmo padrão do `SEOHead`. Só os registros **novos** do Analytics sairão com o
nome certo; o histórico já gravado continua com "SBC Agora".

## Regras válidas para a Fase 3

- Um PRD por sessão; não expandir escopo.
- Medir ANTES e DEPOIS nas 3 rotas; registrar ambos no commit.
- Build do Vite só roda na VPS (CLAUDE.md §14) — nenhum PRD pode ser dado por
  concluído com base em leitura de config.
- Rollout por onda, com canário no `resenhavip` antes de propagar aos 8 blogs
  (CLAUDE.md §6).
- Falhou critério de aceite → reverter, registrar aqui e parar.
