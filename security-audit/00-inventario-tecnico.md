# 00 — Inventário técnico (Fase 0 — Bootstrap & Reconhecimento)

**Data:** 2026-07-21. **Método:** reconhecimento READ-ONLY do repositório por 3 varreduras paralelas (backend/API; frontend+multi-tenancy+IA; infra+segredos+dados). Nenhum arquivo do projeto foi modificado. Toda afirmação referencia evidência real `caminho:linha`.

**Classificação (guardrail 1.5):** salvo indicação, os itens de arquitetura/stack abaixo são **Fato (evidenciado) / Confiança Alta**. Itens que dependem do runtime da VPS (não verificável a partir do repo) são marcados **Limitação**.

---

## 1. Visão geral

Monorepo **pnpm** (workspace `pnpm-workspace.yaml`: `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`). Plataforma multi-blog de notícias **em produção** numa VPS Hostinger, orquestrada por Docker Compose atrás de um único Caddy.

## 2. Componentes (deploy units)

| Componente | Pacote | Tech | Porta (interna) | Papel |
|---|---|---|---|---|
| Backend do blog | `artifacts/api-server` | Express 5 + esbuild, Node 24 | 8080 | `/api/*`, ingest HMAC, uploads, proxy de imagem, AMP, sitemaps, render social (Playwright), analytics |
| Frontend do blog | `artifacts/brasilia-agora` (`@workspace/sbc-agora`) | React 19 + Vite 7 | 3000 | Site público + painel `/admin`; SSR só da home |
| API central | `artifacts/central-hub` | Express 5 + esbuild | 8090 | collector→rewriter→distributor→localizer→deliveryWorker; publicação manual |
| Web central | `artifacts/central-web` | React 19 + Vite 7 | 3001 | SPA do painel central |
| Schema do blog | `lib/db` | Drizzle | — | 24 tabelas; `ensureSchema.ts` roda no boot |
| Schema central | `lib/central-db` | Drizzle | — | 11 tabelas |
| Pipeline IA | `lib/news-engine` | TS | — | scrape, rss, prompts, ai/*, quality, validate, dedup, signing, crypto |
| Template social | `lib/social-template` | TS/CSS | — | fonte única do CSS das artes; render por Playwright |

**Infra (compose raiz):** `api`, `web`, `central-api`, `central-web`, `ollama`, `caddy`, `pg-blogs`. Blogs replicados: um diretório+compose por blog, mesma imagem, banco próprio no `pg-blogs`.

## 3. Linguagens, frameworks e versões principais

- **Runtime:** Node 24 (`node:24-bookworm-slim` nos Dockerfiles; sem pin de digest).
- **Backend:** Express `^5.2.1` (ambos), Drizzle ORM `^0.45.2`, pino `^9`, helmet `^8.2.0`, multer `^2.2.0`, sharp `^0.34.2`, Playwright `^1.49.0`, otplib `^13.4.1`, `@google/genai` `^2.8.0`, node-cron `^3.0.3`, web-push `^3.6.7`.
- **Frontend:** React `19.1.0` (pin), Vite `^7.3.5`, TipTap `^2.11.5`, TanStack Query `^5.90`, **DOMPurify `^3.2.4`** (só no blog), Tailwind `^4.1.14`, Zod `^3.25.76` (presente mas **não** usado nos routers de backend), wouter, Radix UI, recharts.
- **Gerenciador de pacotes:** pnpm. `.npmrc` com `minimumReleaseAge: 1440` e `onlyBuiltDependencies` restrito (defesa de supply chain).

## 4. Bancos de dados

- **sp011 (blog mãe):** Supabase (ref `yfmyufqfepzwjtzblths`), via `SUPABASE_DATABASE_URL`.
- **Central:** Supabase próprio (ref `sxilzannsqfkncxjnbad`), via `CENTRAL_DATABASE_URL`.
- **Blogs replicados:** um DATABASE + ROLE por blog no `pg-blogs` (postgres:16 interno, sem porta no host); `REVOKE CONNECT FROM PUBLIC`; credencial cifrada em `db-config.enc` (não fica no `.env`). Superusuário `postgres` compartilhado via `PG_BLOGS_SUPERPASS`.
- **ORM:** Drizzle parametrizado. As ~153 ocorrências de `sql\`` são template tags parametrizados; os poucos `sql.raw()` são numéricos ou de arquivo estático (`stats.ts:27`, `setup.ts:156-173`) — **risco de SQLi: Baixo**.

## 5. Autenticação usada

- **Blog e central:** token **HMAC stateless** (`base64url(userId:role:ts:HMAC-SHA256(SESSION_SECRET, payload))`), TTL 8h, header `Authorization: Bearer`. **Sem cookies, sem sessão server-side, sem revogação** (blog `middlewares/auth.ts:61-93`; central idem). Senhas em scrypt + `timingSafeEqual`. 2FA TOTP (otplib). Central-web guarda o token em `localStorage` (`central-web/src/api.ts:6`).
- **Ingest:** HMAC-SHA256 do corpo cru + timestamp, por-blog (`lib/news-engine/src/signing.ts`).
- **Webhook:** `WEBHOOK_API_KEY` estática → **eleva a admin** (`api-server/src/middlewares/auth.ts:135-145`).
- **Setup:** setup token de 128 bits impresso uma vez no log.

## 6. Integrações de IA / LLM

- **Provider primário (produção):** Ollama self-hosted (`qwen2.5:7b-instruct`, `http://ollama:11434`, serviço do compose, ~13 GB residentes).
- **Fallback/reforço:** Gemini (`generativelanguage.googleapis.com`), OpenAI (`api.openai.com`), Perplexity (`api.perplexity.ai`) — chaves cifradas, rodízio, cota diária.
- **Pipeline:** conteúdo externo (RSS/scraping) → prompt de reescrita (`lib/news-engine/src/prompts.ts`) → quality/validate gate → distribuição. `ai_usage_events` grava só `keyHint` (últimos 4 chars), não o conteúdo.
- **Function calling / agents / tools:** não há tool-calling de LLM com efeitos no sistema (o LLM só reescreve/classifica texto). Superfície de "excessive agency" limitada, mas **prompt injection indireta** é real (o output vira conteúdo publicado).

## 7. Auditoria de dependências (read-only)

- **`pnpm audit` NÃO foi executado** (exigiria rede/registry; vetado pelo modo read-only). **Limitação.** Pendência para ambiente controlado (entra no PRD-10).
- Defesas estáticas presentes: `.npmrc` `minimumReleaseAge: 1440`; `pnpm-workspace.yaml` `overrides` fixando correções de CVE (`undici>=7.28.0`, `markdown-it>=14.2.0`, `qs>=6.15.2`, `uuid>=11.1.1` GHSA-w5hq-g745-h8pq, etc.); `onlyBuiltDependencies` allowlist.
- **Sem** CI/CD (`.github/`, `.gitlab-ci.yml` ausentes), **sem** Dependabot/Renovate, **sem** scanners.

## 8. Arquivos de manifesto/infra identificados

`pnpm-workspace.yaml`, `.npmrc`, `package.json` (raiz + por artifact), `docker-compose.yml`, `docker-compose.override.yml` (versionado, publica `web:3000`), `deploy/blog-template/compose.yml`, `Dockerfile` (×4), `Caddyfile` + `caddy/sites/*.caddy`, `.env.example`, `.env.central.example`, `deploy/blog-template/.env.example`, `.replit` (**contém segredo real — ver 02/03**), `docs/ANALYTICS.md`, `deploy/**/GO_LIVE*.md`, `deploy/**/*.sql`.

`.gitignore` cobre `.env`/`.env.*` (exceto `.env.example`); `.dockerignore` idem. Confirmado por `git ls-files`: apenas os `*.example` versionados.

## 9. Tamanho vs. orçamento de contexto

O projeto **não** cabe em cobertura 100% linha-a-linha numa sessão. Adotada **amostragem por risco** (Fase 4.6) com cobertura profunda de auth, ingest, IA/prompts, SSRF, uploads, crypto, isolamento e infra (~70-80% da superfície de risco). Não é necessário dividir em sub-missões por serviço — o monorepo foi coberto por 3 varreduras paralelas. O que ficou fora está declarado em `04-plano-auditorias.md` §Cobertura.

## 10. Limitações do reconhecimento (não verificável a partir do repo)

- Estado de runtime da VPS: firewall/UFW, portas efetivamente abertas, se `docker-compose.override.yml` está ativo em prod, se algum backup já existe.
- Conteúdo real dos `.env`/`.env.central` (força dos segredos; se `SETTINGS_ENCRYPTION_KEY` está definido).
- Se a `VAPID_PRIVATE_KEY` versionada ainda está em uso (assumida comprometida).
- CVEs reais no lockfile (sem `pnpm audit`).
- Histórico completo do git não varrido por segredos antigos (além do `.replit` atual).
