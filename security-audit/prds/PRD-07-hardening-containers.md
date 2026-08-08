# PRD-07 — Hardening de runtime dos containers (non-root, cap_drop, remover `--no-sandbox`)

> **Metadados:** Onda 3 | Longo Prazo | Esforço Alto | Dependências: nenhuma | **REVISÃO HUMANA OBRIGATÓRIA + CANÁRIO** (Chromium/volumes podem quebrar).
> Achado de origem: **F9** (mapa de riscos) / **AP-11** (amplificador, threat model).
> Este PRD é autocontido: toda referência a arquivo/linha e todo comando estão escritos aqui.

---

## Objetivo

Reduzir o raio de explosão de um RCE (via HTML atacante no Playwright/Chromium ou dependência comprometida) impedindo que ele escape para o host como **root** e alcance todos os tenants. Faz isso rodando os 4 containers de aplicação como **usuário não-root**, aplicando **least-privilege de kernel** no compose (`cap_drop: ALL`, `no-new-privileges`, `read_only` onde possível, `mem_limit`, `healthcheck`) e removendo `--no-sandbox` do Chromium (ou, se o canário provar inviável, mantendo-o apenas dentro de um container não-root e travado, com o risco residual registrado e sinalizado para revisão humana).

---

## Contexto / Evidência de origem

**Achado F9 — Containers root + Chromium `--no-sandbox`** (`security-audit/02-mapa-riscos.md:57`; classificação **Alto**, "Fato/Alta"). Confirmado por leitura direta dos arquivos em 2026-07-21:

- **Nenhum dos 4 Dockerfiles de aplicação declara `USER`** — o processo Node roda como **root (uid 0)** no runtime. Confirmado com `grep -rn "USER" artifacts/*/Dockerfile` → **0 ocorrências**. Estágios de runtime:
  - `artifacts/api-server/Dockerfile:47` — `FROM ... node:24-bookworm-slim AS runtime`; `CMD` em `:65` (`node --enable-source-maps dist/index.mjs`); copia o workspace inteiro em `:54` (`COPY --from=build /app /app`) e o Chromium em `:56` (`COPY --from=build /ms-playwright /ms-playwright`).
  - `artifacts/brasilia-agora/Dockerfile:17` — runtime; `CMD` em `:31` (`pnpm run serve` = `vite preview`); copia workspace em `:27`.
  - `artifacts/central-hub/Dockerfile:33` — runtime; `CMD` em `:41` (`node ... dist/index.mjs`); copia workspace em `:38`.
  - `artifacts/central-web/Dockerfile:14` — runtime; `CMD` em `:22` (`pnpm run start`); copia workspace em `:19`.
- **Chromium lançado com `--no-sandbox`** em `artifacts/api-server/src/lib/social/renderTemplate.ts:36` (e `--disable-setuid-sandbox` em `:37`), dentro do array `args` de `chromium.launch(...)` (linhas 33-41). Isso desativa a sandbox de processo do Chromium — a principal barreira contra um HTML/JS malicioso que explore o renderizador.
- **Nenhum compose aplica hardening de runtime.** Confirmado com `grep -rn "cap_drop\|no-new-privileges\|read_only\|mem_limit\|healthcheck\|security_opt\|tmpfs" docker-compose.yml deploy/blog-template/compose.yml` → **0 ocorrências**. Os serviços em `docker-compose.yml` (`api`, `web`, `central-api`, `central-web`, `pg-blogs`, `ollama`, `caddy`) e em `deploy/blog-template/compose.yml` (`api`, `web`) sobem com **todas as capabilities default do Docker**, `no-new-privileges` desligado, filesystem gravável e **sem limite de memória** — inclusive o `ollama` (`docker-compose.yml:113-132`), que já consumiu ~13 GiB residentes (maior consumidor da VPS de 31 GiB) e pode causar OOM que derruba os demais tenants.
- **Base sem pin de digest:** todos os runtimes usam `node:24-bookworm-slim` sem `@sha256:...` (tag mutável).

**Risco concreto (attack path AP-11 — `security-audit/03-threat-model.md:52`):**
> "**AP-11 (amplificador) — Escape de container (F9).** Root + `--no-sandbox` → RCE (via HTML atacante no Playwright ou dependência) escapa para host como root → todos os tenants. STRIDE: **E**. Amplifica AP-1/AP-2. Mitiga: PRD-07."

