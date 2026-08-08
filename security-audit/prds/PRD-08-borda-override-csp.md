# PRD-08 — Borda: fim do bypass do Caddy (override/ports) e política CSP/HSTS

> **Metadados** — Onda **0** (passo override) → Onda **1** (passo CSP) | Prioridade: **Quick Win** | Esforço: **Médio** | Dependências: **nenhuma** | **CANÁRIO** (CSP em `Content-Security-Policy-Report-Only` antes de endurecer) | **Revisão humana obrigatória** antes do merge/deploy do passo override (toca a borda de rede / exposição pública) e antes de qualquer decisão de HSTS `preload`.
>
> Este PRD é **autocontido**. O agente que o implementar NÃO precisa da conversa que o gerou: todas as referências arquivo:linha, o desenho da solução e os comandos de verificação estão escritos abaixo. Todos os números de linha foram confirmados por leitura direta do repositório em 2026-07-21.
>
> Este PRD é o **DONO da política CSP** do projeto. O **PRD-04b** (defesa de saída no `central-web`) **consome** a diretiva CSP definida aqui como backstop. O **PRD-04a** trata a *sanitização do corpo AMP* (o HTML de `toAmpHtml`); aqui tratamos apenas a *presença do cabeçalho CSP* na resposta AMP — os dois tocam `amp.ts` mas em concerns distintos (coordenar para evitar conflito de merge).

---

## Objetivo

Fechar a **fronteira de borda** do sistema em duas frentes: (1) **parar de publicar `web:3000` no host** — hoje o `docker-compose.override.yml` (auto-mesclado pelo `docker compose up -d` sem `-f`) expõe o frontend do sp011 direto em `http://<IP>:3000`, **sem TLS e sem os security headers do Caddy**; e (2) **definir e aplicar uma política de CSP de borda** para o HTML do frontend (snippet de blog + sp011 + painel central), iniciando em `Content-Security-Policy-Report-Only` (canário) para não quebrar o SPA e depois endurecendo, além de dar um **backstop de CSP na rota AMP** em vez de remover o cabeçalho sem substituto.

---

## Contexto / Evidência de origem

### Achado F10 — override publica `web:3000`, runbook não usa `-f` (bypass do Caddy)

- **`docker-compose.override.yml:11-14`** (lido em 2026-07-21):
  ```yaml
  services:
    web:
      ports:
        - "3000:3000"   # publica a porta do vite preview no host
  ```
  O comentário do arquivo (linhas 1-10) diz que é "APENAS para teste local no Docker Desktop", mas ele tem o **nome auto-mesclável** `docker-compose.override.yml` — o `docker compose` mescla esse arquivo automaticamente sobre `docker-compose.yml` **sempre que o comando roda sem `-f`**.
- **`docker-compose.yml:42-59`** define o serviço `web` com apenas `expose: ["3000"]` (interno, só o Caddy alcança). O override **adiciona** a publicação no host.
- **Runbook usa `up -d` sem `-f`** — portanto o override É mesclado em produção:
  - `CLAUDE.md` §5 (linhas 130-131): `docker compose build <serviços afetados>` / `docker compose up -d <serviços afetados>`.
  - `CLAUDE.md` §6 (linhas 155-156): `docker compose build api web` / `docker compose up -d api web`.
- **Consequência:** o frontend do sp011 fica acessível em `http://<IP-da-VPS>:3000` **sem HTTPS** e **sem nenhum** dos headers de segurança que o Caddy injeta (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy — `Caddyfile:37-44`). MITM/interceptação em texto claro + anulação das defesas client-side.
- Fonte no mapa de riscos: **`security-audit/02-mapa-riscos.md:58`** — *"F10 | Override publica web:3000 no host; runbook usa `up -d` sem `-f` | `docker-compose.override.yml:11-14`; CLAUDE.md §5/§6 | **Alto** | AP 3,4 | Hipótese/Média (depende do runtime)"*.
- Plano de auditorias: **`security-audit/04-plano-auditorias.md:76`** — *"Override publica web:3000 (bypass do Caddy) | A05; CWE-16/CWE-319 | Alto ~7.4 | F10 → PRD-08"*.

### CSP de borda ausente + AMP remove CSP

