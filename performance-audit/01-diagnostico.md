# 01 — Diagnóstico: cadeia causal e priorização (Fase 1)

> Base: `00-inventario.md`. Toda afirmação vem com evidência + classificação
> (**Fato** / **Hipótese** / **Limitação**) + confiança.

---

## 1.0 Ressalva sobre o baseline de referência

O `PRD_PERFORMANCE_PLANEJAMENTO` parte de Lighthouse mobile **43 / FCP 6,4 s /
LCP 17,0 s / TBT 500 ms / Speed Index 14,1 s / payload 5.029 KiB**.

Minha medição sintética (Chromium headless, Slow-4G + CPU 4×, origem São Paulo)
não reproduziu esses números:

| Rota | FCP medido | LCP medido | Transfer | **Decoded** |
|---|---:|---:|---:|---:|
| `/` (SSR) | 2,56 s | 2,57 s | 1.006 KB | 1.939 KB |
| `/artigo/:slug` | 4,21 s | 5,46 s | 1.622 KB | 4.196 KB |
| `/politica` | 4,21 s | 5,66 s | 1.490 KB | **6.508 KB** |

**Limitação (confiança alta):** o relatório de referência não diz qual rota nem
qual blog foi medido, e o PageSpeed roda de fora do Brasil com emulação de CPU
mais dura. Duas coisas, porém, são consistentes:

1. Os **5.029 KiB** de payload batem com o *decoded* de uma rota **não-home**
   (4,2 MB no artigo, 6,5 MB na categoria) — e **não** com a home (1,9 MB).
2. FCP e LCP da home medidos (2,5 s) são metade dos da rota de categoria (4,2 /
   5,7 s). O SSR da home já funciona; **o problema mora fora dela**.

**Conclusão operacional:** o relatório de referência quase certamente foi tirado
de uma página de artigo ou categoria (ou de um blog com o cache SSR frio). Isso
não muda a lista de gargalos — muda a ordem: o que ataca as rotas sem SSR vem
primeiro. Os números da tabela acima são o **baseline oficial desta auditoria**,
porque são reprodutíveis por comando (§1.5).

---

## 1.1 Cadeias causais

### Cadeia A — Rotas sem SSR: HTML vazio + 2,4 MB de JSON no caminho crítico

```
GET /politica  → spaHeadPlugin devolve index.html com <div id="root"></div>   [0 ms]
  ├─ script inline do <head> dispara fetch /api/articles                       [~50 ms]
  │    → 833 KB transfer / 2.454.750 B decoded  (3.109 artigos, TODOS)
  │    → ~4,2 s de download a 1,6 Mbps, competindo com o JS
  ├─ <link stylesheet> 197 KB (render-blocking)                                [bloqueia FCP]
  ├─ 6 chunks JS = 1.081 KB decoded (315 KB transfer), inclui 403 KB de
  │    vendor-charts que nenhuma página pública usa
  └─ React monta → JSON.parse(2,4 MB) → long task de 900 ms
       → CategoryArchivePage.tsx:31 faz um SEGUNDO fetch /api/articles
         (cache HTTP: transfer 0, mas +2,4 MB de parse → long task de 420 ms)
       → só agora o <img> do LCP entra no DOM → +1 RTT + download
= FCP 4,21 s · LCP 5,66 s · decoded 6,5 MB · 9 long tasks (900+420+238+233+…)
```

**Fato (confiança alta).** `routes/articles.ts:59-81` não tem `limit`/`offset`/
filtro; medições em 4 domínios confirmam que o payload cresce linearmente com o
acervo (sp011 2,4 MB / 3.109 artigos · ksports 985 KB · resenhavip 365 KB).
`CategoryArchivePage.tsx:31` e `Archive.tsx:89` fazem `fetch("/api/articles")`
próprio, fora do cache de `useArticles` — daí o *decoded* de 4,9 MB em `fetch`
com apenas 837 KB de *transfer*.

**Consequência multi-blog:** é uma bomba-relógio. Todo blog da rede caminha para
o mesmo lugar; o sp011 só chegou primeiro porque tem mais acervo.

---

### Cadeia B — 403 KB de Recharts/d3 no bundle de TODA página pública

```
manualChunks() manda recharts + d3-* para "vendor-charts"
  → clsx (~400 B), compartilhado entre recharts e o app, não recebe nome de
    chunk e é absorvido pelo vendor-charts pelo agrupamento padrão do Rollup
  → o entry index-*.js passa a ter  import{c as Mi}from"./vendor-charts-*.js"
  → Vite emite <link rel=modulepreload href="vendor-charts"> no index.html
= 403.228 B decoded / 107.899 B transfer baixados, parseados e executados
  em toda visita pública, para usar 1 função (`clsx`) dentro de `cn()`
```

