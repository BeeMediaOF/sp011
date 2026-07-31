# STATUS — Auditoria de Performance (rede sp011)

> Modo Planejamento (Fases 0 → 1 → 1.5 → 2). **Nenhum arquivo de código de
> produção foi alterado** — escrita restrita a `performance-audit/`.
> Última atualização: 2026-07-28.

## Fase atual

**FASE 3 — EXECUÇÃO. Ondas 1 e 2 ENCERRADAS** (2026-07-28): PRD-01, PRD-02 e
PRD-06 (onda 1) validados em produção e propagados aos 8 blogs; PRD-04 e PRD-03
(onda 2) validados em produção no sp011, aguardando rollout. **Onda 3**: o
PRD-05 está com o código entregue e falta medir em produção.

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
| 06 — llms.txt / robots.txt por blog | 1 | P | — | **concluído e validado em prod** |
| 03 — imagens de identidade e preloads | 2 | M | 01, 02 (medição) | **concluído e validado em prod** |
| 04 — CSS render-blocking | 2 | M/G | **02** | **concluído e validado em prod** |
| 05 — SSR de artigo e categoria | 3 | G | **01** | **concluído e validado em prod** (todas as metas) |

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

## PRD-PERF-06 — validação em produção (2026-07-28)

Deploy feito com bump de imagem e propagado aos 8 blogs.

**Defeito encontrado PELA verificação, corrigido antes de propagar** (`8cd8518`):
o `curl -sI` do roteiro devolvia `text/plain` + `no-cache` enquanto o GET
devolvia `text/plain; charset=utf-8` + `public, max-age=3600`. O guard era
`req.method !== "GET"`, então **HEAD caía no `next()`** e era respondido pelo
estático neutro — metadados de um arquivo, corpo de outro, `Content-Length`
errado. Crawler e monitor costumam mandar HEAD antes do GET. Depois da correção,
GET e HEAD batem byte a byte (`content-length: 1362` nos dois).

### Os 8 blogs, cada um anunciando a si mesmo

| Blog | `# título` do llms.txt | `Sitemap:` |
|---|---|---|
| sp011 | `# SP011` | sp011.com.br ✅ |
| ksports | `# KSports` (**em inglês**) | ksports.midia.run ✅ |
| esporteagora | `# Esporte Agora` | esporteagora.midia.run ✅ |
| resenhavip | `# Resenha Vip` | resenhavip.midia.run ✅ |
| oleysports | `# OleySports` | oleysports.midia.run ✅ |
| beeesportes | `# BeeEsportes` | beeesportes.midia.run ✅ |
| pontofarma | `# Ponto Farma` | pontofarma.midia.run ✅ |
| creditovc | `# Crédito.vc` | creditovc.midia.run ✅ |

Antes, os oito serviam `# SBC Agora` e `Sitemap: brasilia-agora.replit.app`.

### Critérios de aceite

| Critério | Alvo | Medido | |
|---|---|---|:--:|
| `llms.txt` abre com o nome do próprio blog | 4 blogs | **8 de 8** | ✅ |
| Bloco `>` de resumo + links markdown absolutos | sim | sim | ✅ |
| `Sitemap:` do próprio host | sim | 8 de 8 | ✅ |
| — e respondem 200 | sim | 200/200 (sp011) | ✅ |
| `ksports` em inglês | sim | World Cup/Football/NFL/E-Sports | ✅ |
| Com a `api` parada, `/llms.txt` responde 200 | sim | 200, `# Portal de notícias` | ✅ |
| — e o `robots.txt` continua íntegro | (não previsto no PRD) | os 2 `Sitemap:` presentes | ✅ |
| `Content-Type` / `Cache-Control` | `text/plain; charset=utf-8` / `max-age=3600` | idem, em GET **e** HEAD | ✅ |
| `typecheck` | verde | verde (pacote + `vite.config.ts` à parte) | ✅ |
| Lighthouse: Agentic Browsing | 3/3 | **3/3** (era 2/3) | ✅ |
| Lighthouse: SEO | 100, sem regressão pelo `Disallow: /admin` | **100** | ✅ |
| Lighthouse: Best Practices | 100 | **96** | ⚠️ |

Lighthouse rodado pelo dono em `ksports.midia.run` logo após o deploy
(ver seção abaixo). O **Agentic Browsing foi de 2/3 para 3/3** — era a métrica
título do PRD — e o `Disallow: /admin`, que era o risco declarado, **não**
derrubou o SEO. O Best Practices em 96 (o DoD pede 100) não tem causa conhecida
ainda e não é atribuível a este PRD; entra como item aberto.

### Achado de conteúdo (não é código)

**Seis dos oito blogs servem o mesmo resumo `>`: "Notícia. Agora. Sempre."** —
esporteagora, resenhavip, oleysports, beeesportes, pontofarma e creditovc. O
`seoDescription` deles está vazio e o plugin cai para a `tagline`, que é a do
sp011 replicada. Nos dois últimos está factualmente errado: pelo CLAUDE.md §4 a
tagline do PontoFarma é "conteúdo que gera resultado" (B2B farmacêutico) e a do
Crédito.vc é "Educação financeira para a vida real" — nenhum é portal
esportivo. O bloco `>` é a linha que um LLM lê para saber o que o portal é, e
seis domínios repetindo a mesma frase reforçam o problema de conteúdo duplicado
já registrado no CLAUDE.md §9/§19.3. **Correção é no admin, sem deploy:**
Configurações → `seoDescription` por blog (tem precedência sobre a tagline no
código); propaga em até 1 h pelo cache do plugin.

## Onda 1 — encerrada

Os três PRDs da onda 1 (01, 02 e 06) estão concluídos e validados em produção,
com a imagem propagada aos 8 blogs.

## Lighthouse em produção — ksports, 2026-07-28 (fim da onda 1)

Rodado pelo dono em `https://ksports.midia.run/` logo após o deploy da onda 1.
**É o novo ponto de referência da auditoria** — o Lighthouse do prompt mestre
nunca foi reproduzido (§1.0 do `01-diagnostico.md`).

| Categoria | Agora | DoD | |
|---|---:|---:|:--:|
| Performance (mobile) | **47** | ≥ 75 | ❌ |
| Accessibility | **93** | ≥ 93 | ✅ (no limite) |
| Best Practices | **96** | 100 | ⚠️ |
| SEO | **100** | 100 | ✅ |
| **Agentic Browsing** | **3/3** | 3/3 | ✅ |
| CLS | **0** | 0 | ✅ |

| Métrica | Agora | Referência do prompt mestre |
|---|---:|---:|
| FCP | 5,1 s | 6,4 s |
| LCP | 9,2 s | 17,0 s |
| Speed Index | 7,9 s | 14,1 s |
| TBT | 450 ms | 500 ms |
| Main-thread work | 7,8 s | 7,4 s |
| JS execution time | 3,2 s | 3,1 s |
| Unused CSS | **246 KiB** | **246 KiB** |
| Unused JS | 63 KiB | 117 KiB |
| Minify JS | 47 KiB | 66 KiB |
| Image delivery | 411 KiB | 2.360 KiB |
| Long tasks | 20 | 20 |

**Três ressalvas antes de ler esses números como progresso:**