- O `Caddyfile` injeta bons headers em todos os blocos, **mas nenhum `Content-Security-Policy`** para o HTML do frontend:
  - snippet `(blog)` — `Caddyfile:13-20` (HSTS/X-CTO/X-Frame/Referrer/Permissions, **sem CSP**);
  - bloco `{$SITE_DOMAIN}` (sp011) — `Caddyfile:37-44` (idem, **sem CSP**); comentário 34-36 confirma: *"O helmet cobre apenas /api/*; o HTML servido pelo vite preview não tinha nenhum destes headers."*;
  - bloco `{$CENTRAL_DOMAIN}` (painel) — `Caddyfile:65-73` (idem, **sem CSP**).
- A **única** CSP existente é a do helmet, aplicada só a `/api/*` (**`artifacts/api-server/src/app.ts:124-145`**), e ela ainda usa **`'unsafe-inline'`** em `script-src` (`app.ts:129`) e `style-src` (`app.ts:130`).
- A rota AMP **remove** a CSP sem substituto: **`artifacts/api-server/src/routes/amp.ts:169`** → `res.removeHeader("Content-Security-Policy");` (comentário na linha 168: *"AMP requires no CSP restriction on script-src for the AMP runtime"*). A rota AMP é `GET /api/amp/artigos/:slug` (mounted em `routes/index.ts:50` `router.use(ampRouter)`, e o router principal em `app.ts:189` `app.use("/api", router)`) — logo a resposta AMP passa pelo `handle /api/*` do Caddy e fica **sem nenhuma CSP** após o `removeHeader`.

### Attack path e STRIDE

- **AP-3 — Frontend sem borda (F10)** (`security-audit/03-threat-model.md:44`): *"`up -d` sem `-f` → web:3000 sem TLS/CSP → MITM + anula defesas client-side do AP-1. STRIDE: **T, I, S**. Mitiga: PRD-08."*
- Trust boundary #1 (`03-threat-model.md:22`): *"Internet → Caddy (TLS/headers). **Furada por F10 (web:3000 direto)**."*
- STRIDE por componente — linha **Borda (Caddy/override)** (`03-threat-model.md:66`): *"S ● / T ● / I ● → Parar de publicar web:3000; CSP/HSTS (08)"*.
- Resumo executivo (`security-audit/resumo-executivo.md:50`): *"08 | Borda: override/ports + CSP/HSTS | 0→1 | Quick Win | — | AP-3"*.

### Risco concreto e classificação

- **Passo override (F10):** exposição do frontend em texto claro (HTTP) + ausência total de headers de borda. OWASP **A05:2021 – Security Misconfiguration**; **CWE-16** (Configuration), **CWE-319** (Cleartext Transmission of Sensitive Information — cookies/sessão do `/admin` trafegando sem TLS se o operador ou um scanner acessar por `:3000`). CVSS aproximado **~7.4 (Alto)** (conforme `04-plano-auditorias.md:76`).
- **Passo CSP (borda ausente + AMP sem CSP):** falta de mecanismo de proteção contra XSS refletido/armazenado e clickjacking na camada de documento do SPA e das páginas AMP. OWASP **A05:2021**; **CWE-693** (Protection Mechanism Failure), **CWE-1021** (Improper Restriction of Rendered UI Layers — frame). CVSS aproximado **~5–6 (Médio)** como camada de defesa em profundidade que reforça a mitigação da cadeia-mãe **AP-1**.

**Nota de runtime não verificável do repo** (`security-audit/07-perguntas-pendentes.md:22-24`): não se sabe, só pelo código, se a VPS tem firewall/UFW fechando a porta 3000 nem se o override está de fato ativo agora. Este PRD trata a **causa raiz na configuração** (não depende de firewall) e adiciona verificação de que a porta não fica exposta. NÃO assumir que um firewall existe.

---

## Pré-condições

- [ ] Criar branch de trabalho:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011"
  git checkout -b fix/prd-08-borda-override-csp
  ```
- [ ] Registrar o **baseline** ANTES de editar. Anotar PASS/FAIL na linha do PRD-08 em `security-audit/STATUS.md` (criar o arquivo com cabeçalho + linha do PRD-08 se ele não existir). O único código de aplicação tocado por este PRD é `artifacts/api-server/src/routes/amp.ts` — logo o baseline verificável é a suíte + typecheck do `api-server`:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server"
  node --test
  pnpm run typecheck
  ```
  (O `Caddyfile` e o `docker-compose*.yml` não têm suíte de teste; a validação deles é por `caddy validate`/`docker compose config` na seção de verificação — a maior parte roda na VPS.)
