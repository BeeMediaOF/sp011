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

## Preview NÃO deve recarregar a cada edição

O iframe de preview (`/?adminPreview=1`) é atualizado AO VIVO via postMessage
`blocks:update`/`block:preview`/`style:preview`. NÃO mandar `settings:refresh` ao iframe
em edições rotineiras: ele força `useSite` a refazer fetch → `settings` muda → `Home.tsx`
`useEffect([settings])` reseta `previewBlocks` do servidor = re-render total (parece
"recarregar a página"). Idem `setPreviewKey(k+1)` em saves frequentes (remonta o iframe).

**Regra:** toda mutação de blocos deve empurrar `blocks:update` ao vivo. Centralizado num
`useEffect(() => postAllBlocks(blocks), [blocks])` para cobrir excluir/duplicar/mover/
adicionar/reordenar/restaurar de uma vez (antes vários handlers só chamavam `debounceSave`
sem `postAllBlocks` e dependiam do `settings:refresh` removido). Reload/remontagem só é
aceitável em ações deliberadas e raras que mudam LAYOUT de header/footer (presets,
`saveHeaderFooter`) — `style:preview` só cobre cor de fundo, não o layout.

## Sync entre Replit e VPS (mesmo banco Supabase)

Settings (blobs `site_settings`, `menu_items`, etc.) vivem em memória POR PROCESSO
(`_cache` em `store.ts`), hidratados do DB SÓ no boot (`initStore`) e nunca re-lidos.
Replit e VPS compartilham o mesmo Supabase, mas cada processo serve da própria cópia em
memória → editar num lado NÃO aparece no outro até reiniciar.

**Fix:** `startSettingsSync()` em `store.ts` = `setInterval(15s)` que re-lê os blobs de
config editáveis do DB para o `_cache`, PULANDO chaves escritas localmente nos últimos 15s
(via `_lastWriteAt` setado em `persistSetting`) pra não sobrescrever um persist em voo.
Contadores de view ficam de fora (são incrementados em memória). Consistência eventual
(~15s). **Why:** sem isso, "mudei no Replit e na VPS não mudou".
