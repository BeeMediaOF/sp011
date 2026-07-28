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

## Próxima ação

1. Rollout de imagem para os 8 blogs (bump + canário `resenhavip`), CLAUDE.md §6.
2. Início do **PRD-PERF-02** (JS do caminho crítico) — agora com evidência
   quantificada de que ele vale 727 KB decoded por rota.

## Regras válidas para a Fase 3

- Um PRD por sessão; não expandir escopo.
- Medir ANTES e DEPOIS nas 3 rotas; registrar ambos no commit.
- Build do Vite só roda na VPS (CLAUDE.md §14) — nenhum PRD pode ser dado por
  concluído com base em leitura de config.
- Rollout por onda, com canário no `resenhavip` antes de propagar aos 8 blogs
  (CLAUDE.md §6).
- Falhou critério de aceite → reverter, registrar aqui e parar.