- [ ] Ler ANTES de editar (todos confirmados neste PRD):
  - `docker-compose.override.yml` (arquivo inteiro — foco linhas 1-14)
  - `docker-compose.yml` (foco: serviço `web` 42-59; serviço `caddy` 134-154; `ports` 137-139)
  - `Caddyfile` (foco: snippet `(blog)` 10-29; bloco `{$SITE_DOMAIN}` 31-57; bloco `{$CENTRAL_DOMAIN}` 62-84)
  - `caddy/sites/00-placeholder.caddy` (entender o glob `import /etc/caddy/sites/*.caddy`)
  - `artifacts/api-server/src/app.ts` (foco: helmet/CSP 124-145; `unsafe-inline` 129-130; mount `/api` 189)
  - `artifacts/api-server/src/routes/amp.ts` (foco: `removeHeader` na linha 169; rota `/amp/artigos/:slug` na 55)
  - `CLAUDE.md` §5 (linhas 128-140) e §6 (linhas 150-160) — runbook de deploy
  - `security-audit/prds/PRD-04b-central-web-output-defense.md` (consumidor da política CSP — alinhar a diretiva)

---

## Escopo (ações em ordem)

> Executar em **duas ondas**. A **Onda 0 (override)** é a **dependência dura**: CSP de borda é inútil enquanto `web:3000` é publicado direto. Só avançar para a Onda 1 depois que a Onda 0 estiver verificada.

### ONDA 0 — Parar de publicar `web:3000` (Quick Win de configuração)

1. **Renomear o override para um nome NÃO auto-mesclável.** Renomear `docker-compose.override.yml` → `docker-compose.local.yml` (preserva o uso de teste local, mas `docker compose up -d` sem `-f` deixa de mesclá-lo). Usar `git mv` para manter histórico:
   ```bash
   cd "c:/Users/Usuario(a) Master/sp011"
   git mv docker-compose.override.yml docker-compose.local.yml
   ```
   (Alternativa aceitável se o teste local por porta 3000 for descartado: apagar o bloco `ports:` do arquivo. A **renomeação é a recomendada** — é robusta mesmo que alguém rode `up -d` sem `-f`, e mantém o teste local funcionando via `-f` explícito.)

2. **Atualizar o cabeçalho de comentário DENTRO do arquivo renomeado** (`docker-compose.local.yml`) para instruir o uso explícito de `-f`, deixando claro que ele **nunca** deve entrar em produção:
   ```yaml
   # Override APENAS para teste local no Docker Desktop.
   # NÃO é auto-mesclado (nome != docker-compose.override.yml de propósito):
   # para usá-lo, passe os dois arquivos EXPLICITAMENTE:
   #
   #   docker compose -f docker-compose.yml -f docker-compose.local.yml up --build api web
   #
   # Produção (com Caddy/HTTPS) usa SOMENTE o base, sem publicar 3000 no host:
   #   docker compose up -d          (ou: docker compose -f docker-compose.yml up -d)
   ```
   (Manter o serviço `web`/`ports: "3000:3000"` — a segurança vem do arquivo não ser mais auto-mesclado, não de remover a porta.)

3. **Endurecer o runbook (defesa em profundidade documental).** Deixar explícito que produção usa o base compose. Editar `CLAUDE.md` §5 (o bloco de deploy padrão, linhas ~128-131) e §6 (linhas ~155-156) para usar `docker compose -f docker-compose.yml ...` OU adicionar uma nota curta: *"produção usa só `docker-compose.yml`; `docker-compose.local.yml` é teste local e NUNCA é auto-mesclado — se existir um `docker-compose.override.yml`, não subir sem `-f`"*. **Esta edição é de documento de projeto** — sinalizar na descrição do commit. Se preferir minimizar mudança em `CLAUDE.md`, a renomeação (ação 1) já torna o runbook seguro sozinho; nesse caso registrar em `STATUS.md` que o doc-fix ficou como nota e por quê.

4. **Verificar (VPS) que a porta 3000 não fica publicada** após aplicar (ver "Comandos de verificação"): `docker compose config` (auto-merge) não deve conter publicação de host `3000`; `docker compose ps` do serviço `web` não deve mostrar `0.0.0.0:3000->`. **Opcional / defesa em profundidade** (não é critério de aceite; depende do runtime): deixar anotado em `STATUS.md` a recomendação de UFW `deny 3000/tcp` na VPS caso o firewall exista.

