# PRD-10 — CI/CD de segurança: secret-scanning, SCA e SAST (não-bloqueante primeiro)

> **Metadados** — Onda **0/3** (fundacional) | Prioridade: **Quick Win** | Esforço: **Baixo** | Dependências: **nenhuma** | Modo: **NÃO-BLOQUEANTE / report-only primeiro** (não travar o fluxo de deploy do usuário) | **Sem revisão humana obrigatória** para os workflows report-only. **EXCEÇÃO que exige decisão humana:** ligar *branch protection* / GitHub *Secret Scanning + Push Protection* muda o fluxo `commit-direto-na-main` do dono — só recomendar em `STATUS.md`, NÃO aplicar sozinho.
>
> Este PRD é **autocontido**. O agente que o implementar NÃO precisa da conversa que o gerou: todas as referências arquivo:linha, o desenho da solução e os comandos de verificação estão abaixo. Todos os números de linha foram confirmados por leitura direta do repositório em 2026-07-21.
>
> Este PRD **não toca nenhum código de aplicação** — só adiciona arquivos de configuração de CI (`.github/**`, `.gitleaks.toml`) e executa `pnpm audit` para triagem. As defesas estáticas de supply chain já existentes (ver Contexto) devem ser **preservadas intactas**.

---

## Objetivo

Estabelecer uma camada **detectiva** de CI/CD de segurança no repositório GitHub (`BeeMediaOF/sp011`), hoje inexistente (não há `.github/`, Dependabot/Renovate, SAST/SCA/secret-scanning). Entregar três controles **em modo report-only** para não travar o deploy `commit-direto-na-main` do dono: (a) **secret-scanning** (gitleaks) que pega vazamentos como o `.replit` (F1); (b) **SCA** (Dependabot + `pnpm audit` no CI) sobre o `pnpm-lock.yaml`; (c) **SAST leve** (CodeQL) não-bloqueante. Adicionalmente, **executar o `pnpm audit` pendente** (o reconhecimento não rodou por ser read-only) e registrar os CVEs reais como follow-up. Endurecer (blocking) fica para depois.

---

## Contexto / Evidência de origem

### Achado F17 — sem CI/CD e sem scanners

- **Fonte no mapa de riscos — `security-audit/02-mapa-riscos.md:65`**: *"F17 | Sem CI/CD e sem scanners | ausência de `.github/`, Dependabot, etc. | **Médio** | (todos) | Fato/Alta"*.
- **Plano de auditorias — `security-audit/04-plano-auditorias.md:99-101`** (F17 → PRD-10), três facetas:
  - `:99` — *"Sem secret-scanning | A05; **CWE-798** | Médio | F17 → PRD-10"*.
  - `:100` — *"Sem SCA / `pnpm audit` / Dependabot | A06; **CWE-1104**; SLSA | Médio | F17 → PRD-10"*.
  - `:101` — *"Sem SAST / branch protection | A05; **ASVS 1.x** | Médio | F17 → PRD-10"*.
- **Índice de PRDs — `security-audit/05-estrategia-prd.md:40`**: *"10 | CI/CD de segurança (secret-scan, SCA, SAST) | 0/3 | Quick Win | Baixo | —"*.
- **Roadmap — `security-audit/06-roadmap-dimensionamento.md:14`**: *"10 CI/segurança (não-bloqueante) | Fundacional; pega segredos futuros; barato | Baixo | sim"*. Milestone M0 (`:17`) inclui *"scanners ligados"*.
- **Resumo executivo — `security-audit/resumo-executivo.md:52`**: *"10 | CI/CD de segurança | 0/3 | Quick Win | — | (todos)"*.

### Evidência confirmada por leitura direta (2026-07-21)

- **Não existe `.github/`** no repositório (nenhum workflow, nenhum `dependabot.yml`, nenhum `renovate.json`) — confirmado por `ls .github/` → *"NO .github DIR"*. F17 é **Fato**.
- **O repositório está no GitHub** — `git remote -v` → `origin https://github.com/BeeMediaOF/sp011.git`. Logo **GitHub Actions é viável** (secret-scan/SCA/SAST rodam como Actions).
- **Existe `pnpm-lock.yaml`** (commitado, ~287 KB) — habilita `pnpm audit` reprodutível e `pnpm install --frozen-lockfile` no CI (o mesmo comando de `scripts/post-merge.sh`).
- **Segredo real vivo no working tree — `.replit:38`**: `VAPID_PRIVATE_KEY = "..."` (F1). Um secret-scanner **vai** flagar este arquivo. Ele é de propriedade do **PRD-01a** (rotação) / **PRD-01b** (purge do histórico git); aqui ele será **allowlisted com ponteiro para o PRD-01** para não virar ruído que mascare vazamentos novos.

