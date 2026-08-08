# Resumo Executivo — Auditoria e Hardening de Segurança (rede sp011)

**Data:** 2026-07-21 · **Natureza:** hardening contínuo de produção · **Método:** reconhecimento READ-ONLY (3 varreduras paralelas + validação arquitetural independente) · **Entregável:** este dossiê + 17 PRDs autocontidos em `prds/`.

---

## 1. Resumo executivo

A rede sp011 é uma plataforma multi-blog de notícias em produção (N blogs replicados + painel central que coleta, reescreve com IA e distribui conteúdo assinado por HMAC). O sistema tem **fundações de segurança sólidas** — cripto AES-256-GCM dos segredos, HMAC por-blog, scrypt+2FA, rate limit persistente, DOMPurify no site público, defesas de supply chain no `.npmrc` — mas o reconhecimento encontrou **exposições reais e uma cadeia de ataque completa** que justificam um programa de hardening priorizado.

**Os 3 achados mais graves:**
1. **Segredo real versionado** (`VAPID_PRIVATE_KEY` em `.replit`, reusado em todos os blogs) — exposição viva.
2. **Cadeia-mãe AP-1** (takeover do admin central): fonte externa → injeção indireta de prompt → gate de qualidade em modo "log" → XSS no painel central (sem DOMPurify) → roubo do token (localStorage) → central sem RBAC. **Um atacante externo não-autenticado toca os 4 ativos inegociáveis.**
3. **Backups inexistentes** do pg-blogs — perda de volume = perda total e irreversível de todos os blogs replicados.

## 2. Arquitetura (síntese)

2 backends Express 5 (blog `api` + `central-hub`), 2 frontends React/Vite (site+admin e painel), pipeline IA compartilhado (`news-engine`), Drizzle/Postgres (Supabase p/ sp011 e central; pg-blogs interno p/ replicados), Playwright p/ artes sociais, Ollama self-hosted como IA primária. Tudo atrás de um Caddy na VPS Hostinger. Isolamento multi-tenant **só por infra** (sem `blogId` no app). Detalhe em `01-entendimento-sistema.md`.

## 3. Tecnologias

Express `^5.2.1`, React `19.1.0`, Vite `^7.3.5`, Drizzle `^0.45.2`, DOMPurify `^3.2.4` (só no blog), Playwright `^1.49.0`, Node 24, pnpm, Docker Compose, Caddy. Detalhe/criticidade em `02-mapa-riscos.md`.

## 4. Mapa de riscos (19 achados)

11 críticos/altos, 8 médios. Tabela completa com evidência `caminho:linha`, severidade e ativos em `02-mapa-riscos.md`. Referências OWASP/API/ASVS/CWE/CVSS/ATT&CK por item em `04-plano-auditorias.md`.

## 5. Superfícies de ataque

Entradas externas: `/api/ingest` (HMAC), `/api/publish` (webhook key = admin, F7), `/api/image` (SSRF público, F6), `/api/uploads`, `/api/analytics`, `/api/site`+AMP, `/admin/setup`, central `:8090` (sem RBAC, F8), central-web `:3001` (XSS, F4). Fronteiras de confiança e threat agents em `03-threat-model.md`.

## 6. Plano mestre & attack paths

11 attack paths (AP-1 a AP-11) em `03-threat-model.md`. A regra de priorização (externo não-auth → fronteiras de privilégio → suporte) governa a ordem. Plano de auditoria por domínio, ordenado por objetivo, em `04-plano-auditorias.md`.

## 7. Índice comentado dos PRDs

