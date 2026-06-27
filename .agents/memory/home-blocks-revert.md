---
name: Blocos da home "voltando" / demora pra atualizar
description: Por que edições de settings (blocos da home, menu, tema) parecem reverter ou demorar, e como evitar
---

# Settings do site "voltam sozinhos" / demoram pra atualizar

Os settings públicos (blocos da home, menu, tema) são servidos por `GET /api/site`, que
manda `Cache-Control` (cache HTTP do navegador). O hook `useSite.ts` mantém também um
cache em memória de 60s e refaz `fetch("/api/site")` quando recebe `settings:refresh`
(postMessage do editor) ou `invalidateSiteCache()`.

**Armadilha:** se esse refetch pós-edição NÃO usar `{cache:"no-store"}`, o navegador
serve a resposta antiga do cache HTTP → o bloco recém-removido reaparece ("tira o Mundo
e volta") e o site público demora o tempo do `max-age`/`stale-while-revalidate` pra
refletir. O sintoma aparece forte na VPS (Nginx respeita o cache integralmente) e quase
não aparece no dev do Replit.

**Regra:** qualquer refetch de `/api/site` disparado por uma edição admin tem que
ignorar o cache HTTP (`cache:"no-store"`). O `invalidateSiteCache()` do cliente sozinho
NÃO basta — ele só limpa o cache em memória, não o do navegador.

**Why:** store do backend é single-instance/memória + persist fire-and-forget; o problema
não era multi-instância PM2 (o guia já usa `instances:1`) nem o banco — era cache HTTP.

**Também:** no `HomeBlocksManager`, handlers que disparam `debounceSave(...)` devem passar
o valor NOVO calculado (ex.: usar `blocksRef.current`/`next`), nunca o `blocks` do closure,
senão salvam estado antigo (bug clássico em `block:reorder`).
