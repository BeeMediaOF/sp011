# Plano Mestre — Auditoria, Hardening e Testes de Segurança (rede de blogs sp011)

> Este é o **plano da fase de planejamento**. Ele segue o `Prompt_Mestre_Planejamento_Auditoria_Seguranca_v3.md`.
> Fluxo acordado com o usuário: **(1)** aprovar este plano → **(2)** eu monto os PRDs reais em `security-audit/` → **(3)** você aprova os PRDs → **(4)** fase de implementação.
> Nada de código é alterado nesta fase nem na de PRDs. A auditoria sobre o código-fonte é **somente leitura**.

---

## Context — por que este trabalho

A rede sp011 é uma plataforma multi-blog **em produção**: um blog-engine replicado em N instâncias na mesma VPS + um painel central que coleta RSS, reescreve com IA e distribui conteúdo assinado por HMAC para cada blog. O sistema cresce (vários go-lives pendentes) e concentra ativos sensíveis: segredos mestres que cifram todo o resto, o isolamento entre blogs que é feito **só por infraestrutura** (não há `blogId` no app), a integridade do que é publicado em nome de cada portal, e dados pessoais (admins, visitantes/analytics, conteúdo enviado a IAs no exterior).

Um reconhecimento real do repositório (3 agentes em paralelo cobrindo backend/API, frontend+multi-tenancy+IA, infra+segredos+dados) encontrou **um segredo real versionado no git**, uma **cadeia de XSS via injeção indireta de prompt**, **SSRF autenticado e não autenticado**, **ausência de RBAC no painel central**, **containers rodando como root**, e **backups inexistentes** do banco dos blogs replicados — ao lado de vários controles já bem-feitos. O objetivo é transformar esses achados num roadmap de hardening rastreável, dividido em PRDs autocontidos e executáveis, priorizado por risco.

Resultado esperado desta fase: **um plano aprovável que define quantos PRDs serão criados, o que cada um cobre, em que ordem, e quais artefatos de auditoria serão gerados** — a fundação para as fases seguintes.

---

## Fase 0.1 — Objetivo declarado (confirmado com o usuário)

| Direcionador | Decisão |
|---|---|
| **Natureza** | Hardening contínuo de sistema **em produção** (não pré-lançamento, não resposta a incidente ativo) |
| **Prazo/marco** | Sem prazo rígido — priorizar por **risco puro** (impacto × exposição × esforço) |
| **Ativos inegociáveis** | **Todos os 4**: (1) isolamento entre blogs · (2) segredos mestres · (3) integridade do conteúdo · (4) dados pessoais (PII/LGPD) |

**Regra de priorização derivada (aplica-se a todo o resto do plano):** primeiro o que um **atacante externo não autenticado** alcança e que toca um dos 4 ativos → depois **fronteiras de privilégio** (blog→blog, usuário→admin, central→blog) → depois **itens de suporte** (backups, supply chain, observabilidade) que não estão no caminho direto de um ataque. Isto **substitui** a ordem padrão do OWASP Top 10.

Origem: fornecido pelo usuário via pergunta direta (confiança **Alta**). Será persistido em `security-audit/00-objetivo.md`.

---

## Fase 0 — Reconhecimento real (resumo do inventário técnico)

**Stack:** monorepo pnpm; Express 5 + esbuild (2 backends), React 19 + Vite 7 (2 frontends), Drizzle ORM, Postgres (Supabase p/ sp011 e central; pg-blogs interno p/ replicados), Playwright/Chromium (render social), Ollama self-hosted (IA primária) + Gemini/OpenAI/Perplexity (fallback). Node 24, Docker Compose, Caddy, VPS Hostinger.

**Superfícies externas mapeadas:** `/api/ingest` (HMAC), `/api/publish` (webhook key), `/api/image` (proxy), `/api/uploads/:file`, `/api/analytics` (ingest público), `/api/site`+sitemaps+AMP, `/admin/setup` (setup token), painel central `:8090` (auth por rota), painel web `:3001`.

