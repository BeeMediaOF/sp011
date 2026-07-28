# PRD-PERF-01 — Cortar os 2,4 MB de JSON do caminho crítico (`/api/articles`)

## Objetivo

`GET /api/articles` devolve **todos** os artigos publicados, sem limite: 2.454.750 B
no sp011 (3.109 artigos). Toda rota que não é a home baixa e parseia esse JSON —
duas vezes em páginas de categoria. Este PRD dá paginação/filtro à rota e faz os
consumidores pedirem só o que exibem, derrubando ~95% do payload de dados e as
duas maiores long tasks da aplicação.

## Métrica(s) alvo

| Métrica | Antes (medido 2026-07-27) | Meta deste PRD | Como medir |
|---|---|---|---|
| Payload de `/api/articles` (sp011) | 2.454.750 B bruto / 832.734 B gzip | ≤ 120.000 B bruto / ≤ 40.000 B gzip | `curl -s -o /dev/null -w '%{size_download}' https://sp011.com.br/api/articles?limit=200` |
| Bytes *decoded* em `/politica` | 6.508 KB | ≤ 1.800 KB | Resource Timing (`decodedBodySize`) — §Comandos |
| Bytes *decoded* em `/artigo/:slug` | 4.196 KB | ≤ 1.500 KB | idem |
| Maior long task em `/politica` | 900 ms | ≤ 300 ms | `PerformanceObserver` type `longtask` |
| LCP em `/politica` (Slow-4G, CPU 4×) | 5.660 ms | ≤ 3.800 ms | script de medição (§Comandos) |
| `__SSR_DATA__` no HTML da home | 70.923 B | ≤ 45.000 B | `curl -s https://<blog>/ \| grep -o 'window.__SSR_DATA__=.*</script>' \| wc -c` |
| TBT (proxy: soma das long tasks em `/politica`) | 2.229 ms | ≤ 900 ms | idem |

## Contexto / evidência

`01-diagnostico.md` §1.1 **Cadeia A** e §1.5. Pontos de código:

- `artifacts/api-server/src/routes/articles.ts:59-81` — `router.get("/")` faz
  `articleService.getArticles()`, filtra `status === "published"`, mapeia 14
  campos e devolve tudo. Sem `limit`, `offset`, `category` ou `q`.
- `artifacts/brasilia-agora/index.html:11-81` — boot prefetch dispara
  `fetch("/api/articles")` no parse do `<head>` em toda rota **sem**
  `__SSR_DATA__`.
- `artifacts/brasilia-agora/src/hooks/useArticles.ts:63` — `doFetch()` busca a
  lista inteira; consumido por `TopBar`, `HeroSection`, `Home`, `Artigo`,
  `PortalZoneBlocks`.
- `artifacts/brasilia-agora/src/pages/CategoryArchivePage.tsx:31` — **segundo**
  `fetch("/api/articles")` na mesma página (servido do cache HTTP, mas com novo
  `JSON.parse` de 2,4 MB → a long task de 900 ms).
- `artifacts/brasilia-agora/src/pages/Archive.tsx:89` — mesmo padrão.
- `artifacts/brasilia-agora/vite.config.ts:411-414` — o `ssrHomePlugin` busca a
  lista inteira server-side a cada 30 s e serializa 100 artigos em
  `__SSR_DATA__`.

Medições de apoio (banco do sp011, MCP Supabase): 3.109 artigos publicados;
os 200 mais recentes, sem `socialTitle` e sem `keywords`, somam **106.959 B**
(média de 535 B por artigo). Nenhum componente público lê `socialTitle` nem
`keywords` a partir da **lista** (`keywords` vem de `useArticle(id)`,
`Artigo.tsx:205`; `socialTitle` só é usado no admin) — ambos podem sair do
payload da lista.

Nenhum consumidor externo: `grep -rn "api/articles"` em `artifacts/central-hub`,
`artifacts/central-web`, `lib/` e `deploy/` não retorna nada.

## Pré-condições

- [ ] Branch: `git checkout -b perf/prd-01-payload-articles`
- [ ] Baseline: rodar os comandos de §Comandos de verificação **antes** de
      qualquer edição e salvar a saída em `performance-audit/baseline-prd01.txt`