O componente **Chromium render** no STRIDE por componente (`security-audit/03-threat-model.md:64`) pede explicitamente: "Sandbox real (sem `--no-sandbox`, non-root, seccomp), egress restrito (07)". Plano de auditoria (`security-audit/04-plano-auditorias.md:74-77`): "Containers root, sem cap_drop/no-new-privileges — A05; CWE-250/CWE-16; ATT&CK T1611; Alto ~7.0"; "Chromium `--no-sandbox` — A05; CWE-693; Alto ~7.5"; "Sem mem_limit/healthcheck — A05; CWE-400; Médio".

**Referências normativas:** OWASP Top 10 **A05:2021 (Security Misconfiguration)**; **CWE-250** (Execution with Unnecessary Privileges); **CWE-269** (Improper Privilege Management); **CWE-693** (Protection Mechanism Failure); **CWE-16** (Configuration); **CWE-400** (Uncontrolled Resource Consumption); MITRE ATT&CK **T1611** (Escape to Host). CVSS aproximado do achado: **~7.0-7.5 (Alto)** como amplificador.

---

## Pré-condições

- [ ] **Branch dedicado:** `git checkout -b fix/prd-07-hardening-containers`
- [ ] **Baseline de testes registrado** (comando exato — rodar e anotar a saída em `security-audit/STATUS.md` como linha-base ANTES de qualquer mudança):
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
  ```
  (Este PRD não altera lógica de aplicação testada por `node --test`; o baseline serve para provar que nada regrediu. `artifacts/central-hub` e `lib/news-engine` também têm suites, mas não são tocados aqui.)
- [ ] **Ler ANTES de editar** (todos já lidos na origem deste PRD; reler para reancorar linhas, pois números podem ter deslocado):
  - `docker-compose.yml` (raiz)
  - `deploy/blog-template/compose.yml`
  - `artifacts/api-server/Dockerfile`
  - `artifacts/brasilia-agora/Dockerfile`
  - `artifacts/central-hub/Dockerfile`
  - `artifacts/central-web/Dockerfile`
  - `artifacts/api-server/src/lib/social/renderTemplate.ts`
  - `security-audit/03-threat-model.md` (AP-11, linha 52) e `security-audit/06-roadmap-dimensionamento.md:44` (nota de canário)
- [ ] **Confirmar acesso ao canário na VPS.** Escolher UM blog replicado de baixo risco como canário (ex.: `resenhavip` — já é o canário padrão dos rollouts, ver CLAUDE.md §6). NENHUMA mudança de runtime vai para todos os blogs antes de o canário passar no smoke test de render social.
- [ ] **Alertar o operador humano ANTES de mergear/deployar:** este PRD é **Esforço Alto** e toca **runtime de produção** (permissões de volume `/data` com `db-config.enc` e uploads, sandbox do Chromium, limites de memória do Ollama). Requer revisão humana + observação de canário. Não fazer commit direto na `main` sem sinal verde do operador.

---

## Escopo (ações em ordem)

> Regra geral: o usuário `node` (uid/gid **1000**) **já existe** na imagem `node:24-bookworm-slim` — preferir reusá-lo a criar um usuário novo. Onde um volume nomeado é montado em `/data`, a imagem precisa ter esse diretório pré-criado e com dono `node` ANTES do primeiro `up` num volume novo (o Docker copia as permissões do diretório da imagem para um volume nomeado recém-criado). Volumes JÁ EXISTENTES (root) exigem `chown` manual na VPS — ver ação 12.

### A. Non-root nos 4 Dockerfiles

1. **`artifacts/api-server/Dockerfile` (estágio `runtime`, após `:56` e antes do `CMD` em `:65`):** garantir que os diretórios que o processo escreve pertençam ao `node`. O api-server grava em `/data` (uploads do sp011 em `/data/uploads`, `/data/db-config.enc`) e usa o Chromium em `/ms-playwright` (leitura). Adicionar, ao final do estágio runtime, antes do `CMD`:
   - `RUN mkdir -p /data && chown -R node:node /data /app` (o `chown -R /app` é necessário porque o workspace foi copiado como root em `:54`; sem isso o processo `node` não lê symlinks/`node_modules` com permissões restritas — validar no canário se o `-R /app` é realmente necessário ou se basta `/data` + leitura; se `/app` já for legível por outros, restringir a `chown /data` para não inflar a imagem).
   - `USER node` imediatamente antes do `CMD ["node", "--enable-source-maps", "dist/index.mjs"]`.
   - **Atenção Chromium:** o binário do sandbox (`chrome_sandbox` / `chrome-sandbox`) em `/ms-playwright/**/chrome_sandbox` precisa de `setuid root` (dono root, modo 4755) para a sandbox SUID funcionar sob usuário não-root. Ver ação 9 (decisão de sandbox). Se a decisão for manter `--no-sandbox`, esse ajuste não é necessário.
2. **`artifacts/brasilia-agora/Dockerfile` (estágio `runtime`, antes do `CMD` em `:31`):** adicionar `RUN chown -R node:node /app` e `USER node` antes de `CMD ["pnpm", "run", "serve"]`. Este container não monta `/data` (sem volume no compose) e só serve estático via `vite preview` — non-root é direto.
3. **`artifacts/central-hub/Dockerfile` (estágio `runtime`, antes do `CMD` em `:41`):** o central-api monta `central_data:/data` (grava `/data/news-images` e `/data/social-videos`). Adicionar `RUN mkdir -p /data && chown -R node:node /data /app` e `USER node` antes de `CMD ["node", "--enable-source-maps", "dist/index.mjs"]`.
4. **`artifacts/central-web/Dockerfile` (estágio `runtime`, antes do `CMD` em `:22`):** adicionar `RUN chown -R node:node /app` e `USER node` antes de `CMD ["pnpm", "run", "start"]`. Sem volume; non-root direto.

### B. Least-privilege de kernel no compose (raiz)

> Aplicar por serviço em `docker-compose.yml`. NÃO usar uma âncora YAML compartilhada que force `read_only` em serviços que precisam gravar — cada serviço tem necessidades diferentes. `pg-blogs`, `ollama` e `caddy` usam imagens de terceiros que gravam no próprio filesystem: para esses, NÃO aplicar `read_only`; aplicar apenas `mem_limit`/`healthcheck`/`security_opt` conforme abaixo.

5. **`api` (`docker-compose.yml:8-40`):** adicionar
   - `security_opt: ["no-new-privileges:true"]`
   - `cap_drop: ["ALL"]` (o api-server não precisa de nenhuma capability para ouvir em porta 8080 >1024; só adicionar `cap_add` se o canário provar necessidade — ex.: sandbox do Chromium, ver ação 9).
   - `mem_limit` (ex.: `mem_limit: 2g` — dimensionar pela RAM residente observada; o container carrega sharp + Playwright).
   - `healthcheck` batendo num endpoint HTTP interno já existente (verificar rota de saúde disponível; se não houver, usar `CMD-SHELL` com `node -e` fazendo um GET em `http://127.0.0.1:8080/` e checando status — NÃO criar rota nova neste PRD; se nenhuma rota servir, usar `test` de porta TCP via `node -e`).
   - **`read_only: true` + `tmpfs`:** aplicar SOMENTE se o canário confirmar que o api-server não grava fora de `/data` e de `/tmp`. Playwright/Chromium precisam de `/tmp` gravável e de `/dev/shm` (o código já passa `--disable-dev-shm-usage` em `renderTemplate.ts:38`, o que reduz a dependência de `/dev/shm`). Configuração alvo: `read_only: true`, `tmpfs: ["/tmp"]`, mantendo o volume `api_data:/data` gravável. Se `read_only` quebrar o Chromium no canário, deixar `read_only` de fora deste serviço e registrar a exceção no STATUS.md (o `cap_drop`+`no-new-privileges`+non-root já entregam o núcleo do controle).