**Fato (confiança alta).** Evidência direta no artefato de produção: o
`index-CdUrz0ja.js` baixado de `sp011.com.br` contém literalmente
`import{c as Mi}from"./vendor-charts-Dw77MGS9.js"`, e `Mi` é usado em
`function ft(...e){return al(Mi(e))}` — a assinatura de `cn()` =
`twMerge(clsx(...))`. O `vendor-charts` exporta `AreaChart`, `RadialBar`,
`formatAxisMap` (Recharts). `recharts` só é importado em
`pages/admin/{Analytics,Dashboard}.tsx` (ambos `lazy()`) e em
`components/ui/chart.tsx` (arquivo nunca importado).

**Hipótese (confiança média) sobre o mecanismo exato:** o Vite define
`output.experimentalMinChunkSize` (500 B por padrão), que funde chunks
minúsculos em vizinhos; `clsx` cai abaixo do limiar e é fundido no
`vendor-charts`. A correção não depende de confirmar o mecanismo — basta dar
nome de chunk explícito aos utilitários compartilhados e verificar o HTML gerado.

Custo secundário na mesma cadeia: `vendor-radix` (55 KB) entra no
`modulepreload` porque `App.tsx:3` importa `TooltipProvider` de forma **eager**,
e nenhuma página pública abre tooltip.

---

### Cadeia C — 234 KB de PNG de identidade + preloads que roubam a banda do LCP

```
React 19.1 renderToString hoisteia <link rel=preload as=image> para todo <img>
não-lazy do SSR
  → 3 preloads no <head> da home:
      logo         818×288 PNG  81.530 B   (exibido com height:48px)
      hero (LCP)   webp         41.714 B   ← o único que importa
      footer-logo  818×288 PNG  69.534 B   (rodapé, fora da dobra)
  → a 1,6 Mbps, 151 KB de logos à frente/lado do LCP ≈ 0,75 s de atraso
  → byline-logo 1080×1080 PNG 82.957 B é buscado 12× (1 download, cache) mas
    entra na mesma disputa
= 234 KB de PNG servidos crus por /api/site-asset (sem resize, sem WebP)
```

**Fato (confiança alta).** `routes/site.ts:10-18` faz `Buffer.from(base64)` e
`res.end()` — não passa pelo `lib/imageTransform.ts` que já existe e é usado por
`/api/image` e `/api/uploads`. Dimensões e bytes medidos em produção. Os 3
preloads não existem no `index.html` nem em componente algum
(`grep -rn preload src/`) — só podem vir do React 19.

**Nota:** o `/api/image` já faz o trabalho certo (WebP, 22–82 KB por variante,
cache imutável, placeholder em falha). O buraco é **exclusivamente** o
`/api/site-asset`.

---

### Cadeia D — CSS único público+admin, render-blocking

```
src/index.css → @import "tailwindcss" (Tailwind 4, autodetecção de fontes)
  → varre TODO o projeto: 30 páginas admin + 55 arquivos components/ui/*
    (dos quais só 13 são importados em qualquer lugar)
  → entry-client.tsx importa index.css → o CSS é dependência do entry
  → 1 único <link rel=stylesheet> de 197.582 B (30.677 B gzip), render-blocking
    em TODA rota pública
```

**Fato (confiança alta):** 197.582 B medidos; 55 arquivos em `components/ui/`
contra 13 referências `@/components/ui/*` no código.
**Hipótese (confiança média):** a maior parte do desperdício vem das classes das
telas admin + dos 42 wrappers `ui/*` não usados. Confirmar por comando (§1.5)
antes de escolher a técnica de corte.

---

### Cadeia E — Documento da home carrega os dados duas vezes

O HTML SSR da home tem 185.197 B, dos quais **70.923 B são o
`<script>window.__SSR_DATA__=…</script>`** — os mesmos artigos que já estão
renderizados como HTML logo abaixo, repetidos como JSON para a hidratação.

**Hipótese (confiança alta):** é isso que o Lighthouse reporta como
*"Minify JavaScript — 66 KiB"*. 66 KiB = 67.584 B, contra 70.923 B medidos: um
JSON inline gigante é exatamente o que o audit de minificação de JS enxerga
como "script não minificado". Nenhum chunk do build está sem minificar (todos
saem do esbuild, verificável por inspeção).

O corte de `/api/articles` (Cadeia A) reduz este bloco na mesma proporção,
porque o `ssrHomePlugin` monta o `__SSR_DATA__` a partir dele.

---

### Cadeia F — llms.txt e robots.txt são estáticos da imagem compartilhada