### Defesas de supply chain JÁ existentes — PRESERVAR (não remover, não mexer)

> Correção de precisão vs. o achado original: estas defesas vivem em **`pnpm-workspace.yaml`**, não no `.npmrc` (o `.npmrc:1-2` só tem `auto-install-peers=false` / `strict-peer-dependencies=false`).

- **`pnpm-workspace.yaml:28`** — `minimumReleaseAge: 1440` (bloqueia instalar versão npm com < 1 dia de publicação; defesa nº1 contra supply-chain). **NUNCA reduzir/remover.**
- **`pnpm-workspace.yaml:30-35`** — `minimumReleaseAgeExclude` (`@replit/*`, `stripe-replit-sync`).
- **`pnpm-workspace.yaml:71-76`** — `onlyBuiltDependencies` (allowlist de scripts de build: `@swc/core`, `esbuild`, `msw`, `sharp`, `unrs-resolver`).
- **`pnpm-workspace.yaml:78-169`** — `overrides`, incluindo correções de CVE já aplicadas: `:160-161` esbuild `^0.28.1`, `:163` undici `>=7.28.0`, `:164` markdown-it `>=14.2.0`, `:165` js-yaml `>=4.2.0`, `:166` qs `>=6.15.2`, `:167` @babel/core `>=7.29.6`, `:169` uuid `>=11.1.1` (GHSA-w5hq-g745-h8pq). O `pnpm audit` deste PRD deve **confirmar** que esses ainda resolvem e surfacear apenas novidades.
- **`package.json:6`** — `preinstall` força pnpm e remove `package-lock.json`/`yarn.lock` (o CI deve usar pnpm, nunca npm/yarn).
- **`.gitignore:53-55`** — `.env` / `.env.*` ignorados (`!.env.example`). O secret-scan complementa isto pegando segredos que escapem para arquivos versionados (como o `.replit`).

### Attack path e classificação

- **Não há AP dedicado** a F17 — é um controle **transversal detectivo/preventivo** que afeta **todos** os ativos (col. "Ativos = (todos)" em `02-mapa-riscos.md:65`). Relevância direta com **AP-7 — Segredos em repouso/VCS** (`security-audit/03-threat-model.md:48`, gatilho `.replit` VAPID F1): secret-scanning é o controle que **impede a reincidência** de F1 daqui pra frente.
- OWASP **A05:2021 (Security Misconfiguration)** + **A06:2021 (Vulnerable and Outdated Components)**. CWE: **CWE-798** (Use of Hard-coded Credentials — o que o secret-scan pega), **CWE-1104** (Use of Unmaintained/Vulnerable Third-Party Components — o que o SCA pega). Severidade **Médio**; sem CVSS numérico (controle de processo, não vuln explorável isolada).

**Nota de runtime não verificável do repo:** as GitHub Actions só executam de fato **após push** para o GitHub — a validação final (ver "Comandos de verificação") é a observação da aba **Actions** do repositório. Localmente (Windows) valida-se existência/estrutura dos arquivos e, se as ferramentas estiverem instaladas, uma execução manual de `gitleaks`/`pnpm audit`.

---

## Pré-condições

- [ ] Criar branch de trabalho:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011"
  git checkout -b fix/prd-10-cicd-seguranca
  ```
- [ ] Registrar o **baseline** ANTES de editar. Anotar PASS/FAIL na linha do PRD-10 em `security-audit/STATUS.md` (criar o arquivo com cabeçalho + linha do PRD-10 se ele não existir). Como este PRD **não toca código de aplicação**, o baseline é apenas uma sanidade de que o repo continua íntegro — rodar a suíte do pacote mais crítico:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server"
  node --test
  pnpm run typecheck
  cd "c:/Users/Usuario(a) Master/sp011"
  ```
  (Nenhum arquivo de código muda; espera-se que o baseline continue idêntico ao fim do PRD.)
