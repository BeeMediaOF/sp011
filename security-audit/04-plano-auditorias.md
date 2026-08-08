# 04 — Plano de auditorias por domínio (Fase 4)

Domínios **ordenados pela relevância ao objetivo declarado** (`00-objetivo.md`): hardening de produção, priorização por exposição, 4 ativos inegociáveis. A ordem **não** é a alfabética/cobertura do prompt mestre. Cada item traz as referências aplicáveis (OWASP Top 10 2021 = A0x; OWASP API Security Top 10 2023 = API0x; OWASP ASVS v4; CWE; CVSS aproximado; MITRE ATT&CK quando faz sentido).

> CVSS é **estimativa** para priorização (vetor não formalmente calculado). Confirmar no item de cada PRD.

---

## Ordem dos domínios (com justificativa)

1. **Integrações de IA / pipeline de conteúdo externo** — *1º porque é o único vetor que um atacante **externo não-autenticado** dispara e que percorre até o topo do privilégio (AP-1), tocando os 4 ativos.*
2. **Autorização / RBAC / fronteiras de privilégio** — *2º porque é o que transforma um foothold em takeover (F7/F8) e porque o central não tem RBAC algum.*
3. **SSRF / superfícies de fetch** — *2º (empate) porque o proxy de imagem é externo não-auth (F6) e alcança serviços internos e metadados.*
4. **Segredos & criptografia** — *alto porque há segredo real vazado (F1) e fallback plaintext (F16); é o ativo #2.*
5. **Integridade do ingest & isolamento multi-tenant** — *ativos #1 e #3; fronteira central→blog e blog→blog.*
6. **Infraestrutura (containers/borda/VPS)** — *habilitador/amplificador (AP-3/AP-11); F10 pode ser exposição viva.*
7. **Disponibilidade / custo / DoS** — *importante mas fora do caminho direto aos 4 ativos, salvo o custo de IA.*
8. **Durabilidade / backups** — *fora do caminho de ataque, mas impacto catastrófico (AP-9) sobe a prioridade.*
9. **Supply chain / CI-CD / Secure SDLC** — *fundacional; protege todo o resto; não bloqueia por exposição direta.*
10. **Dados pessoais / LGPD** — *ativo #4; risco regulatório, não de exploração externa imediata.*
11. **Robustez / observabilidade / resposta a incidente** — *suporte; fecha lacunas de detecção e vazamento de erro.*

---

## Domínio 1 — Integrações de IA / conteúdo externo → IA

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Injeção **indireta** de prompt (texto externo cru) | OWASP LLM01; CWE-77/CWE-1427; ATT&CK T1059 (análogo) | Alto ~7.5 | F2 → PRD-05 |
| Saída do modelo não validada/bloqueada (gate "log") | OWASP LLM02/LLM05; CWE-79 (via saída) | Alto ~8.1 | F3 → PRD-04a |
| Abuso de custo / DoS de cota (portão não fecha) | OWASP LLM10 (Unbounded Consumption); API04; CWE-770 | Médio ~6.5 | F13 → PRD-11 |
| Exposição de chave de IA / rodízio | OWASP LLM06; CWE-522 | Baixo (mitigado) | — (controle OK) |
| Excessive agency (tool-calling) | OWASP LLM06 | N/A | Não aplicável (sem tool-calling) |

## Domínio 2 — Autorização / RBAC / fronteiras

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Central-hub sem RBAC | A01; API01/API05; ASVS 4.1; CWE-862/CWE-285 | Alto ~8.8 | F8 → PRD-02 |
| Webhook key = admin global | A01/A07; API02; CWE-269/CWE-266 | Alto ~8.1 | F7 → PRD-03 |
| Sem revogação de token / logout no-op / fail-open role | A07; ASVS 3.3; CWE-613/CWE-384/CWE-636 | Médio ~6.5 | F14 → PRD-03 |
| Falta de trilha de auditoria de ações privilegiadas | A09; ASVS 7.x; CWE-778 | Médio ~5.3 | F(R) → PRD-02 |
| Mass assignment em endpoints admin | A08; API06; CWE-915 | Baixo-Médio (gated) | (nota em PRD-02/03) |