### ONDA 1 — CSP de borda (CANÁRIO report-only → enforce) + backstop AMP

5. **Definir a política CSP canônica do projeto** (esta é a diretiva que o PRD-04b consome). Valor inicial recomendado para o **SPA do frontend** (ajustável na fase de observação):
   ```
   default-src 'self';
   script-src 'self' 'unsafe-inline';
   style-src 'self' 'unsafe-inline';
   img-src 'self' data: https:;
   font-src 'self' data: https://fonts.gstatic.com;
   connect-src 'self';
   frame-ancestors 'none';
   base-uri 'self';
   form-action 'self';
   object-src 'none'
   ```
   Registrar essa string (em uma linha, `;`-separada) como a política oficial em `security-audit/STATUS.md` na entrada do PRD-08, para o PRD-04b referenciar.

6. **Aplicar a CSP em modo CANÁRIO (`Content-Security-Policy-Report-Only`) no `Caddyfile`, SÓ nas respostas do frontend** (não em `/api`, que é dono do helmet). Adicionar um sub-bloco `header` **dentro do `handle {}`** que faz `reverse_proxy` para o container web em cada um dos três blocos — NÃO no `header {}` de topo (o de topo atinge também `/api`, incluindo `/api/amp/*`, e conflitaria com o helmet):
   - snippet `(blog)` — dentro do `handle {}` de `Caddyfile:26-28` (proxy `{args[0]}-web:3000`), adicionar:
     ```
     header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
     ```
   - bloco `{$SITE_DOMAIN}` — dentro do `handle {}` de `Caddyfile:54-56` (proxy `sp011-web:3000`), mesma linha.
   - bloco `{$CENTRAL_DOMAIN}` — dentro do `handle {}` de `Caddyfile:81-83` (proxy `central-web:3001`), mesma linha.
   (O `header` do snippet `(blog)` cobre **todos** os blogs replicados de uma vez.)

7. **Observar o canário (não endurecer ainda).** Após deploy do Caddy, navegar no site público, no `/admin` e no painel central com o DevTools aberto e coletar as violações `Content-Security-Policy-Report-Only` do console. Ajustar a política (ação 5/6) até que **nenhuma violação quebre funcionalidade** do SPA (login, home SSR, editor, uploads, analytics beacon). Registrar em `STATUS.md` as fontes que precisaram ser liberadas (ex.: algum host de imagem, `data:` em fonts).

8. **Endurecer para enforcing.** Quando o canário estiver limpo, trocar `Content-Security-Policy-Report-Only` por **`Content-Security-Policy`** nos três blocos. Onde viável, **reduzir `'unsafe-inline'`** de `script-src` migrando scripts inline para nonce/hash (avaliar; se o build Vite/SSR da home injetar inline, pode ficar em `'unsafe-inline'` com justificativa registrada em `STATUS.md` — não bloquear a entrega por isso).

9. **Backstop de CSP na rota AMP (`artifacts/api-server/src/routes/amp.ts:169`).** Substituir a remoção cega
   ```ts
   res.removeHeader("Content-Security-Policy");
   ```
   por uma CSP **apropriada ao AMP** (nunca deixar a página AMP sem CSP). A página AMP usa o runtime assíncrono de `https://cdn.ampproject.org`, `<style amp-boilerplate>`/`<style amp-custom>` inline e `<script type="application/ld+json">` inline. Valor sugerido:
   ```ts
   res.setHeader(
     "Content-Security-Policy",
     "default-src 'self'; script-src https://cdn.ampproject.org 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://cdn.ampproject.org; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
   );
   ```
   Requisito de aceite: a resposta AMP passa a ter **um** cabeçalho `Content-Security-Policy` presente (verificável por `curl -I`). Ajustar allowances se um validador AMP acusar bloqueio do runtime.

10. **HSTS `preload` — AVALIAR, NÃO auto-aplicar.** O HSTS atual é `max-age=31536000; includeSubDomains` (sem `preload`) nos três blocos (`Caddyfile:14,38,69`). Adicionar `preload` + submeter em hstspreload.org é **compromisso praticamente irreversível** que força HTTPS em **todos** os subdomínios do apex (inclui o wildcard `*.midia.run` de todos os blogs). **NÃO** adicionar `preload` neste PRD sem decisão humana explícita. Registrar em `STATUS.md` como recomendação pendente de aprovação do dono. (Se aprovado por humano, é uma linha por bloco: `Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"`.)

