# 01 — Entendimento do sistema (Fase 1)

Baseado em evidência real da Fase 0. Foco: seguir o **dado** (entrada → validação → armazenamento → saída), não os componentes isolados. As áreas de cobertura (§3.1 do prompt mestre) estão avaliadas ao final.

---

## 1. Arquitetura (texto + fluxo)

```
                        Internet (não-autenticado)
                                  │
                        ┌─────────▼─────────┐
                        │      Caddy        │  TLS + security headers (borda)
                        │  (80/443 no host) │  ⚠ override publica web:3000 direto (F10)
                        └───┬───────┬───────┘
             ┌──────────────┘       └───────────────┐
     ┌───────▼────────┐                     ┌────────▼────────┐
     │  web (blog)    │  React/Vite         │  central-web    │  SPA :3001
     │  site + /admin │  SSR só da home     │  (painel)       │  token em localStorage (F4)
     └───────┬────────┘                     └────────┬────────┘
     ┌───────▼────────┐   HMAC ingest       ┌────────▼────────┐
     │  api (blog)    │◄────────────────────│  central-api    │  :8090
     │  :8080         │  POST /api/ingest   │  workers        │  sem RBAC (F8)
     │  Bearer/HMAC   │  (por-blog secret)  │                 │
     └───┬────────┬───┘                     └───┬─────────┬───┘
         │        │ Playwright/Chromium         │         │
         │        │ (--no-sandbox, F9)          │      ┌──▼───┐
     ┌───▼───┐ ┌──▼──────────┐            ┌──────▼──┐  │ollama│ IA primária
     │Supabase│ │/data/uploads│            │Supabase │  │:11434│ (self-host)
     │ (sp011)│ │ (volume)    │            │(central)│  └──────┘
     └───────┘ └─────────────┘            └─────────┘  Gemini/OpenAI/Perplexity (fallback, exterior)

     Blogs replicados: N × (api+web) → pg-blogs (1 DB+role por blog, interno)
```

## 2. Como um dado sensível trafega (o fio condutor)

### 2.1 Fluxo de conteúdo (o caminho do AP-1 — cadeia-mãe)
1. **Coleta:** `collector` puxa RSS/scraping de fontes externas. `lib/news-engine/src/scrape.ts:162-232` extrai `text.slice(0,8000)` de páginas de terceiros. **Fronteira de confiança: conteúdo de terceiros entra aqui como não-confiável.**
2. **Reescrita IA:** `rewriter` chama o provider. `prompts.ts:121-131` faz `.replace(/\{\{TEXTO\}\}/g, text)` **sem delimitar** o conteúdo externo → o texto de terceiros é interpretável como comando (**injeção indireta, F2**).
3. **Validação de saída:** `quality.ts`/`validate.ts` detectam HTML perigoso, mas `rewriter.ts:301` só bloqueia se `validationMode === "enforce"`; o **default é `"log"`** (`store.ts:140`) → HTML com `<script>`/handlers é **gravado e distribuído** (**F3**).
4. **Distribuição:** `distributor` cria `deliveries`; `deliveryWorker` assina com HMAC por-blog (`blogClient.ts:37-51`) e faz `POST /api/ingest`.
5. **Ingest no blog:** `ingest.ts:167` aplica `sanitizeIngestHtml` (**regex, contornável, F12**); persiste. Idempotência por `centralId` com **TOCTOU** (`ingest.ts:128-194`, **F15**).
6. **Saída no site público:** render usa `sanitizeArticleHtml` → **DOMPurify no cliente** (robusto) — o site público está protegido.
7. **Saída no painel central:** `central-web` renderiza `contentHtml` **cru** (`News.tsx:220`, sem DOMPurify) → **XSS no browser do admin** → exfiltra `central_token` do `localStorage` (**F4**) → sem RBAC (**F8**), controla blogs/segredos/chaves.

### 2.2 Fluxo de segredos
- Segredos do banco (chaves de IA, `centralIngestSecret`, tokens Meta/Buffer) são cifrados com envelope `enc:v1:` (AES-256-GCM), chave derivada por scrypt de `SETTINGS_ENCRYPTION_KEY || SESSION_SECRET` (`crypto.ts`). **Fallback silencioso para texto puro** se nenhum estiver definido (**F16**).
- `db-config.enc` (credencial do banco do blog replicado) gravado `0o600`, escrita atômica.
- **`VAPID_PRIVATE_KEY` real versionada em `.replit:38`** e reusada em todos os blogs (**F1**). `twoFactorSecret` gravado **em claro** no banco (**F16**).

