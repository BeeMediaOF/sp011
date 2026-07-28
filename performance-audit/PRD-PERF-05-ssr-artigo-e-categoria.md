# PRD-PERF-05 — Artigo e categoria hoje são `<div id="root"></div>`: estender o SSR

## Objetivo

O SSR existe e funciona, mas **só para `/`**. Toda outra rota recebe o
`index.html` buildado com o `#root` vazio: o navegador precisa baixar o JS,
executar o React e buscar dados antes de pintar qualquer coisa — daí FCP de
4,2 s e LCP de 5,5 s nas páginas de artigo e de categoria, contra 2,5 s na home.
Este PRD generaliza o middleware de SSR para `/artigo/:slug` e para as rotas de
categoria.

## Métrica(s) alvo

| Métrica | Antes (medido 2026-07-27) | Meta deste PRD | Como medir |
|---|---|---|---|
| FCP em `/artigo/:slug` | 4.208 ms | ≤ 2.100 ms | script de medição |
| LCP em `/artigo/:slug` | 5.464 ms | ≤ 2.900 ms | idem |
| FCP em `/politica` | 4.208 ms | ≤ 2.200 ms | idem |
| LCP em `/politica` | 5.660 ms | ≤ 3.000 ms | idem |
| Speed Index (proxy: `load`) em `/artigo` | 3.564 ms | ≤ 2.600 ms | `navigation.loadEventEnd` |
| TTFB em `/artigo` (cache quente) | 87 ms | ≤ 200 ms | `curl -w '%{time_starttransfer}'` |
| `#root` vazio no HTML de artigo | sim | **não** | `curl -s https://<blog>/artigo/<slug> \| grep -c '<div id="root"></div>'` = 0 |

## Contexto / evidência

`01-diagnostico.md` §1.1 **Cadeia A** (parte de renderização) e §1.0.

- `artifacts/brasilia-agora/vite.config.ts:361-500` — `ssrHomePlugin`: middleware
  em `configurePreviewServer`, casa só `"/"` e `"/index.html"`
  (linha 390), busca 3 APIs, chama `render()` de
  `dist/server/entry-server.js`, injeta `__SSR_DATA__` + `appHtml`, cacheia o
  HTML por 30 s.
- `vite.config.ts:511-550` — `spaHeadPlugin`: todas as demais rotas recebem o
  `index.html` cru com o `<head>` reescrito. **É aqui que artigo e categoria
  caem hoje.**
- `src/entry-server.tsx` — `render(url, data)` já aceita `url` e o `App` já
  aceita `ssrPath` (`App.tsx:352-356`, `WouterRouter ssrPath`). **A infra para
  SSR de qualquer rota já existe**; falta o middleware e o seed dos dados.
- `src/pages/Artigo.tsx:120-122` — `useParams()` + `useArticle(slug)`;
  `useArticles.ts:118-149` guarda artigo único num `Map` de módulo **sem função
  de seed** (diferente de `seedArticles`/`seedSite`/`seedAds`).
- `src/pages/CategoryArchivePage.tsx:31` — fetch próprio (já reduzido pelo
  PRD-PERF-01).
- `src/App.tsx:132-163` — `DynamicCategory` resolve o slug buscando
  `/api/site` no cliente e só então decide entre `CategoryArchivePage` e
  `NotFound`; no servidor os `menuItems` já vêm no payload de `/api/site`.

## Pré-condições

- [ ] **PRD-PERF-01 concluído e validado** (dependência dura: sem o corte da
      lista, o SSR de categoria serializaria os mesmos 2,4 MB)
- [ ] PRD-PERF-02, 03 e 04 concluídos (para medir o ganho isolado do SSR)
- [ ] Branch: `git checkout -b perf/prd-05-ssr-artigo-categoria`
- [ ] Baseline nas 3 rotas + `curl -s https://<blog>/artigo/<slug> | wc -c`
- [ ] Ler obrigatoriamente:
  - `artifacts/brasilia-agora/vite.config.ts` (linhas 261-550: `socialOgPlugin`,
    `ssrHomePlugin`, `spaHeadPlugin`)
  - `artifacts/brasilia-agora/src/entry-server.tsx` e `entry-client.tsx`
  - `artifacts/brasilia-agora/src/hooks/useArticles.ts`
  - `artifacts/brasilia-agora/src/pages/Artigo.tsx`
  - `artifacts/brasilia-agora/src/pages/CategoryArchivePage.tsx`
  - `artifacts/brasilia-agora/src/App.tsx` (`DynamicCategory`, `Router`)
  - `docs/ANALYTICS.md` (o SSR não pode disparar pageview no servidor)

## Escopo (ações em ordem)

### 1. Seeds que faltam

Em `src/hooks/useArticles.ts`, exportar:

```ts
/** Semeia o cache de artigo único (SSR + hidratação). Ver seedArticles. */
export function seedArticle(key: string, article: Article): void
```
que grava em `_articleCache` sob a **mesma chave** que `useArticle(id)` usa
(o `slug` da URL) e, se o `article.id` for diferente do slug, sob as duas.