---

## Fora de escopo

- **Não** trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` nem qualquer segredo (rechaveamento é outro PRD).
- **Não** sanitizar o corpo HTML da AMP (`toAmpHtml`, `amp.ts:34-50`) — isso é o **PRD-04a** (write-path). Aqui só se mexe na **presença do header CSP** (linha 169). Coordenar o merge com o PRD-04a para não conflitar no mesmo arquivo.
- **Não** implementar sanitização de saída no `central-web` (DOMPurify) — é o **PRD-04b**, que apenas **consome** a política CSP definida aqui.
- **Não** alterar a CSP do helmet em `/api` (`app.ts:124-145`) além do necessário — o endurecimento do `'unsafe-inline'` da API não é objetivo deste PRD (a borda cobre o HTML do frontend; a API já tem CSP). Se for tentador reduzir `unsafe-inline` no helmet, deixar para um PRD próprio.
- **Não** publicar `pg-blogs`, `ollama` ou qualquer outra porta no host; não mexer em `mem_limit`/`healthcheck`/`--no-sandbox` (containers = **PRD-07**).
- **Não** adicionar um endpoint coletor de relatórios CSP (`report-uri`/`report-to`) — o console do navegador basta para o canário; um collector é melhoria futura.
- **Não** mexer no `deploy/blog-template/compose.yml` (já **não** publica portas — confirmado: nenhuma diretiva `ports:` ali).

---

## Comandos de verificação

Rodar nesta ordem. Os itens marcados **(VPS)** rodam no servidor após o deploy (o `docker compose config`/`caddy validate` e os `curl` de borda precisam do stack de pé; `vite build`/Caddy não rodam no Windows).

```bash
# ── Contexto local (Windows) ───────────────────────────────────────────────
cd "c:/Users/Usuario(a) Master/sp011"

# 1) O override NÃO é mais auto-mesclável: não existe arquivo com o nome que o
#    docker compose mescla sozinho.  SUCESSO: 0 linhas (ambos os greps vazios).
ls docker-compose.override.yml docker-compose.override.yaml 2>/dev/null
grep -rn "3000:3000" docker-compose.override.yml 2>/dev/null

# 2) A publicação de 3000 só existe no arquivo de teste local renomeado, se
#    ainda existir.  SUCESSO: nenhuma ocorrência de "3000:3000" fora de
#    docker-compose.local.yml (0 linhas retornadas pelo comando abaixo).
grep -rn "3000:3000" --include="docker-compose*.yml" . | grep -v "docker-compose.local.yml"

# 3) A CSP foi adicionada ao Caddyfile nos 3 blocos de frontend.
#    SUCESSO: >= 3 ocorrências (report-only na fase canário; sem "-Report-Only"
#    na fase enforce).
grep -n "Content-Security-Policy" Caddyfile

# 4) A rota AMP NÃO remove mais a CSP sem substituto.
#    SUCESSO: 0 ocorrências de removeHeader da CSP...
grep -n 'removeHeader("Content-Security-Policy")' artifacts/api-server/src/routes/amp.ts
#    ...e a CSP passou a ser SETADA (SUCESSO: >= 1 ocorrência).
grep -n 'setHeader(\s*$\|Content-Security-Policy' artifacts/api-server/src/routes/amp.ts

# 5) Baseline/regressão do api-server (única suíte tocada por este PRD).
#    SUCESSO: node --test sem falhas; typecheck exit 0.
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server"
node --test
pnpm run typecheck
cd "c:/Users/Usuario(a) Master/sp011"

# ── (VPS) após deploy — validação de config e borda ────────────────────────
# 6) (VPS) O merge automático NÃO publica 3000 no host.
#    SUCESSO: nenhuma linha "published: \"3000\"" (só 80/443 do caddy aparecem).
#    cd /opt/sp011
#    docker compose config | grep -n "published"

# 7) (VPS) O container web não tem port-mapping de host.
#    SUCESSO: a coluna PORTS do web NÃO mostra 0.0.0.0:3000->3000.
#    docker compose ps web

# 8) (VPS) A porta 3000 não responde de fora.
#    SUCESSO: conexão recusada / timeout (NÃO deve devolver HTML/200).
#    curl -I --max-time 5 http://<IP-DA-VPS>:3000        # deve FALHAR