- [ ] Ler obrigatoriamente:
  - `artifacts/api-server/src/routes/articles.ts`
  - `artifacts/api-server/src/lib/articleService.ts`
  - `artifacts/brasilia-agora/src/hooks/useArticles.ts`
  - `artifacts/brasilia-agora/src/pages/CategoryArchivePage.tsx`
  - `artifacts/brasilia-agora/src/pages/Archive.tsx`
  - `artifacts/brasilia-agora/index.html` (script de boot)
  - `artifacts/brasilia-agora/vite.config.ts` (`ssrHomePlugin`, linhas 361-500)
  - `artifacts/brasilia-agora/src/pages/Home.tsx` (`getArticles`, `sortByViews`)

## Escopo (ações em ordem)

### 1. Backend — `artifacts/api-server/src/routes/articles.ts`

Em `router.get("/")`, aceitar query params **aditivos** (nenhum obrigatório):

| Param | Valores | Semântica |
|---|---|---|
| `limit` | inteiro 1–1000, ou `all` | quantos artigos devolver. **Default: 200** |
| `offset` | inteiro ≥ 0 | paginação. Default 0 |
| `category` | slug | igualdade EXATA, case-insensitive, sobre `category`; fallback por `tag` slugificada quando `category` vier vazia (replicar a regra de `CategoryArchivePage.tsx:33-41`) |
| `q` | texto | `includes` case-insensitive sobre `title` **ou** `category` (mesma regra de `Archive.tsx:96-98`) |
| `sort` | `recent` (default) \| `views` | ordenação antes do corte |

Regras:
1. Ordenar **sempre** antes de cortar (`recent` = `publishedAt` desc;
   `views` = `views` desc com desempate por `publishedAt` desc).
2. Remover `socialTitle` e `keywords` do objeto mapeado (linhas 66-79) — ficam
   12 campos.
3. Devolver `{ articles, total, limit, offset }`, onde `total` é a contagem
   **após** `category`/`q` e **antes** do corte. `articles` continua sendo a
   chave — nenhum consumidor quebra.
4. `limit=all` continua devolvendo tudo (válvula de escape para depuração e
   scripts); não deve ser usado por nenhum código do frontend após este PRD.
5. Manter o header atual
   `Cache-Control: public, max-age=30, s-maxage=30, stale-while-revalidate=300`.

### 2. Constante única no frontend

Criar `artifacts/brasilia-agora/src/lib/articlesQuery.ts` exportando:

```ts
/** Tamanho da lista pública padrão. Alinhado com o default do /api/articles. */
export const ARTICLES_LIST_LIMIT = 200;
/** Lista enxuta para rotas que só precisam do ticker/cabeçalho. */
export const ARTICLES_TICKER_LIMIT = 30;
export function articlesUrl(params: { limit?: number|"all"; offset?: number; category?: string; q?: string; sort?: "recent"|"views" }): string
```

`articlesUrl` monta a query em **ordem fixa de chaves** — a URL precisa ser
byte-idêntica entre o boot prefetch e o `useArticles`, senão o segundo fetch não
aproveita o cache HTTP.

### 3. Boot prefetch — `artifacts/brasilia-agora/index.html`

O script já distingue home de não-home (`var isHome = location.pathname === "/"`).
Usar isso para o tamanho da lista:

```js
b.articles = j("/api/articles?limit=" + (isHome ? 200 : 30) + "&offset=0&sort=recent");
```

Mover o cálculo de `isHome` para **antes** das três chamadas `j(...)`.
Manter os valores literais e um comentário apontando para
`src/lib/articlesQuery.ts` (o HTML não pode importar o módulo).

### 4. `useArticles` — `src/hooks/useArticles.ts`

- `doFetch()` passa a usar `articlesUrl({ limit, offset: 0, sort: "recent" })`
  com `limit = ARTICLES_LIST_LIMIT` na home e `ARTICLES_TICKER_LIMIT` fora dela
  (mesma condição de `isHome` do boot — extrair para uma função exportada em
  `articlesQuery.ts` e usar nos dois lugares que rodam em JS).