**Isolamento multi-tenant:** confirmado que é **só por infra** — cada blog conecta seu próprio banco via `db-config.enc` (AES-256-GCM, `0o600`) e tem segredo HMAC próprio de 256 bits; não há `blogId` no app. Guarda anti-adoção (409 `existing_install`) no wizard.

### Achados consolidados (todos com evidência `caminho:linha` real; detalhamento completo irá para `security-audit/`)

**Críticos / Altos**
1. **Segredo real no git** — `.replit:38` tem `VAPID_PRIVATE_KEY` real; docs mandam reusar em todos os blogs.
2. **Injeção indireta de prompt** — texto de fonte externa entra cru no prompt de IA sem delimitação (`lib/news-engine/src/prompts.ts:121-131`).
3. **Gate de qualidade não bloqueia HTML perigoso por padrão** — `validationMode` default `"log"` (`central-hub/src/services/rewriter.ts:301`, `lib/store.ts:140`).
4. **XSS armazenado no painel central** — `dangerouslySetInnerHTML` cru de conteúdo da IA + token em `localStorage` (`central-web/src/pages/News.tsx:220`, `api.ts:6`). Cadeia 2→3→4 exfiltra `central_token` do admin.
5. **SSRF autenticado** — `POST /api/admin/article-from-url` busca URL arbitrária sem allowlist (`api-server/src/routes/admin.ts:1215-1343`); `scrape.ts` idem.
6. **SSRF no proxy de imagem (público)** — segue redirect sem revalidar host, aceita `http:`, sem bloqueio de IP privado/link-local (`api-server/src/routes/image.ts:147-151`).
7. **Webhook API key = admin global** — vira role admin e fura toda permissão (`api-server/src/middlewares/auth.ts:135-145`, `permissions.ts:7`).
8. **Central-hub sem RBAC** — qualquer usuário central autenticado gerencia blogs, rotaciona segredos e lê/grava chaves de IA (`central-hub/src/routes/*`).
9. **Containers como root, sem hardening** — sem `USER`/`cap_drop`/`no-new-privileges`/`mem_limit`/`healthcheck`; Chromium `--no-sandbox` (`renderTemplate.ts:36-37`).
10. **Override de compose publica `web:3000` no host** — runbook usa `up -d` sem `-f`, mesclando o override em prod (`docker-compose.override.yml:11-14`).
11. **Backups do pg-blogs inexistentes** — `pg_dump`+`rclone` pendente ("INEGOCIÁVEL"); perda de volume = perda de todos os blogs replicados.

**Médios**
12. Sanitizadores por **regex** (SSR/ingest/AMP) contornáveis (`<svg/onload>`) + risco de drift entre espelhos.
13. **Portão de economia nunca fecha** se algum blog ativo não tem `maxPostsPerDay` → consumo ilimitado de IA / DoS de cota (`central-hub/src/lib/dailyQuota.ts:92`).
14. Sem **revogação de token** / logout no-op / troca de senha não invalida token; **fail-open** no fallback de role e nos rate limits (`auth.ts:184-188,267-270`).
15. Anti-replay do ingest só por **janela de 300s** (sem nonce) + **TOCTOU** na idempotência por `centralId` (`signing.ts:53-55`, `ingest.ts:128-194`).
16. **Segredos em texto puro** se nenhuma chave de cripto definida (fallback silencioso); `twoFactorSecret` em claro no banco.
17. **Sem CI/CD e sem nenhum scanner** (SAST/DAST/SCA/secret-scanning), sem Dependabot/Renovate, sem branch protection.
18. **LGPD** — transferência internacional a IAs (Art. 33) sem base legal documentada; `contact_messages` guarda IP/UA sem TTL; consentimento com granularidade "cosmética".
19. Sem **handler de erro global** (vaza `err.message`); `ensureSchema` engole falhas; rate limit ausente na maioria das rotas admin/proxy/upload.

