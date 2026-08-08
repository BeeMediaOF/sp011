# 03 — Threat Model (Fase 3 — STRIDE)

Construído sobre os ativos e a arquitetura de `01`/`02`. Foco em **cadeias** (attack paths), não vulnerabilidades isoladas.

---

## 1. Ativos críticos

| Ativo | Por que | Onde vive |
|---|---|---|
| Segredo de envelope (`SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`) | Cifra todos os segredos do banco; assina tokens | `.env` (não versionado), derivado em `crypto.ts`/`auth.ts` |
| `CENTRAL_INGEST_SECRET` por blog | Autoriza publicar em nome do blog | cifrado em `central_db.blogs.ingestSecretEnc`; `.env` do blog |
| Chaves de IA (Gemini/OpenAI/Perplexity/Apify) | Custo financeiro; abuso | cifradas em `central_settings` |
| Credencial de banco por blog (`db-config.enc`) | Acesso total ao tenant | `/data/db-config.enc` (0o600) |
| Tokens Meta/Buffer | Publicar/impersonar nas redes | cifrados em `blog_social_accounts` |
| PII (admins, contact_messages, analytics) | LGPD | bancos |
| Conteúdo publicado / integridade dos portais | Reputação, desinformação | bancos dos blogs |
| Backups (inexistentes) | Recuperação | — (lacuna, F11) |

## 2. Trust boundaries

1. **Internet → Caddy** (TLS/headers). Furada por F10 (web:3000 direto).
2. **Internet não-auth → api/central** (ingest HMAC, proxy, analytics, setup).
3. **Usuário autenticado → admin** (blog: `requireAdmin`; central: **sem fronteira**, F8).
4. **Central → blog** (HMAC por-blog). Integridade depende do segredo não vazar e do anti-replay (F15).
5. **Blog ↔ blog** (isolamento por DB/container/segredo). Sem `blogId` no app.
6. **App → conteúdo externo (RSS/scraping)** — a fronteira mais subestimada: terceiros não-confiáveis alimentam a IA (F2).
7. **Container → host** (root + `--no-sandbox`, F9).

## 3. Threat agents (perfis plausíveis para ESTE sistema)

- **Atacante externo não-autenticado** — alvo primário pela regra de ordem. Alcança ingest, proxy de imagem (SSRF), site, setup.
- **Operador de fonte de conteúdo maliciosa** — controla uma página/feed que o collector lê; injeta prompt/payload (F2 → AP-1). **Não precisa de credencial.**
- **Usuário central de baixo privilégio / token roubado** — sem RBAC, vira admin efetivo do ecossistema (F8, AP-5).
- **Portador da webhook key** (vazada/fraca) — admin global do blog (F7, AP-4).
- **Insider/operador com acesso ao repo** — lê `.replit` (VAPID, F1) e refs de projeto.
- **Tenant vizinho** (num futuro com blogs de terceiros) — tenta cruzar isolamento (adopt-guard, bucket, superuser compartilhado).
- **Não aplicável a este projeto:** atacante politicamente motivado contra portal de candidato, sequestro de sessão de bot WhatsApp/Telegram, extensão Chrome — **evidência:** não há esses componentes no repo (o v3 do prompt mestre é genérico; adaptado aqui conforme guardrail 1.6).

## 4. Attack paths (cadeias)