- [ ] Ler ANTES de editar (todos confirmados neste PRD):
  - `.npmrc` (confirmar que só tem settings de peers — NÃO mexer).
  - `pnpm-workspace.yaml` (foco: `minimumReleaseAge:28`; `minimumReleaseAgeExclude:30-35`; `onlyBuiltDependencies:71-76`; `overrides:78-169` — **PRESERVAR TUDO**).
  - `package.json` (foco: `preinstall:6` força pnpm; sem `packageManager`/`engines`).
  - `.gitignore` (foco: `.env`/`.env.*` em `:53-55`).
  - `scripts/post-merge.sh` (usa `pnpm install --frozen-lockfile` — o CI deve espelhar).
  - `.replit` (foco: `VAPID_PRIVATE_KEY` em `:38` — será allowlisted, propriedade do PRD-01).
  - `security-audit/prds/PRD-01a-rotacao-segredo-vapid.md` e `PRD-01b-higiene-segredos-repouso.md` (para referenciar corretamente a quem pertence o achado `.replit`).

---

## Escopo (ações em ordem)

> Tudo em **modo report-only / não-bloqueante**. Nenhum job deve fazer o run "vermelho" de forma que trave o `git push`/deploy do dono. Endurecer (blocking) é follow-up registrado em `STATUS.md`.

### A) Secret-scanning (gitleaks)

1. **Criar `.github/workflows/security.yml`** com um job `secret-scan` que roda em `push` (branch `main`), `pull_request` (caso um dia exista) e `schedule` (semanal) + `workflow_dispatch`. Usar a action oficial `gitleaks/gitleaks-action` **pinada por major** (ex.: `@v2`) com `checkout` de histórico completo (`actions/checkout@v4` com `fetch-depth: 0`). O passo do gitleaks deve ser **não-bloqueante** nesta fase: marcar o job/step com `continue-on-error: true` (report-only). O resultado (SARIF) sobe para a aba Security do GitHub se disponível; caso contrário, fica no log do run.

2. **Criar `.gitleaks.toml`** na raiz do repo estendendo a config default (`[extend] useDefault = true`) com um **allowlist explícito** do achado já catalogado F1 (`.replit`), com comentário apontando o dono:
   ```toml
   # Config do gitleaks — secret-scanning (PRD-10).
   [extend]
   useDefault = true

   [allowlist]
   description = "Achados já catalogados pela auditoria — remover conforme resolvidos."
   paths = [
     # F1: VAPID_PRIVATE_KEY versionada no .replit (security-audit/02-mapa-riscos.md:65).
     # Propriedade do PRD-01a (rotação) + PRD-01b (purge do histórico git).
     # REMOVER esta linha assim que o PRD-01b concluir o purge — aí este arquivo
     # deve deixar de existir no working tree e o allowlist perde a razão de ser.
     '''^\.replit$''',
   ]
   ```
   Objetivo: manter o run **verde-com-nota** (o único segredo conhecido está allowlisted e rastreado), de modo que **qualquer novo** vazamento apareça como sinal limpo, não afogado pelo ruído do `.replit`.

3. **(Opcional, defesa em profundidade local) Hook pré-commit leve.** Documentar em `STATUS.md` — e, se trivial, adicionar como script opcional — a instalação do hook `gitleaks protect --staged` para o dono rodar localmente antes de commitar. **Não** tornar obrigatório nem instalar um framework pesado (`pre-commit`) — o dono opera solo no Windows; manter opt-in.

### B) SCA — Dependabot + `pnpm audit` no CI

