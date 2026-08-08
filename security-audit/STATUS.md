# STATUS — Auditoria e Hardening de Segurança (sp011)

**Última atualização:** 2026-07-22
**Fase atual:** DEPLOY EM PRODUÇÃO CONCLUÍDO e validado (push + VPS, imagem v43) — os 17 PRDs estão rodando em produção (mãe + central + 7 replicados, non-root). Restam sub-partes deferidas (enforce/rotação/purge) e as Fases 6-7 (mem_limit pg-blogs/ollama, backup offsite) — ver "Deploy em produção" abaixo.

## Modelo de entrega (decidido 2026-07-21)
Cada PRD autorizado é implementado como **commit(s) na `main` LOCAL**, verificado localmente (`node --test` + typecheck + greps de aceite), **sem `git push`**. Como a VPS faz deploy por `git pull` da `origin/main`, nada chega a produção enquanto não houver push — o usuário controla o momento (push + `git pull` + rebuild direcionado). Isso segue a convenção do repo (CLAUDE.md §5, commit direto na main) e resolve a dependência entre PRDs (ex.: 06b enxerga o `safeFetch` do 06a na mesma main). Passos irreversíveis/produção continuam com o operador.

## Deploy em produção (2026-07-22) — CONCLUÍDO e validado
Push de `af28071` para `origin/main` (fast-forward `0779a4d..af28071`, 13 commits; os 4 PRDs 06a/05/06b/09 já estavam em `origin` de antes → **17/17 publicados**). Deploy na VPS na imagem **`blog-api:v43`**:
- **mãe (sp011) + central + 7 replicados** (ksports, resenhavip, esporteagora, oleysports, beeesportes, pontofarma, creditovc) todos na imagem endurecida, rodando **non-root `uid=1000(node)`** (PRD-07), com `cap_drop:ALL`/`no-new-privileges`/`mem_limit`/`healthcheck`.
- **Validado:** site sp011 no ar + **CSP Report-Only** na borda; schema aplicado no boot (`ingest_nonces` PRD-14, `tokens_valid_from` PRD-03, `central_audit_log` PRD-02); escrita nos volumes OK; **anti-mistura limpa** (cada domínio = próprio nome); **ingest fim-a-fim `POST /api/ingest` → 201** em produção (PRD-14 nonce + PRD-03 auth confirmados).
- **GOTCHA do PRD-07 descoberto no deploy:** volume preexistente é dono `root`; o `chown` para `node` DEVE ser via `docker run` PURO (`docker run --rm --user root -v <vol>:/data blog-api:<tag> chown -R node:node /data`) — `docker compose run` falha ("Operation not permitted") por herdar o `cap_drop:ALL` do serviço. Runbook: `deploy/DEPLOY_SEGURANCA.md`; memória `prd07-nonroot-chown-volume`. **Entra em todo go-live novo com PRD-07.**
- **Fase 6 CONCLUÍDA (2026-07-22):** `mem_limit` aplicado — pg-blogs recriado (4g, healthy, replicados reconectaram) e ollama já tinha 16g (sem cold-start).
- **Fase 7 (PRD-09) CONCLUÍDA em modo interino-local (2026-07-22):** rclone+gpg instalados; `/opt/blog-ctl/` com scripts + `backup.pass` (0600); remote `offsite` = alias local `/opt/backups-offsite` (troca por B2/S3 sem mexer nos scripts). 1º backup real: **7 bancos** dumpados+cifrados (MANIFEST sha256) + espelho no alias. **TESTE DE RESTORE (gate) PASSOU:** beeesportes restaurado do dump cifrado → **25 tabelas** (`restore_test_*`, dropado depois). O gate pegou bug real: `pg_restore` sem `-U postgres` (role root) — fix commit `40b2a12`. **Pendente:** passphrase salva offline (operador), remote offsite REAL (provedor a escolher) + `systemctl enable --now sp011-backup.timer`.
- **Deferidos seguem deferidos:** enforce gate/CSP + HSTS preload, `--no-sandbox`, purge/rotação VAPID, cookie HttpOnly, ensureSchema fail-loud, retentionSweep apply.

## Resumo (2-3 linhas)
Planejamento, threat model e os 17 PRDs concluídos e verificados (auto-checagem 5.3 — todos passam). Implementação em andamento na `main` local (sem push/deploy); itens de revisão humana/canário ficam para o usuário. PRD-13 e PRD-14 aguardam verificação do usuário antes de implementar.

---