1. **Blog diferente.** Toda a auditoria (inventário, diagnóstico, baselines,
   medições dos PRDs 01/02) foi feita em `sp011.com.br`. Este Lighthouse é do
   `ksports.midia.run`, que tem outro acervo, outras imagens e outro template.
   A coluna "referência do prompt mestre" é **indicativa, não comparável**.
2. **A própria execução avisou que está incompleta:** *"The page loaded too
   slowly to finish within the time limit. Results may be incomplete."*
3. **A VPS estava ocupada.** A medição saiu logo depois de `docker compose
   build api web` + recriação de containers de 8 blogs, com o `ollama`
   segurando ~13 GB. TTFB alto sob essa carga explica parte do FCP/Speed Index
   — coerente com o insight "Document request latency". Uma nova execução com a
   máquina ociosa é necessária antes de tratar 47 como o número real.

**O que os dados dizem, apesar das ressalvas:**

- **`Unused CSS` continua exatamente 246 KiB** — nenhum dos PRDs da onda 1
  tocou nisso, e é a maior massa isolada que sobrou. Junto com
  `Render-blocking requests — 2.150 ms`, aponta direto para o **PRD-04**.
- `Unused JS` caiu de 117 para 63 KiB e `Minify JS` de 66 para 47 KiB —
  consistente com o que o PRD-02 tirou do caminho crítico.
- **Main-thread 7,8 s, JS execution 3,2 s e 20 long tasks praticamente não se
  mexeram.** É esperado: o PRD-02 removeu *download e parse* de 458 KB, não
  *execução*. Quem ataca execução é o PRD-05 (SSR das demais rotas) e a
  redução de DOM ("Optimize DOM size" aparece nos insights).
- `Image delivery` em 411 KiB é o escopo restante do **PRD-03**.
- `Image elements do not have explicit width and height` **com CLS = 0**:
  não está causando layout shift hoje, mas é fragilidade — o `LazyImage.tsx`
  existe e nenhum bloco da home o usa (§8.6 do `ROADMAP.md`).

### Lighthouse do sp011 (mesma sessão) e o que a comparação revela

| Categoria | sp011 | ksports |
|---|---:|---:|
| Performance | **42** | 47 |
| Accessibility | 93 | 93 |
| Best Practices | **100** | 96 |
| SEO | 100 | 100 |
| Agentic Browsing | **3/3** | **3/3** |

Duas conclusões diretas:

1. **O Best Practices 96 é do ksports, não da rede.** No sp011 é 100, com a
   mesma imagem Docker. Some com o item "Best Practices = 100" da lista de
   pendências de código: é conteúdo/terceiro do ksports (o relatório dele traz
   o insight "3rd parties" — provável banner KBET).
2. **Agentic Browsing 3/3 nos dois blogs** — o PRD-06 fechou a métrica.

**TTFB não é o gargalo.** Medido dos dois domínios, 3 requisições seguidas:
sp011 197 ms na primeira e 134/144 ms depois; ksports 639 ms na primeira e
123/156 ms depois. O cache de HTML do `ssrHomePlugin` funciona (a diferença
cold→warm do ksports é o render do SSR, ~500 ms), mas o documento chega em menos
de 700 ms no pior caso. O FCP de 5 s está no que vem **depois** do primeiro byte.

### Achado: o `__SSR_DATA__` é a PRIMEIRA coisa do `<head>`

Medido no HTML servido por `https://sp011.com.br/` em 2026-07-28:

| Elemento | Offset no documento |
|---|---:|
| `window.__SSR_DATA__` | **64** |
| — tamanho do bloco | **62.287 chars** |
| `rel="modulepreload"` | 68.301 |
| `<link rel="stylesheet">` | 68.627 |
| `</head>` | 68.699 |
| `<div id="root">` | 68.720 |
| documento total | 176.559 |

`ssrHomePlugin` injeta o JSON com `.replace("<head>", …)`, ou seja **no topo
absoluto do documento**. O navegador precisa baixar e parsear 62 KB de JSON
antes de ver o `<link>` do CSS render-blocking, os `modulepreload` e o markup
do SSR. Na banda do Lighthouse mobile (1,6 Mbps ≈ 200 KB/s) são **~310 ms de
atraso puro** empurrando todo o resto para a direita, mais o parse com CPU 4×.
É o insight "Document request latency — Est savings 114 KiB", e ataca
diretamente o FCP, que é a métrica mais atrasada.

**A correção é barata e segura:** mover o bloco para o fim do `<body>`, depois
do `#root`. O entry é `<script type="module">`, e módulo é *deferred* por
definição — só executa quando o parse do documento termina. Um `<script>`
clássico inline em qualquer ponto anterior do documento já terá definido
`window.__SSR_DATA__` a tempo. Ganho: o CSS e o markup do SSR passam a ser
descobertos ~62 KB mais cedo, sem tirar nada do payload.

**Por que as duas medições divergem tanto** (Playwright 2,28 s × Lighthouse
5,1 s de FCP): o Lighthouse mobile usa *simulated throttling* (Lantern), que
modela a cadeia de dependências com handshake por origem e é sistematicamente
mais pessimista que o *applied throttling* do CDP que meu script usa. Os dois
são válidos, mas **não são comparáveis em valor absoluto** — o script serve
para antes/depois contra ele mesmo; o Lighthouse é quem responde ao DoD
(Performance ≥ 75). Daqui para frente, todo PRD reporta os dois.

### Onda 2, reordenada por este Lighthouse

O `ROADMAP.md` colocava 03 e 04 na mesma onda sem ordem entre eles. Os dados
desempatam: **PRD-04 primeiro** (2.150 ms de render-blocking + 246 KiB de CSS
não usado, a maior economia isolada do relatório), **PRD-03 depois** (411 KiB
de imagem). O 04 também é o que mais aproxima o FCP do alvo, e o FCP é o que
ficou 84 ms fora do critério no PRD-02.

## PRD-PERF-04 — entregue (b54892c), medido em produção em 2026-07-28

Entregue junto o quick win do `__SSR_DATA__` e as duas correções que a onda 1
tinha agendado (todas no serviço `web`, conforme decidido).

### Medição em produção (sp011, imagem v59)

| Métrica | Antes | Depois | Meta do PRD |
|---|---:|---:|---:|
| CSS público bruto | 197.597 | **139.097** (−29,6%) | ≤ 95.000 ❌ |
| CSS público gzip | 30.674 | **22.449** (−26,8%) | ≤ 17.000 ❌ |
| Offset do `<link rel=stylesheet>` | 68.633 | **6.584** | — ✅ |
| Arquivos em `components/ui/` | 55 | **4** | ≤ 20 ✅ |
| `window.__SSR__` no topo | — | presente | ✅ |
| `HEAD /` | `index.html` cru | **200 text/html** | ✅ |

### O fecho transitivo era 4, não 13

O PRD listava 13 `ui/*` importados. Aquela contagem somava as arestas
**internas** de `components/ui/` (um wrapper importando outro). Os pontos de
entrada reais são quatro: `toaster` (App.tsx), `toast` (hooks/use-toast),
`card` (pages/not-found) e `tooltip` (components/admin/AdminLayout). Os outros
51 saíram, junto de 39 dependências que ficaram sem nenhum importador e de
34 PNGs órfãos (44,7 MB — todo `.png` com par `.webp` tinha zero importadores).

### Item 3 medido e NÃO aplicado — o critério de 95 KB é inatingível neste PRD