6. **`web` (`docker-compose.yml:42-59`):** `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`, `mem_limit` (ex.: `768m`), `healthcheck` (GET em `http://127.0.0.1:3000/`), `read_only: true` + `tmpfs: ["/tmp"]` (vite preview serve estático — bom candidato a read-only; validar no canário).
7. **`central-api` (`docker-compose.yml:65-80`):** `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`, `mem_limit`, `healthcheck` (porta 8090). Mantém `central_data:/data` gravável; `read_only` só se validado.
8. **`central-web` (`docker-compose.yml:82-92`):** `security_opt`, `cap_drop: ["ALL"]`, `mem_limit`, `healthcheck` (porta 3001), `read_only: true` + `tmpfs: ["/tmp"]` (candidato a read-only).
9. **`ollama` (`docker-compose.yml:113-132`) — PRIORIDADE anti-OOM:** adicionar **`mem_limit`** (dimensionar acima do pico observado do modelo `qwen2.5:7b-instruct` — visto ~13 GiB; considerar `mem_limit: 16g` para dar folga ao KV cache de `OLLAMA_CONTEXT_LENGTH=16384`, sem estourar os 31 GiB junto com Postgres/apps). Adicionar `security_opt: ["no-new-privileges:true"]` e `healthcheck` (GET em `http://127.0.0.1:11434/` ou `/api/tags`). **NÃO** aplicar `read_only` (grava modelos em `/root/.ollama`) nem `cap_drop: ALL` sem validar (imagem de terceiros; testar no canário antes de dropar capabilities).
10. **`pg-blogs` (`docker-compose.yml:98-108`):** adicionar `mem_limit` (ex.: `4g`), `security_opt: ["no-new-privileges:true"]` e `healthcheck` (`CMD-SHELL pg_isready -U postgres`). **NÃO** `read_only` nem `cap_drop: ALL` (Postgres oficial precisa gravar em `/var/lib/postgresql/data` e usa capabilities). Já tem `shm_size: 256mb` (`:101`) — manter.
11. **`caddy` (`docker-compose.yml:134-154`):** `mem_limit` (ex.: `512m`), `healthcheck` (checar `:2019` admin ou GET em `http://127.0.0.1:80`). Caddy liga em 80/443 (portas <1024): NÃO fazer `cap_drop: ALL` cego — se dropar tudo, precisa `cap_add: ["NET_BIND_SERVICE"]`. Alternativa mais simples: manter capabilities default do Caddy e aplicar só `mem_limit`+`healthcheck`+`no-new-privileges`. Decidir e registrar.

