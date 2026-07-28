# PRD-PERF-02 — Tirar 403 KB de Recharts/d3 do caminho crítico de toda página pública

## Objetivo

O chunk `vendor-charts` (Recharts + d3, **403.228 B**) é `modulepreload` no HTML
de todas as rotas públicas porque o chunk de entrada importa **um único símbolo**
dele — o `clsx` usado dentro de `cn()`. Nenhuma página pública desenha gráfico.
Este PRD corrige o particionamento de chunks e o último import pesado *eager* do
`App.tsx`, cortando ~460 KB de JS baixado, parseado e executado em toda visita.

## Métrica(s) alvo

| Métrica | Antes (medido 2026-07-27) | Meta deste PRD | Como medir |
|---|---|---|---|
| JS *decoded* na home | 1.086 KB (8 req) | ≤ 640 KB | Resource Timing por `initiatorType: script` |
| JS *transfer* na home | 320 KB | ≤ 200 KB | idem |
| `vendor-charts` no `<head>` público | presente | **ausente** | `curl -s https://<blog>/ \| grep -c vendor-charts` = 0 |
| `vendor-radix` no `<head>` público | presente | ausente (ou ≤ 10 KB) | `curl -s https://<blog>/ \| grep -o 'modulepreload[^>]*'` |
| Soma das long tasks na home | 1.081 ms (467+270+219+…) | ≤ 700 ms | `PerformanceObserver` type `longtask` |
| FCP na home (Slow-4G, CPU 4×) | 2.564 ms | ≤ 2.200 ms | script de medição |

## Contexto / evidência

`01-diagnostico.md` §1.1 **Cadeia B**.

Evidência direta, do artefato servido em produção
(`https://sp011.com.br/assets/index-CdUrz0ja.js`):

```js
import{f as Pi,r as f,...}from"./vendor-react-gREd9mYW.js"
import{Q as Ii,a as Ri}from"./vendor-query-BZ68cNsE.js"
import{P as Di,C as Ar,a as Oi}from"./vendor-radix-Bc9VOEZP.js"
import{c as Mi}from"./vendor-charts-Dw77MGS9.js"      // ← único símbolo
...
function ft(...e){return al(Mi(e))}                    // ← cn() = twMerge(clsx(...))
```

E o fim do `vendor-charts-Dw77MGS9.js` exporta `AreaChart`, `RadialBar`,
`formatAxisMap` — é Recharts mesmo. `recharts` só aparece em
`pages/admin/Analytics.tsx:8`, `pages/admin/Dashboard.tsx:11` (ambos `lazy()`)
e `components/ui/chart.tsx` (arquivo que **nenhum** outro arquivo importa).

Regra que cria o problema: `vite.config.ts:608-630` — `manualChunks` só nomeia
os pacotes pesados; utilitários minúsculos e compartilhados (`clsx`,
`tailwind-merge`, `class-variance-authority`) ficam sem nome e são absorvidos
pelo agrupamento padrão do Rollup/Vite (que funde chunks abaixo de
`experimentalMinChunkSize`, 500 B por padrão).

Segundo item da mesma cadeia: `App.tsx:3` importa `TooltipProvider` de
`@/components/ui/tooltip` de forma **eager**, e o `<TooltipProvider>` envolve a
árvore inteira (`App.tsx:355`). Isso puxa `@radix-ui/react-tooltip` (dentro de
`vendor-radix`, 55.314 B) para o preload de toda rota pública, onde nenhum
tooltip é aberto.

## Pré-condições

- [ ] PRD-PERF-01 concluído e validado (para que o ganho seja atribuível)
- [ ] Branch: `git checkout -b perf/prd-02-js-critico`
- [ ] Baseline: salvar a lista de `modulepreload` + tamanhos em
      `performance-audit/baseline-prd02.txt`:
      ```bash
      curl -s https://<blog>/ | grep -o '<link rel="modulepreload"[^>]*>'
      curl -s https://<blog>/ | grep -o '<script type="module"[^>]*>'
      ```
- [ ] Ler obrigatoriamente:
  - `artifacts/brasilia-agora/vite.config.ts` (linhas 584-633)
  - `artifacts/brasilia-agora/src/App.tsx`
  - `artifacts/brasilia-agora/src/lib/utils.ts` (o `cn()`)
  - `artifacts/brasilia-agora/src/components/ui/tooltip.tsx`