**Controles positivos a preservar (não quebrar):** AES-256-GCM nos segredos; HMAC 256-bit por blog com comparação timing-safe; scrypt + `timingSafeEqual` nas senhas; 2FA TOTP; lockout de conta; rate limit persistente no login; `helmet`+CSP no `/api`; `/api/site` remove segredos; guarda anti-adoção do wizard; defesas de supply chain no `.npmrc` (`minimumReleaseAge`, overrides de CVE, `onlyBuiltDependencies`); `ai_usage_events` só grava `keyHint`.

---

## Estratégia de cobertura de código (Fase 4.6)

**Amostragem por risco** (o repo é grande demais para 100% linha-a-linha com fidelidade). Cobertura profunda priorizada em: autenticação/autorização, ingest HMAC, pipeline IA/prompts, proxy de imagem/scrape (SSRF), uploads, crypto/segredos, isolamento multi-tenant, infra/compose/Caddy. **Cobertura estimada ~70-80%** das superfícies de risco. Fica declarado o que **não** foi lido linha-a-linha (será registrado em `04-plano-auditorias.md`): `articleService.ts` interno, schemas Drizzle em profundidade, `scrapeWithDiffbot`, alguns services do central (`collector/distributor/videoPublisher`), fluxo OAuth Meta/Buffer completo, e o estado de runtime da VPS (firewall/portas/backups reais).

---

## Divisão de PRDs (decisão): **17 PRDs**

Racional: cada PRD é **uma unidade de deploy/rollback isolada**. A divisão foi validada por uma revisão arquitetural independente, que forçou splits onde um PRD misturava codebases ou naturezas de risco distintas (incidente vs. hardening; write-path vs. saída; SSRF público vs. autenticado), e realocou achados para o "balde" correto (integridade ≠ custo; isolamento ≠ robustez). O grafo de dependências resultante é **quase plano** — a maioria roda em paralelo, o que confirma que a granularidade está certa.

| PRD | Escopo (1 linha) | Onda | Depende de | Revisão humana / canário |
|---|---|---|---|---|
| **01a** | **Incidente:** rotacionar VAPID viva/versionada + confirmar chave de envelope setada em prod + par por blog | 0 | — | Sim (segredo) |
| **01b** | Higiene em repouso: cifrar `twoFactorSecret`, fail-closed **permanente** da cripto, **purge do histórico git** | 2 | 01a | **Sim** (purge = force-push) |
| **02** | **RBAC do painel central** + **trilha de auditoria** de ações privilegiadas | 2 | — | Sim (lockout op.) |
| **03** | Fronteiras de auth do blog: webhook key → publish-only, **revogação de token** (logout real/`passwordChangedAt`), fail-open→fail-closed, **token fora do localStorage** | 2 | — | Sim (fail-closed) |
| **04a** | Sanitização canônica **no write-path**: lib única server-side, gate default `enforce`, resolver drift dos espelhos (SSR/ingest/AMP) | 1 | — | **Sim** (rejeita conteúdo → shadow) |
| **04b** | Defesa de saída no **central-web**: DOMPurify nos `dangerouslySetInnerHTML` + consome a política CSP do PRD-08 | 1 | 08 | Não |
| **05** | **Injeção indireta de prompt**: delimitar/marcar conteúdo externo não-confiável + validar saída | 1 | 04a (soft) | Não (aditivo) |
| **06a** | **SSRF proxy de imagem público** (não-auth): allowlist + bloqueio IP privado/link-local + revalidar redirect + só https; entrega o **util de fetch seguro** compartilhado | 1 | — | Canário (allowlist) |
| **06b** | **SSRF autenticado**: `article-from-url` + `scrape` reusando o util do 06a | 2 | 06a | Canário |
| **07** | Hardening de runtime dos containers: non-root, `cap_drop`/`no-new-privileges`/`mem_limit`/`healthcheck`, **remover `--no-sandbox`** | 3 | — | **Sim** (Chromium/volumes) |
| **08** | **Borda:** fix do `override`/ports (parar de publicar `web:3000`) **+ dono da política CSP/HSTS** | 0→1 | — | Canário (CSP report-only) |
| **09** | **Backups & durabilidade** do pg-blogs: `pg_dump`+`rclone` offsite, retenção, teste de restore | 0/3 | — | Não (aditivo) |
| **10** | **CI/CD de segurança**: secret-scanning (gitleaks), SCA (Dependabot/Renovate + `pnpm audit`), SAST, workflow mínimo | 0/3 | — | Não (não-bloqueante 1º) |
| **11** | Custo/DoS: **teto de cota default** (portão de economia), rate limits faltantes, limites anti-bomba (sharp/Playwright/upload) | 3 | — | Canário (default de cota) |
| **12** | **LGPD/privacidade**: base legal + Art. 33 (Ollama-only p/ PII), TTL de retenção do `contact_messages`, direitos do titular, granularidade de consentimento | 4 | — | **Sim** (deleção de dados = dry-run) |
| **13** | Robustez operacional: **handler de erro global**, `ensureSchema` fail-loud, alerting de segurança | 4 | — | Sim (fail-loud no boot) |
| **14** | **Integridade do ingest & guarda de instalação**: nonce persistido + transação atômica na idempotência por `centralId`; endurecer `adoptExistingInstall` (isolamento) | 2 | — | Não |