### C. Least-privilege no template dos blogs replicados

12. **`deploy/blog-template/compose.yml` (serviços `api` `:9-23` e `web` `:25-44`):** espelhar o hardening dos serviços `api`/`web` da raiz (ações 5 e 6): `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`, `mem_limit`, `healthcheck`, e `read_only`+`tmpfs` conforme validado no canário. Este arquivo é o molde copiado para cada `/opt/blogs/<id>/` — a mudança só vale para blogs criados/atualizados depois; blogs já provisionados precisam do compose atualizado manualmente (documentar no procedimento de deploy, ação 16).

### D. Migração de permissão de volume (procedimento de VPS, não é código)

13. **Documentar no STATUS.md e no bloco de deploy** o `chown` único dos volumes JÁ EXISTENTES (root-owned) para `node:node`, pois volumes nomeados com dados preexistentes NÃO herdam as novas permissões da imagem. Comando de migração (rodar na VPS, uma vez por volume/serviço afetado, ANTES de subir a versão non-root):
   ```bash
   cd /opt/sp011
   docker compose run --rm --user root api  chown -R node:node /data
   docker compose run --rm --user root central-api chown -R node:node /data
   # para cada blog replicado com volume api_data já populado:
   # cd /opt/blogs/<id> && docker compose run --rm --user root api chown -R node:node /data
   ```
   Sem este passo, o container non-root falha ao ler `db-config.enc`/gravar uploads → wizard/uploads/social quebram.

### E. Sandbox do Chromium (o item mais arriscado — decisão explícita)