O PRD manda medir antes de escolher a técnica. Como o build do Vite não roda no
Windows, a medição foi feita sobre o CSS **servido em produção**, cruzando cada
regra com as classes que aparecem só em `pages/admin`+`components/admin`, só no
resto, ou nos dois (2,2% do arquivo ficou sem classificar):

| Origem | Bytes | % |
|---|---:|---:|
| Só no público | 55.336 | 39,8% |
| Compartilhado público + admin | 30.397 | 21,9% |
| Infra do Tailwind (`@property`, `:root`, preflight, `@font-face`, keyframes) | 24.699 | 17,8% |
| **Só no admin** | **24.911** | **17,9%** |

Separar o `admin.css` por `@source` (item 3) levaria o CSS público a
**~110.400 B**, ainda **15 KB acima da meta**. Em gzip a diferença é de ~4 KB —
cerca de 20 ms na banda do Lighthouse mobile, contra os ~310 ms que o quick win
do `__SSR_DATA__` já entregou. Não paga o custo: dois arquivos de CSS, risco de
classe perdida no admin (`Login.tsx` e `Setup.tsx` não passam pelo `AdminShell`)
e 14 rotas × 2 blogs de verificação visual.

**A hipótese do PRD estava parcialmente certa.** Ele supunha (confiança média
declarada) que "a maior fatia dos 197 KB vem das telas admin + dos `ui/*`
mortos". Os `ui/*` mortos eram de fato a maior fatia — 58,5 KB, já cortados. As
telas admin são só 24,9 KB. O piso do CSS público é **~110 KB** (85,7 KB de
classes que o site público realmente usa + 24,7 KB de infra do Tailwind), então
**≤ 95.000 B não é alcançável sem redesenhar o site** — e "não redesenhar nada,
este PRD é byte-neutro visualmente" é regra explícita do próprio PRD.

Registrado como **critério revisado por evidência**, não como falha silenciosa.
Se o item 3 for desejado depois por outro motivo (o admin cresce e o público não
deve pagar por ele), o caminho está escrito no PRD e continua válido.

### Nota de método

O primeiro cruzamento deu 99,3% "sem classe" — o parser tratava cada
`@layer utilities{…}` minificado como uma regra única. Depois de corrigir, ainda
sobravam 20 KB órfãos porque o extrator incluía aspas no charset e
`className="sr-only"` virava o token `"sr-only"`. Os dois vieses foram
corrigidos antes de tirar qualquer conclusão; os números da tabela são do
parser corrigido.

## PRD-PERF-03 — entregue (cdca546 + 5ca2795), medido em produção em 2026-07-28

### Medição em produção (sp011), nas larguras que o site realmente pede

| Asset | Antes | Depois | Corte |
|---|---:|---:|---:|
| `logo` (w=320) | 81.530 PNG | **10.570** WebP | −87,0% |
| `footer-logo` (w=320) | 69.534 PNG | **10.976** WebP | −84,2% |
| `byline-logo` (w=32) | 82.957 PNG | **402** WebP | −99,5% |
| `favicon` (w=64) | 33.166 PNG | **1.620** WebP | −95,1% |
| **Total** | **267.187** | **23.568** | **−91,2%** (meta ≤ 26.000 ✅) |

| Outro critério | Resultado |
|---|---|
| `content_type` com `w` | `image/webp` ✅ |
| `If-None-Match` | **304** ✅ |
| Preloads `as=image` no `<head>` | 3 → **1**, e é o do hero (`/api/image?url=…`) ✅ |
| `og-image` | continua **sem** `w` (crawler recebe 1200×630) ✅ |

O `byline-logo` é o caso extremo e explica o tamanho do ganho: um PNG de
1080×1080 com 82.957 B para desenhar um círculo de 16 px, referenciado **13
vezes** no HTML da home.

### Contradição interna do PRD, resolvida a favor do critério

O item 3 do PRD dizia que o preload da logo do **cabeçalho** "é aceitável" depois
do resize; o critério de aceite pedia exatamente **1** preload, o do hero. A
primeira medição deu 2 — o rodapé saiu, o cabeçalho ficou.

O critério está certo e o item 3 não: a logo já está no HTML do SSR no topo do
`<body>`, então o parser a descobre de imediato — o preload adianta poucos ms e
em troca disputa banda com a imagem do LCP. `loading="lazy"` numa imagem **dentro
da viewport** não atrasa nada (o navegador busca imagem lazy visível assim que
calcula o layout); o efeito útil é só impedir o hoisting do React 19. Vale
duplamente porque o `HeaderLogo` tem **duas** `<img>` (mobile e desktop): num
blog com logo mobile configurada, uma delas está sempre em `display:none`, e
**preload não respeita media query** — seriam 2 preloads, um de um recurso que
aquele viewport nunca usa.

### Decisões de implementação que valem registro

- **Sem `w`, a resposta é byte-idêntica à anterior** — qualquer URL antiga em
  cache de navegador continua válida.
- **A identidade do cache é o conteúdo do data URI, não o `?v=` da query.** Uma
  URL montada à mão sem `v` nunca serve a logo antiga, e a troca no admin
  invalida sozinha.
- **SVG não passa pelo sharp**: rasterizar vetor perde qualidade em 2× e costuma
  aumentar o peso.
- **Falha do sharp cai para o binário cru**, em vez de deixar o site sem logo.
- O helper `siteAssetUrl`/`siteAssetSrcSet` devolve a entrada **inalterada** para
  data URI, URL externa e caminho estático — o mesmo campo ainda chega como data
  URI em blog não migrado ou `localStorage` antigo, e um `&w=` colado num `data:`
  quebraria a imagem.
- Teste novo cobre explicitamente que a URL derivada continua casando com
  `startsWith(SITE_ASSET_PREFIX)` da guarda do `updateSettings` — o caminho em
  que uma URL derivada já causou incidente (`store.ts:870-878`).

### Regressão reportada pelo usuário e corrigida (dcbca20)

"Baixou a qualidade da imagem do cabeçalho" (KSports). Duas causas, uma delas
conceitual:

1. **Dimensionar logo por LARGURA é o erro.** A restrição de layout de uma logo
   é a **altura** — o CSS fixa `style={{ height }}` e deixa a largura livre, que
   sai da proporção e só o servidor conhece. A logo do KSports é 1080×300
   (3,6:1) com `logoSize=120` → é desenhada com **432 px de largura**, e o PRD-03
   servia `w=320`: o navegador ampliava. A rota passou a aceitar `h`, com
   precedência sobre `w`, e Header/Footer pedem a altura que eles mesmos aplicam
   (`srcSet` 2× no mesmo eixo). `w` continua valendo para favicon e byline, que
   são quadrados e limitados pela caixa.
2. **`q=82` + `effort:1` é perfil de FOTO.** Em arte com texto, borda dura,
   gradiente e alfa, o lossy do WebP deixa ringing em volta das letras. Novo
   perfil `artwork`: gera lossless e lossy q95/effort 4 e serve **o menor** —
   quem ganha em bytes depende do conteúdo (lossless vence em logo chapada, o
   lossy vence quando há gradiente, como no KSports).

Medido localmente antes do deploy:

| | exibida | servida antes | servida agora |
|---|---|---|---|
| KSports cabeçalho | 432×120 | 320 px (**upscale**) | 432 px · 15.346 B |
| SP011 cabeçalho | 318×112 | 320 px | 318 px · 11.854 B |
| SP011 rodapé | 114×40 | 320 px (2,8× maior que o preciso) | 114 px · **3.548 B** |

O mesmo erro acontecia ao contrário no rodapé. Somando as duas logos, o sp011
fica **menor que antes** (15.402 contra 21.546 B) e correto em nitidez. A chave
de cache passou a codificar o eixo (`h ? -h : w`) e o literal `artwork`, para
não reaproveitar o disco lossy antigo.

### Pendente para fechar o PRD-03

- **Conferir a logo do KSports depois do deploy de `dcbca20`** — é o único juiz
  da regressão acima.
- **Troca de logo pelo admin** (`/admin/configuracoes`) refletindo no site em
  ≤90 s — é o gate que valida a guarda do `updateSettings` no fluxo real.
- `LCP ≤ 2.000 ms` e `bytes de imagem na home ≤ 130 KB`: dependem de uma medição
  com a VPS ociosa.
- Rollout aos 8 blogs.

## PRD-PERF-05 — entregue (código), pendente de medição em produção

O SSR existia só para `/`. Toda outra rota recebia o `index.html` com o `#root`
vazio — daí FCP de 4,2 s e LCP de 5,5 s em artigo e categoria contra 2,5 s na
home. Agora `/artigo/:slug` e as rotas de editoria também saem renderizadas.

### O bloqueio que o PRD não previu

`renderToString` **não espera Suspense**, e todas as páginas públicas eram
`lazy()`. Pelo caminho natural, o SSR de artigo/editoria devolveria o
`<PageSpinner/>` — a página inteira trocada por um spinner, servida como HTML
final. Três saídas foram consideradas:

| Saída | Por que não / por que sim |
|---|---|
| Render em duas passadas (renderizar, esperar o microtask, renderizar de novo) | A 1ª passada inicializa TODO lazy que alcança, inclusive `Toaster` e `LGPDConsent`. Se o import deles resolvesse a tempo, a 2ª passada emitiria markup que o cliente NÃO tem no 1º render (chunk ainda baixando) → mismatch. Resultado dependente de corrida de I/O: descartado. |
| `import.meta.env.SSR` com import estático no ramo morto | Exigiria top-level await no App, que é compartilhado com o bundle do cliente. |
| **Prop `pages` no App** (escolhida) | O `entry-server` importa `Artigo` e `CategoryArchivePage` de forma ESTÁTICA e injeta; o `Router` usa `pages?.X ?? X`. Determinístico, sem tocar em interno do React, e o bundle do cliente nunca vê o objeto — os chunks continuam sob demanda. |

### Mudanças estruturais

- **As 13 editorias de rota fixa deixaram de ser 13 arquivos de página de 3
  linhas** (`src/pages/Politica.tsx` e cia, todos idênticos) e viraram a tabela
  `FIXED_CATEGORIES` em `src/lib/categoryRoutes.ts`. O módulo é a fonte única de
  três consumidores que **precisam concordar**: o App (monta as rotas e resolve
  o `/:slug`), o middleware de SSR (decide o que renderizar no servidor) e o
  `<title>` servido. Discordar ali é o servidor pintar uma página e o cliente
  hidratar outra. O `vite.config.ts` importa o módulo — é TS puro, sem React.
- `classifySsrPath` saiu do `vite.config.ts` para `src/lib/ssrRoutes.ts` **para
  ter teste**: é a função que decide o que NUNCA vira HTML de servidor (o
  painel, os assets, a API). Falso positivo ali não é lentidão, é o painel
  vazando para o HTML público.
- `ssrHomePlugin` → `ssrPlugin`, com tabela de rotas, cache LRU (teto de 200
  entradas, TTL 30 s na home e 60 s no resto, chave incluindo o **host**) e um
  `<head>` por rota (título/OG do artigo, `article:published_time`,
  `article:section` e `<link rel="canonical">` self-referente nas três rotas).
- `DynamicCategory` não busca mais `/api/site` por conta própria: lê o
  `useSite`, que o SSR já semeou. Sai um round-trip e some o `null` do primeiro
  quadro.
- Seeds novos: `seedArticle` (artigo único) e `seedCategoryArchive` (página de
  editoria — a lista dela vive num `useEffect`, que o `renderToString` não roda).

### Defeitos encontrados no caminho (e corrigidos)

- **`ArticleCard` sem `loading="lazy"`**: com o SSR da editoria, o React 19
  emitiria um `<link rel=preload as=image>` para **cada um dos ~58 cards**,
  todos disputando banda com a imagem do destaque (o LCP da página). Mesma
  correção no avatar de assinatura do artigo.
- **`Artigo.tsx` montava o JSON-LD com `BRAND.url`** quando não havia `window` —
  o domínio do blog que buildou a imagem Docker. No SSR isso seria um
  `<script type="ld+json">` diferente do que o cliente monta → mismatch. Novo
  `pageOrigin()`, semeado com o origin da requisição. O `breadcrumbSchema`, que
  ainda tinha `https://sbcagora.com.br` fixo nos 8 blogs, foi junto.
- **`_articleCache` não tinha teto.** No navegador morre com a aba; no processo
  de SSR, que fica de pé por semanas, cada artigo renderizado deixaria o corpo
  inteiro na memória do container `web` para sempre. Teto de 60 entradas com
  descarte da mais antiga.
- **`useSite` não distinguia "settings do localStorage" de "settings
  confirmadas"** (`_cacheAt = 0` no seed do boot). Sem isso, o `DynamicCategory`
  novo responderia NotFound a uma editoria criada depois da última visita do
  usuário. Campo `validated` no retorno do hook.

### Decisões que valem registro

- **Path com barra final não é renderizado no servidor** (`/futebol/` cai na
  SPA). O wouter do cliente pode casar outra rota para ele, e servir a página
  certa para uma URL que o cliente resolve de outro jeito é trocar lentidão por
  hidratação quebrada.
- **A editoria busca `/api/site` ANTES das listas.** Sem o menu não dá para
  saber se o slug é editoria, e buscar as listas de um path qualquer daria a
  bots um jeito barato de multiplicar consultas.
- **Descrição por editoria não foi implementada** (o PRD pedia `<title>` e
  description). O `<title>` sim — `Política — SP011`, escrito pelo SSR e
  repetido pela página. A description continua a do portal: inventar texto
  editorial em dois idiomas para 8 blogs de nichos diferentes é conteúdo, não
  performance.
- **`suppressHydrationWarning` no tempo relativo** dos cards de editoria (mesmo
  padrão que a home já usava no hero e na TopBar): o HTML fica até 60 s em
  cache, e "3 h atrás" vira outro texto nesse intervalo.
- **O corpo do artigo é sanitizado por caminhos diferentes** nos dois lados
  (regex no servidor, DOMPurify no cliente). O React não compara conteúdo de
  `dangerouslySetInnerHTML` na hidratação, então não há mismatch — o DOM fica
  com a versão do servidor, que remove as mesmas classes de perigo.

## PRD-PERF-05 — validação em produção (sp011, 2026-07-29)

