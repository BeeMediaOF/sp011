# Compatibilidade Frontend ↔ Backend

## Checklist

### Endpoints API implementados no backend
- [x] `GET /api/site` — Site settings (nome, tagline, logo)
- [x] `GET /api/articles` — Lista de artigos publicados
- [x] `GET /api/articles/:id` — Artigo individual
- [x] `GET /api/ads` — Publicidades
- [x] `POST /api/ads/:id/click` — Track ad click
- [x] `GET /api/health` — Health check

### Proxy Vite (dev)
- [x] Configurado em `vite.config.ts`:
  ```ts
  proxy: {
    "/api": {
      target: process.env.API_URL ?? "http://localhost:5000",
      changeOrigin: true,
    },
  }
  ```

### Hooks criados no frontend
- [x] `useSite.ts` — Consome `GET /api/site`
- [x] `useArticles.ts` — Consome `GET /api/articles` e `GET /api/articles/:id`

### Componentes integrados com API
- [x] `Header.tsx` — Usa `useSite` para `alt` do logo
- [x] `Home.tsx` — Usa `useArticles` para artigos reais (fallback mock)
- [x] `Artigo.tsx` — Usa `useArticle(slug)` para artigo individual
- [x] `AdCentral.tsx` / `useAds.ts` — Já usavam `/api/ads`
- [x] `Archive.tsx` — Já usava `/api/articles`
- [x] `Contato.tsx` — Já usava `/api/messages`

### Caminhos relativos
- [x] Todas as chamadas são feitas com `/api/...` (caminho relativo)
- [x] Nenhum URL hardcoded no código

### Build
- [x] `build.outDir = dist/public` (Nginx-ready)
- [x] SPA fallback para `index.html`

## Variáveis de ambiente (dev)
- `API_URL` — URL do backend para proxy (ex: `http://localhost:5000`)
- `PORT` — Porta do Vite dev server
- `BASE_PATH` — Path base do app

## Teste rápido
```bash
# Testar endpoints
curl http://localhost:80/api/site
curl http://localhost:80/api/articles
curl http://localhost:80/api/articles/hero-1
```