## Escopo (ações em ordem)

### 1. Nomear explicitamente os utilitários compartilhados

Em `vite.config.ts`, dentro de `manualChunks(id)`, **antes** de qualquer outra
regra:

```ts
// Utilitários minúsculos usados por TODA a UI (cn = twMerge(clsx)). Sem chunk
// próprio, o Rollup os funde num vizinho arbitrário — e já fundiu no
// vendor-charts, arrastando 403 KB de Recharts para o entry público.
if (id.includes("node_modules/clsx") ||
    id.includes("node_modules/tailwind-merge") ||
    id.includes("node_modules/class-variance-authority")) {
  return "vendor-utils";
}
```

Atenção ao layout do pnpm: os caminhos reais são
`node_modules/.pnpm/clsx@X/node_modules/clsx/...` — `includes("node_modules/clsx")`
casa o segundo segmento. Confirmar no build.

### 2. Impedir a re-fusão de chunks pequenos

Em `build.rollupOptions.output`, junto do `manualChunks`:

```ts
// Vite funde chunks abaixo de 500 B em vizinhos arbitrários. Foi assim que o
// clsx caiu dentro do vendor-charts. 0 desativa a heurística; os chunks aqui
// já são poucos e nomeados.
experimentalMinChunkSize: 0,
```

Se após o build o `vendor-utils` continuar sendo absorvido, a alternativa é
manter `experimentalMinChunkSize` e reexportar `clsx`/`twMerge` de
`src/lib/utils.ts` (o módulo local já é grande o bastante para não ser fundido).
**Escolher a alternativa só se a primeira falhar na verificação.**

### 3. Tirar `TooltipProvider` do caminho eager

Em `App.tsx`:
- remover `import { TooltipProvider } from "@/components/ui/tooltip"` do topo;
- criar `const TooltipProvider = lazy(() => import("@/components/ui/tooltip").then((m) => ({ default: m.TooltipProvider })))`;
- envolver o uso em `<Suspense fallback={children-sem-provider}>`. **Não** dá
  para renderizar `null` no fallback — a árvore inteira sumiria e o SSR/hidratação
  quebraria. Padrão a usar: manter o `TooltipProvider` **só** onde há tooltip.

  Verificar antes com `grep -rn "Tooltip" src/ --include=*.tsx | grep -v "components/ui/tooltip"`:
  se todos os usos estiverem em `src/pages/admin/**` ou `src/components/admin/**`,
  mover o `<TooltipProvider>` para dentro do `AdminShell`
  (`src/components/admin/AdminLayout.tsx`, já `lazy`) e removê-lo do `App.tsx`.
  **Esta é a solução preferida** — é uma mudança de posição, não de mecanismo,
  e não mexe em Suspense/SSR.

  Se houver uso público de tooltip, **não fazer o item 3** e registrar isso no
  `STATUS.md`; o ganho do item 1 já é a maior parte do PRD.

### 4. Conferir que nada mais pesado ficou eager

Após o build (na VPS), listar os imports estáticos do chunk de entrada:

```bash
grep -o 'from"\./[a-zA-Z0-9_-]*\.js"' artifacts/brasilia-agora/dist/public/assets/index-*.js | sort -u
```

Esperado: `vendor-react`, `vendor-query`, `vendor-utils`, `vendor-icons`
(e nada de `vendor-charts`, `vendor-editor`, `vendor-motion`; `vendor-radix` só
se o item 3 não tiver sido aplicado).

### 5. Verificar a hipótese de "Minify JavaScript"

Confirmar que todos os chunks saem minificados (não deve haver nada a fazer):

```bash
head -c 200 artifacts/brasilia-agora/dist/public/assets/index-*.js
```

Se vier código formatado, investigar `build.minify`. Se vier minificado
(esperado), registrar no `STATUS.md` que o insight *Minify JavaScript 66 KiB* é
o `__SSR_DATA__` inline e pertence ao **PRD-PERF-01** — nada a fazer aqui.

## Fora de escopo