`public/llms.txt` e `public/robots.txt` são buildados dentro da imagem
`blog-web` e servidos **idênticos em todos os blogs**. Em produção, o sp011
serve um `llms.txt` que se apresenta como *"SBC Agora … São Bernardo do Campo e
região do Grande ABC"* e um `robots.txt` cujo `Sitemap:` aponta para
`https://brasilia-agora.replit.app/api/sitemap.xml` (host morto), enquanto a
rota real existe em cada blog (`routes/sitemap.ts:33`).

**Fato (confiança alta):** conteúdo baixado de produção. Explica o
*Agentic Browsing 2/3*. Sem impacto em Core Web Vitals; é o único item aqui que
não é perf.

---

## 1.2 O que **não** é gargalo (verificado, para não gastar esforço)

| Suspeita comum | Veredito | Evidência |
|---|---|---|
| Compressão ausente | **OK** | Caddy `encode gzip zstd` nos 3 blocos; gzip confirmado em HTML/JS/CSS/JSON |
| Cache de assets | **OK** | `/assets/*`, `/fonts/*`, `/api/image`, `/api/site-asset` com `max-age=31536000, immutable` + ETag |
| HTTP/1.1 | **OK** | h2 negociado em 20/20 recursos (medido) |
| Fontes bloqueando render | **OK** | auto-hospedadas, `font-display: swap`, `unicode-range` por subset, preload dos 2 subsets latin |
| Google Fonts / CDN externo | **inexistente** | nenhuma requisição a terceiros no carregamento |
| Anúncios em base64 | **já corrigido** | `routes/ads.ts:153-159` devolve `imageUrl`; payload de 51 MB é histórico |
| Imagens de artigo sem resize | **OK** | `/api/image` com sharp/WebP, srcset em 44 dos 68 `<img>` da home |
| CLS | **0** | nenhum `layout-shift` nas 3 rotas; `width`/`height`/`aspect-ratio` presentes |
| Scripts de terceiros (GTM/GA4/Pixel) | **OK** | injetados em `requestIdleCallback` e só com consentimento |
| TTFB do servidor | **OK** | 66–87 ms (cache SSR de 30 s + `stale-while-revalidate`) |
| `content-visibility` na home | **já aplicado** | `.cv-auto` a partir do 4º bloco |

Isso importa: **quatro dos "domínios prováveis" sugeridos pelo prompt mestre já
estão resolvidos neste projeto.** Não vou gerar PRD para eles.

---

## 1.3 Priorização (impacto × esforço)

| # | Gargalo | Métricas atacadas | Impacto estimado | Esforço | Classe |
|---|---|---|---|---|---|
| A | `/api/articles` sem limite (2,4 MB, lido 2× fora da home) | LCP, TBT, Speed Index, payload | −2,4 MB decoded/rota · −1,3 s de long task · LCP −1,5 a −2,0 s em artigo/categoria | **P** | **Quick Win** |
| B | `vendor-charts` (403 KB) no caminho crítico via `clsx` | FCP, TBT, JS execution, unused JS | −403 KB decoded / −108 KB transfer em toda rota · TBT −150 a −250 ms | **P** | **Quick Win** |
| C | PNGs de identidade crus + preloads concorrentes | LCP, image delivery, payload | −210 KB · LCP −0,5 a −0,8 s na home | **P/M** | **Quick Win** |
| D | CSS único público+admin (197 KB, render-blocking) | FCP, render-blocking, unused CSS | −100 a −120 KB decoded · FCP −0,2 a −0,4 s | **M** | Médio |
| E | HTML vazio em `/artigo/*` e categorias | FCP, LCP, Speed Index | FCP 4,2 → ≤2,0 s · LCP 5,5 → ≤2,8 s | **G** | Alto |
| F | `llms.txt`/`robots.txt` estáticos com marca errada | Agentic Browsing (2/3 → 3/3) | fora de CWV | **P** | Quick Win |

Ordem de execução decidida: **A → B → C → F → D → E** (detalhe e justificativa
no `ROADMAP.md`).

---

## 1.4 Decisão de PRDs (6, justificada)

Agrupei por cadeia causal completa, não por componente. Seis PRDs — dentro da
faixa 4–6 pedida:

| PRD | Cadeia | Por que é um PRD próprio |
|---|---|---|
| **PRD-PERF-01** — Payload de dados da API | A + E | Mexe em `routes/articles.ts` + 4 consumidores no frontend + o `ssrHomePlugin`. É a única mudança que também encolhe o `__SSR_DATA__`. Sozinha derruba >60% do payload das rotas sem SSR. |
| **PRD-PERF-02** — JS do caminho crítico | B | Mudança isolada em `vite.config.ts` + 1 import de `App.tsx`, verificável por inspeção do HTML buildado. Misturar com o PRD-01 impediria atribuir o ganho. |
| **PRD-PERF-03** — Bytes de imagem de identidade | C | Toca `routes/site.ts` (backend) + `Header`/`Footer` (loading dos logos). Cadeia inteira: gerar variante → consumir com `srcset` → parar o preload indevido. |
| **PRD-PERF-04** — CSS render-blocking | D | Depende de medir o que é usado; risco de regressão visual em admin **e** público. Precisa de PRD com critério de aceite visual próprio. |
| **PRD-PERF-05** — SSR de artigo e categoria | E | Esforço G, risco de hidratação/#418, precisa de canário. Só faz sentido depois que A–D tiverem baixado o custo do que o SSR vai servir. |
| **PRD-PERF-06** — `llms.txt`/`robots.txt` por blog | F | Quick win independente, alvo diferente (Agentic Browsing/SEO), sem interação com os demais. |

Itens pequenos **absorvidos dentro dos PRDs** (não viraram PRD próprio, conforme
§8 do prompt mestre): `TooltipProvider` eager (→ 02), `components/ui/*` não
usados (→ 04), avatares PNG de 1,3 MB importados sem uso em `CategoryPage`
(→ 04), `Sitemap:` errado do `robots.txt` (→ 06), corte de campos do
`__SSR_DATA__` (→ 01).

---

## 1.5 Matriz: insight do Lighthouse → PRD dono

| Insight (referência) | Economia declarada | PRD dono | Evidência local correspondente |
|---|---:|---|---|
| Render-blocking requests | 2.650 ms | **04** (CSS) + **02** (JS) | 1 `<link stylesheet>` de 197 KB + 5 `modulepreload` somando 745 KB decoded |
| Image delivery | 2.360 KiB | **03** | 234 KB de PNG de identidade sem resize; 3 preloads `as=image` |
| Document request latency | 135 KiB | **01** + **05** | documento de 185.197 B, dos quais 70.923 B são `__SSR_DATA__` |
| Unused CSS | 246 KiB | **04** | 197.582 B com classes de 30 telas admin + 42 `ui/*` não usados |
| Unused JavaScript | 117 KiB | **02** | 403 KB de Recharts/d3 no `modulepreload` público |
| Minify JavaScript | 66 KiB | **01** | `__SSR_DATA__` inline de 70.923 B (≈ 66 KiB) |
| Main-thread work | 7,4 s | **01** + **02** | long tasks de 900/467/420/270/238 ms |
| JS execution time | 3,1 s | **02** + **01** | 1.086 KB decoded de script + parse de 2,4 MB de JSON ×2 |
| Network payload total | 5.029 KiB | **01** + **03** | decoded 6.508 KB em `/politica`, 4.196 KB em `/artigo` |
| Long tasks (20) | — | **01** + **02** | 9 long tasks medidas em `/politica` |
| llms.txt (Agentic Browsing) | 2/3 | **06** | `llms.txt` com a marca de outro portal |

---

## 1.6 Comandos que reproduzem este diagnóstico

```bash
# Payload da lista de artigos, por blog (roda de qualquer máquina)
for d in sp011.com.br ksports.midia.run resenhavip.midia.run esporteagora.midia.run; do
  echo -n "$d bruto="; curl -s -o /dev/null -w '%{size_download}' "https://$d/api/articles"
  echo -n " gzip=";    curl -s -o /dev/null -H 'Accept-Encoding: gzip' -w '%{size_download}\n' "https://$d/api/articles"
done

# vendor-charts no caminho crítico da home
curl -s https://sp011.com.br/ | grep -o '<link rel="modulepreload"[^>]*>'
curl -s https://sp011.com.br/assets/index-CdUrz0ja.js | grep -o 'from"\./vendor-charts[^"]*"'

# PNGs de identidade servidos crus
for k in logo footer-logo byline-logo favicon; do
  echo -n "$k: "; curl -s -o /dev/null -w '%{size_download} bytes %{content_type}\n' \
    "https://sp011.com.br/api/site-asset/$k?v=1"
done

# Peso do CSS e do documento
curl -s -o /dev/null -w 'css bruto=%{size_download}\n'  https://sp011.com.br/assets/index-ChdAtXJa.css
curl -s https://sp011.com.br/ | wc -c
curl -s https://sp011.com.br/ | grep -o 'window.__SSR_DATA__=.*</script>' | wc -c
```

Para as métricas de campo sintéticas, o script Playwright usado está descrito no
`ROADMAP.md` §6 (não foi commitado; é reconstruível em 20 linhas).