## Domínio 3 — SSRF / fetch

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| SSRF público no proxy de imagem (redirect, IP privado) | A10; API07; CWE-918; ATT&CK T1090/T1552.005 | Alto ~8.6 (não-auth) | F6 → PRD-06a |
| SSRF autenticado (`article-from-url`, `scrape`) | A10; CWE-918 | Alto ~7.2 (auth) | F5 → PRD-06b |

## Domínio 4 — Segredos & criptografia

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| VAPID real versionada, reusada | A05/A02; CWE-798/CWE-321; ATT&CK T1552.001 | **Crít ~9.1** | F1 → PRD-01a |
| Fallback plaintext se sem chave de cripto | A02; CWE-311/CWE-312 | Médio ~6.5 | F16 → PRD-01b |
| twoFactorSecret em claro | A02; CWE-312 | Médio ~5.9 | F16 → PRD-01b |
| Sem re-chaveamento/revogação da chave-mãe | A02; CWE-320 | Médio (arquitetural) | Pergunta aberta → PRD-15? |

## Domínio 5 — Integridade do ingest & isolamento

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Replay de ingest (janela 300s, sem nonce) | A08; CWE-294 | Médio ~5.9 | F15 → PRD-14 |
| TOCTOU na idempotência por centralId | CWE-367 | Médio ~5.0 | F15 → PRD-14 |
| `adoptExistingInstall` (risco de isolamento) | A01; CWE-284 | Médio (operacional) | F → PRD-14 |
| Superuser `postgres` compartilhado no pg-blogs | A01; CWE-250 | Médio (nota) | (nota em PRD-09/14) |

## Domínio 6 — Infraestrutura (containers/borda/VPS)

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Containers root, sem cap_drop/no-new-privileges | A05; CWE-250/CWE-16; ATT&CK T1611 | Alto ~7.0 | F9 → PRD-07 |
| Chromium `--no-sandbox` | A05; CWE-693 | Alto ~7.5 | F9 → PRD-07 |
| Override publica web:3000 (bypass do Caddy) | A05; CWE-16/CWE-319 | Alto ~7.4 | F10 → PRD-08 |
| Sem mem_limit/healthcheck | A05; CWE-400 | Médio | F9 → PRD-07 |
| CSP ausente na borda p/ frontend; AMP remove CSP | A05; CWE-1021/CWE-693 | Médio ~5.4 | F/F → PRD-08 |
| CORS aberto por default no central | A05; API08; CWE-942 | Baixo (Bearer) | (nota em PRD-08) |

## Domínio 7 — Disponibilidade / custo / DoS

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Rate limit ausente (admin/proxy/upload) | A04; API04; CWE-770 | Médio ~6.5 | F19 → PRD-11 |
| Bombas de mídia/decompressão (sharp/Playwright/upload) | A04; CWE-409/CWE-400 | Médio ~6.5 | F11 → PRD-11 |
| Teto de cota default ausente (custo IA) | API04; CWE-770 | Médio | F13 → PRD-11 |

## Domínio 8 — Durabilidade / backups

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Sem backup do pg-blogs (perda total) | A08(process); CWE-1188; ATT&CK T1485/T1490 | Alto (impacto) | F11 → PRD-09 |

## Domínio 9 — Supply chain / CI-CD / Secure SDLC

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Sem secret-scanning | A05; CWE-798 | Médio | F17 → PRD-10 |
| Sem SCA / `pnpm audit` / Dependabot | A06; CWE-1104; SLSA | Médio | F17 → PRD-10 |
| Sem SAST / branch protection | A05; ASVS 1.x | Médio | F17 → PRD-10 |
| Defesas presentes (`.npmrc`, overrides) | — | (positivo) | preservar |

