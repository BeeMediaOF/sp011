# 02 — Mapa de riscos (Fase 2 — Mapeamento)

Classificação CVSS/OWASP/CWE por item fica em `04-plano-auditorias.md`. Aqui: tecnologias, componentes, riscos preliminares e lacunas de visibilidade.

---

## 1. Tabela de tecnologias

| Componente | Tecnologia | Versão | Criticidade |
|---|---|---|---|
| api-server (blog) | Express + esbuild | Express `^5.2.1` | **Crítica** (ingest, uploads, proxy, admin) |
| brasilia-agora (site+admin) | React + Vite | React `19.1.0` / Vite `^7.3.5` | Alta |
| central-hub | Express + esbuild | Express `^5.2.1` | **Crítica** (orquestra todos os blogs, segredos) |
| central-web | React + Vite | React `19.1.0` | Alta (XSS → takeover, F4) |
| lib/news-engine | TS (scrape/rss/ai/quality/signing) | — | **Crítica** (prompt injection, HMAC) |
| lib/db / lib/central-db | Drizzle ORM | `^0.45.2` | Alta |
| Sanitização | DOMPurify (só blog) | `^3.2.4` | Alta (ausente no central) |
| Render social | Playwright/Chromium | `^1.49.0` | Alta (`--no-sandbox`) |
| IA primária | Ollama (`qwen2.5:7b`) | — | Média |
| IA fallback | Gemini/OpenAI/Perplexity | — | Média (custo/LGPD) |
| Banco replicados | Postgres (pg-blogs) | 16 | **Crítica** (sem backup) |
| Banco sp011/central | Supabase | — | Alta |
| Proxy/borda | Caddy | — | Alta (bons headers; override fura) |
| Orquestração | Docker Compose | — | Alta (root, sem hardening) |
| Cripto de segredos | AES-256-GCM (scrypt) | — | **Crítica** |
| Auth | HMAC stateless (SESSION_SECRET) | — | **Crítica** |

## 2. Mapa de componentes e dependências

```
Caddy ──► web(blog), central-web, api(blog), central-api
api(blog) ──► Supabase(sp011) | pg-blogs(replicado via db-config.enc) | /data/uploads | Playwright | @workspace/news-engine(signing,crypto)
central-api ──► Supabase(central) | ollama | Gemini/OpenAI/Perplexity | api(blog) [HMAC ingest] | /data/news-images
central-api ──► @workspace/news-engine (scrape,rss,prompts,ai,quality,validate,signing,crypto)
news-engine ──► fontes externas (RSS/scraping) [NÃO-CONFIÁVEL]
web(blog) ──► /api/site, /api/image (proxy → CDNs externas)
Todos os blogs replicados ──► pg-blogs [isolamento por DB/role]; superuser postgres compartilhado
Cripto de segredos deriva de SESSION_SECRET/SETTINGS_ENCRYPTION_KEY [ponto único de falha]
```

**Pontos únicos de falha (crown jewels):** (a) `SESSION_SECRET`/chave de envelope — cifra tudo; (b) `pg-blogs` — todos os blogs replicados, sem backup; (c) `central-hub` — orquestra e guarda segredos de todos os blogs; (d) `CENTRAL_INGEST_SECRET` por blog — controla o que se publica.

## 3. Registro de riscos preliminares (F1–F19)

Severidade preliminar (Crít/Alto/Médio). Todos são **Fato (evidenciado)** salvo indicação. Ativos: (1) isolamento, (2) segredos, (3) integridade, (4) PII.