- **AP-1 — Takeover do admin central via pipeline de IA (cadeia-mãe).** Fonte externa → injeção indireta (F2) → IA emite HTML perigoso → gate default "log" não bloqueia (F3) → armazenado → central-web renderiza cru (F4) → XSS no browser do admin → exfiltra `central_token` do localStorage → sem RBAC (F8) rotaciona segredos/lê chaves/gerencia blogs. **Entrada: externo não-auth. Toca os 4 ativos.** STRIDE: **T, E, I**. Mitiga: PRD-04a/04b/05/02/03.
- **AP-2 — SSRF público (proxy de imagem, F6).** Não-auth → segue redirect sem revalidar host, aceita http, sem bloqueio de IP privado → `169.254.169.254`/metadados, pg-blogs, ollama, central:8090. STRIDE: **I, S, D**. Mitiga: PRD-06a.
- **AP-3 — Frontend sem borda (F10).** `up -d` sem `-f` → web:3000 sem TLS/CSP → MITM + anula defesas client-side do AP-1. STRIDE: **T, I, S**. Mitiga: PRD-08.
- **AP-4 — Webhook key = admin global (F7).** Bearer com a key → admin, fura permissões, publica/desfigura; token não-revogável (F14) impede corte. STRIDE: **E, S, T**. Mitiga: PRD-03.
- **AP-5 — Central → blog / extração de segredos (F8).** Usuário central baixo-privilégio (ou token do AP-1) → lê db-config/rotaciona ingest secret/lê chaves → forja ingest e publica em nome do blog, ou conecta ao DB. STRIDE: **E, T, I, R** (sem auditoria de quem fez). Mitiga: PRD-02.
- **AP-6 — Forja/replay/duplicação de ingest (F15).** Replay em 300s sem nonce + TOCTOU na idempotência → duplicação + 500. STRIDE: **S, T, R, D**. Mitiga: PRD-14.
- **AP-7 — Segredos em repouso/VCS (F1/F16).** VAPID versionada e reusada em todos os blogs → forja de push notifications; fallback plaintext → db-config e twoFactorSecret em claro se a chave não estiver setada → comprometimento de tenant + bypass de 2FA. STRIDE: **I, S, E**. Mitiga: PRD-01a/01b.
- **AP-8 — Exaustão de custo/IA (F13/F11/F19).** Portão nunca fecha sem `maxPostsPerDay`; rate limit ausente; bombas sharp/Playwright → consumo ilimitado / travamento de workers. STRIDE: **D**. Mitiga: PRD-11.
- **AP-9 — Perda de durabilidade (F11).** Sem backup do pg-blogs → perda de volume/drop/ransomware → perda total de todos os blogs, sem recuperação. STRIDE: **D (permanente), R**. Mitiga: PRD-09.
- **AP-10 — LGPD/transferência internacional (F18).** PII (contact_messages IP/UA, sem TTL) → IAs estrangeiras sem base legal (Art. 33). STRIDE: **I, R**. Mitiga: PRD-12.
- **AP-11 (amplificador) — Escape de container (F9).** Root + `--no-sandbox` → RCE (via HTML atacante no Playwright ou dependência) escapa para host como root → todos os tenants. STRIDE: **E**. Amplifica AP-1/AP-2. Mitiga: PRD-07.

## 5. STRIDE por componente crítico

| Componente | S | T | R | I | D | E | Controle que falta (PRD) |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| **Ingest HMAC** | ● | ● | ● | | ● | | Nonce persistido + transação atômica; fim do reuso de segredo (14) |
| **central-hub** | | ● | ● | ● | | ● | Guards RBAC + **trilha de auditoria** (02) |
| **Proxy de imagem** | ● | | | ● | ● | | Allowlist + bloqueio IP privado + revalidar redirect + só https (06a) |
| **Pipeline IA** | | ● | | ● | | ● | Delimitar conteúdo externo; gate `enforce`; PII→Ollama-only (04a/05) |
| **central-web (saída)** | ● | ● | | ● | | ● | DOMPurify + CSP; token fora do localStorage (04b/03) |
| **db-config / isolamento** | ● | | | ● | | ● | Fail-closed permanente; hardening adopt-guard (01b/14) |
| **Chromium render** | | ● | | ● | | ● | Sandbox real (sem `--no-sandbox`, non-root, seccomp), egress restrito (07) |
| **Auth do blog** | ● | ● | | | | ● | Webhook key escopada; revogação de token; fail-closed (03) |
| **Borda (Caddy/override)** | ● | ● | | ● | | | Parar de publicar web:3000; CSP/HSTS (08) |
| **pg-blogs** | | ● | ● | | ● | | Backups + teste de restore (09) |

## 6. Controles existentes vs. lacunas (resumo)

**Já mitigado (preservar):** AES-256-GCM dos segredos; HMAC 256-bit timing-safe; scrypt+`timingSafeEqual`; 2FA TOTP; lockout + rate limit persistente no login; helmet+CSP no `/api`; `/api/site` remove segredos; DOMPurify no site público; anti-traversal em uploads/imagens; guarda anti-adoção (409); defesas de supply chain no `.npmrc`; `ai_usage_events` só grava `keyHint`; cota diária de IA + cooldown/parking de chave.

**Lacunas → PRDs:** ver `05-estrategia-prd.md` e `06-roadmap-dimensionamento.md`.