**Fornecedores/SaaS terceiros (4.4):** Supabase (DB sp011+central+Storage; responsabilidade compartilhada: durabilidade gerenciada só do lado Supabase — pg-blogs NÃO), Hostinger (VPS/host; SSH/root), Gemini/OpenAI/Perplexity/Apify (processam conteúdo; ver LGPD), Meta/Buffer (publicação social; tokens cifrados). Mapear "o que acontece se o fornecedor for comprometido" → `resumo-executivo.md`.

## Domínio 10 — Dados pessoais / LGPD

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Transferência internacional a IAs (Art. 33) sem base legal | LGPD Art. 33/7; A09 | Médio | F18 → PRD-12 |
| contact_messages IP/UA sem TTL de retenção | LGPD (minimização/retenção); CWE-212 | Médio | F18 → PRD-12 |
| Consentimento com granularidade cosmética | LGPD Art. 8/9 | Baixo-Médio | F18 → PRD-12 |

## Domínio 11 — Robustez / observabilidade / IR

| Item | Ref | Sev/CVSS | Achado→PRD |
|---|---|---|---|
| Sem handler de erro global (vaza err.message) | A05; CWE-209 | Baixo-Médio | F19 → PRD-13 |
| ensureSchema engole falhas de migração | CWE-703 | Baixo | F19 → PRD-13 |
| Sem alerting de segurança (logSecurity sem consumidor) | A09; CWE-778 | Médio | F19 → PRD-13 |
| Caminho rápido de revogação de credencial (IR) | ASVS; NIST IR | Médio | ver PRD-01a/03 + pergunta aberta |

---

## Security by Design (4.3) — aplicado ao plano

- **Least Privilege:** PRD-02 (RBAC), PRD-03 (webhook escopo), PRD-07 (non-root), superuser dedicado (nota).
- **Fail Secure:** PRD-03 (fail-open→fail-closed), PRD-01b (fail-closed da cripto), PRD-13 (fail-loud).
- **Complete Mediation:** PRD-06 (revalidar redirect), PRD-04a (sanitização no write-path canônica).
- **Defense in Depth:** PRD-04a+04b+08 (write-path + saída + CSP), PRD-07+PRD-06 (sandbox + egress).
- **Secure Defaults:** PRD-04a (gate `enforce` default), PRD-11 (teto de cota default), PRD-08 (CSP).
- **Economy of Mechanism / redução de superfície:** PRD-07 (imagem slim, sem source), PRD-08 (borda única).
- **Separation of Duties:** PRD-02 (papéis no central) + trilha de auditoria.

## Estratégia de cobertura de código (4.6)

**Amostragem por risco.** Cobertura profunda (lida linha-a-linha): `middlewares/auth.ts` e `permissions.ts` (ambos), `routes/ingest.ts`, `routes/image.ts`, `routes/admin.ts` (SSRF/autofill), `routes/uploads.ts`, `routes/setup.ts`, `lib/crypto.ts`, `lib/dbConfig.ts`, `lib/ensureSchema.ts`, `lib/social/renderTemplate.ts`, `news-engine/src/{prompts,scrape,signing,validate,quality,ai/*}.ts`, `central-hub/src/{routes/*,services/rewriter,services/deliveryWorker,lib/store,lib/dailyQuota}.ts`, `central-web/src/{api,pages/News,pages/Review,pages/NewArticle}.tsx`, `brasilia-agora/src/lib/{sanitize,newsImage}.ts`, `docker-compose*.yml`, `Caddyfile`, `Dockerfile`s, `.npmrc`, `.replit`, schemas Drizzle (parcial). **Cobertura estimada ~70-80% da superfície de risco.**

**Fora da cobertura profunda (declarado):** `articleService.ts` interno, `scrapeWithDiffbot`, services `collector/distributor/videoPublisher/videoDownloader`, fluxo OAuth Meta/Buffer completo, `routes/{analytics,push,queue,realtime-stats,dbConfigAdmin}.ts`, testes existentes, e todo o **runtime da VPS**. `pnpm audit` **não** executado (entra no PRD-10).