14. **`artifacts/api-server/src/lib/social/renderTemplate.ts:35-41`:** meta é **remover `--no-sandbox` e `--disable-setuid-sandbox`** (linhas 36-37), rodando o Chromium sob sandbox real. Executar a decisão nesta ordem, guiada pelo canário (ação 17):
    - **Tentativa 1 (preferida):** remover `--no-sandbox` e `--disable-setuid-sandbox`; rodar o container **non-root** com a sandbox SUID habilitada (garantir `chrome_sandbox` com `setuid root`, modo 4755, na ação 1) **ou** com sandbox de user-namespace. Para o namespace sandbox funcionar em Docker, ou o host permite `unprivileged_userns_clone` **ou** o serviço `api` recebe `cap_add: ["SYS_ADMIN"]`. Se optar por `SYS_ADMIN`, isso reintroduz privilégio — preferir a sandbox SUID (não precisa de SYS_ADMIN) e manter `cap_drop: ALL`.
    - **Tentativa 2 (fallback, só se a 1 falhar no canário):** manter `--no-sandbox` **exclusivamente** dentro do container já travado (non-root + `cap_drop: ALL` + `no-new-privileges` + seccomp default), documentar o **risco residual** (CWE-693) em `security-audit/STATUS.md` e **sinalizar para revisão humana** — non-root+cap_drop já reduz drasticamente o impacto de AP-11 mesmo com `--no-sandbox`. NÃO considerar o PRD 100% concluído nesse caso; marcar como "parcial — sandbox real pendente" no STATUS.md.
    - Manter `--disable-dev-shm-usage` (`:38`), `--disable-gpu` (`:39`) e `--font-render-hinting=none` (`:40`) — não são de segurança e o primeiro evita dependência de `/dev/shm` sob `read_only`.

### F. Higiene de imagem (secundário — só se não introduzir risco de quebra)

15. **Pin de digest da base (baixo risco, recomendado):** em cada `FROM ... node:24-bookworm-slim` dos 4 Dockerfiles (estágios build e runtime), fixar `node:24-bookworm-slim@sha256:<digest>` obtendo o digest atual na VPS com `docker buildx imagetools inspect node:24-bookworm-slim`. Aplicar o MESMO digest nos 4 arquivos.
16. **Enxugar runtime (OPCIONAL — deferível; alto risco de quebrar):** hoje o runtime copia o workspace inteiro (`COPY --from=build /app /app`), incluindo fontes `.ts`, `.map` e `node_modules` de build. Reduzir a superfície é desejável, MAS o esbuild externaliza dependências resolvidas via **symlinks do pnpm** e o runtime carrega `node_modules` (sharp/playwright) — remover arquivos cegamente quebra a resolução. Se implementar: apenas remover `**/*.ts` e `**/src` de pacotes já compilados APÓS o build, validando `node --test` + boot + render no canário. **Se houver qualquer risco de quebrar a resolução de módulos, PULAR este item** e registrar como "não feito por risco" no STATUS.md — não é o núcleo do controle F9.

### G. Deploy e verificação

17. **Rollout de canário obrigatório** (procedimento na VPS): buildar as imagens novas, subir SÓ no blog canário, rodar o smoke test de render social (ação abaixo) e conferir que api/central/web/central-web sobem saudáveis ANTES de propagar aos demais. Ver "Comandos de verificação".

---

## Fora de escopo

- **NÃO** alterar `SESSION_SECRET`, `SETTINGS_ENCRYPTION_KEY` nem qualquer segredo/env de aplicação. Este PRD é runtime/infra, não re-chaveamento (isso é o PRD-01a/01b).
- **NÃO** mudar a lógica de render social além de remover as flags de sandbox (linhas 36-37); o pipeline de arte social, o template e o WYSIWYG permanecem idênticos.
- **NÃO** publicar novas portas no host nem alterar TLS/CSP/borda — isso é o **PRD-08** (F10). Não tocar no `caddy` além de `mem_limit`/`healthcheck`.
- **NÃO** restringir egress de rede do container (allowlist de saída/SSRF) — isso pertence ao PRD-06a/06b e a evoluções futuras; aqui só reduzimos privilégio local.
- **NÃO** adicionar backup do `pg-blogs` (PRD-09) nem rate limit/anti-bomba (PRD-11), mesmo que o `mem_limit` do Ollama toque o mesmo tema de recursos.
- **NÃO** hardcodar nada por blog na imagem compartilhada (regra de isolamento do CLAUDE.md); o hardening é idêntico para todos os tenants.
- **NÃO** aplicar `read_only`/`cap_drop: ALL` em `pg-blogs`/`ollama` sem validação — imagens de terceiros que gravam no próprio FS.

---

## Comandos de verificação

> Bloco 1 (grep/estático) roda no ambiente de dev (Windows/Git Bash). Blocos 2-4 (docker) rodam **na VPS** — Docker não builda imagens grandes localmente (CLAUDE.md §14). Para cada comando está declarado o que caracteriza SUCESSO.

