---
name: PageSpeed Rodada 6 — CLS e Acessibilidade
description: Correções de CLS, contraste WCAG e JS lazy-load implementadas na Rodada 6.
---

## CLS (0.568 → meta <0.1)

**TickerBar (Header.tsx):**
- Problema: RAF animation lia `rail.scrollWidth` a cada frame → reflow forçado.
- Solução: substituir completamente por CSS `@keyframes ticker-scroll { 0%{translateX(0)} 100%{translateX(-33.333%)} }` + `animation: 30s linear infinite`. Zero leitura de layout em JS. Altura travada em `style={{ height: 32 }}`.
- Remover refs: `railRef`, `posRef`, `rafRef` e segundo `useEffect`. Remover `useRef` do import.

**AdBanner.tsx:**
- Problema: skeleton usava `minHeight: 90px` mas live image usava `h-auto w-full` → 728×90 em container 1200px resulta em ~148px, não 90px → CLS.
- Solução: adicionar prop `aspectRatio?: string` (default `"728/90"`). Usar `style={{ aspectRatio }}` TANTO no skeleton QUANTO no container do banner live. Img usa `h-full object-cover` em vez de `h-auto`.
- Remover prop `placeholder` (nunca foi usado por nenhum caller).
- `skeletonHeight` mantido como `@deprecated` para backward compat (callers em Home.tsx ainda passam mas é ignorado).

## Acessibilidade (85 → meta 100)

**Contraste WCAG AA (mín. 4.5:1 para texto pequeno):**
| Elemento | Antes | Depois | Contraste antes→depois |
|---|---|---|---|
| TickerBar código moeda | gray-400 on gray-100 | gray-600 | 2.86→7.06:1 |
| NewsCard summary | gray-500 on white | gray-700 | 4.48→10.36:1 |
| NewsCard byline div | gray-400 on white | gray-600 | 2.86→7.06:1 |
| Footer light nav | gray-400/500 on #f9fafb | gray-600 | <4.5→7.03:1 |
| Footer light copyright | gray-400 on #f9fafb | gray-600 | 2.86→7.06:1 |
| Footer dark description | gray-500 on #000 | gray-400 | 4.00→5.49:1 |
| Footer dark newsletter label | gray-500 on #000 | gray-400 | 4.00→5.49:1 |
| Footer dark copyright | gray-500 on #000 | gray-400 | 4.00→5.49:1 |
| Footer minimal | gray-500 on #f3f4f6 | gray-600 | 4.47→7.06:1 |

**Regra geral de contraste para este portal:**
- Fundo escuro (#000 ou dark): mínimo gray-400 para texto pequeno.
- Fundo claro (white, #f9fafb, #f3f4f6): mínimo gray-600 para texto pequeno.
- Fundo branco para texto maior (≥18px bold ou ≥24px normal): gray-500 pode passar, mas preferir gray-600 para segurança.

**Touch targets:**
- AdBanner dots: `w-1.5 h-1.5` (6px) → `<button className="p-2">` + inner `<span className="w-2 h-2">` = 28px área de toque.
- AdBanner prev/next: `w-7 h-7` → `w-8 h-8` (28px→32px).

## JS lazy-load

**Home.tsx ColumnistsSection:**
- Movido de eager import para `const ColumnistsSection = lazy(() => import("../components/ColumnistsSection"))`.
- `const lazy` deve ficar DEPOIS de todos os `import` estáticos (TypeScript exige).
- Adicionar `Suspense fallback={null}` na renderização em `PredefinedBlock`.
- `import React, { lazy, Suspense }` — adicionar lazy e Suspense ao import do React.

## Erros TS pré-existentes (NÃO corrigir)
- `src/pages/admin/ColumnistsManager.tsx(191,28)` — specialty inexistente
- `src/pages/admin/PerplexitySearch.tsx(173,7)` e (394,48) — tipo autoMode