Em `src/components/ArtigosRelacionados.tsx`, adicionar seed equivalente para a
lista de relacionados (ou deixar o componente buscar no cliente — **decisão:
deixar buscar**, ele está abaixo da dobra e não afeta LCP).

### 2. Generalizar o middleware de SSR

Refatorar `ssrHomePlugin` para `ssrPlugin(apiBase)`, com uma tabela de rotas:

| Rota | Dados buscados | Chave de cache |
|---|---|---|
| `/` | `articles?limit=300`, `site`, `ads` | `home` |
| `/artigo/:slug` | `articles/:slug`, `articles?limit=30`, `site`, `ads` | `artigo:<slug>` |
| rotas de categoria | `articles?category=<slug>&limit=60`, `articles?limit=5&sort=views`, `site`, `ads` | `cat:<slug>` |

Rotas de categoria = as fixas do `App.tsx:322-334`
(`/politica`, `/cidade`, `/seguranca`, `/transporte`, `/saude`, `/educacao`,
`/cultura`, `/esportes`, `/colunas`, `/brasil`, `/mundo`, `/economia`,
`/tecnologia`) **mais** qualquer `path` de `menuItems` do `/api/site` (é assim
que o `DynamicCategory` decide). Resolver isso no servidor com o payload de
`/api/site` que já é buscado.

Regras do middleware:
- Só `GET`; qualquer path com extensão ou `/api/` → `next()`.
- `/admin/*` → `next()` **sempre** (nunca renderizar o painel no servidor).
- Qualquer falha (API fora, artigo 404, exceção no `renderToString`) →
  `next()`, caindo no `spaHeadPlugin` de hoje. **O fallback é obrigatório.**
- `spaHeadPlugin` continua registrado **depois**, sem mudanças.
- `socialOgPlugin` continua registrado **antes** de tudo: crawlers seguem no
  caminho atual, já validado. Não mexer nele neste PRD.

### 3. Cache de HTML com limite de memória

O cache atual é uma variável única (`htmlCache`). Com artigos e categorias vira
um dicionário — e o container `web` tem `mem_limit: 768m`
(`docker-compose.yml:75`).

- LRU com **teto de 200 entradas** e TTL de **60 s** para artigo/categoria
  (a home fica nos 30 s de hoje).
- Guardar apenas a string do HTML; nada de buffers de imagem.
- Header de resposta: `public, max-age=60, stale-while-revalidate=120`
  (mesma família do que a home já usa; **nunca** `no-store` — CLAUDE.md §17,
  bfcache).

### 4. `<head>` por artigo no HTML SSR

O `rewriteHeadMeta` atual escreve a identidade **do blog**. Para `/artigo/:slug`,
escrever também `og:title`, `og:description`, `og:image` (URL absoluta),
`og:type=article`, `article:published_time`, `article:section`, `<title>` e
`<link rel=canonical>` do artigo — reaproveitando os campos que o
`socialOgPlugin` já monta (`vite.config.ts:140-185`), sem duplicar código:
extrair uma função comum.

Para categoria: `<title>` e `description` da editoria.

### 5. `DynamicCategory` sem round-trip no cliente

`App.tsx:136-151` busca `/api/site` só para descobrir o `menuItem` do slug.
Como o SSR já semeia `useSite`, trocar o `fetch` por leitura do
`useSite()` (com fallback para o fetch atual quando `settings` ainda for null).
Isso remove um round-trip e um `null` render na hidratação.

### 6. Analytics: não contar pageview no servidor

`App.tsx:357` monta `<AnalyticsProvider/>` → `useAnalytics()`. Confirmar que
todo disparo está dentro de `useEffect` (não roda em `renderToString`) e que
nada usa `window` no topo do módulo. Se houver, guardar com
`typeof window === "undefined"`. **Critério de aceite explícito:** contagem de
pageviews do dia não sobe por causa do SSR.

## Fora de escopo

- Não fazer SSR de `/arquivo`, `/contato`, `/privacidade`, `/termos`
  (baixo tráfego, sem imagem LCP).
- Não fazer SSR de `/admin/*` — jamais.
- Não trocar `renderToString` por `renderToPipeableStream` (streaming). Fica como
  próximo passo se o TTFB incomodar.
- Não introduzir prerender estático em build time nem CDN.
- Não mexer no `socialOgPlugin`.
- Não mexer no `/api/articles` (é o PRD-01).

## Comandos de verificação

