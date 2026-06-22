---
name: Sprint 2 features
description: Web Push, Tiptap editor, ArtigosRelacionados, LazyImage, Google News Sitemap, canonical+hreflang
---

## Features implementadas

### 1. Web Push Notifications
- `lib/db/src/schema/push_subscriptions.ts` — tabela com endpoint, p256dh, auth
- `artifacts/api-server/src/routes/push.ts` — GET /api/push/vapid-public-key, POST /subscribe, DELETE /unsubscribe, export `sendPushToAll()`
- `artifacts/api-server/src/routes/webhook.ts` — chama `sendPushToAll()` ao publicar artigo (3 pontos de trigger)
- `artifacts/brasilia-agora/public/sw.js` — service worker para receber push
- `artifacts/brasilia-agora/src/components/PushSubscribeButton.tsx` — botão bell no Header

**Why:** `urlBase64ToUint8Array` tinha incompatibilidade de tipo `Uint8Array<ArrayBufferLike>` vs `ArrayBuffer` — solução: usar `new ArrayBuffer(len)` + view Uint8Array separado.

**VAPID keys:** Geradas e salvas como secrets VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.

### 2. Tiptap Editor (substitui textarea)
- `artifacts/brasilia-agora/src/components/admin/RichTextEditor.tsx` — editor WYSIWYG com toolbar completo
- `artifacts/brasilia-agora/src/pages/admin/ArticleEdit.tsx` — textarea substituída por `<RichTextEditor>`
- `@tiptap/*` adicionados ao `artifacts/brasilia-agora/package.json`

**Note:** Conteúdo legacy (não HTML) será exibido como texto plano no editor — é esperado.

### 3. Artigos Relacionados
- `artifacts/brasilia-agora/src/components/ArtigosRelacionados.tsx` — grid 2/4 col com score por categoria + keywords
- `GET /api/articles/:id/relacionados` — retorna 4 artigos scored por afinidade (mesma categoria +10, keywords compartilhadas +2)
- Inserido em `Artigo.tsx` antes da seção de tags

### 4. LazyImage (Core Web Vitals)
- `artifacts/brasilia-agora/src/components/LazyImage.tsx` — IntersectionObserver + fade-in, rootMargin 200px

### 5. Google News Sitemap
- `artifacts/api-server/src/routes/sitemap-news.ts` — GET /api/sitemap-news.xml, janela 48h, Cache-Control 900s

### 6. Canonical + hreflang
- `Artigo.tsx` useEffect injeta `<link rel="canonical">` e `<link rel="alternate" hreflang="pt-BR/x-default">`
- Campo "URL Canônica" na aba SEO do ArticleEdit (salvo como `canonicalUrl` no DB)
- Schema: `canonicalUrl text` adicionado à tabela `articles`

## Importante
- `store.getArticles()` em api-server retorna array vazio — usar `articleService.getArticles()` para dados reais
- `pnpm add` falha com código -1; usar edição manual de package.json + `pnpm install`
- Erros pré-existentes a não corrigir: rssProcessor content:encoded, quotes.ts, ColumnistsManager specialty, PerplexitySearch autoMode