| PRD | Título | Onda | Prioridade | Dep. | Attack path |
|---|---|:--:|---|---|---|
| 01a | Rotação VAPID + chave de envelope | 0 | Quick Win | — | AP-7 |
| 01b | Segredos em repouso + purge git | 2 | Médio | 01a | AP-7 |
| 02 | RBAC central + auditoria | 2 | Quick Win | — | AP-5 |
| 03 | Auth do blog (webhook/revogação/fail-closed/token) | 2 | Médio | ~01a | AP-4 |
| 04a | Sanitização write-path + gate enforce | 1 | Médio | — | AP-1 |
| 04b | central-web DOMPurify | 1 | Quick Win | 08 | AP-1 |
| 05 | Injeção indireta de prompt | 1 | Médio | 04a | AP-1 |
| 06a | SSRF proxy público + safeFetch | 1 | Quick Win | — | AP-2 |
| 06b | SSRF autenticado | 2 | Médio | 06a | AP-2 |
| 07 | Hardening de containers | 3 | Longo | — | AP-11 |
| 08 | Borda: override/ports + CSP/HSTS | 0→1 | Quick Win | — | AP-3 |
| 09 | Backups & durabilidade | 0/3 | Quick Win | — | AP-9 |
| 10 | CI/CD de segurança | 0/3 | Quick Win | — | (todos) |
| 11 | Custo/DoS: cota default + rate limits + anti-bomba | 3 | Médio | — | AP-8 |
| 12 | LGPD/privacidade | 4 | Médio | — | AP-10 |
| 13 | Robustez operacional | 4 | Médio | — | (suporte) |
| 14 | Integridade do ingest & guarda de instalação | 2 | Médio | — | AP-6 |

**PRD-15 (condicional):** re-chaveamento da chave de envelope — pendente de decisão (`07-perguntas-pendentes.md`).

## 8. Roadmap, cronograma e priorização

5 ondas (M0–M4) em `06-roadmap-dimensionamento.md`. Ordem de grandeza: ~5–8 semanas para M0–M4 com paralelismo. Priorização = impacto × esforço × objetivo; classificações contraintuitivas (04a alto-esforço na Onda 1; 09 fora do caminho externo mas na Onda 0) justificadas ali.

## 9. Fornecedores/SaaS — o que acontece se o terceiro for comprometido

- **Supabase** (DB sp011+central+Storage): comprometimento → leitura/escrita dos bancos do sp011/central e do Storage dos replicados. Responsabilidade compartilhada: durabilidade gerenciada **só** do lado Supabase; **pg-blogs NÃO** (daí PRD-09). Segredos no banco estão cifrados (bom).
- **Hostinger (VPS)**: comprometimento do host/SSH → tudo (root nos containers agrava, PRD-07).
- **Gemini/OpenAI/Perplexity/Apify**: processam conteúdo (LGPD Art. 33, PRD-12); chaves cifradas e mascaradas.
- **Meta/Buffer**: publicação social; tokens cifrados. Comprometimento → impersonação nas redes.

## 10. Checklist de cobertura

**Coberto a fundo (~70-80%):** auth/authz (ambos), ingest HMAC, pipeline IA/prompts, SSRF (proxy+scrape), uploads, crypto/segredos, isolamento multi-tenant, infra (compose/Caddy/Dockerfiles), central-web render, sanitizadores. **Não coberto linha-a-linha (declarado):** `articleService.ts`, schemas Drizzle a fundo, `scrapeWithDiffbot`, services `collector/distributor/videoPublisher`, OAuth Meta/Buffer completo, rotas `analytics/push/queue/realtime-stats/dbConfigAdmin`, **runtime da VPS** e **`pnpm audit`** (entra no PRD-10). Detalhe em `04-plano-auditorias.md` §Cobertura.

## 11. Perguntas pendentes

6 perguntas (2 mudam escopo: PRD-15 e matriz de papéis do PRD-02; 4 de verificação de runtime). Detalhe em `07-perguntas-pendentes.md`. **Nenhuma bloqueia o início da implementação** das Ondas 0–1.

---

> **Próximo passo:** revisão dos 17 PRDs pelo usuário. Após aprovação, a implementação segue a ordem de `06-roadmap-dimensionamento.md`, atualizando `STATUS.md` a cada PRD concluído. Mudanças em auth/segredos/dados sensíveis exigem revisão humana antes do merge/deploy.