```bash
# 1) HTML de artigo e categoria vêm pintados
curl -s https://<blog>/artigo/<slug> | grep -c '<div id="root"></div>'   # => 0
curl -s https://<blog>/politica      | grep -c '<div id="root"></div>'   # => 0
curl -s https://<blog>/artigo/<slug> | grep -o '<title>[^<]*</title>'
curl -s https://<blog>/artigo/<slug> | grep -o '<link rel="canonical"[^>]*>'

# 2) Fallback funciona (rota inexistente não pode dar 500)
curl -s -o /dev/null -w '%{http_code}\n' https://<blog>/artigo/slug-que-nao-existe
curl -s -o /dev/null -w '%{http_code}\n' https://<blog>/rota-inventada

# 3) Admin continua client-only
curl -s https://<blog>/admin/login | grep -c '<div id="root"></div>'     # => 1

# 4) TTFB frio e quente
curl -s -o /dev/null -w 'frio: %{time_starttransfer}\n'  https://<blog>/artigo/<slug>
curl -s -o /dev/null -w 'quente: %{time_starttransfer}\n' https://<blog>/artigo/<slug>

# 5) Memória do container após navegar por ~50 artigos
docker stats --no-stream <blog>-web

# 6) Crawler continua recebendo o OG antigo
curl -s -A 'facebookexternalhit/1.1' https://<blog>/artigo/<slug> | head -20

# 7) Tipos e testes
cd artifacts/brasilia-agora && pnpm run typecheck && pnpm test
```

**Verificação de não-regressão:**
- **Console do navegador sem aviso de hidratação (React #418/#423)** em `/`,
  `/artigo/<slug>` e `/politica` — é o risco número 1 deste PRD
  (CLAUDE.md §17: formatadores sempre com `timeZone` explícito)
- CLS = 0 nas 3 rotas · Accessibility ≥ 93 · SEO = 100 · Best Practices = 100
- Navegação SPA (clicar num card da home → artigo → voltar) continua instantânea
  e o scroll volta ao topo (`ScrollToTop`)
- `bfcache`: voltar pelo botão do navegador restaura a página sem recarregar
- Preview de link no WhatsApp/Facebook continua correto
- Pageviews do dia no `/admin/analytics` não sobem sem tráfego real
- Testar em **2 blogs** com idiomas diferentes (sp011 pt-BR e ksports en):
  `<html lang>`, datas e textos do chrome corretos no HTML servido

## Critérios de aceite

- [ ] `#root` vem preenchido em `/artigo/:slug` e nas rotas de categoria
- [ ] FCP ≤ 2.100 ms e LCP ≤ 2.900 ms em `/artigo/:slug`
- [ ] FCP ≤ 2.200 ms e LCP ≤ 3.000 ms em `/politica`
- [ ] TTFB quente ≤ 200 ms nas duas rotas
- [ ] Slug inexistente devolve a SPA (não 500), e `/admin/login` continua vazio
- [ ] Zero aviso de hidratação no console nas 3 rotas
- [ ] Memória do container `web` estável (≤ 400 MB) após navegar 50 artigos
- [ ] Pageviews não inflacionados pelo SSR
- [ ] `pnpm run typecheck` e `pnpm test` verdes

## Invariantes preservadas

- CLS = 0, Accessibility ≥ 93, SEO = 100, Best Practices = 100
- CLAUDE.md §17: SSR **não** pode fazer `sanitizeArticleHtml` retornar `""` no
  servidor (é o bug clássico de #418); `/api/site` continua publicando assets
  como URL; HTML segue `no-cache`/`max-age` curto, **nunca** `no-store`
- CLAUDE.md §15: formatadores de data sempre com `timeZone` explícito; o
  container `web` já roda `TZ=America/Sao_Paulo` (Dockerfile:24), mas blogs com
  `siteTimezone` diferente dependem do parâmetro explícito
- **Multi-blog:** a mesma imagem serve 8 blogs com idiomas e templates
  diferentes; testar em 2 antes de propagar (canário `resenhavip`, CLAUDE.md §6)
- `mem_limit: 768m` do serviço `web` — o cache LRU precisa de teto

## Dependências de outros PRDs

**Depende do PRD-PERF-01** (dura). Recomendado após 02, 03 e 04 para medição
limpa e para não empilhar risco.

## Estimativa de esforço

**G** — é o único PRD da série que mexe na arquitetura de renderização. Reserve
uma janela própria e um canário de pelo menos 24 h.

## Plano de rollback

```bash
git revert HEAD
cd /opt/sp011 && git pull && docker compose build web && docker compose up -d web
```

Rollback parcial e imediato, sem revert: no `ssrPlugin`, fazer a tabela de rotas
casar apenas `/` (uma linha) — volta ao comportamento de hoje mantendo o
refactor.

## Notas de execução para o agente

- Trabalhe apenas neste PRD; não expanda escopo.
- **Fallback para `next()` em toda falha** é regra, não otimização: um erro no
  `renderToString` não pode virar 500 para o visitante.
- Verifique o console de hidratação manualmente nas 3 rotas antes de declarar
  concluído — `pnpm test` não pega #418.
- Canário obrigatório: subir a imagem só no `resenhavip` e observar 24 h antes de
  propagar (CLAUDE.md §6).
- Meça ANTES e DEPOIS nas 3 rotas e registre na mensagem de commit.
- Ao concluir: atualize `performance-audit/STATUS.md`.