### 2.3 Fluxo de autenticação/autorização
- Login → rate limit persistente + lockout + 2FA → token HMAC 8h. **Sem revogação** (**F14**).
- Autorização do blog: papéis `admin`/`editor`; `permissions.ts:7` faz admin **e webhook key** furarem toda checagem (**F7**). Editor tem allowlist de permissões.
- Autorização do central: **inexistente** além de "autenticado" (**F8**).

## 3. Áreas de cobertura (§3.1) — situação

| Área | Situação (evidência) |
|---|---|
| **Multi-tenancy / isolamento** | Só por infra (DB+container+SESSION_SECRET+HMAC próprios). Sólido no código; riscos são operacionais (bucket/env errado) + `adoptExistingInstall` (F, PRD-14) + superuser `postgres` compartilhado. |
| **Automação de bots / extensões** | **Não aplicável** — não há WhatsApp Web/Telegram/Chrome Extension neste projeto. Há integração Meta/Buffer (social), com tokens cifrados (`blog_social_accounts.*_Enc`). |
| **Pipeline conteúdo externo → IA** | Injeção indireta real (F2) + gate default "log" (F3). Ver 2.1. |
| **Higiene staging/dev** | Sem ambiente de staging evidente no repo; dev usa fallback `dev-secret-*`. Não há mascaramento de dados (não há dados reais de prod versionados). |
| **Arquitetura** | Monólito por serviço; 2 backends + 2 frontends; comunicação HMAC central→blog; entry points na §4. |
| **Frontend** | Site público bem sanitizado (DOMPurify). **central-web sem sanitização** (F4). Sem segredos no bundle (confirmado por grep). |
| **Backend** | Rotas mapeadas; validação **manual** (sem zod nos routers); mass-assignment possível em endpoints admin (gated por permissão). |
| **Banco** | Drizzle parametrizado (SQLi baixo); REVOKE PUBLIC nos replicados; superuser compartilhado; sem backup (F11). |
| **APIs** | REST; auth por rota; rate limit só em login/ingest/publish; **CORS aberto por default no central**. |
| **Integrações IA** | Prompt injection (F2), gate (F3), custo/DoS de cota (F13); chaves cifradas write-only, cota diária — bem controlado no custo, exceto o portão que não fecha (F13). |
| **AuthN/AuthZ** | Ver 2.3. IDOR não é o eixo principal (isolamento é por DB, não por checagem de owner no app). |
| **Painel admin / permissões** | Blog: admin ignora permissões (design). Central: sem RBAC (F8). |
| **Editor de conteúdo** | TipTap; sanitização no blog (DOMPurify) OK; central-web cru (F4). |
| **RSS/automações/jobs** | Fontes externas não-confiáveis (F2); jobs (workers) rodam com privilégio do processo. |
| **Uploads** | multer memoryStorage, filtro MIME, limites de tamanho, nome UUID, anti-traversal na leitura (OK). Falta limite anti-bomba de pixels/tempo no sharp/Playwright (F11-DoS). |
| **Docker/Nginx/VPS** | Caddy com bons headers; containers **root**, sem `mem_limit`/`healthcheck`, `--no-sandbox` (F9); override publica web:3000 (F10). |
| **CI/CD** | Inexistente (F17). |
| **Logs/backups/monitoramento** | pino + `logSecurity`; **sem backup** (F11); sem alerting de segurança (F19). Analytics não persiste IP (bom). |
| **Dependências / env** | Defesas de supply chain no `.npmrc`; `.env` não versionado; **`.replit` com segredo real** (F1). |
| **Trust boundaries / ativos / superfícies** | Consolidados em `03-threat-model.md`. |

## 4. Entry points externos (superfície de ataque)

| Endpoint | Auth | Exposição | Risco-chave |
|---|---|---|---|
| `GET /` (site, web:3000) | nenhuma | pública | AP-3 se servido fora do Caddy |
| `POST /api/ingest` | HMAC por-blog | pública | replay 300s sem nonce, TOCTOU (F15) |
| `POST /api/publish` | webhook key | pública | key = admin global (F7) |
| `GET /api/image` | nenhuma | pública | **SSRF** (F6) |
| `GET /api/uploads/:file` | nenhuma | pública | OK (anti-traversal) |
| `POST /api/analytics` | nenhuma | pública | inflação de métricas (baixo) |
| `/api/site`, sitemaps, AMP | nenhuma | pública | AMP remove CSP (F, baixo) |
| `/admin/setup` | setup token | pública até instalar | OK (token + lockout + anti-adopt) |
| `/api/admin/*` | Bearer | pública (auth) | mass-assignment; SSRF `article-from-url` (F5) |
| central-api `:8090` `/api/*` | Bearer por rota | pública (via Caddy) | **sem RBAC** (F8); CORS aberto |
| central-web `:3001` | — | pública | XSS + token em localStorage (F4) |