> **Duas medições, e a diferença entre elas é a lição.** A primeira rodou com o
> `ollama` em **1576% de CPU** — a máquina inteira, reescrevendo notícia — e
> reprovou 4 metas de FCP/LCP. A segunda, com o `central-api` parado e o load
> average abaixo de 1, aprovou todas com folga. **Nenhum número de tempo desta
> auditoria vale sem conferir `docker stats` antes**; os critérios estruturais
> (`#root`, console, memória, 404) não dependem de carga.

### Critérios de aceite

| Critério | Meta | Medido | |
|---|---|---|:--:|
| `#root` vazio em `/artigo/:slug` | 0 | **0** | ✅ |
| `#root` vazio na editoria | 0 | **0** | ✅ |
| `/admin/login` continua client-only | 1 | **1** | ✅ |
| Slug inexistente e rota inventada | não 500 | **200** (SPA) | ✅ |
| HEAD no artigo | 200 sem corpo | **200 · 0 B** | ✅ |
| TTFB quente | ≤ 200 ms | **3–5 ms de servidor** | ✅ |
| Memória do `web` após 50 artigos | ≤ 400 MB | 197,9 → **212,6 MiB** | ✅ |
| Console sem aviso de hidratação | 0 | **limpo nas 3 rotas** | ✅ |
| CLS | 0 | **0,002** nas 3 | ✅ |
| FCP `/artigo/:slug` | ≤ 2.100 ms | **1.312 ms** | ✅ |
| LCP `/artigo/:slug` | ≤ 2.900 ms | **1.312 ms** | ✅ |
| FCP `/politica` | ≤ 2.200 ms | **1.360 ms** | ✅ |
| LCP `/politica` | ≤ 3.000 ms | **1.360 ms** | ✅ |
| `load` em `/artigo` (proxy de Speed Index) | ≤ 2.600 ms | **2.336 ms** | ✅ |

Tempos da medição com a VPS ociosa (a saturada está na tabela seguinte).

### Medição de campo (mesmo perfil do baseline, mediana de 5)

Com a VPS ociosa (`central-api` parado, load average 0,54):

| Rota | FCP | LCP | transfer | decoded | reqs |
|---|---:|---:|---:|---:|---:|
| `/` baseline | 2.564 | 2.572 | 1.006 KB | 1.939 KB | — |
| **`/` agora** | **1.332** | **1.332** | **527 KB** | **1.240 KB** | 31 |
| `/artigo` baseline | 4.208 | 5.464 | 1.622 KB | 4.196 KB | — |
| `/artigo` pós-02 | 2.960 | 4.392 | 674 KB | 1.328 KB | — |
| **`/artigo` agora** | **1.312** | **1.312** | **425 KB** | **1.069 KB** | 19 |
| `/politica` baseline | 4.208 | 5.660 | 1.490 KB | 6.508 KB | — |
| `/politica` pós-02 | 2.916 | 4.116 | 558 KB | 1.223 KB | — |
| **`/politica` agora** | **1.360** | **1.360** | **431 KB** | **1.139 KB** | 25 |

**FCP e LCP colaram nas três rotas**: o maior elemento passa a pintar junto com
o primeiro, que é exatamente o que o SSR existe para fazer. Contra o baseline,
LCP −76% no artigo e −76% na editoria. TTFB de 10 ms.

A dispersão também sumiu: cinco leituras do artigo entre **1.308 e 1.316 ms**,
contra 2.004–3.112 na medição saturada. Aquilo era contenção de CPU, não o site.

### A mesma medição com o Ollama comendo a máquina (1576% de CPU)

| Rota | FCP | LCP | transfer | decoded |
|---|---:|---:|---:|---:|
| `/` | 2.412 | 2.412 | 704 KB | 1.417 KB |
| `/artigo` | 2.884 | 2.884 | 448 KB | 1.097 KB |
| `/politica` | 3.192 | 3.800 | 431 KB | 1.139 KB |

Fica registrado por dois motivos. Primeiro, é o custo REAL para o visitante
sempre que a central reescreve — e isso atinge os 8 blogs ao mesmo tempo, não
só quem está sendo medido. Segundo, sob saturação o SSR da editoria chega a
custar FCP: `/politica` foi de 2.916 (pós-02) para 3.192 ms enquanto o LCP caiu
de 4.116 para 3.800. A causa é o tamanho do documento — `/arquivo`, única rota
pública sem SSR, serviu de controle:

| Rota | bruto | gzip |
|---|---:|---:|
| `/arquivo` (sem SSR) | 6.673 | 2.642 |
| `/politica` (com SSR) | 162.668 | **35.153** |
| `/artigo` | 73.732 | 19.912 |
| `/` | 178.845 | 35.857 |

O SSR da editoria acrescentou **32,5 KB gzip** ao documento. A 1,6 Mbps
(~200 KB/s) são ~163 ms de download disputando o caminho crítico com o CSS que
bloqueia a renderização — a mesma ordem de grandeza dos 276 ms perdidos. Com a
máquina ociosa esse custo desaparece na medição (1.360 ms de FCP), mas ele
existe: é banda, e reaparece em conexão ruim de visitante real.

O documento da editoria se divide em ~100 KB de markup (58 cards a ~1,7 KB) e
~58 KB de `__SSR_DATA__` (60 artigos da lista + 30 recentes + 5 mais lidas +
settings). Reduções possíveis, em ordem de retorno:

1. **SSR só da dobra** (2 destaques + ~8 cards) e o resto buscado depois de
   hidratar: cortaria ~80 KB brutos / ~18 KB gzip, ~90 ms de FCP. Muda
   comportamento (a lista completa chega ~1 s depois) — **fora do escopo do
   PRD-05, decisão do dono**.
2. Não semear os 30 recentes quando `showTopBar` está desligado — nada mais na
   página de editoria lê `useArticles`. ~15 KB brutos, sem mudar nada visível.
3. Enxugar os campos do seed para os 8 que o `toCard` usa (fora `category`,
   `views`, `readingMinutes`): ~10% do JSON.

### stale-while-revalidate do servidor (1dbdfc0) — o pior número da auditoria

Medido ANTES: três misses seguidos da home custaram **505 ms, 2.792 ms e
311 ms** de tempo de servidor. O header `stale-while-revalidate` que já
mandávamos só vale para cache compartilhado e navegador; na origem, a cada 30 s
um visitante pagava a renderização inteira (300 artigos + pool por categoria +
100 cards). Artigo e editoria custavam ~300 ms no miss.

Depois de servir o HTML vencido na hora e revalidar atrás:

| | antes | depois |
|---|---:|---:|
| pós-TTL 1 | 708 ms | **192 ms** |
| pós-TTL 2 | **2.892 ms** | **181 ms** |
| pós-TTL 3 | 602 ms | **183 ms** |

(valores de relógio, ~100 ms deles handshake TLS + RTT — o `curl` sai da VPS e
volta pelo Caddy.) A cauda sumiu.

### Nota de método

O medidor de campo agora é versionado (`performance-audit/medir-campo.mjs`,
commits 3ed176e/8c14c25/a0d361f). Dois defeitos dele foram corrigidos durante
esta medição e valem registro porque contaminariam qualquer série futura:
`getEntriesByType("largest-contentful-paint")` devolve lista vazia no Chrome (a
primeira leitura saiu com LCP = 0 nas três rotas) **e** imprime "Deprecated API
for given entry type" no console — justamente o gate de hidratação que o
relatório existe para checar. E a primeira leitura de uma rota com SSR paga o
cache frio: sem aquecimento ela entrava na amostra (3.720 ms contra 2.396 e
2.516 na home) e puxava a mediana.