# 9) (VPS) O Caddyfile é válido e o frontend serve CSP + HSTS.
#    SUCESSO (validate): "Valid configuration".
#    docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
#    SUCESSO (headers): a resposta do HTML mostra Content-Security-Policy
#    (ou -Report-Only na fase canário) E Strict-Transport-Security.
#    curl -sI https://<SITE_DOMAIN>/ | grep -iE "content-security-policy|strict-transport-security"
#    curl -sI https://<CENTRAL_DOMAIN>/ | grep -iE "content-security-policy|strict-transport-security"

# 10) (VPS) A página AMP tem CSP presente (backstop), não vazia.
#    SUCESSO: 1 linha Content-Security-Policy (com cdn.ampproject.org).
#    curl -sI https://<SITE_DOMAIN>/api/amp/artigos/<slug-publicado> | grep -i "content-security-policy"
```

**Observação de canário (objetiva, pós-deploy do Caddy — fase report-only, ação 7):** abrir o site público, o `/admin` e o painel central com o DevTools; **SUCESSO** = o SPA funciona normalmente (login, navegação, editor, upload) e as mensagens de `Content-Security-Policy-Report-Only` no console são apenas *relatos* (nada é bloqueado). Só endurecer para enforcing depois disso. **FALHA** = qualquer tela em branco / recurso essencial bloqueado → ajustar a política antes de trocar para `Content-Security-Policy`.

---

## Critérios de aceite

**Onda 0 (override):**
- [ ] Não existe mais arquivo auto-mesclável `docker-compose.override.yml`/`.yaml` (comando 1).
- [ ] Nenhuma publicação `3000:3000` fora de `docker-compose.local.yml` (comando 2).
- [ ] (VPS) `docker compose config` (auto-merge, sem `-f`) não publica host `3000` (comando 6); `docker compose ps web` não mostra `0.0.0.0:3000->` (comando 7); `curl` na porta 3000 externa falha (comando 8).
- [ ] Comentário do arquivo renomeado e/ou runbook deixam explícito o uso de `-f` para teste local; produção usa só o base (ação 2/3).

**Onda 1 (CSP/AMP):**
- [ ] `Caddyfile` serve CSP no HTML dos 3 blocos de frontend (comando 3), começando em `-Report-Only` (canário) e endurecido para `Content-Security-Policy` só após o canário limpo (observação de canário).
- [ ] (VPS) `curl -sI` de `SITE_DOMAIN` e `CENTRAL_DOMAIN` mostra `Content-Security-Policy`(`-Report-Only`) **e** `Strict-Transport-Security` (comando 9); `caddy validate` = "Valid configuration".
- [ ] `amp.ts` não faz mais `removeHeader("Content-Security-Policy")`; passa a `setHeader` uma CSP apropriada ao AMP (comando 4); (VPS) a resposta AMP tem CSP presente (comando 10).
- [ ] `node --test` e `pnpm run typecheck` do `api-server` passam (comando 5).
- [ ] A política CSP canônica e a decisão sobre HSTS `preload` estão registradas em `security-audit/STATUS.md` (a diretiva que o PRD-04b consome + `preload` pendente de aprovação humana).

---

## Definition of Done

Produção não publica mais `web:3000` no host (comandos 1/2/6/7/8 satisfeitos e revisados por humano), o HTML do frontend dos três blocos serve CSP **enforcing** e HSTS pela borda (comando 9), a rota AMP serve uma CSP de backstop em vez de nenhuma (comandos 4/10), `node --test`/typecheck do `api-server` passam, e `security-audit/STATUS.md` registra a política CSP oficial (consumida pelo PRD-04b) e a pendência de decisão sobre HSTS `preload`.

---

## Dependências

- **Dependências de entrada: nenhuma.** É Quick Win de borda; pode começar imediatamente.
- **Aresta dura interna:** Onda 0 (override) **antes** de Onda 1 (CSP) — CSP de borda é inútil enquanto `web:3000` é publicado direto (`security-audit/05-estrategia-prd.md:21`).
- **Este PRD é dono da política CSP.** O **PRD-04b** (`security-audit/prds/PRD-04b-central-web-output-defense.md`) consome a diretiva CSP definida aqui como backstop — pode correr em paralelo, mas deve referenciar a string registrada em `STATUS.md`.
- **Coordenação de arquivo com PRD-04a:** ambos tocam `artifacts/api-server/src/routes/amp.ts` (04a = sanitização do corpo; 08 = header CSP). Mergear em ordem e reconciliar se houver conflito na região da linha 169.

---

## Prioridade e esforço

**Quick Win** — **Esforço Médio** (Onda 0 → Onda 1). A Onda 0 é uma renomeação de arquivo + nota de runbook (esforço baixo, alto valor). A Onda 1 é média por exigir o ciclo de canário (report-only → observar → endurecer) e o ajuste fino da CSP para não quebrar o SPA, além do backstop AMP.

---

## Plano de rollback

Mudanças isoladas e revertíveis; nenhuma toca dados, migrações ou segredos.

```bash
cd "c:/Users/Usuario(a) Master/sp011"