4. **Criar `.github/dependabot.yml`** com dois ecossistemas, semanal, com limite baixo de PRs e agrupamento para não afogar o dev solo:
   ```yaml
   version: 2
   updates:
     - package-ecosystem: "npm"        # cobre o pnpm-lock.yaml
       directory: "/"
       schedule:
         interval: "weekly"
       open-pull-requests-limit: 5
       groups:
         all-dev-and-minor:
           update-types: ["minor", "patch"]
       # Segurança: manter a defesa de supply chain — NÃO deixar o Dependabot
       # rebaixar as versões fixadas por override (undici/qs/uuid/etc.).
     - package-ecosystem: "github-actions"
       directory: "/"
       schedule:
         interval: "weekly"
       open-pull-requests-limit: 5
   ```
   Registrar em `STATUS.md` o aviso: **estes serão os primeiros PRs do repo** (o modelo é commit-direto-na-main); o dono pode mergear/ignorar, mas o Dependabot **não bloqueia** deploy. Alternativa equivalente (Renovate via `renovate.json`) fica documentada como opção — escolher **um** dos dois, não os dois.

5. **Adicionar ao `security.yml` um job `sca`** que instala pnpm e roda `pnpm audit` **report-only**:
   - `pnpm/action-setup` (pinado) + `actions/setup-node@v4` (com `node-version` alinhado à produção — usar `22` LTS; registrar em `STATUS.md` se a versão da VPS for outra).
   - `pnpm install --frozen-lockfile` (mesmo comando de `scripts/post-merge.sh`).
   - `pnpm audit --audit-level=low` com o passo em `continue-on-error: true` (não falha o run). Opcionalmente `pnpm audit --json > pnpm-audit.json` e subir como artifact do run para triagem.

### C) SAST leve (CodeQL, não-bloqueante)

6. **Adicionar ao `security.yml` um job `codeql`** usando `github/codeql-action` (init → autobuild/none → analyze) para a linguagem `javascript-typescript`, em `push`/`schedule`/`workflow_dispatch`, com o passo de analyze **não-bloqueante** (`continue-on-error: true` nesta fase). CodeQL é nativo do GitHub e gratuito para este repositório. *(Alternativa equivalente: `semgrep ci` com ruleset `p/default` — documentar como opção; escolher **um** SAST, não dois, para manter o esforço Baixo.)*

### D) Executar o `pnpm audit` pendente e triar (ação manual do agente)

7. **Rodar `pnpm audit` localmente** (o reconhecimento não rodou — `02-mapa-riscos.md:77`: *"pnpm audit/CVEs — não executado. Bloqueia dimensionar F17"*), triar os resultados e **anexar o resumo a `STATUS.md`**:
   - Confirmar que os `overrides` de CVE (`pnpm-workspace.yaml:163-169`) **resolvem** (undici/markdown-it/js-yaml/qs/@babel/core/uuid não devem aparecer como vulneráveis).
   - Listar CVEs **remanescentes** (nível ≥ moderate) como **follow-up** com pacote, versão, GHSA/CVE e caminho da dependência. **Não corrigir** aqui (correção de CVE real é follow-up próprio) — apenas registrar. Se algum for **Crítico/Alto e trivialmente corrigível por override** sem quebrar build, registrar como recomendação, mas não aplicar sem confirmação (mexer em deps pode quebrar o build que só roda na VPS).

### E) Branch protection / Push Protection — RECOMENDAR, não aplicar

8. **NÃO** habilitar branch protection que exija PR (quebraria o fluxo `commit-direto-na-main` do dono — `CLAUDE.md` §18). **Registrar em `STATUS.md`** como recomendação pendente de decisão humana a opção **compatível com dev-solo**: ligar, nas **Settings → Code security** do GitHub, **Secret Scanning + Push Protection** (nativo, gratuito para o repo, bloqueia *push* de padrões de segredo conhecidos **sem** exigir PR). É a "branch protection mínima" que cabe no modelo do dono. Requer admin do repo no GitHub UI — **fora do alcance do agente via código**; só documentar.

### F) STATUS

9. **Atualizar `security-audit/STATUS.md`** (criar se ausente): baseline → resultado, data, hash do commit, resumo do `pnpm audit` (ação 7), a nota do Dependabot (primeiros PRs), a recomendação de Secret Scanning/Push Protection (ação 8) e o lembrete de **remover o allowlist do `.replit`** quando o PRD-01b concluir o purge.

---

## Fora de escopo