```bash
# === BLOCO 1 — estático (dev, Git Bash na raiz do repo) ===
cd "c:/Users/Usuario(a) Master/sp011"

# 1a) Não pode haver --no-sandbox no CÓDIGO-FONTE (ignora dist/ buildado, que é gitignored).
grep -rn "no-sandbox" artifacts/api-server/src lib/ artifacts/central-hub/src
# SUCESSO na Tentativa 1: 0 ocorrências.
# Na Tentativa 2 (fallback aprovado por humano): a única ocorrência é a linha
# documentada em renderTemplate.ts, e há entrada correspondente no STATUS.md.

# 1b) USER non-root deve existir nos 4 Dockerfiles de runtime.
grep -rn "USER node" artifacts/api-server/Dockerfile artifacts/brasilia-agora/Dockerfile artifacts/central-hub/Dockerfile artifacts/central-web/Dockerfile
# SUCESSO: 4 ocorrências (uma por arquivo), cada uma antes do respectivo CMD.

# 1c) Hardening presente nos serviços de aplicação do compose raiz.
grep -n "no-new-privileges\|cap_drop\|mem_limit\|healthcheck" docker-compose.yml
# SUCESSO: aparece para api, web, central-api, central-web (e mem_limit também
# para ollama e pg-blogs). Confirmar visualmente por serviço.

# 1d) Hardening espelhado no template dos blogs replicados.
grep -n "no-new-privileges\|cap_drop\|mem_limit\|healthcheck" deploy/blog-template/compose.yml
# SUCESSO: aparece para api e web.

# 1e) Typecheck do api-server (única mudança de código é em renderTemplate.ts).
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run typecheck
# SUCESSO: sem erros de tipo.

# 1f) Suite de testes do api-server sem regressão vs. baseline.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
# SUCESSO: mesmo resultado do baseline registrado nas Pré-condições (sem novas falhas).

# 1g) Build do api-server (esbuild roda localmente).
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && pnpm run build
# SUCESSO: build conclui sem erro.
```

```bash
# === BLOCO 2 — compose válido e efetivo (VPS) ===
cd /opt/sp011
git pull
docker compose config >/dev/null && echo "compose OK"
# SUCESSO: "compose OK" (YAML válido; nenhum erro de schema).

docker compose config | grep -A2 "no-new-privileges\|cap_drop\|mem_limit"
# SUCESSO: o config RENDERIZADO mostra cap_drop=[ALL], no_new_privileges e
# mem_limit resolvidos para api/web/central-api/central-web (e mem_limit p/ ollama).
```

```bash
# === BLOCO 3 — migração de volume + build + canário (VPS) ===
cd /opt/sp011
# 3a) chown único dos volumes existentes ANTES de subir non-root:
docker compose run --rm --user root api          chown -R node:node /data
docker compose run --rm --user root central-api  chown -R node:node /data
# SUCESSO: comandos retornam 0.

# 3b) bump de versão de imagem e build (rollout padrão, CLAUDE.md §6):
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
docker compose build api web central-api central-web
docker compose up -d api web central-api central-web ollama
# SUCESSO: build completa; containers sobem.

# 3c) processo roda como non-root (uid 1000) dentro de cada container:
for s in api web central-api central-web; do echo -n "$s: "; docker compose exec -T $s id -u; done
# SUCESSO: cada linha imprime 1000 (não 0).

# 3d) saúde dos containers:
docker compose ps
# SUCESSO: api/web/central-api/central-web/ollama = Up (healthy) após o healthcheck estabilizar.

# 3e) canário do blog replicado (ex.: resenhavip) recebe a nova tag e sobe:
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
docker compose run --rm --user root api chown -R node:node /data   # se volume preexistente
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
# SUCESSO: retorna o siteName do PRÓPRIO blog (não mistura tenant); container Up.
```

```bash
# === BLOCO 4 — SMOKE TEST do render social (VPS, o gate crítico) ===
# Gerar UMA arte social pelo fluxo real (Admin → Redes Sociais → gerar/pré-visualizar
# arte, ou reenfileirar um post na fila social_publication_queue) e confirmar que
# o Chromium iniciou e produziu imagem.
cd /opt/sp011
docker compose logs --since 5m api | grep -i "Chromium iniciado\|browser quente\|render"
# SUCESSO: aparece "Social render: Chromium iniciado (browser quente)" e NENHUM
# erro de launch do Chromium (ex.: "Failed to launch", "Running as root without
# --no-sandbox", "No usable sandbox").
# E: a arte social gerada é uma imagem válida (PNG/JPEG não-vazio) visível no admin/fila.
# FALHA a tratar: se o Chromium não iniciar sem --no-sandbox → aplicar a decisão da
# ação 14 (Tentativa 2 / fallback) e registrar no STATUS.md antes de propagar.
```

