# ROADMAP — Auditoria de Performance (rede sp011)

> Fase 2 do `docs/PRD_PERFORMANCE_PLANEJAMENTO (1).md`.
> Base: `00-inventario.md` + `01-diagnostico.md`. Data: 2026-07-27.

---

## 1. Sequência por dependência

```
PRD-01 (payload /api/articles)  ──┬──> PRD-05 (SSR artigo/categoria)   [dependência DURA]
                                  │
PRD-06 (llms.txt/robots.txt)  ────┤    (independente, pode ir junto do 01)
                                  │
PRD-02 (JS crítico) ──────────────┴──> PRD-04 (CSS)   [mesmo vite.config.ts]
                                  │
PRD-03 (imagens de identidade) ───┘    (independente; medir depois do 02)
```

| PRD | Depende de | Motivo |
|---|---|---|
| 01 — payload da lista de artigos | — | ponto de partida |
| 02 — JS do caminho crítico | 01 (só para atribuição de ganho) | mede melhor sem os 2,4 MB no meio |
| 03 — imagens de identidade | 01, 02 (só medição) | LCP fica estável depois deles |
| 04 — CSS render-blocking | **02** (conflito no `vite.config.ts`) | evitar edição concorrente |
| 05 — SSR de artigo/categoria | **01** (dura) | sem o corte, o SSR serializaria 2,4 MB |
| 06 — llms.txt / robots.txt | — | totalmente independente |

---

## 2. Ondas

### Onda 1 — Quick Wins (PRD-01, PRD-02, PRD-06)

Esforço somado M+P+P. Todas as mudanças são reversíveis com `git revert` e não
tocam em layout.

**Meta da onda:**
- payload *decoded* em `/politica`: **6.508 KB → ≤ 1.400 KB**
- payload *decoded* em `/artigo/:slug`: **4.196 KB → ≤ 1.100 KB**
- payload *decoded* na home: **1.939 KB → ≤ 1.450 KB**
- maior long task em `/politica`: **900 ms → ≤ 300 ms**
- LCP em `/politica`: **5.660 ms → ≤ 3.600 ms**
- FCP na home: **2.564 ms → ≤ 2.200 ms**
- Agentic Browsing: **2/3 → 3/3**

Sozinha, esta onda deve responder por **~70% do ganho total** de payload.

### Onda 2 — Bytes e bloqueio de render (PRD-03, PRD-04)

Esforço M + M/G. Risco visual real (imagens e CSS) — screenshots antes/depois
são gate obrigatório.

**Meta da onda:**
- imagens na home: **310 KB → ≤ 130 KB**
- CSS público: **197.582 B → ≤ 95.000 B** (gzip 30.677 → ≤ 17.000)
- preloads `as=image` no `<head>`: **3 → 1**
- LCP na home: **2.572 ms → ≤ 2.000 ms**
- FCP na home: **≤ 2.100 ms**

### Onda 3 — Renderização inicial (PRD-05)

Esforço G, janela própria, canário de 24 h no `resenhavip`.

**Meta da onda:**
- FCP em `/artigo/:slug`: **4.208 ms → ≤ 2.100 ms**
- LCP em `/artigo/:slug`: **5.464 ms → ≤ 2.900 ms**
- FCP em `/politica`: **→ ≤ 2.200 ms** · LCP: **→ ≤ 3.000 ms**

---

## 3. Matriz de cobertura — insight do Lighthouse → PRD dono

| Insight (§0.1 do prompt mestre) | Economia declarada | PRD dono | Onda |
|---|---:|---|:--:|
| Render-blocking requests | 2.650 ms | **04** (CSS) + **02** (JS) | 2 / 1 |
| Image delivery | 2.360 KiB | **03** | 2 |
| Document request latency | 135 KiB | **01** (`__SSR_DATA__`) + **05** | 1 / 3 |
| Unused CSS | 246 KiB | **04** | 2 |
| Unused JavaScript | 117 KiB | **02** | 1 |
| Minify JavaScript | 66 KiB | **01** (é o `__SSR_DATA__` inline de 70.923 B) | 1 |
| Main-thread work | 7,4 s | **01** + **02** | 1 |
| JS execution time | 3,1 s | **02** + **01** | 1 |
| Network payload total | 5.029 KiB | **01** + **03** | 1 / 2 |
| Long tasks (20) | — | **01** + **02** | 1 |
| Speed Index | 14,1 s | **05** + **01** | 3 / 1 |
| FCP 6,4 s | — | **05** (rotas sem SSR) + **04** + **02** | 3 / 2 / 1 |
| LCP 17,0 s | — | **01** + **05** + **03** | 1 / 3 / 2 |
| TBT 500 ms | — | **01** + **02** | 1 |
| CLS 0 ✅ | manter | invariante de **todos** | — |
| llms.txt (Agentic Browsing 2/3) | — | **06** | 1 |

**Nenhum insight ficou sem dono.**

---

## 4. Definition of Done geral

- [ ] Lighthouse mobile **Performance ≥ 75**; desktop **≥ 90**
- [ ] Accessibility ≥ 93 · Best Practices = 100 · SEO = 100 · **CLS = 0**
- [ ] Agentic Browsing 3/3
- [ ] Medido nas **3 rotas** (`/`, `/artigo/:slug`, `/<categoria>`) e em
      **2 blogs** (sp011 + um replicado)
- [ ] Nenhum blog da rede quebrado após o rollout de imagem (§6 do CLAUDE.md):
      `curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'` devolve
      o nome próprio em cada domínio
- [ ] `RELATORIO-FINAL.md` escrito com a tabela antes/depois por PRD

---

## 5. Deploy e rollout (CLAUDE.md §5 e §6)

Cada PRD toca serviços diferentes — rebuild direcionado:

| PRD | Arquivos | Serviços a rebuildar |
|---|---|---|
| 01 | `api-server`, `brasilia-agora`, `vite.config.ts` | `api` **e** `web` |
| 02 | `brasilia-agora` | `web` |
| 03 | `api-server` (`site.ts`, `store.ts`), `brasilia-agora` | `api` **e** `web` |
| 04 | `brasilia-agora` | `web` |
| 05 | `brasilia-agora` (`vite.config.ts`) | `web` |
| 06 | `brasilia-agora` (`vite.config.ts`, `public/`) | `web` |

```bash
cd /opt/sp011
git pull
docker compose build <serviços afetados>
docker compose up -d <serviços afetados>
```

Para propagar aos blogs replicados, é preciso **bump de imagem** (§6):
build no sp011 → canário no `resenhavip` → demais blogs. Recomendação: agrupar o
rollout **por onda**, não por PRD — 3 bumps de imagem no total, em vez de 6.

---

## 6. Como medir (o mesmo script antes e depois)

O Playwright já está instalado na máquina de desenvolvimento
(`node_modules/.pnpm/playwright@1.61.1`) e os navegadores estão em
`%LOCALAPPDATA%\ms-playwright`. Script de medição (reconstruível, ~40 linhas):

1. `chromium.launch({ headless: true })`
2. contexto mobile: `viewport 412×823`, `deviceScaleFactor 1.75`, `isMobile`
3. CDP: `Network.emulateNetworkConditions` (latency 150 ms, download 1,6 Mbps) +
   `Emulation.setCPUThrottlingRate({ rate: 4 })`
4. `addInitScript` com `PerformanceObserver({type:"largest-contentful-paint", buffered:true})`
   guardando em `window.__LCP__`
5. `page.goto(url, { waitUntil: "load" })` + `waitForTimeout(6000)`
6. coletar: `first-contentful-paint`, `__LCP__`, `navigation.responseStart`,
   soma de `transferSize` e `decodedBodySize` de `performance.getEntriesByType("resource")`,
   agrupamento por `initiatorType`, top-25 por `transferSize`, e long tasks via
   `PerformanceObserver({type:"longtask", buffered:true})`

Rodar **sempre** nas 3 rotas, 2× cada (descartar a primeira, que aquece o cache
SSR do servidor), e salvar o JSON em `performance-audit/medicoes/<prd>-<antes|depois>.json`.

Complemento por `curl` (não precisa de navegador): §1.6 do `01-diagnostico.md`.

---

## 7. Riscos e mitigações

| Risco | PRD | Mitigação |
|---|---|---|
| Corte da lista some com artigo de editoria de baixo volume na home | 01 | o pool por categoria do SSR (`vite.config.ts:432-458`) continua; critério de aceite específico |
| `/arquivo` deixa de alcançar o acervo antigo | 01 | botão "Carregar mais" com `offset` é item de escopo |
| "Mais lidas" passa a ranquear só entre os recentes | 01 | `sort=views` no backend preserva o ranking global onde ele importava |
| `experimentalMinChunkSize: 0` gera chunks demais | 02 | contar os chunks do `modulepreload` no critério de aceite; alternativa documentada no PRD |
| Corte de CSS quebra uma tela | 04 | 14 screenshots × 2 blogs como gate |
| Erro de hidratação (#418) no SSR novo | 05 | console limpo nas 3 rotas é critério de aceite; fallback `next()` obrigatório |
| Cache de HTML estoura os 768 MB do container `web` | 05 | LRU com teto de 200 entradas + `docker stats` no aceite |
| Troca de logo pelo admin para de propagar | 03 | teste explícito da guarda de `updateSettings` (`store.ts:875-878`) |
| `Disallow: /admin` derruba o SEO score | 06 | Lighthouse SEO = 100 no aceite |
| Regressão em um blog específico da rede | todos | canário `resenhavip` antes de propagar (§6) |

---

## 8. Achados fora do escopo de performance (para o dono decidir)

Levantados durante a auditoria; **não** viraram PRD porque não atacam nenhum
número do Lighthouse:

1. **`components/MostRead.tsx`** contém 5 notícias de exemplo hardcoded sobre
   Brasília/DF, com links mortos (`/artigo/pol-2`). Hoje inativo no sp011
   (o bloco `mais-lidas` usa `area: "sidebar"` e cai no renderer de zona), mas
   renderiza em qualquer blog que use o bloco no fluxo clássico — conteúdo falso
   publicado, e viola a invariante "nada hardcoded por blog" (CLAUDE.md §13).
2. **`src/assets/images/`** tem 43 MB em 37 PNGs (avatares de 1,3 MB, artes de
   exemplo de até 2,2 MB) que entram no contexto de build do Docker a cada
   deploy. Só 12 arquivos têm importador. Limpeza sugerida dentro do PRD-04
   (item 5), mas a decisão de apagar do repo é do dono.
3. **`public/`** tem 549 KB de imagens de anúncio de exemplo (`ad-*.png/gif/jpg`)
   e 6 logos de apoiador, servidos por todos os blogs.
4. **`src/main.tsx`** registra o service worker, mas o entry real é
   `entry-client.tsx` (`index.html:110`) — `main.tsx` não é referenciado por
   nada. Suspeita de código morto; confirmar antes de remover.
5. **`components/BottomSection.tsx`** não é importado por nenhum arquivo.
6. **`components/LazyImage.tsx`** implementa `priority`/`sizes`/`aspectRatio`
   corretamente, mas nenhum bloco da home o usa — todos escrevem `<img>` à mão.
   Não é bug hoje (os `<img>` manuais têm `width`/`height`/`srcset`), mas é uma
   divergência que faz cada bloco novo repetir a mesma decisão.