- Remover `socialTitle`/`keywords` da interface `Article`? **Não.** Mantê-los
  opcionais para não quebrar `pages/admin/ArticleEdit.tsx`, que também importa
  o tipo.

### 5. `CategoryArchivePage.tsx`

- Trocar o `fetch("/api/articles")` da linha 31 por dois fetches enxutos:
  - `articlesUrl({ category: slug, limit: 60, sort: "recent" })` para a lista;
  - `articlesUrl({ limit: 5, sort: "views" })` para a sidebar "Mais lidas"
    (que hoje ordena a lista inteira por `views` — o `sort=views` do backend
    preserva exatamente esse significado de "site inteiro").
- O filtro de categoria client-side (linhas 33-41) sai; o `category=` do
  backend passa a ser a fonte da verdade. **Manter a regra de fallback por
  `tag`** dentro do backend (item 1) para não perder artigos legados.

### 6. `Archive.tsx`

- `fetch("/api/articles")` → `articlesUrl({ limit: ARTICLES_LIST_LIMIT, sort: "recent" })`.
- O campo de busca continua filtrando client-side sobre os 200 carregados.
  Adicionar, abaixo da lista, um botão "Carregar mais" que busca a próxima
  página (`offset += ARTICLES_LIST_LIMIT`) e concatena — sem isso o arquivo
  deixa de dar acesso ao acervo antigo, que é uma regressão funcional.

### 7. SSR — `vite.config.ts`, `ssrHomePlugin`

- Linha 412: `fetchJson(\`${apiBase}/api/articles?limit=300&offset=0&sort=recent\`)`.
- O bloco de "completar o pool por categoria" (linhas 432-458) **continua**:
  com 300 artigos ele ainda protege editorias de baixo volume. Ajustar o corte
  de `sorted.slice(0, 100)` para `slice(0, 150)` — o payload por artigo caiu de
  614 B para ~535 B com a remoção de `socialTitle`.
- Verificar que o `__SSR_DATA__` resultante fica ≤ 45.000 B (critério de aceite).

### 8. Documentação

Atualizar `docs/TECHNICAL_OVERVIEW.md` §"Artigos — Público (`/api/articles`)"
com os novos parâmetros e o novo default.

## Fora de escopo

- Não mexer em `/api/articles/:id`, `/api/articles/:id/relacionados` nem
  `/api/articles/categories`.
- Não mexer no `articleService` / camada de banco (o corte é em memória; o
  `store` já mantém os artigos em cache no processo). Índices/consulta paginada
  no Postgres é assunto de outro trabalho.
- Não mexer em imagens, CSS, chunking nem SSR de outras rotas (PRDs 02–05).
- Não introduzir React Query nesses fetches.

## Comandos de verificação

```bash
# 1) Backend responde aos novos parâmetros e ficou pequeno
curl -s -o /dev/null -w 'default: %{size_download} bytes\n'  https://<blog>/api/articles
curl -s -o /dev/null -w 'limit200: %{size_download} bytes\n' 'https://<blog>/api/articles?limit=200&offset=0&sort=recent'
curl -s -o /dev/null -w 'limit30:  %{size_download} bytes\n' 'https://<blog>/api/articles?limit=30&offset=0&sort=recent'
curl -s 'https://<blog>/api/articles?limit=1' | head -c 400   # confere shape: articles/total/limit/offset
curl -s 'https://<blog>/api/articles?category=politica&limit=5' | grep -o '"category":"[^"]*"' | sort -u
curl -s 'https://<blog>/api/articles?limit=5&sort=views'      | grep -o '"views":[0-9]*'

# 2) Campos removidos
curl -s 'https://<blog>/api/articles?limit=5' | grep -c 'socialTitle\|keywords'   # deve ser 0

# 3) __SSR_DATA__ encolheu
curl -s https://<blog>/ | grep -o 'window.__SSR_DATA__=.*</script>' | wc -c       # <= 45000

# 4) Build e tipos (Windows: por pacote — CLAUDE.md §14)
cd artifacts/api-server     && pnpm run typecheck && pnpm run build && pnpm test
cd ../brasilia-agora        && pnpm run typecheck && pnpm test
# build do vite só na VPS (Docker) — CLAUDE.md §14

# 5) Métricas de campo (rodar ANTES e DEPOIS, mesmo perfil)
#    Chromium headless, mobile 412x823 DPR 1.75, 1.6 Mbps / 150 ms / CPU 4x.
#    Coletar: FCP, LCP, sum(transferSize), sum(decodedBodySize), long tasks.
#    Rotas obrigatórias: / , /artigo/<slug-do-1o-artigo> , /politica
```