---

## Critérios de aceite

- [ ] `grep -rn "no-sandbox" artifacts/api-server/src lib/ artifacts/central-hub/src` retorna **0** (Tentativa 1) OU exatamente 1 ocorrência documentada + entrada de risco residual no STATUS.md aprovada por humano (Tentativa 2/fallback).
- [ ] `grep -rn "USER node"` nos 4 Dockerfiles de runtime retorna **4 ocorrências**, cada uma antes do respectivo `CMD`.
- [ ] `docker compose exec -T <svc> id -u` retorna **1000** para `api`, `web`, `central-api`, `central-web` (não 0/root).
- [ ] `docker compose config` renderiza `cap_drop: [ALL]`, `no_new_privileges: true` e `mem_limit` para os 4 serviços de aplicação; `mem_limit` também presente para `ollama` e `pg-blogs`.
- [ ] `deploy/blog-template/compose.yml` contém `security_opt`/`cap_drop`/`mem_limit`/`healthcheck` para `api` e `web`.
- [ ] `docker compose ps` mostra os 4 serviços de aplicação **Up (healthy)**; o canário `resenhavip` sobe e `/api/site` devolve o siteName correto (sem mistura de tenant).
- [ ] **Smoke test do render social passa no canário:** a fila social gera uma imagem válida e os logs mostram "Chromium iniciado" sem erro de launch/sandbox.
- [ ] `docker compose run --rm --user root api chown -R node:node /data` foi executado nos volumes preexistentes (api sp011 + central + blogs replicados) — o wizard/uploads/`db-config.enc` continuam funcionando sob non-root (validar login no `/admin` do canário e um upload).
- [ ] `pnpm run typecheck`, `node --test` (== baseline) e `pnpm run build` do api-server passam.
- [ ] Base `node:24-bookworm-slim` fixada por `@sha256:` (mesmo digest nos 4 Dockerfiles) — OU registrado no STATUS.md por que foi adiado.
- [ ] `security-audit/STATUS.md` atualizado com: decisão de sandbox (Tentativa 1 vs 2), quais serviços receberam `read_only`, valores de `mem_limit` escolhidos, resultado do smoke test e número/hash do canário.

---

## Definition of Done

Os 4 containers de aplicação (`api`, `web`, `central-api`, `central-web`) rodam como usuário **non-root (uid 1000)** com `cap_drop: ALL` + `no-new-privileges`, com `mem_limit` e `healthcheck` definidos (Ollama e pg-blogs com `mem_limit`); o render social continua gerando imagens válidas no **canário**; a mudança está mergeada na `main` **somente após revisão humana e canário verde**; e o `--no-sandbox` foi removido (Tentativa 1) **ou** o risco residual do fallback está explicitamente documentado no STATUS.md e sinalizado para o operador. Uploads/wizard/social operam normalmente sob non-root (volumes `/data` migrados).

---

## Dependências

- **Nenhuma dependência dura.** Pode rodar em paralelo com qualquer outro PRD.
- **Complementaridade (não bloqueante):** o PRD-08 (borda: parar de publicar `web:3000`, CSP/HSTS) e o PRD-06a/06b (SSRF/egress) endereçam camadas vizinhas do mesmo raio de explosão; não há acoplamento de código com este PRD.
- **Ordem recomendada no roadmap:** Onda 3 (Longo Prazo) — por ser o mais arriscado/custoso e exigir canário, roda depois das ondas de correção de fronteira (PRD-01..06/08).

---

## Prioridade e esforço

- **Prioridade:** **Longo Prazo (Onda 3).** É amplificador (AP-11), não vetor de entrada direto; alto valor defensivo, mas alto custo/risco operacional.
- **Esforço:** **Alto.** Toca 4 Dockerfiles + 2 composes + 1 arquivo de código + migração de permissão de volume em produção + investigação da sandbox do Chromium sob non-root (a parte imprevisível) + rollout de canário.

