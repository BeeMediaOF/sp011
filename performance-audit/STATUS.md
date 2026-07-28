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
| 01 — payload da lista de artigos | 1 | M | — | **implementado — validar em prod** |
| 02 — JS do caminho crítico | 1 | P | 01 (medição) | pendente |
| 06 — llms.txt / robots.txt por blog | 1 | P | — | pendente |
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

## Próxima ação

1. Deploy na VPS (`docker compose build api web && up -d api web`).
2. Rodar os comandos de verificação do PRD-PERF-01 e o script de medição nas
   3 rotas; comparar com `baseline-prd01.txt` e registrar aqui.
3. Só então: rollout de imagem para os blogs replicados (canário `resenhavip`) e
   início do **PRD-PERF-02**.

## Regras válidas para a Fase 3

- Um PRD por sessão; não expandir escopo.
- Medir ANTES e DEPOIS nas 3 rotas; registrar ambos no commit.
- Build do Vite só roda na VPS (CLAUDE.md §14) — nenhum PRD pode ser dado por
  concluído com base em leitura de config.
- Rollout por onda, com canário no `resenhavip` antes de propagar aos 8 blogs
  (CLAUDE.md §6).
- Falhou critério de aceite → reverter, registrar aqui e parar.