- Não trocar Recharts por outra biblioteca; não mexer nas telas admin.
- Não mexer no `lazy()` das páginas (já está correto).
- Não mexer em `vendor-editor` (Tiptap) nem `vendor-motion` — já não aparecem no
  HTML público.
- Não mexer em CSS (PRD-04) nem em imagens (PRD-03).
- Não remover `components/ui/chart.tsx` neste PRD (entra no PRD-04, junto com os
  demais `ui/*` não usados).

## Comandos de verificação

```bash
# Build real (só roda na VPS/Docker — CLAUDE.md §14)
cd /opt/sp011 && docker compose build web

# Depois do deploy, no HTML servido:
curl -s https://<blog>/ | grep -o '<link rel="modulepreload"[^>]*>'
curl -s https://<blog>/ | grep -c 'vendor-charts'          # => 0
curl -s https://<blog>/ | grep -c 'vendor-editor'          # => 0

# Tamanho dos chunks efetivamente carregados (repetir para cada href acima)
curl -s -o /dev/null -w '%{size_download}\n' https://<blog>/assets/<chunk>.js

# Admin continua funcionando (chunks sob demanda)
curl -s -o /dev/null -w '%{http_code}\n' https://<blog>/admin/login

# Tipos e testes
cd artifacts/brasilia-agora && pnpm run typecheck && pnpm test
```

**Verificação de não-regressão:**
- CLS = 0 · Accessibility ≥ 93 · SEO = 100 · Best Practices = 100
- Home, artigo e categoria renderizam idênticos (comparar screenshot antes/depois)
- `/admin` carrega, Dashboard e Analytics **desenham os gráficos** (é o consumidor
  real do `vendor-charts` — se ele sumiu do público mas quebrou no admin, o PRD falhou)
- `/admin/artigos/novo` abre o editor Tiptap
- Tooltips do admin continuam aparecendo (se o item 3 foi aplicado)

## Critérios de aceite

- [ ] `curl -s https://<blog>/ | grep -c vendor-charts` = **0**
- [ ] Existe um chunk `vendor-utils-*.js` de ≤ 5 KB no `modulepreload`
- [ ] JS *decoded* na home ≤ 640 KB e *transfer* ≤ 200 KB
- [ ] Soma das long tasks na home ≤ 700 ms
- [ ] FCP na home ≤ 2.200 ms no perfil de medição
- [ ] Dashboard e Analytics do admin desenham os gráficos normalmente
- [ ] `pnpm run typecheck` e `pnpm test` verdes em `brasilia-agora`

## Invariantes preservadas

- CLS = 0 (mudança puramente de empacotamento)
- Accessibility ≥ 93, SEO = 100, Best Practices = 100
- **Multi-blog:** a imagem `blog-web` é única; o ganho vale para os 8 blogs de
  uma vez. Rollout padrão do CLAUDE.md §6 com canário no `resenhavip`.
- CLAUDE.md §17: nenhuma mudança em SSR, sanitização, `/api/site` ou allowlist
  de imagem. O `entry-server` usa o mesmo `App.tsx` — se o item 3 mudar a árvore,
  **conferir que não aparece erro de hidratação (React #418) no console**.

## Dependências de outros PRDs

Depende do **PRD-PERF-01** apenas para atribuição de ganho (não há dependência
técnica). Pode subir junto se preferir uma única janela de deploy, mas então
meça as duas rotas antes de ambos e aceite não separar os efeitos.

## Estimativa de esforço

**P** (2 blocos em `vite.config.ts` + 1 movimentação de provider). O custo real
está na verificação, que exige build na VPS.

## Plano de rollback

```bash
git revert HEAD
cd /opt/sp011 && git pull && docker compose build web && docker compose up -d web
```

## Notas de execução para o agente

- Trabalhe apenas neste PRD; não expanda escopo.
- O build do Vite **não roda no Windows** (CLAUDE.md §14): a verificação dos
  chunks só é possível após `docker compose build web` na VPS. Não conclua o PRD
  com base em leitura de config.
- Se o item 3 (TooltipProvider) revelar uso público de tooltip, **pule o item 3**
  e registre — não force.
- Meça ANTES e DEPOIS e registre os dois conjuntos na mensagem de commit.
- Ao concluir: atualize `performance-audit/STATUS.md`.