| F# | Risco | Evidência | Sev. | Ativos | Tipo/Conf. |
|---|---|---|---|---|---|
| F1 | VAPID_PRIVATE_KEY real versionada, reusada em todos os blogs | `.replit:38` | **Crít** | 2 | Fato/Alta |
| F2 | Injeção indireta de prompt (texto externo cru no prompt) | `lib/news-engine/src/prompts.ts:121-131` | **Alto** | 3 | Fato/Alta |
| F3 | Gate de qualidade default `"log"` não bloqueia HTML perigoso | `central-hub/src/services/rewriter.ts:301`; `lib/store.ts:140` | **Alto** | 3 | Fato/Alta |
| F4 | XSS armazenado no central-web + token em localStorage | `central-web/src/pages/News.tsx:220`; `api.ts:6` | **Alto** | 2,3 | Fato/Alta |
| F5 | SSRF autenticado (`article-from-url`, sem allowlist) | `api-server/src/routes/admin.ts:1215-1343` | **Alto** | 1,2 | Fato/Alta |
| F6 | SSRF público no proxy de imagem (segue redirect, IP privado) | `api-server/src/routes/image.ts:147-151` | **Alto** | 1,2 | Fato/Alta |
| F7 | Webhook API key concede admin global | `api-server/src/middlewares/auth.ts:135-145`; `permissions.ts:7` | **Alto** | 3 | Fato/Alta |
| F8 | Central-hub sem RBAC | `central-hub/src/routes/*` (só authMiddleware) | **Alto** | 1,2,3 | Fato/Alta |
| F9 | Containers root + Chromium `--no-sandbox` | Dockerfiles; `renderTemplate.ts:36-37` | **Alto** | 1 | Fato/Alta |
| F10 | Override publica web:3000 no host; runbook usa `up -d` sem `-f` | `docker-compose.override.yml:11-14`; CLAUDE.md §5/§6 | **Alto** | 3,4 | Hipótese/Média (depende do runtime) |
| F11 | Backups do pg-blogs inexistentes | CLAUDE.md §19.6; ausência de script no repo | **Alto** | 1 | Fato/Alta |
| F12 | Sanitizadores por regex contornáveis + drift dos espelhos | `brasilia-agora/src/lib/sanitize.ts:57-63`; `ingestSanitize.ts:10-16`; `amp.ts:34-50` | Médio | 3 | Fato/Alta |
| F13 | Portão de economia nunca fecha sem `maxPostsPerDay` | `central-hub/src/lib/dailyQuota.ts:92` | Médio | (custo) | Fato/Alta |
| F14 | Sem revogação de token; logout no-op; fail-open (role/rate limit) | `auth.ts:184-188,267-270`; `admin.ts:285-293` | Médio | 2,3 | Fato/Alta |
| F15 | Anti-replay ingest só por janela 300s + TOCTOU idempotência | `signing.ts:53-55`; `ingest.ts:128-194` | Médio | 3 | Fato/Alta |
| F16 | Segredos em texto puro se sem chave de cripto; twoFactorSecret em claro | `crypto.ts:29-35`; `lib/db/.../users.ts:26` | Médio | 2,4 | Fato/Alta |
| F17 | Sem CI/CD e sem scanners | ausência de `.github/`, Dependabot, etc. | Médio | (todos) | Fato/Alta |
| F18 | LGPD: transferência internacional s/ base legal; contact_messages sem TTL | `ai/*.ts`; `contact_messages.ts:9-10`; `docs/ANALYTICS.md` | Médio | 4 | Fato/Alta |
| F19 | Sem handler de erro global (vaza err.message); ensureSchema engole falhas; rate limit ausente | `ensureSchema.ts:73-78`; vários catch | Médio | 3 | Fato/Alta |

## 4. Cadeias (attack paths) — resumo

F2→F3→F4→F8 = **AP-1** (takeover do admin central, cadeia-mãe). F1/F16 = AP-7. F5/F6 = AP-2. F13/F11/F19 = AP-8. Detalhe em `03-threat-model.md`.

## 5. Lacunas de visibilidade (o que não pôde ser verificado)

- **Runtime da VPS** (firewall, portas abertas, override ativo, backup existente) — não verificável do repo. **Bloqueia** confirmar F10 e o estado real de F11.
- **Conteúdo dos `.env`** (força dos segredos; se `SETTINGS_ENCRYPTION_KEY` definido) — não lido. **Bloqueia** confirmar exposição de F16.
- **`pnpm audit`/CVEs** — não executado. **Bloqueia** dimensionar F17 (dependências vulneráveis reais).
- **Interior de `articleService.ts`, schemas Drizzle, `scrapeWithDiffbot`, services `collector/distributor/videoPublisher`, fluxo OAuth Meta/Buffer** — mapeados por nome, não linha-a-linha.
- **Histórico git** não varrido por segredos antigos além do `.replit` atual.
- **Robustez concreta dos bypasses de regex** — avaliada por padrão, não testada com payloads (proibido testar exploit ativo).