- **Não** tornar nenhum scanner **bloqueante** (nada de `exit 1` que trave o push/deploy). Endurecer para blocking é follow-up explícito, registrado em `STATUS.md`.
- **Não** habilitar branch protection que exija Pull Request nem qualquer *required status check* — contraria o modelo `commit-direto-na-main` (`CLAUDE.md` §18). Só recomendar Push Protection nativo (ação 8).
- **Não** remover, reduzir ou "simplificar" as defesas de supply chain existentes: `minimumReleaseAge` (`pnpm-workspace.yaml:28`), `minimumReleaseAgeExclude` (`:30-35`), `onlyBuiltDependencies` (`:71-76`), `overrides` de CVE (`:78-169`). Preservar byte-a-byte.
- **Não** rotacionar nem tocar o `.replit`/VAPID (F1) — é **PRD-01a/01b**. Aqui só se **allowlista** o achado conhecido.
- **Não** corrigir CVEs reais do `pnpm audit` (bump/override de dependência) — só **registrar** como follow-up (ação 7). Correção de deps altera o build que só roda na VPS.
- **Não** adicionar `packageManager`/`engines` ao `package.json` nem `.nvmrc`/`.node-version` (fixar Node é melhoria opcional; se decidir, registrar — mas não é objetivo deste PRD).
- **Não** tocar nenhum arquivo de código de aplicação (`artifacts/**/src`, `lib/**/src`, `central-*`), `Dockerfile`, `docker-compose*.yml`, `Caddyfile` ou `.env*`.
- **Não** configurar DAST (scan dinâmico) — fora do escopo "leve" desta onda.

---

## Comandos de verificação

Rodar nesta ordem. Itens **(GitHub)** só se confirmam após o push (observação da aba Actions). Itens marcados **(requer ferramenta local)** dependem de gitleaks/pnpm instalados no Windows; se ausentes, a autoridade é o run de CI.

```bash
cd "c:/Users/Usuario(a) Master/sp011"

# 1) Os arquivos de CI foram criados.  SUCESSO: os 3 caminhos existem (sem erro).
ls -la .github/workflows/security.yml .github/dependabot.yml .gitleaks.toml

# 2) O workflow declara os três controles e roda em modo não-bloqueante.
#    SUCESSO: cada grep abaixo retorna >= 1 ocorrência.
grep -n "gitleaks"           .github/workflows/security.yml
grep -n "pnpm audit"         .github/workflows/security.yml
grep -n "codeql\|CodeQL"     .github/workflows/security.yml
grep -n "continue-on-error"  .github/workflows/security.yml

# 3) O CI usa pnpm com lockfile congelado (espelha scripts/post-merge.sh),
#    nunca npm/yarn.  SUCESSO: >= 1 ocorrência de frozen-lockfile; 0 de "npm install".
grep -n "frozen-lockfile" .github/workflows/security.yml
grep -n "npm install\|yarn install" .github/workflows/security.yml   # esperado: 0 linhas

# 4) O achado F1 (.replit) está allowlisted e apontado ao PRD-01.
#    SUCESSO: >= 1 ocorrência de .replit no allowlist e menção ao PRD-01.
grep -n "replit\|PRD-01" .gitleaks.toml

# 5) As defesas de supply chain existentes NÃO foram alteradas.
#    SUCESSO: cada valor abaixo continua presente, idêntico.
grep -n "minimumReleaseAge: 1440" pnpm-workspace.yaml
grep -n "onlyBuiltDependencies"   pnpm-workspace.yaml
grep -n "undici\|uuid\|markdown-it\|js-yaml\|qs\|@babel/core" pnpm-workspace.yaml
#    E o diff do arquivo deve estar VAZIO (nada tocado):  SUCESSO: 0 linhas.
git diff --stat -- pnpm-workspace.yaml .npmrc package.json

# 6) (requer ferramenta local) Secret-scan do working tree usando a config.
#    SUCESSO: gitleaks executa e reporta "no leaks found" OU apenas o achado
#    allowlisted (.replit) — ZERO segredos NOVOS/desconhecidos.
#    Se gitleaks não estiver instalado (winget install gitleaks.gitleaks / binário),
#    a autoridade é o job secret-scan na aba Actions.
gitleaks detect --no-git --config .gitleaks.toml -v || echo "gitleaks ausente localmente -> validar no CI"

# 7) (requer ferramenta local) Executar o pnpm audit pendente e capturar p/ triagem.
#    SUCESSO: o comando executa e produz o relatório (anexar o resumo ao STATUS.md).
#    Report-only: o '|| true' evita que um exit != 0 do audit atrapalhe a verificação.
pnpm audit --audit-level=low || true

# 8) Sanidade: nenhum código de aplicação foi tocado (baseline intacto).
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server"
node --test
pnpm run typecheck
cd "c:/Users/Usuario(a) Master/sp011"

# 9) (GitHub, após push) Observar a aba Actions do repositório BeeMediaOF/sp011:
#    SUCESSO: o workflow "security" aparece e EXECUTA os jobs secret-scan / sca /
#    codeql; nenhum job em modo report-only bloqueia o push (o run pode ficar
#    "verde" ou "neutral", nunca deve impedir o deploy). Findings, se houver,
#    aparecem no log/aba Security como RELATO, não como gate.
```