---

## Plano de rollback

- **Reverter código/config:** `git revert <hash-do-merge>` do branch `fix/prd-07-hardening-containers` (restaura Dockerfiles como root, composes sem hardening e `renderTemplate.ts` com `--no-sandbox`).
- **Reconstruir e subir a versão anterior na VPS** (mapeamento CLAUDE.md §5: `api-server`→`api`; `brasilia-agora`→`web`; `central-hub`→`central-api`; `central-web`→`central-web`):
  ```bash
  cd /opt/sp011
  git pull
  docker compose build api web central-api central-web
  docker compose up -d api web central-api central-web ollama
  ```
  Para reverter um blog replicado, restaurar o `BLOG_IMAGE_TAG` anterior no `.env` do blog e `docker compose up -d`.
- **Rollback parcial sem revert total (preferível durante o canário):**
  - Se o **Chromium não iniciar** sem `--no-sandbox`: reintroduzir `--no-sandbox`/`--disable-setuid-sandbox` em `renderTemplate.ts:36-37` MANTENDO non-root + `cap_drop`/`no-new-privileges` (fallback da ação 14) — o núcleo do controle F9 (não-root) permanece.
  - Se um serviço não subir por `read_only`: remover apenas `read_only`/`tmpfs` daquele serviço no compose, mantendo `cap_drop`/`no-new-privileges`/non-root.
  - Se o container non-root falhar por **permissão de volume**: rodar o `chown` da ação 13 (`docker compose run --rm --user root <svc> chown -R node:node /data`); se ainda assim quebrar, reverter só o `USER` daquele Dockerfile e registrar no STATUS.md.
  - Se `mem_limit` do Ollama causar OOM-kill do modelo: aumentar o valor ou removê-lo temporariamente (mantém os demais limites).
- **Nota:** `git revert` NÃO reverte o `chown` já aplicado aos volumes — mas `node:node`/root são compatíveis com a imagem root anterior (root lê tudo), então não há ação de rollback necessária para as permissões.

---

## Notas de execução para o agente

- **Trabalhe SOMENTE neste PRD (PRD-07).** Não misture com PRD-06a/06b (SSRF/egress), PRD-08 (borda/ports) nem PRD-11 (rate limit/anti-bomba), mesmo que toquem infra/recursos.
- **Canário é obrigatório e vem antes da `main`.** Nunca propague a versão non-root/sem-`--no-sandbox` para todos os blogs sem o smoke test de render social verde no canário (Bloco 4). O maior risco é o Chromium não iniciar sob sandbox real ou o volume `/data` ficar ilegível para o usuário non-root.
- **Regras do repo a respeitar:** imports de teste com extensão `.ts` explícita; `node --test` dentro do pacote; typecheck por pacote (o filtro da raiz não casa no Windows); build de frontend só no Docker da VPS; nunca unicode literal em regex (`\uXXXX`); nunca incluir valores de segredo em comandos.
- **Isolamento:** o hardening é idêntico para todos os tenants — não hardcodar nada por blog na imagem compartilhada.
- **Se QUALQUER critério de aceite falhar após implementar, NÃO marque como concluído:** registre o motivo exato (comando, saída, `arquivo:linha`, e a decisão de sandbox tomada) em `security-audit/STATUS.md` (criar o arquivo se não existir, uma entrada por PRD) e **PARE**. Em especial, se apenas a Tentativa 1 da sandbox falhar e o fallback (Tentativa 2) for adotado, marque o PRD como **"parcial — sandbox real pendente"**, não como concluído.
- **Ao concluir com sucesso, atualize `security-audit/STATUS.md`** com: PRD-07, hashes de commit, resultado dos comandos de verificação (Blocos 1-4), decisão de sandbox (1 vs 2), serviços com `read_only`, valores de `mem_limit`, e o identificador do canário validado.
- **REVISÃO HUMANA OBRIGATÓRIA antes do merge/deploy:** esforço Alto, toca runtime de produção (permissões do volume com `db-config.enc`/uploads, sandbox do Chromium, limites de memória do Ollama que, mal dimensionados, causam OOM que derruba todos os tenants). Sinalizar explicitamente ao operador antes de mergear na `main` e antes de propagar do canário para os demais blogs.