# Reverter tudo pelo commit de entrega (substituir <hash>):
git revert <hash>

# OU, antes de commitar, desfazer por arquivo:
git mv docker-compose.local.yml docker-compose.override.yml   # volta o nome
git checkout -- Caddyfile artifacts/api-server/src/routes/amp.ts CLAUDE.md
```

Deploy do rollback na VPS:
```bash
cd /opt/sp011
git pull
docker compose up -d --force-recreate caddy   # se o Caddyfile foi revertido
docker compose build api && docker compose up -d api   # se amp.ts foi revertido
# Reverter o override é config: 'docker compose up -d web' recria o web conforme
# o merge vigente. ATENÇÃO: reverter para o nome docker-compose.override.yml
# RE-EXPÕE web:3000 (estado vulnerável) — só fazer em emergência controlada.
```

Rollback do **CSP enforcing → report-only** (mitigação rápida sem reverter tudo, se o SPA quebrar): editar o `Caddyfile` trocando `Content-Security-Policy` de volta por `Content-Security-Policy-Report-Only` nos três blocos e `docker compose up -d --force-recreate caddy`.

---

## Plano de deploy (VPS) — após merge na main

Aplicar por passo (rebuild direcionado):

```bash
cd /opt/sp011
git pull

# Onda 0 (override renomeado): re-materializa o web sem a porta 3000.
docker compose up -d web
docker compose config | grep -n "published"   # conferência: sem 3000

# Onda 1 (CSP de borda no Caddyfile): Caddyfile é bind de arquivo ÚNICO — git
# pull troca o inode e 'caddy reload' releria o arquivo VELHO. Force-recreate:
docker compose up -d --force-recreate caddy

# Onda 1 (backstop AMP em amp.ts → imagem compartilhada do blog):
docker compose build api
docker compose up -d api
```

Para propagar o backstop AMP a **todos os blogs replicados** (imagem compartilhada), seguir o rollout de imagem do `CLAUDE.md` §6 (bump `BLOG_IMAGE_VERSION` → build `api web` → canário → demais). Registrar em `STATUS.md` se o rollout aos blogs ficou pendente.

Pós-deploy: rodar os comandos **(VPS)** 6–10 e a **observação de canário**. Na fase report-only, navegar site/admin/central com DevTools antes de endurecer.

---

## Notas de execução para o agente

- Trabalhar **somente** neste PRD (PRD-08). Não encostar em auth, segredos, sanitização de write-path, `central-web`, containers (`--no-sandbox`/`mem_limit`) nem na CSP do helmet em `/api`.
- **Respeitar a ordem das ondas:** só endurecer a CSP (enforce) depois do canário report-only estar limpo. Um `Content-Security-Policy` estrito errado deixa o SPA em **tela branca** — por isso o report-only vem primeiro.
- **Revisão humana obrigatória** antes do merge/deploy do passo override (muda a exposição de rede pública) e antes de qualquer `preload` de HSTS (compromisso quase irreversível sobre todos os subdomínios). Sinalizar ambos ao dono.
- Se **qualquer** critério de aceite falhar após implementar: **NÃO** marcar como concluído. Registrar o motivo exato (comando + saída) na linha do PRD-08 em `security-audit/STATUS.md` e **PARAR**.
- Ao concluir com sucesso, atualizar `security-audit/STATUS.md`: baseline → resultado final, data, hash do commit, a **string da política CSP canônica** (para o PRD-04b), e o estado da decisão de HSTS `preload`.
- Não incluir valores de segredo em nenhum comando/exemplo. Não trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`.