**Observação objetiva pós-push (GitHub):** o workflow `security` roda em cada push para `main` e semanalmente; os achados são **relatos** (report-only) e **não** impedem o `git push`/deploy do dono. **FALHA** = um job configurado como bloqueante que trave o fluxo, ou o secret-scan acusar um segredo **novo** (não-allowlisted) → nesse caso PARAR e tratar o vazamento antes de prosseguir.

---

## Critérios de aceite

- [ ] Existem `.github/workflows/security.yml`, `.github/dependabot.yml` e `.gitleaks.toml` (comando 1).
- [ ] O `security.yml` declara **secret-scan (gitleaks)**, **SCA (`pnpm audit`)** e **SAST (CodeQL)**, todos **report-only** (`continue-on-error`) e usando **pnpm com `--frozen-lockfile`** (comandos 2 e 3; zero `npm install`/`yarn install`).
- [ ] O `.gitleaks.toml` allowlista o achado F1 (`.replit`) com ponteiro ao **PRD-01** e comentário de "remover após o purge" (comando 4).
- [ ] `.github/dependabot.yml` habilita os ecossistemas `npm` (pnpm-lock) e `github-actions`, semanal, com limite/agrupamento de PRs (ação 4).
- [ ] As defesas de supply chain (`minimumReleaseAge`, `onlyBuiltDependencies`, `overrides` de CVE) permanecem **intactas** — `git diff` de `pnpm-workspace.yaml`/`.npmrc`/`package.json` vazio (comando 5).
- [ ] `gitleaks` (local ou no CI) roda e **não acha segredo NOVO** além do `.replit` allowlisted (comando 6 ou job Actions).
- [ ] `pnpm audit` foi **executado** e seu resumo (CVEs remanescentes ≥ moderate como follow-up; confirmação de que os overrides resolvem) está **anexado a `security-audit/STATUS.md`** (comando 7 + ação 7).
- [ ] Baseline intacto: `node --test`/`pnpm run typecheck` do `api-server` continuam passando (comando 8).
- [ ] (GitHub, após push) O workflow `security` **executa** na aba Actions e **não bloqueia** o push (comando 9).
- [ ] `STATUS.md` contém: nota dos primeiros PRs do Dependabot, recomendação de **Secret Scanning + Push Protection** (decisão humana, ação 8) e o lembrete de remover o allowlist do `.replit` quando o PRD-01b concluir.

---

## Definition of Done

O repositório `BeeMediaOF/sp011` tem CI de segurança **report-only** funcionando (secret-scan gitleaks + SCA `pnpm audit`/Dependabot + SAST CodeQL) que **executa em cada push sem bloquear o deploy** do dono (comando 9); o único segredo conhecido (`.replit`/VAPID, F1) está allowlisted e apontado ao PRD-01; as defesas de supply chain existentes continuam intactas (comando 5); o `pnpm audit` pendente foi executado e triado com o resumo em `STATUS.md`; e `security-audit/STATUS.md` registra baseline→resultado, o resumo do audit, a recomendação de Push Protection e o lembrete de remoção do allowlist. Endurecer para blocking e corrigir CVEs remanescentes ficam como follow-ups registrados.

---

## Dependências