## Fases concluídas
- [x] Fase 0.1 — Objetivo (`00-objetivo.md`)
- [x] Fase 0 — Inventário técnico (`00-inventario-tecnico.md`)
- [x] Fase 1 — Entendimento do sistema (`01-entendimento-sistema.md`)
- [x] Fase 2 — Mapa de riscos (`02-mapa-riscos.md`)
- [x] Fase 3 — Threat model STRIDE (`03-threat-model.md`)
- [x] Fase 4 — Plano de auditorias (`04-plano-auditorias.md`)
- [x] Fase 5.1 — Estratégia de PRDs (`05-estrategia-prd.md`)
- [x] Fase 5.2/5.3 — 17 PRDs escritos e verificados (`prds/`)
- [x] Fase 6 — Roadmap (`06-roadmap-dimensionamento.md`)
- [x] Fase 7 — Perguntas pendentes (`07-perguntas-pendentes.md`)
- [x] Resumo executivo (`resumo-executivo.md`)

## Checagem de consistência dos PRDs (5.3) — VEREDITO
Todos os 17 PRDs foram lidos e **passam**: autocontidos, `arquivo:linha` reais, escopo imperativo, critérios verificáveis por comando, rollback e sinalização de revisão humana/canário. Fonte da verdade dos achados: `02-mapa-riscos.md` (F1–F19) e `03-threat-model.md` (AP-1–AP-11).

---

## Rastreador de implementação

Legenda: `PENDENTE` · `EM ANDAMENTO` · `CONCLUÍDO (código)` = commit na `main` local + verificação local verde (sem push) · `AGUARDANDO USUÁRIO` · `BLOQUEADO: <motivo>`.
Regra de operação desta sessão: implementar o **código-seguro** como commit na **`main` local, sem `git push`** (ver "Modelo de entrega"); **não** executar passos irreversíveis/produção (rotação de segredo vivo, purge de histórico git, virar gate para `enforce`, remover `--no-sandbox`, expurgo real de dados) — esses ficam com o usuário/operador com o runbook pronto.