**Verificação de não-regressão (obrigatória, mesmas 3 rotas):**
- CLS continua 0
- Accessibility ≥ 93 · SEO = 100 · Best Practices = 100
- Home renderiza os 22 blocos com conteúdo (nenhum bloco vira placeholder)
- Blocos de editoria de baixo volume (ex.: `nfl`, `e-sports`) continuam com
  artigos — é o cenário que o pool por categoria do SSR protege
- `/arquivo` continua permitindo chegar a artigos antigos (botão "Carregar mais")
- `/politica` lista os mesmos artigos de antes (comparar os 10 primeiros títulos)

## Critérios de aceite

- [ ] `GET /api/articles` sem parâmetros devolve ≤ 120.000 B no sp011
- [ ] `GET /api/articles?limit=200` devolve exatamente 200 itens e `total` = 3.109 (ou o total atual do blog)
- [ ] `GET /api/articles?category=politica` só devolve artigos dessa categoria
- [ ] `GET /api/articles?sort=views&limit=5` devolve os 5 de maior `views` do acervo inteiro
- [ ] Nenhuma resposta da lista contém `socialTitle` ou `keywords`
- [ ] `__SSR_DATA__` ≤ 45.000 B
- [ ] `decodedBodySize` total em `/politica` ≤ 1.800 KB e em `/artigo/:slug` ≤ 1.500 KB
- [ ] Maior long task em `/politica` ≤ 300 ms
- [ ] LCP em `/politica` ≤ 3.800 ms no perfil de medição
- [ ] `pnpm test` verde em `api-server` e `brasilia-agora`
- [ ] Nenhuma regressão da lista de não-regressão acima

## Invariantes preservadas

- CLS = 0 — o corte não muda o layout; a home continua recebendo pool suficiente
- Accessibility ≥ 93, SEO = 100, Best Practices = 100
- **Multi-blog:** `api` e `web` saem da MESMA imagem e sobem juntos
  (CLAUDE.md §6), então não existe janela de web novo com api velho. Ainda
  assim, o novo default do backend é compatível com o frontend antigo (só
  devolve menos itens) e os novos parâmetros são aditivos.
- CLAUDE.md §17: `/api/site` intocado; nenhuma mudança em assets ou allowlist de
  imagem; HTML segue `no-cache`
- Igualdade EXATA de slug de categoria (regra registrada em `Home.tsx:824-826` e
  `CategoryArchivePage.tsx:33-41`) — o filtro do backend precisa replicá-la,
  incluindo o fallback por `tag`

## Dependências de outros PRDs

Nenhuma. **É o PRD que deve subir primeiro** — os demais medem melhor depois
que este ruído sai do caminho.

## Estimativa de esforço

**M** (backend pequeno; 4 consumidores no frontend + SSR + um botão novo no
`/arquivo`).

## Plano de rollback

```bash
git revert HEAD
# rebuild direcionado (CLAUDE.md §5):
#   cd /opt/sp011 && git pull && docker compose build api web && docker compose up -d api web
# blogs replicados: só voltam ao normal no próximo rollout de imagem (§6),
# ou fixando BLOG_IMAGE_TAG na tag anterior no .env de cada /opt/blogs/<id>.
```

Rollback parcial mais barato, se só o corte incomodar: setar o default de
`limit` de volta para `all` em `routes/articles.ts` (uma linha) e rebuildar
só `api`.

## Notas de execução para o agente

- Trabalhe apenas neste PRD; não expanda escopo.
- Rode os comandos de verificação **literalmente**; não presuma sucesso.
- Meça ANTES e DEPOIS nas 3 rotas e registre os dois conjuntos na mensagem de
  commit.
- Se qualquer critério de aceite falhar: registre em `STATUS.md`, reverta e pare.
- Ao concluir: atualize `performance-audit/STATUS.md` com os números medidos.