## Achado fora dos PRDs: bloco de imagem servia a imagem crua (4cd391b)

Veio de um PageSpeed do **esporteagora** em 2026-07-30: desempenho **48** num
blog cujo FCP era 1,2 s. O mesmo código, na mesma imagem Docker, dava **99** no
oleysports. A diferença não era código — era o que o operador subiu pelo painel:

| Banner (bloco de imagem da home) | peso | exibido | real |
|---|---:|---:|---:|
| `anuncie-lateral-16e026e7.png` | **1.697 KiB** | 665×561 | 1366×1152 |
| `anuncie-faixa-ad6bf104.png` | 728 KiB | 665×87 | 2172×284 |
| `imagem-f20e6788.png` | 417 KiB | 665×53 | 2172×172 |

2,84 MB de 3,74 MB da página, e o lateral era o elemento de LCP: **15,0 s**.
Os anúncios da TABELA de anúncios nunca tiveram esse problema (`/api/ads/:id/image`
já serve WebP de 960 px) — por isso o oleysports passou ileso.

**Mas o código deixou o conteúdo causar esse estrago**, e isso é defeito nosso:

1. O `ImageBlock` renderizava `<img src={block.imageUrl}>`. O `/api/uploads` já
   redimensiona e converte para WebP desde sempre; faltava pedir. Medido depois
   da correção, no mesmo arquivo: **1.737.247 B cru → 110.742 B** na largura que
   o celular escolhe (−93,6%).
2. Sem `width`/`height`, o `h-auto` deixava a imagem com altura zero até chegar
   e tudo abaixo pulava: **CLS 0,945**, dos quais 0,605 só do rodapé. As
   dimensões nativas passaram a vir no `/api/site` (`lib/blockImageMeta.ts`,
   leitura cacheada por nome de arquivo — o nome do upload carrega hash de
   conteúdo, então nome igual = bytes iguais). Sem campo novo no painel, sem
   migração, e vale para os blocos que já existem.

Depois (PageSpeed no mesmo blog, e medição de campo com a VPS ociosa):

| | antes | depois |
|---|---:|---:|
| Desempenho (PSI) | 48 | **62** |
| LCP (PSI) | 15,0 s | **3,2 s** |
| CLS (PSI) | 0,945 | **0** |
| CLS (campo, home e artigo) | — | **0** |
| FCP / LCP de campo, home | — | 1.400 / 3.280 ms |
| FCP / LCP de campo, artigo | — | 1.416 / 2.232 ms |

### O gargalo mudou de lugar: agora é thread principal

O PSI depois da correção acusa **TBT 2.210 ms**, 5,7 s de trabalho na thread
principal e 20 tarefas longas. **A comparação com os 110 ms de antes não vale**:
com 4,2 MB de imagem a página ficava presa na rede e o JS rodava escondido atrás
do download; tirada a rede da frente, o custo de JS aparece na janela medida. Ele
sempre esteve ali.

É o único item grande que a auditoria não tocou: o PRD-02 cortou BYTES de JS, não
o TRABALHO de hidratação (22 blocos e ~100 cards reconciliados de uma vez, com a
CPU 4× estrangulada). Merece PRD próprio.

### O #418/#419 do esporteagora não se reproduz

Aquele PageSpeed acusou erro de hidratação no console; o blog estava numa imagem
anterior. Depois do rollout para a v68, **dez execuções (5 na home, 5 no artigo)
saíram com console limpo**. Fica registrado como não reproduzível — não como
resolvido, porque não sei qual mudança o matou.

## PRD-PERF-07 — hidratação: a home formatava 4.400 datas por render

O TBT de 2.210 ms tinha uma causa única e mensurável, encontrada lendo o código
antes de instrumentar: **a home construía um `Intl.DateTimeFormat` por card**.

`formatDayMonth` chamava `date.toLocaleDateString(lang, opts)`, e essa API
CONSTRÓI um formatador a cada chamada — a construção é a parte cara, formatar
depois é quase de graça. Pior: `getArticles(cat)` é chamada por **cada bloco**
durante o render e percorre a lista **inteira** (200 artigos, o
`ARTICLES_LIST_LIMIT` da home), formatando a data de todos, inclusive dos que o
bloco descarta em seguida ao fatiar 3–6 itens. Com os 22 blocos do template de
portal: **4.400 formatações por render**.

Medido com `node` (CPU de desktop, sem estrangulamento):

| | 4.400 formatações |
|---|---:|
| `toLocaleDateString(lang, opts)` — como estava | **677 ms** |
| `Intl.DateTimeFormat` cacheado | 24 ms |
| cacheado **e** uma passada por categoria | **0,5 ms** |

677 ms de CPU de desktop viram ~2,7 s no celular do PageSpeed, que roda com a CPU
4× mais lenta — sozinho, isso cobre o TBT inteiro. E não acontecia uma vez: a
home re-renderiza na hidratação, quando o `/api/site` volta (`refreshSite`) e
quando o `/api/articles` resolve. Três vezes.

O mesmo custo era pago **no servidor**, a cada render do SSR da home.

### O que mudou

- `lib/i18n.ts`: os quatro formatadores passam por um cache de
  `Intl.DateTimeFormat` por (estilo, idioma, fuso). Vale para o site inteiro —
  byline do artigo, arquivo, editoria e a data por extenso da TopBar.
- `pages/Home.tsx`: `getArticles` memoriza a lista já mapeada por categoria
  (`useMemo` em `[articles, lang, tz]`). "Uma passada por bloco" virou "uma
  passada por categoria distinta", e re-render passou a custar zero.
- Removido o `useArticlesByCategory`, cópia sem uso do mesmo mapeamento — uma
  segunda versão lenta esperando para ser reintroduzida por engano.

### Por que a saída não pode ter mudado

