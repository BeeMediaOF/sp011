---
name: Hospedagem fora do Replit (VPS Hostinger)
description: Decisões e pontos Replit-específicos para rodar o portal SBC Agora numa VPS comum
---

# Hospedagem na VPS (Hostinger) — pontos não óbvios

## Uploads → Supabase Storage
- `uploads.ts` usa a **REST API do Supabase Storage** (sem SDK) com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-side) e bucket `SUPABASE_STORAGE_BUCKET` (default `uploads`).
- URL pública servida pela própria API: `/api/uploads/:filename` (contrato estável; o frontend não muda).
- Em **produção** (`NODE_ENV=production`) o Storage é **obrigatório**: sem as envs, uploads retornam **503** (não cai mais pro disco local). Em dev, cai pro disco local.
- Download é feito por **streaming** (`Readable.fromWeb`), não bufferiza o arquivo inteiro (importante para vídeos até 100MB).
- **Why:** o Object Storage do Replit (sidecar GCS em `127.0.0.1:1106`) não existe na VPS; fallback silencioso pra disco em prod espalharia/perderia arquivos.

## URL pública para redes sociais
- `getPublicBase()` em `queueProcessor.ts` prioriza `APP_URL`/`PUBLIC_URL`; só usa `REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN` como fallback legado.

## OG / prévia de links
- O prerender de OG para crawlers (`socialOgPlugin` em `vite.config.ts`) só roda no servidor Vite (`configureServer`/`configurePreviewServer`), **não** em arquivos estáticos puros.
- Por isso, na VPS o frontend deve rodar com **`vite preview`** (script `serve`), não servido como estático puro pelo Nginx. Precisa de `PORT`, `BASE_PATH=/` e `API_URL` (default `http://localhost:8080`).

## Build da API
- `pnpm --filter @workspace/api-server run build` usa **esbuild** (`build.mjs`), que **não** roda `tsc`.
- Existem erros pré-existentes de `tsc` em `rssProcessor.ts` (`content:encoded` index, TS7053) que **não bloqueiam o build** nem o deploy.

## IA na VPS
- Usar `GEMINI_API_KEY` direto (modo `gemini_direct`). As envs `AI_INTEGRATIONS_GEMINI_*` são exclusivas do proxy do Replit e não funcionam fora dele.

## Roteamento
- Frontend chama a API por **URLs relativas** (`/api/...`). Na VPS, o Nginx roteia `/api` → porta 8080 (API) e `/` → frontend.