**Risco de envelope (aceito ou PRD?) — pergunta em aberto:** a rotação da própria chave de envelope/`SESSION_SECRET` não tem caminho hoje (CLAUDE.md proíbe trocar — todo segredo cifrado deriva dela). Isso significa que não há re-chaveamento de emergência. Ver `07-perguntas-pendentes.md`: decidir entre **aceitar como risco arquitetural** ou criar um **PRD-15 de re-chaveamento** (re-encrypt de todos os segredos sob nova chave, com migração).

### Grafo de dependências (arestas reais; o resto é paralelo)

```
FUNDACIONAL (habilita/protege tudo, rodar cedo em paralelo):  PRD-10, PRD-09
INCIDENTE (urgência, sem deps):                               PRD-01a, PRD-08(override)

ARESTAS DURAS:   override-fix ──► CSP de borda (PRD-08)  ──► PRD-04b (central-web consome a política)
                 PRD-06a (util de fetch seguro) ──► PRD-06b
                 PRD-01a ──► PRD-01b
ARESTAS SUAVES:  PRD-04a (gate enforce) ──▷ PRD-05      ;   PRD-02 (RBAC) ──▷ audit log (mesmo ponto)
OVERLAP:         PRD-01a (rotaciona SESSION_SECRET) ⇄ PRD-03 (revogação de token) — coordenar p/ não duplicar
INDEPENDENTES:   PRD-02, 03, 06a, 07, 09, 10, 11, 12, 13, 14
```

---

## Threat Model — principais attack paths (STRIDE)