Trocar formatador de data num app com SSR é exatamente o tipo de mudança que
quebra hidratação em silêncio: basta um caractere diferente entre servidor e
cliente para o React descartar o HTML do SSR (#418) e o LCP voltar ao que era
antes do PRD-05. `src/lib/i18n.test.ts` compara a implementação nova com a
antiga em **384 combinações** (4 estilos × 2 idiomas × 4 fusos × 6 datas,
incluindo virada de dia e de ano) e exige igualdade byte a byte.

Uma diferença real existe e está tratada: `Intl.format` **lança** `RangeError`
em data inválida, enquanto `toLocaleDateString` devolve `"Invalid Date"`. Um
`publishedAt` corrompido no banco derrubaria a home inteira. O caminho de data
inválida continua no comportamento antigo, com teste próprio.

### O medidor passou a medir TBT

`medir-campo.mjs` só media FCP/LCP/CLS — não media o número que este PRD precisa
derrubar. Ganhou observador de `longtask` (TBT, contagem e maior tarefa) e de
`long-animation-frame`, que atribui o tempo a **arquivo e função** e evita
adivinhação sobre bundle minificado. O TBT daqui não é o do Lighthouse (janela e
traçado diferentes): serve para comparar esta série com ela mesma.

## PRD-PERF-07 — validação em produção (2026-07-31, imagem v71)

Medido com a VPS ociosa pelo runbook `VPS-OCIOSA.md` (ollama e central-api
parados, load abaixo de 1,0 — o `docker stats` da sessão não tinha nenhum
container acima de 12%).

### Confirmação de que a imagem certa foi medida

O script de medição é copiado à parte (`docker compose cp`), então colunas novas
no relatório **não** provam que o `web` foi rebuildado. A prova veio do bundle
servido: `DateTimeFormat: 1` e `toLocaleDateString: 1`. O código antigo tinha
zero e quatro. Fica como método para as próximas: verificar a imagem pelo
artefato servido, não pela ferramenta de medir.

### esporteagora — o blog que motivou o PRD (22 blocos)

| | 2026-07-30, antes | 2026-07-30, só imagem corrigida | 2026-07-31, com o PRD-07 |
|---|---:|---:|---:|
| Desempenho (PSI móvel) | 48 | 62 | **98** |
| TBT | 110 ms¹ | 2.210 ms | **10 ms** |
| Tarefas longas | — | 20 | **1** |
| LCP | 15,0 s | 3,2 s | **2,1 s** |
| FCP | 1,2 s | 2,1 s | **1,2 s** |
| CLS | 0,945 | 0 | **0** |

¹ Os 110 ms da primeira coluna são enganosos e estão aqui só para não sumirem do
registro: com 4,2 MB de imagem a página ficava presa na rede e o JS rodava
escondido atrás do download. O trabalho de hidratação sempre esteve lá.

### sp011 — nenhuma regressão, e o instrumento calibrado

PSI móvel: **Desempenho 95**, TBT 110 ms, CLS 0,002, FCP 1,5 s, LCP 2,6 s.
Medidor de campo (mediana de 5, VPS ociosa):

| rota | FCP | LCP | TTFB | CLS | TBT | tarefas |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 1.452 | 1.452 | 13 | 0,002 | 86 | 2 |
| `/artigo/…` | 1.432 | 1.432 | 10 | 0,002 | 112 | 2 |
| `/politica` | 1.476 | 1.476 | 12 | 0,02 | 102 | 4 |

**Console limpo nas 15 execuções** — o gate que mais importava nesta mudança.
Mexer em formatador de data com SSR quebra hidratação em silêncio; o React teria
logado #418 e não logou.

Vale registrar um cruzamento de instrumentos que antes não existia: na MESMA
página (sp011), Lighthouse deu TBT 110 ms e o medidor de campo 86 ms — concordam
dentro de ~25%. Eu havia avisado que comparar os 2.210 do Lighthouse com os 86 do
medidor seria erro de método; a comparação legítima é esta, e ela valida a série
de TBT daqui em diante. Para REDE as duas continuam incomparáveis (LCP 2,6 s vs
1.452 ms): o PSI usa 4G lento com CPU do Moto G Power, o medidor usa 1,6 Mbps e
RTT 150 ms.

### Atribuição do que sobrou na thread

`index-*.js:(anônima)` 111–127 ms e `vendor-react:bl` 69–94 ms, praticamente
iguais nas três rotas — inclusive nas duas que **não** renderizam blocos de home.
É o custo fixo de subir o React e hidratar, não trabalho proporcional ao
conteúdo. Foi esse padrão que indicou, antes do `grep` no bundle, que a correção
estava mesmo no ar.

### O que o PSI aponta agora (nenhum é hidratação)

esporteagora: árvore de dependência da rede, entrega de imagens (142 KiB),
solicitações que bloqueiam renderização, imagens sem `width`/`height`, JS não
usado (59 KiB). sp011: os mesmos, com 150 ms de render-blocking e 61 KiB de JS
não usado. O LCP virou a pior métrica dos dois — é o próximo alvo natural.

## Achado: a editoria nunca passou pelo proxy de imagem, e hidratava errado

Encontrado em 2026-07-31 medindo o esporteagora depois do PRD-07. A home saiu em
LCP 1.432 ms e console limpo; a **mesma imagem**, na rota `/futebol`:

| | `/` | `/futebol` |
|---|---:|---:|
| LCP | 1.432 ms | **10.040 ms** |
| TBT | 74 ms | 262 ms |
| `index.js` na thread | 115 ms | 241 ms |
| console | limpo | **React #418** |

O HTML do servidor está sadio — `curl` na rota devolve 200 em 36 ms com 161 KB.
O estrago é todo no cliente, e são dois defeitos independentes.

### 1. Imagens cruas da origem

`ArticleCard` e o destaque do `CategoryPage` renderizavam `src={imageUrl}` sem
proxy e sem `srcset`. A editoria baixava foto de agência em tamanho original
(`AFP__20260729__…__HighRes__….jpg`) direto do site da fonte, para caixas de
110–180 px (miniatura) e 640 px (destaque). A 1,6 Mbps, **três requisições não
terminavam em 45 s** — foi o que travou o evento `load` e o que a lista de
requisições pendentes do medidor apontou nominalmente.

O proxy já existia, e `.gazetaesportiva.com` já estava na allowlist desde
2026-07-20. A home sempre usou; a editoria nunca foi ligada. Corrigido também no
`ArtigosRelacionados` (mesmo defeito, abaixo da dobra no artigo).

### 2. React #418 — tempo relativo contra HTML cacheado

`relativeTimeOrDate` calcula "agora mesmo" / "3 h atrás" a partir de
`Date.now()`. O HTML da editoria fica em cache por até 60 s: o servidor escreve
"agora mesmo", o cliente hidrata 40 s depois e calcula "1 min atrás". Divergência
**garantida** para artigo recente — e é por isso que só a editoria acusava #418:
a home usa `formatDayMonth` e o artigo `formatDateTime`, ambos absolutos.

O destaque do `CategoryPage` já tinha `suppressHydrationWarning` (com comentário
explicando exatamente isso); os ~58 cards da lista, não. Agora têm.

Efeito colateral aceito: com a marca, o React mantém o texto do SERVIDOR, então o
tempo relativo pode nascer até 60 s velho. Trocar "agora mesmo" por "1 min atrás"
não vale um re-render de página inteira.

**Isto retro-explica o registro de "#418 do esporteagora não se reproduz"**: as
dez execuções que saíram limpas foram em `/` e `/artigo`. Nenhuma foi numa
editoria.

### O que o episódio diz sobre o método

O #418 estava em produção em todos os 8 blogs, em todas as editorias, e passou
por PRD-05, rollout e duas medições. Só apareceu quando o medidor parou de
morrer na primeira rota travada e passou a listar requisições pendentes. A
diferença entre "não reproduz" e "reproduz sempre" foi puramente de instrumento.

## Próxima ação

1. **Verificação visual acumulada (PRD-04 + PRD-03 + PRD-05)** — o gate que
   nenhum número detecta: `/`, uma categoria, um artigo, `/contato`, e no painel
   `/admin/login`, dashboard, configurações e o modo escuro. Do PRD-04 saíram 51
   componentes e 34 PNGs; do PRD-03, conferir que logo do cabeçalho, do rodapé,
   avatar de assinatura e favicon aparecem **nítidos**, inclusive em tela 2×; do
   PRD-05, que artigo e editoria continuam idênticos ao que eram (o SSR não pode
   mudar layout) e que a navegação SPA segue instantânea.
2. **Troca de logo pelo admin** (gate do PRD-03).
3. **Lighthouse novo com a VPS ociosa.** O anterior rodou durante o rollout dos
   8 blogs e trouxe "The page loaded too slowly to finish within the time
   limit". Agora há quatro mudanças grandes para medir juntas: CSS 29,6% menor,
   62 KB tirados da frente do `<link>`, 243 KB de imagem de identidade a menos e
   o SSR de artigo/editoria.
4. ~~Rollout aos 8 blogs~~ — **CONCLUÍDO em 2026-07-30**. Canário no resenhavip
   e depois os demais; os 8 domínios devolvem cada um o próprio `siteName` (o
   diagnóstico de mistura de blogs) e o `/api/site` ficou entre 31 e 102 ms em
   todos — a leitura de dimensões de imagem não custou nada no caminho crítico.
   `credito.vc` não é da rede: o blog atende em `creditovc.midia.run`.
5. Preencher `tagline` e `seoDescription` por blog no admin. Confirmado no
   rollout: o creditovc, portal de educação financeira, publica
   `"tagline":"Notícia. Agora. Sempre."`. Sem deploy, propaga em ≤1 h.
6. ~~Hidratação na thread principal~~ — **ENCERRADO em 2026-07-31**. TBT do
   esporteagora 2.210 ms → **10 ms**, nota 62 → **98**; sp011 em 95 sem
   regressão. Validado em produção na imagem v71.
7. **Achado fora da auditoria de site:** o `ollama` consome a máquina inteira
   (1576% de CPU) enquanto a central reescreve, e isso é latência real para
   visitante real nos 8 blogs ao mesmo tempo. Nenhum PRD cobre isso.
8. **502 e CLS 0,014 em `/politica`** (achado da medição limpa): imagem legada
   que provavelmente só existe no Supabase Storage, cuja cota de egress estourou
   em julho — a imagem falha, o `BrokenImageFallback` troca pelo placeholder e a
   troca desloca o layout. As outras rotas ficaram em CLS 0,002.
9. `RELATORIO-FINAL.md`.

### Lentidão de build — diagnosticada e CORRIGIDA (9c25560)

Medido na VPS em 2026-07-28. Fora da auditoria de performance do site, mas é o
que atrasava cada deploy. O build do `web` (v59) levou **827 s**:

| Etapa | Tempo |
|---|---:|
| `RUN chown -R node:node /app` | **650,7 s** (79% do build) |
| `RUN pnpm install --frozen-lockfile` | 61,2 s |
| `COPY --from=build /app /app` | 42,7 s |
| `RUN … run build` (o Vite de verdade) | 21,1 s |

O `chown -R` toca todos os arquivos do `/app` e, no overlayfs, **duplica o
`/app` inteiro numa camada nova** — explica também os 2,47 GB da `blog-web:v58`
e os 3,88 GB da `blog-api:v58`. Entrou em `82f9dc8` (PRD-07, 2026-07-21), que é
exatamente quando a lentidão começou.

Corrigido nos dois Dockerfiles: `COPY --from=build --chown=node:node`, que
embute o dono na cópia que já acontecia, sem camada extra. No `api-server`
sobrou o `chown` do `/data`, diretório vazio na imagem — a regra do PRD-07 sobre
volume **preexistente** na VPS não muda. O `Dockerfile` do `web` também passou a
copiar os manifestos antes do `pnpm install`, como o do `api` faz desde
`107134a`. E o `.dockerignore` tirou `attached_assets` (78 MB, só estava no
contexto pelo alias `@assets`, do qual nenhum arquivo importa), `screenshots`,
`*.zip` e os diretórios de auditoria — o contexto era 116 MB transferidos a cada
build dos dois serviços.

Contexto de infra que continua valendo: disco em 109 G de 387 G (29%, **não é
disco cheio**), build cache 71,09 GB, imagens 46,17 GB com v53…v58 vivas, RAM
23 Gi de 31 Gi com **swap 0 B** e o `ollama` segurando ~13 GB. Limpeza segura:
`docker builder prune -f` e apagar as tags `blog-*:v53…v56`, mantendo v57 de
rollback. **Nunca** `docker system prune --volumes` (CLAUDE.md §13).

<!-- diagnóstico original, mantido para histórico -->
<details><summary>Sinais coletados antes da correção</summary>

   | Sinal | Valor | Leitura |
   |---|---:|---|
   | Disco `/` | 109 G de 387 G (29%) | **não é disco cheio** |
   | Build cache do Docker | **71,09 GB** (39,35 recuperáveis) | acúmulo, não é a causa |
   | Imagens | 46,17 GB (26,84 recuperáveis) | v53…v58 vivas; só a v58 em uso |
   | `blog-api:v58` | **3,88 GB** | anormal p/ Node + Chromium |
   | `blog-web:v58` | **2,47 GB** | anormal p/ um SPA estático |
   | RAM | 23 Gi de 31 Gi usados · **7,8 Gi disponíveis** | apertado |
   | **Swap** | **0 B** | sem rede de segurança |

   Causa, em ordem de peso: (a) o `Dockerfile` do `web` faz `COPY . .` **antes**
   do `pnpm install`, então **todo** build reinstala o monorepo inteiro — o do
   `api` já corrige isso desde `107134a`, copiando só os manifestos primeiro;
   (b) o `RUN chown -R node:node /app` de `82f9dc8` (PRD-07, 2026-07-21) toca
   todos os arquivos do `/app` e, no overlayfs, **duplica o `/app` inteiro numa
   camada** — explica os 3,88 GB / 2,47 GB e bate com a época em que a lentidão
   começou; (c) `docker compose build api web` sobe dois builds simultâneos com
   7,8 Gi livres e **swap zero**, com o `ollama` segurando ~13 GB.

   Correções, da mais barata para a mais estrutural: `docker builder prune -f`
   (~39 GB) e apagar as tags `blog-*:v53…v56`, mantendo v57 como rollback e v58
   em uso (~25 GB); buildar um serviço por vez enquanto a RAM estiver assim; e,
   o que resolve de fato, copiar os manifestos antes do `pnpm install` no
   `Dockerfile` do `web` e trocar `RUN chown -R` por
   `COPY --from=build --chown=node:node`, que embute o dono na própria cópia e
   elimina a camada duplicada. **Nunca** `docker system prune --volumes`
   (CLAUDE.md §13).

</details>

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

**Corrigido em `b54892c`** (PRD-04), junto com dois irmãos que apareceram no
mesmo arquivo: o `og:site_name` também usava `BRAND.name`, e o
`mainEntityOfPage` do JSON-LD apontava para `https://sbcagora.com.br` **fixo** —
domínio que não é de nenhum blog da rede — em todos os 8. Agora usa o origin do
próprio blog. O `<link rel="canonical">` do `<head>` nunca teve esse defeito
(sempre usou o origin), então o dano ficou contido ao structured data.

## Regras válidas para a Fase 3

- Um PRD por sessão; não expandir escopo.
- Medir ANTES e DEPOIS nas 3 rotas; registrar ambos no commit.
- Build do Vite só roda na VPS (CLAUDE.md §14) — nenhum PRD pode ser dado por
  concluído com base em leitura de config.
- Rollout por onda, com canário no `resenhavip` antes de propagar aos 8 blogs
  (CLAUDE.md §6).
- Falhou critério de aceite → reverter, registrar aqui e parar.