- **Dependências de entrada: nenhuma.** É fundacional (Onda 0/3) e paraleliza com qualquer outro PRD (`06-roadmap-dimensionamento.md:14`, `:74`).
- **Relação com PRD-01a/01b (soft):** este PRD **allowlista** o achado `.replit` (F1) que o **PRD-01a** (rotação) e o **PRD-01b** (purge do histórico git) resolvem. Quando o PRD-01b concluir, a entrada de allowlist do `.replit` no `.gitleaks.toml` deve ser **removida** (lembrete em `STATUS.md`). Não há acoplamento de código; ordem indiferente.
- **Habilita follow-ups:** o secret-scan passa a ser a rede de segurança contra reincidência de vazamentos (AP-7); o `pnpm audit` triado alimenta um eventual PRD de correção de CVEs.

---

## Prioridade e esforço

**Quick Win** — **Esforço Baixo**. Apenas arquivos de configuração de CI + uma execução de `pnpm audit` para triagem; nenhum código de aplicação é tocado, risco de quebra ~nulo (report-only não bloqueia nada). Alto valor fundacional: pega segredos futuros e dá visibilidade de dependências vulneráveis. Onda **0/3** (fundacional, roda cedo e em paralelo).

---

## Plano de rollback

Mudanças isoladas e aditivas (só arquivos novos de config); nenhuma toca código, dados, migrações ou segredos. Reverter é remover os arquivos criados.

```bash
cd "c:/Users/Usuario(a) Master/sp011"

# Reverter tudo pelo commit de entrega (substituir <hash>):
git revert <hash>

# OU, antes de commitar, desfazer removendo os arquivos criados:
git rm -f .github/workflows/security.yml .github/dependabot.yml .gitleaks.toml
git checkout -- security-audit/STATUS.md   # se quiser desfazer a linha do PRD-10

# Desligar SÓ um scanner sem reverter tudo: editar .github/workflows/security.yml
# e remover/comentar o job correspondente (secret-scan | sca | codeql).
# Desligar o Dependabot: remover .github/dependabot.yml (para de abrir PRs).
```

**Não há passo de deploy na VPS** para este PRD: as GitHub Actions e o Dependabot vivem no GitHub, não no runtime da VPS (`/opt/sp011`). O rebuild de serviços do §5/§6 do `CLAUDE.md` **não se aplica**. O efeito começa no primeiro push para `main` após o merge.

---

## Notas de execução para o agente

- Trabalhar **somente** neste PRD (PRD-10). Não encostar em código de aplicação, `.env`, Dockerfiles, `docker-compose*.yml`, `Caddyfile`, nem em `pnpm-workspace.yaml`/`.npmrc`/`package.json` (só **ler** para preservar as defesas existentes).
- **Report-only é inegociável nesta onda:** nenhum job pode travar o `git push`/deploy do dono. Se em dúvida sobre exit codes de uma action, adicionar `continue-on-error: true`. Endurecer é follow-up.
- **Escolher UM** por categoria: um secret-scanner (gitleaks), um SCA (Dependabot **ou** Renovate — recomendado Dependabot nativo), um SAST (CodeQL **ou** semgrep — recomendado CodeQL). Não duplicar (mantém o esforço Baixo).
- **Não** ligar branch protection com PR obrigatório nem required checks (quebra `commit-direto-na-main`). Push Protection nativo é só **recomendação** em `STATUS.md` (decisão humana, ação 8).
- Ao **allowlistar o `.replit`**: deixar o comentário apontando para o PRD-01 e o lembrete de remoção pós-purge — para não mascarar vazamentos novos.
- **Executar o `pnpm audit`** de fato (não pular) e anexar o resumo a `STATUS.md` — é entrega deste PRD, não opcional.
- Se **qualquer** critério de aceite falhar após implementar: **NÃO** marcar como concluído. Registrar o motivo exato (comando + saída) na linha do PRD-10 em `security-audit/STATUS.md` e **PARAR**.
- Ao concluir com sucesso, atualizar `security-audit/STATUS.md`: baseline → resultado final, data, hash do commit, resumo do `pnpm audit`, nota do Dependabot e recomendação de Push Protection.
- Este PRD é **Esforço Baixo e não toca auth/segredos/dados sensíveis** — **não** exige revisão humana de merge para os workflows report-only. A **única** faceta que exige decisão humana é ligar Push Protection/branch protection (muda o fluxo do dono): apenas recomendar, nunca aplicar.
- Não incluir valores de segredo reais em nenhum comando/exemplo. Não trocar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY`.