Cadeias (não vulnerabilidades isoladas), mapeadas aos achados (F#) e aos 4 ativos. Detalhamento completo + STRIDE por componente irá para `03-threat-model.md`.

- **AP-1 — Takeover do admin central via pipeline de IA (cadeia-mãe).** Fonte externa → injeção indireta (F2) → IA emite HTML perigoso → gate default "log" não bloqueia (F3) → armazenado → central-web renderiza cru (F4) → XSS → exfiltra `central_token` do localStorage (F4) → sem RBAC (F8) rotaciona segredos/lê chaves. **Externo não-auth; toca os 4 ativos.** STRIDE T/E/I. → PRD-04a, 04b, 05, 02, 03.
- **AP-2 — SSRF público do proxy de imagem (F6).** Não-auth alcança `169.254.169.254`/metadata e serviços internos (pg-blogs, Ollama, central:8090). STRIDE I/S/D. → PRD-06a.
- **AP-3 — Frontend sem borda (F10).** `up -d` sem `-f` publica `web:3000` sem TLS/CSP → MITM + anula as defesas client-side do AP-1. STRIDE T/I/S. → PRD-08.
- **AP-4 — Webhook key = admin global (F7).** Bearer com a chave vira admin e fura permissões; token não-revogável (F14) impede corte rápido. STRIDE E/S/T. → PRD-03.
- **AP-5 — Central → blog / extração de segredos (F8).** Usuário central de baixo privilégio (ou token do AP-1) lê db-config/rotaciona `CENTRAL_INGEST_SECRET`/lê chaves → forja ingest e publica em nome do blog, ou conecta ao DB. STRIDE E/T/I/R (sem auditoria). → PRD-02.
- **AP-6 — Forja/replay/duplicação de ingest (F15).** Replay em 300s sem nonce + TOCTOU na idempotência → duplicação + 500. STRIDE S/T/R/D (integridade). → PRD-14.
- **AP-7 — Segredos em repouso/VCS (F1/F16).** VAPID versionada e reusada em todos os blogs; fallback plaintext deixa db-config e `twoFactorSecret` em claro se a chave de envelope não estiver setada. STRIDE I/S/E. → PRD-01a, 01b.
- **AP-8 — Exaustão de custo/IA (F13/F11/F19).** Portão de economia nunca fecha sem `maxPostsPerDay`; rate limit ausente; bombas sharp/Playwright. STRIDE D. → PRD-11.
- **AP-9 — Perda de durabilidade (F11).** Sem backups do pg-blogs → perda total de todos os blogs. STRIDE D/R (catastrófico). → PRD-09.
- **AP-10 — LGPD/transferência internacional (F18).** PII sem TTL enviada a IAs estrangeiras sem base legal (Art. 33). STRIDE I/R. → PRD-12.
- **AP-11 (amplificador) — Escape de container (F9).** Root + Chromium `--no-sandbox` → RCE escapa para host como root, atinge todos os tenants. STRIDE E. Amplifica AP-1/AP-2. → PRD-07.

| Componente crítico | STRIDE dominante | Controle que falta |
|---|---|---|
| Ingest HMAC | S/T/R | Nonce persistido + transação atômica; fim do reuso de segredo |
| central-hub | E/I/R | Guards RBAC + trilha de auditoria |
| Proxy de imagem | I/S/D | Allowlist + bloqueio IP privado + revalidar redirect + só https |
| Pipeline IA | T/E/I | Delimitar conteúdo externo; gate `enforce`; PII→Ollama-only |
| db-config / isolamento | I/S/E | Fail-closed permanente; hardening do adopt-guard |
| Chromium render | E/T/I | Sandbox real (sem `--no-sandbox`, non-root, seccomp), restrição de egress |

---

## Roadmap em ondas (impacto × exposição × alinhamento com os 4 ativos)

**Onda 0 — Incidente / quick wins de config (horas–dias):** PRD-01a (rotacionar VAPID viva) · PRD-08 passo-1 (parar de publicar `web:3000`) · **puxar em paralelo** PRD-10 (scanners, não-bloqueante) e PRD-09 (backups — INEGOCIÁVEL e barato).

**Onda 1 — Externo não-auth → 4 ativos (maior exposição):** PRD-04a (gate `enforce` + lib única, em **shadow/report-diff** primeiro) · PRD-04b (central-web DOMPurify) · PRD-06a (SSRF público) · PRD-05 (delimitar prompt) · PRD-08 passo-2 (CSP/HSTS em `report-only` primeiro).

**Onda 2 — Fronteiras de privilégio (blog→blog, usuário→admin, central→blog):** PRD-02 (RBAC + auditoria) · PRD-03 (webhook escopo + revogação + fail-closed + token fora do localStorage) · PRD-06b (SSRF autenticado) · PRD-14 (nonce/transação do ingest + adopt-guard) · PRD-01b (cifrar `twoFactorSecret` + fail-closed permanente + purge git coordenado).

**Onda 3 — Runtime / disponibilidade / custo:** PRD-07 (containers non-root + remover `--no-sandbox`, **canário**) · PRD-11 (teto de cota default + rate limits + anti-bomba).

**Onda 4 — Compliance + robustez:** PRD-12 (LGPD, deleção em **dry-run**) · PRD-13 (handler de erro global, `ensureSchema` fail-loud, alerting).

**Quick Wins:** PRD-10, override/ports, teto de cota default, rotação VAPID, fail-closed da cripto, bloqueio de IP privado no proxy, guards de RBAC (middleware aditivo), backups.
**Longo prazo/pesados:** sanitizador unificado + drift (04a), remoção do `--no-sandbox` (07), base legal LGPD (12), teste de restore (09), purge de histórico (01b).

**Itens que exigem modo observação/canário antes de fechar (não enviar direto a prod):** gate `enforce` (04a, shadow), CSP (08, report-only), allowlist SSRF (06), rate-limit fail-closed (03/11), remoção do `--no-sandbox` (07), teto de cota default (11), deleção de retenção (12, dry-run).

---

## Artefatos que serão produzidos após aprovação (estrutura de entrega)

```
security-audit/
├── 00-objetivo.md                (objetivo declarado, origem, prioridades derivadas)
├── 00-inventario-tecnico.md      (bootstrap/reconhecimento)
├── 01-entendimento-sistema.md    (arquitetura, fluxos, áreas de cobertura)
├── 02-mapa-riscos.md             (tecnologias, componentes, riscos preliminares, lacunas)
├── 03-threat-model.md            (STRIDE por componente + attack paths)
├── 04-plano-auditorias.md        (domínios ordenados por objetivo, refs OWASP/CWE/CVSS/ATT&CK por item)
├── 05-estrategia-prd.md          (índice e racional da divisão dos PRDs)
├── prds/
│   ├── PRD-01-....md ... PRD-NN-....md   (um arquivo por PRD, completo e autocontido)
├── 06-roadmap-dimensionamento.md (ondas, esforço, dependências, paralelismo, DoD)
├── 07-perguntas-pendentes.md
├── STATUS.md                     (fase atual, PRDs escritos vs. pendentes, retomada)
└── resumo-executivo.md           (síntese final + índice comentado dos PRDs)
```

---

## Perguntas em aberto (Fase 7 — preliminar)

- **Rotação da chave de envelope/`SESSION_SECRET`** — não há caminho de re-chaveamento hoje (proibido trocar). **Bloqueia:** decidir se vira **PRD-15** (re-encrypt de todos os segredos sob nova chave) ou risco arquitetural **aceito e documentado**. *Por que importa:* sem isso, não existe revogação de emergência da chave-mãe.
- Estado real da VPS (firewall/UFW, portas efetivamente abertas, se o override está ativo em prod agora, se algum backup já existe) — não verificável a partir do repo; alguns itens de Onda 0 podem já estar mitigados.
- Conteúdo real dos `.env`/`.env.central` (força dos segredos, se `SETTINGS_ENCRYPTION_KEY` está definido) — não lido (segredos vivos).
- Se a `VAPID_PRIVATE_KEY` de `.replit` ainda está em uso em produção — assumir comprometida até rotação (PRD-01a).
- CVEs reais no lockfile — `pnpm audit` não executado (evita rede/instalação); pendência para ambiente controlado (entra no PRD-10).

---

## Verificação (como validar as fases seguintes)

- **Fase de PRDs:** cada PRD passa por auto-checagem (executável sozinho? escopo imperativo? critérios verificáveis por comando?) e por uma releitura crítica antes de fechar.
- **Fase de implementação (futura):** cada PRD traz seus próprios comandos de verificação (testes `node --test` por pacote, `grep` de ausência de padrão vulnerável, checagem de headers/config). Nada é marcado "concluído" sem os comandos passarem; mudanças em auth/segredos/dados sensíveis são sinalizadas para revisão humana.