| PRD | Onda | Estado | Branch | Observação |
|---|:--:|---|---|---|
| 01a Rotação VAPID | 0 | CONCLUÍDO (Parte A código) | main (local, sem push) | `.replit` desrastreado + VAPID removido + gitignorado; docs mandam gerar par novo (não reusar); **Parte B (rotação por blog na VPS + confirmar chave de envelope) = operador/REVISÃO HUMANA**; valor antigo segue no histórico até o PRD-01b (purge) |
| 01b Segredos em repouso + purge git | 2 | CONCLUÍDO (Frentes 1-2 código) | main (local, sem push) | `twoFactorSecret` cifrado at-rest (setup encrypta, verify/disable/login decriptam; migração idempotente no boot) + fail-closed `assertEncryptionConfigured` em prod nos 2 apps; news-engine 137/137, api 80/80, typechecks ok; **Frente 3 (purge do histórico git + force-push) = operador/REVISÃO HUMANA** (destrutivo; `.replit` já gitignorado no 01a) |
| 02 RBAC central + auditoria | 2 | CONCLUÍDO (código) | main (local, sem push) | `requireCentralRole` (módulo puro `rbac.ts`) em 23 rotas admin-only (blogs/settings/sources/rules/social); trilha `central_audit_log` + `logAudit`/`buildAuditRow`; 91/91 testes, typecheck ok; auth NÃO tocado; **revisão humana (lockout) + break-glass** = operador antes do deploy |
| 03 Auth do blog | 2 | CONCLUÍDO (Partes A-C código) | main (local, sem push) | Webhook key escopada a publish-only (`publishAuth`, sem admin) + revogação de token (`tokens_valid_from`/`passwordChangedAt`) + fail-closed (503/fallback rate limit); 57/57 testes, 4 typechecks ok; **Parte D (cookie do central) deferida** (frontend VPS + revisão humana; 04b já mitiga o XSS) |
| 04a Sanitização write-path | 1 | CONCLUÍDO (FASE A código) | main (local, sem push) | Sanitizador canônico parser (cheerio, SEM dep nova) em `lib/news-engine/src/sanitizeHtml.ts`; ingest+AMP+gate consomem; bateria de bypass verde; **FASE B (enforce)** = shadow ≥72h + humano; **step 6 SSR frontend** = follow-up de VPS (risco #418) |
| 04b central-web DOMPurify | 1 | CONCLUÍDO (código) | main (local, sem push) | dompurify ^3.2.4 + helper `lib/sanitize.ts`; 3 `dangerouslySetInnerHTML` (News/Review/NewArticle) sanitizados; typecheck ok; CSP backstop do PRD-08 já entregue (report-only no bloco central); verificação de comportamento (img onerror) = VPS pós-deploy |
| 05 Injeção indireta de prompt | 1 | CONCLUÍDO (código) | main (local, sem push) | neutralizeUntrusted + fronteiras nos 4 pontos de entrada + espelho rssProcessor byte-idêntico; news-engine 121/121, api-server 49/49, central-hub 86/86, typecheck ok |
| 06a SSRF proxy de imagem | 1 | CONCLUÍDO (código) | main (local) — commit 82139c4 | `safeFetch` entregue; 49/49 testes, typecheck ok; deploy `api` + canário = operador |
| 06b SSRF autenticado | 2 | CONCLUÍDO (código) | main (local, sem push) | portão assertAllowedTarget no article-from-url + safeFetch nos 4 fetch de URL-do-usuário + espelho `lib/news-engine/src/safeFetch.ts`; news-engine 125/125, api-server 53/53, typecheck ok; canário de 422/coleta = operador |
| 07 Hardening containers | 3 | CONCLUÍDO (código/config) | main (local, sem push) | `USER node` (non-root) nos 4 Dockerfiles + `cap_drop`/`no-new-privileges`/`mem_limit`/`healthcheck` no compose raiz (api/web/central-api/central-web) e template; `mem_limit` p/ ollama(16g)/pg-blogs(4g)/caddy; **`--no-sandbox` MANTIDO** (Tentativa 2/fallback — remoção real = canário do operador); build/canário/`chown` de volumes + digest pin = operador/REVISÃO HUMANA |
| 08 Borda override/CSP | 0→1 | CONCLUÍDO (código) | main (local, sem push) | Onda 0: override renomeado→`docker-compose.local.yml` (não mais auto-mesclável); Onda 1: CSP **report-only** nos 3 blocos do Caddyfile + backstop CSP na rota AMP; **enforce** e deploy Caddy/api = operador (canário); HSTS preload = decisão humana (não aplicado) |
| 09 Backups pg-blogs | 0/3 | CONCLUÍDO (código) | main (local, sem push) | 8 artefatos em `deploy/blog-ctl/` (backup/restore/units/README); Bloco 1 estático 100% verde; Blocos 2-4 (backup real + teste de restore + agendamento) = operador/VPS (GATE do PRD é o teste de restore) |
| 10 CI/CD de segurança | 0/3 | CONCLUÍDO (código) | main (local, sem push) | `.github/workflows/security.yml` (gitleaks+pnpm audit+CodeQL, todos report-only) + `dependabot.yml` + `.gitleaks.toml` (.replit allowlisted→PRD-01); `pnpm audit` executado e triado; supply chain intacta; efeito só após push (GitHub Actions) |
| 11 Custo/DoS | 3 | CONCLUÍDO (código) | main (local, sem push) | Portão de cota SEMPRE pode fechar (default 500, sem "ilimitado"); rate limit em article-from-url/uploads/image; sharp `limitInputPixels`=50MP+timeout+validação de upload; Playwright timeout/semáforo/recycle; central-hub 96/96, api-server 62/62, typechecks ok; canário de cota/429 = operador |
| 12 LGPD | 4 | CONCLUÍDO (código) | main (local, sem push) | `docs/LGPD.md` (registro de tratamento + base legal + Art. 33 + retenção + Art. 18 + consentimento); `dataRetention.ts` puro + `retentionSweep.ts` (DRY-RUN por padrão, dupla trava `RETENTION_APPLY=1`+`--apply`) + build entry; 84/84, typecheck ok; fallback IA NÃO flipado, analytics sem IP; **dry-run/expurgo real = operador+REVISÃO HUMANA**; banner de consentimento (frontend) = opcional/operador |
| 13 Robustez operacional | 4 | CONCLUÍDO (Partes A+C código) | main (local, sem push) | Handler de erro global nos 2 apps (sem `err.message`/stack em prod) + fim dos 3 leaks; sink de alerta (`securityAlert`) + `logSecurity` no 401 do ingest; api-server 80/80, central 96/96; **Parte B (ensureSchema fail-loud) DEFERIDA** (service-blocking, revisão humana + validação em staging); verificado pelo usuário |
| 14 Integridade do ingest | 2 | CONCLUÍDO (código) | main (local, sem push) | Nonce persistido (`ingest_nonces`, fail-closed) + fim do TOCTOU (centralId no insert atômico, 23505→replay) + adopt-guard endurecido (`SETUP_ALLOW_ADOPT` em prod + log `ADOPT_EXISTING_INSTALL`); 69/69 testes, typechecks ok; `signing.ts` intacto; verificado pelo usuário |

## Perguntas abertas que afetam a implementação
- Rotação da chave de envelope/`SESSION_SECRET` → PRD-15 ou risco aceito? (`07-perguntas-pendentes.md` #1)
- Matriz de papéis do PRD-02 (o que o `operator` pode) — default: admin-only nas sensíveis.

---

## Log por PRD
(cada PRD escreve aqui seu baseline, hashes de commit e resultado dos comandos de verificação ao concluir)

### PRD-06a — SSRF proxy de imagem + safeFetch
- Estado: **CONCLUÍDO (código)** — branch `fix/prd-06a-ssrf-proxy-imagem` (2026-07-21).
- Arquivos: novo `artifacts/api-server/src/lib/safeFetch.ts` (isPrivateOrReservedIp/assertAllowedTarget/safeFetch); `routes/image.ts` `fetchOriginRaw` roteado por `safeFetch`; novo `test/safeFetch.test.ts`.
- Decisão http/https: **`allowHttp: false`** (https-only). Mantida a linha 221 da rota (aceita http), mas o `safeFetch` rejeita http → degrada para placeholder. Se o canário mostrar imagens http legítimas virando placeholder, setar `allowHttp: true` restrito à allowlist.
- Resíduo aceito: janela TOCTOU de DNS-rebinding entre resolução e connect (documentado no cabeçalho de `safeFetch.ts`); o bloqueio de redirect + resolução de DNS fecham o vetor prático do AP-2.
- Verificação local: `node --test` 49/49 pass; `pnpm run typecheck` exit 0; `grep` de `await fetch(`/`redirect:"follow"` em image.ts = 0; `newsImage.ts` inalterado.
- **Pendente (operador/VPS):** rebuild `api` + canário da taxa de `X-Image-Cache: PLACEHOLDER` por ≥24h. Commit na `main` local (82139c4), **sem push**.

### PRD-05 — Injeção indireta de prompt
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push.
- Arquivos: `lib/news-engine/src/prompts.ts` (neutralizeUntrusted exportado; fronteiras no DEFAULT/TRANSLATION/CLASSIFY; buildTranslationPrompt/buildClassifyPrompt puros; PROMPT_VERSION 1.1.0); `lib/news-engine/src/ai/rewrite.ts` (usa os construtores puros); `lib/news-engine/src/ai/perplexity.ts` (aviso no system + fronteiras/neutralização no userPrompt); espelho `artifacts/api-server/src/lib/rssProcessor.ts` (template byte-idêntico + cópia de neutralizeUntrusted); novo teste `lib/news-engine/test/promptInjection.test.ts`.
- **Desvio consciente do PRD:** a neutralização de tradução/classificação vive nos construtores `buildTranslationPrompt`/`buildClassifyPrompt` em `prompts.ts` (passo 8 do PRD manda extrair funções puras), então `grep neutralizeUntrusted rewrite.ts` = 0 por design; o equivalente está em `prompts.ts` (13 refs) e `rewrite.ts` chama os construtores. Propriedade de segurança preservada.
- Verificação local: news-engine `tsc -b` limpo + `node --test` 121/121; api-server `node --test` 49/49 + typecheck ok; central-hub `node --test` 86/86; `prompt-mirror.test.ts` verde (template byte-idêntico entre os dois espelhos); greps de aceite OK (fronteiras nos 2 espelhos, neutralize no applyPromptTemplate dos 2, perplexity avisa, PROMPT_VERSION 1.1.0).
- Nota: a defesa de SAÍDA (gate `enforce`/`containsDangerousHtml`) é do **PRD-04a** — esta é camada de entrada, complementar. Conexão com PRD-12 (PII→Ollama-only) anotada, não implementada aqui.
- **Pendente (operador/VPS):** deploy `api` + `central-api`; spot-check de 3-5 reescritas (PROMPT_VERSION 1.1.0 permite correlacionar). **Sem push.**

### PRD-06b — SSRF autenticado (article-from-url + scrape)
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push. Depende do `safeFetch` do 06a (presente na mesma main).
- Arquivos: `artifacts/api-server/src/routes/admin.ts` (portão síncrono `assertAllowedTarget(url, () => true, {allowHttp:false})` no topo do `article-from-url`, antes de qualquer request/Diffbot; `safeFetch` no fetch og-fallback e no `scrapeYouTube`); `artifacts/api-server/src/lib/rssProcessor.ts` (`scrapeArticle` via `safeFetch`); novo espelho `lib/news-engine/src/safeFetch.ts` (fronteira de pacote composite); `lib/news-engine/src/scrape.ts` (`scrapeArticle` via `safeFetch`); testes novos `test/ssrfArticleFromUrl.test.ts` (api-server) e `test/ssrfScrape.test.ts` (news-engine).
- **Nuance do grep de aceite (documentada):** (1) o critério `grep "fetch(url," rssProcessor.ts = 0` do PRD casa por substring com `safeFetch(url,` — usei `await fetch(url` (fetch cru) como padrão real. (2) `grep "await fetch(url" rssProcessor.ts` ainda mostra `callOllama` (linha ~266): ali a var `url` é o endpoint INTERNO do Ollama (`http://ollama:11434/v1/...`), NÃO a URL do usuário — está corretamente fora de escopo (envolvê-lo no safeFetch bloquearia o host interno e quebraria a IA). O único fetch cru de URL-do-usuário (`scrapeArticle`) foi convertido. (3) ordem dos checks em `assertAllowedTarget`: protocolo antes do IP — logo `http://<ip-interno>` retorna `protocol_not_allowed` (não `ssrf_blocked`); a URL é rejeitada de qualquer forma. Os testes usam `https://<ip-interno>` para exercitar o bloqueio de IP e provam que ele sobrevive a `allowHttp:true`.
- Diffbot/oEmbed/HEAD de thumbnail (host fixo `api.diffbot.com`/`www.youtube.com`/`img.youtube.com`) mantidos como fetch direto (não são SSRF da nossa rede) — confirmado por grep.
- Verificação local: news-engine `tsc -b` + `node --test` 125/125; api-server `node --test` 53/53 + typecheck ok.
- **Pendente (operador/VPS):** deploy `api` + `central-api`; canário da taxa de 422 de `article-from-url` e de falha da coleta em fontes legítimas (https) por ≥24h; se fontes http legítimas caírem, `allowHttp:true` mantendo o IP-block. **Sem push.**

### PRD-09 — Backups e durabilidade do pg-blogs
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push. Puramente aditivo (só `deploy/blog-ctl/`, nenhum código de app tocado).
- Arquivos: `deploy/blog-ctl/` com `backup-blog.sh` (pg_dump -Fc | gpg AES256 → rclone; enumera bancos dinamicamente; valida não-vazio; MANIFEST sha256; retenção local/offsite), `backup-volumes.sh` (tar cifrado dos volumes `*_api_data`/`*_central_data` descobertos por `docker volume ls`), `restore-blog.sh` (guarda: DROP só p/ prefixo `restore_test_`, produção exige `--force`), `backup.conf.example`, `.gitignore` (protege `backup.conf`/`*.pass`), `sp011-backup.service`/`.timer` (systemd, 03:30 diário), `README.md` (runbook copy-paste sem heredoc: pré-reqs, aviso INEGOCIÁVEL da passphrase offline, teste de restore obrigatório, restore de desastre, "NUNCA docker system prune --volumes").
- Verificação local (Bloco 1): 8 artefatos presentes; `bash -n` OK nos 3 scripts; `grep "<<"` = 0 (sem heredoc); `grep` de segredo hardcodado = 0; backup-blog usa pg_dump+gpg+rclone; `.gitignore` protege. Scripts marcados executáveis (`git update-index --chmod=+x`). `node --test` do api-server inalterado (aditivo).
- **Pendente (operador/VPS — GATE):** instalar gnupg/rclone + passphrase + remoto; rodar backup real (Bloco 2); **executar o teste de restore (Bloco 3) ao menos uma vez** (contagens de tabelas/linhas iguais à origem) — o PRD só é DONE com isso; instalar o timer/cron (Bloco 4). Guardar a passphrase OFFLINE. **Sem push.**

### PRD-10 — CI/CD de segurança
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push. Aditivo (só `.github/**` + `.gitleaks.toml`); nenhum código de app, `pnpm-workspace.yaml`/`.npmrc`/`package.json` tocados (git diff vazio).
- Arquivos: `.github/workflows/security.yml` (jobs `secret-scan`/gitleaks@v2, `sca`/pnpm audit, `codeql`, TODOS `continue-on-error` — report-only; pnpm@9 + node22 + `--frozen-lockfile`); `.github/dependabot.yml` (npm + github-actions, semanal, limite 5, agrupado); `.gitleaks.toml` (allowlist do `.replit`→PRD-01a/01b, com lembrete de remover pós-purge).
- **`pnpm audit` executado (triagem, 2026-07-21):** 5 vulns — **1 high** `brace-expansion` (GHSA-3jxr-9vmj-r5cp, cadeia dev `lib/api-spec>orval>typedoc>minimatch`), **3 moderate** `js-yaml 5.x` (GHSA-724g-mxrg-4qvm, dev via orval — nota: é major 5, diferente do override `>=4.2.0`), `protobufjs` (GHSA-j3f2-48v5-ccww, via `@google/genai`), +1; **1 low** `body-parser` (GHSA-v422-hmwv-36x6, via express). Todas em cadeias de dev/tooling ou exigem input malicioso não recebido. Os overrides de CVE do repo (undici/qs/uuid/markdown-it/@babel/core) **NÃO aparecem** → confirmados resolvidos. **Não corrigidos** aqui (follow-up: bump quando conveniente; risco baixo).
- **Nuance de grep:** `grep "npm install"` casa por substring com `pnpm install` (falso-positivo) — não há `npm`/`yarn install` real; CI usa pnpm frozen-lockfile.
- Baseline: só arquivos novos de CI adicionados; nenhum arquivo de código/config de app modificado (diff vazio), api-server permanece 53/53.
- **Pendente (operador/GitHub — decisão humana):** (1) os workflows só rodam **após push** (observar aba Actions); (2) Dependabot abrirá os **primeiros PRs** do repo — mergear/ignorar (não bloqueia); (3) **recomendação (não aplicada):** ligar Settings→Code security→**Secret Scanning + Push Protection** (compatível com commit-direto-na-main, sem exigir PR); (4) remover o allowlist do `.replit` quando o PRD-01b concluir o purge. **Sem push.**

### PRD-08 — Borda: override/ports + CSP/HSTS
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push.
- **Onda 0 (override):** `git mv docker-compose.override.yml → docker-compose.local.yml` (nome NÃO auto-mesclável de propósito) + cabeçalho de comentário atualizado (instrui `-f` explícito p/ teste local). Isso sozinho já torna o runbook seguro — `docker compose up -d` sem `-f` deixa de publicar `web:3000` no host. O doc-fix do CLAUDE.md §5/§6 ficou como **nota** (não editado; a renomeação basta, per PRD ação 3).
- **Onda 1 (CSP report-only + AMP):** `Caddyfile` — `header Content-Security-Policy-Report-Only "..."` dentro do `handle {}` de frontend dos 3 blocos (snippet `(blog)`, `{$SITE_DOMAIN}`, `{$CENTRAL_DOMAIN}`) — **NÃO** no header de topo (evita colidir com o helmet de `/api`). `amp.ts`: trocado `removeHeader("Content-Security-Policy")` por `setHeader` de CSP apropriada ao AMP (permite `cdn.ampproject.org` + inline; trava object-src/base-uri/frame-ancestors).
- **POLÍTICA CSP CANÔNICA do projeto (o PRD-04b consome esta string como backstop):**
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
- Verificação local: override auto-mesclável não existe; `3000:3000` só em `docker-compose.local.yml`; CSP report-only em 3 blocos do Caddyfile; `amp.ts` 0 removeHeader / 1 CSP; api-server 53/53 + typecheck ok. (`caddy validate` = VPS.)
- **Revisão humana obrigatória preservada** (o passo override muda exposição de rede) — nada é deployado sem seu push + `git pull` na VPS.
- **Pendente (operador/VPS — canário):** deploy `docker compose up -d web` (conferir `docker compose config | grep published` sem 3000) + `up -d --force-recreate caddy` + `build api`; navegar site/admin/central com DevTools na fase report-only; **endurecer** `-Report-Only`→`Content-Security-Policy` só após canário limpo; propagar backstop AMP aos blogs (rollout de imagem §6). **HSTS `preload` = decisão humana (quase irreversível, cobre `*.midia.run`) — NÃO aplicado.** **Sem push.**

### PRD-04a — Sanitização canônica write-path + gate por parser (FASE A)
- Estado: **CONCLUÍDO (FASE A, código)** — commit na `main` local (2026-07-21), sem push. FASE B e step 6 (SSR) deferidos (ver abaixo).
- **Decisão de engine:** usei **cheerio** (já dependência do news-engine) em vez de jsdom/DOMPurify. Motivo: evita nova superfície de supply chain (que o PRD manda submeter a revisão humana + `minimumReleaseAge` do repo bloquearia) E evita o risco de puxar jsdom/cheerio ao bundle do cliente (#418). O PRD lista cheerio como alternativa aceitável.
- Arquivos: novo `lib/news-engine/src/sanitizeHtml.ts` (FONTE ÚNICA: `sanitizeArticleHtml`/`sanitizeAmpHtml`/`containsDangerousHtml`, allowlist por parser + limpeza de `on*`/`style`/URLs `javascript:`/`data:`/`vbscript:` inclusive ofuscadas com tab); `index.ts` + `package.json` (subpath `./sanitize`); `validate.ts` (gate usa `containsDangerousHtml`, removida a regex `DANGEROUS_HTML`); `api-server/lib/ingestSanitize.ts` (delega à canônica, 0 regex); `api-server/routes/amp.ts` `toAmpHtml` (delega a `sanitizeAmpHtml`); testes novos `sanitizeHtml.test.ts` (bateria de bypass svg/math/aninhado/data/tab) + extensões em `validate.test.ts`/`ingestSanitize.test.ts`.
- **Nota mXSS:** `<scr<script>ipt>` é PARSEADO pelo cheerio como texto inerte (`ipt&gt;alert(1)`) — `sanitizeArticleHtml` o neutraliza; o detector retorna false porque, pós-parse, não há nó perigoso (e o write-path/DOMPurify do 04b re-sanitizam). Teste reflete isso (neutralização exigida sempre; detecção do raw só quando produz nó perigoso real).
- Verificação local: news-engine `tsc -b` + `node --test` 137/137; api-server `node --test` 54/54 + typecheck ok; central-hub 86/86; greps de aceite: `.replace` em ingestSanitize=0, `const DANGEROUS_HTML`=0, subpath `./sanitize` presente, 3 consumidores importam a canônica.
- **DEFERIDO — step 6 (SSR do frontend `brasilia-agora/src/lib/sanitize.ts`):** NÃO tocado. Alterar o `stripDangerousHtml` do SSR arriscaria divergir do DOMPurify do cliente e disparar hydration mismatch #418 (incidente documentado no arquivo), validável só com o build vite na VPS. Fica como follow-up de VPS (o write-path já sanitiza o conteúdo armazenado; o SSR trata HTML de settings do próprio admin).
- **DEFERIDO — FASE B (gate `enforce`):** NÃO virei `store.ts:140` para `enforce`. Exige janela de SHADOW ≥72h em `log` + revisão humana dos números + ajuste de allowlist (senão gera artigos vazios). Rollback instantâneo já existe (toggle `validationMode` na UI do central, sem deploy).
- **Pendente (operador/VPS):** deploy `api` + `central-api`; validar bundle do cliente sem cheerio/jsdom e sem #418 na home SSR; rodar SHADOW e só então FASE B. **Sem push.**

### PRD-04b — Defesa de saída no central-web (DOMPurify)
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push. Fecha o SINK do AP-1 (render cru no admin → XSS → exfil do central_token).
- Arquivos: `artifacts/central-web/package.json` (+`dompurify: ^3.2.4`, mesma versão do blog), `pnpm-lock.yaml` (reusado do store — dompurify já existia via brasilia-agora), novo `src/lib/sanitize.ts` (helper `sanitizeHtml` = DOMPurify html-profile), e os 3 `dangerouslySetInnerHTML` (`News.tsx`, `Review.tsx`, `NewArticle.tsx`) agora via `sanitizeHtml(...)`.
- Verificação local: typecheck ok; `grep` de `dangerouslySetInnerHTML` sem `sanitize`/`DOMPurify` = 0; dompurify no package.json e lockfile.
- Backstop CSP do **PRD-08** já entregue (CSP report-only no bloco `{$CENTRAL_DOMAIN}` do Caddyfile).
- **Pendente (operador/VPS):** `docker compose build central-web && up -d central-web`; verificação de comportamento — no preview de `/nova-noticia` com `<img src=x onerror="window.__xss=1">`, confirmar `window.__xss===undefined` e sem atributo `onerror` no DOM. **Sem push.**

### PRD-02 — RBAC do central + trilha de auditoria
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push. **Revisão humana obrigatória (lockout) antes do deploy.**
- Modelo de papéis: `admin` (default do schema + seed → TODOS os usuários atuais já são admin, ninguém é trancado) e `operator` (nasce sem usuários). Guard trata papel legado/desconhecido como sem privilégio.
- Arquivos: `middlewares/rbac.ts` (NOVO, `requireCentralRole` — módulo PURO só com tipos do express, para ser testável sem DB; `auth.ts` re-exporta p/ as rotas); `lib/auditRow.ts` (NOVO, `buildAuditRow` puro, só `import type` de central-db) + `lib/auditLog.ts` (`logAudit` fire-and-forget); schema `lib/central-db/src/schema/central_audit_log.ts` (+ export no index) + `CREATE TABLE IF NOT EXISTS` no `ensureSchema.ts`; guards em **23 rotas** (blogs POST/PATCH/DELETE/rotate-secret; settings PUT/pools/prompts; sources CRUD/run/run-cycle; rules CRUD; social 7 credenciais); `logAudit` em blogs (create/delete/rotate — meta SEM segredo) e settings (update/ai_key.add/remove/prompts); `test/rbac.test.ts` (NOVO).
- **Nota de typing:** adicionar o guard como middleware posicional muda o overload do Express 5 e widen `req.params.X` para `string | string[]`; corrigido com cast `as string` (o param é single-value). Auth/HMAC/token **não** tocados (só re-export do guard).
- **Decisões/deferimentos:** (1) `sources`/`rules` = admin-only (política ajustável — rebaixar p/ operator é 1 palavra/rota se o operador precisar no dia a dia); (2) `logAudit` no `news.ts` (publicação manual) ficou como follow-up menor (não é gate; a auditoria dos itens que tocam segredo — blogs/settings — está feita); (3) `logAudit` em social = guards aplicados, logAudit por-rota é follow-up.
- Verificação local: `tsc -b` do lib/central-db ok; central-hub typecheck ok; `node --test` 91/91 (5 RBAC novos); guard exportado; auth intacto (diff sem generateToken/verifyToken/HMAC); nenhum segredo em `logAudit`.
- **Pendente (operador/VPS — revisão humana):** confirmar ≥1 admin ativo (break-glass: `UPDATE central_users SET role='admin' WHERE email=...`); `docker compose build central-api && up -d central-api`; verificar 1 linha em `central_audit_log` por ação privilegiada (com user_id, sem segredo em meta) e 403 p/ operator. **NÃO reverter em lockout** — usar break-glass. **Sem push.**

### PRD-03 — Fronteiras de auth do blog (Partes A-C)
- Estado: **CONCLUÍDO (Partes A-C, código)** — commit na `main` local (2026-07-21), sem push. **REVISÃO HUMANA (fail-closed pode auto-bloquear) antes do deploy.** **Parte D (cookie do central) DEFERIDA** (ver abaixo).
- **Parte A (F7/AP-4 — webhook key escopada):** removido o ramo da webhook key do `authMiddleware` (não vira mais admin global); novo `publishAuth` (ÚNICO ponto que reconhece a key — só seta `req.isWebhookKey`, nunca papel admin) aplicado em `webhook.ts` (`POST /` e `POST /:id`); removido o bypass `|| req.isWebhookKey` de `permissions.ts`.
- **Parte B (F14 — revogação):** coluna `tokens_valid_from` (schema `lib/db` + `ensureSchema`); `verifyToken` expõe `issuedAt`; `authMiddleware` rejeita (401) token com `issuedAt < max(passwordChangedAt, tokensValidFrom)`; `POST /logout` grava `tokensValidFrom` + invalida cache (fim do no-op); troca de senha invalida cache.
- **Parte C (fail-closed):** no erro de DB do `authMiddleware`, não confia mais no papel do token — usa cache fresco OU nega com 503; `checkRateLimit` usa fallback de rate limit em memória em vez de `return true` (fail-open).
- **Refactor de testabilidade:** funções puras de token/senha movidas para `middlewares/token.ts` (só crypto, sem `@workspace/db`) e re-exportadas por `auth.ts` — para o `node --test` conseguir importá-las sem o dir-import do barrel de `lib/db` (mesmo padrão do PRD-02). `auth.ts`/HMAC/TTL de 8h preservados.
- Verificação local: `lib/db` `tsc -b` ok; api-server typecheck ok + `node --test` 57/57 (3 novos de revogação); greps de aceite = 0 nas atribuições fail-open/admin, `publishAuth`/`tokens_valid_from`/logout/senha presentes.
- **DEFERIDO — Parte D (F4-storage / AP-1 — token do central em cookie HttpOnly):** NÃO implementada. Requer `cookie-parser` no central-hub + mudanças em `app.ts`/`auth.ts`/`routes/auth.ts` (central-hub) e refatoração de `api.ts`/`Login.tsx`/`App.tsx` (central-web, build só valida na VPS) + revisão humana. O **PRD-04b (DOMPurify)** já mitiga o XSS que leria o token do localStorage; Parte D é defesa em profundidade. Follow-up.
- **Pendente (operador/VPS — revisão humana):** deploy `api`; verificar (curl) que a webhook key dá 401 em `/api/admin/*` e 200/201 em `/api/publish`; que logout/troca-de-senha invalidam o token antigo (401); testar comportamento do fail-closed sob falha de DB (usar cache/reiniciar, NUNCA reintroduzir fail-open). **Sem push.**

### PRD-11 — Custo/DoS (teto de cota, rate limits, anti-bomba)
- Estado: **CONCLUÍDO (código)** — commit na `main` local (2026-07-21), sem push. **CANÁRIO + revisão humana** (muda economia de IA e worker de render).
- **A (F13):** `dailyQuota.ts` sem o curto-circuito "capless → ilimitado"; lógica pura em `dailyQuotaCore.ts` (`isDailyQuotaFilled` + `DEFAULT_MAX_POSTS_PER_DAY=500`, override `CENTRAL_DEFAULT_MAX_POSTS_PER_DAY`) — o portão SEMPRE pode fechar. Default ALTO (canário: poder fechar, não estrangular).
- **B (F19-ratelimit):** `endpointRateLimit` parametrizado (defaults = comportamento antigo, ingest/publish intactos); aplicado em `article-from-url` (20/min, block 15min), uploads (60/min) e `/api/image` (240/min — canário; alto porque um pageview dispara dezenas).
- **C (F11-bomba):** `imageTransform.ts` `sharp(raw, {limitInputPixels: MAX_INPUT_PIXELS=50MP, failOn:"error"}).timeout(15s)` (fonte única do cap); `uploads.ts` valida dimensões via `sharp().metadata()` antes de gravar (413/422).
- **D (Playwright):** `renderGuards.ts` (puro, testável): `runWithTimeout` (timeout global 20s), semáforo `MAX_CONCURRENT_RENDERS=2`, recycle a cada `RENDERS_BEFORE_RECYCLE=200` (só quando sem render concorrente); `renderArt` adquire slot + timeout + recycle.
- **Refactor de testabilidade:** `dailyQuotaCore.ts` e `renderGuards.ts` puros (sem central-db/playwright/social-template) — mesmo motivo do PRD-02 (barris com dir-import quebram node --test).
- Verificação local: central-hub `node --test` 96/96 + typecheck ok; api-server `node --test` 62/62 (dailyQuota/renderGuards/imageTransform.bomb) + typecheck ok; greps de aceite todos OK.
- **Pendente (operador/VPS — 2 canários ≥24h):** (1) portão fecha com fila cheia mesmo sem teto por blog E nenhum blog legítimo bate 500; (2) 429 em `/api/image`//uploads só sob abuso (se pageview legítimo tomar 429, subir o limite). **Sem push.**
