# PRD-09 — Backups e durabilidade do pg-blogs (pg_dump + rclone + teste de restore)

> **Metadados:** Onda 0/3 | **Quick Win** | Esforço **Médio** | Dependências: **nenhuma** | **Sem revisão humana obrigatória (aditivo — só cria arquivos novos de deploy; não toca código de aplicação)**.
> Achado de origem: **F11** (mapa de riscos) / **AP-9** (threat model).
> Este PRD é autocontido: toda referência a arquivo/linha e todo comando estão escritos aqui. Leia-o sem depender de nenhuma outra conversa.

---

## Objetivo

Criar um backup **automatizado, cifrado e offsite** dos bancos do `pg-blogs` (um DATABASE por blog replicado) — mais os volumes de dados que hotlinkam para produção (`api_data`, `central_data`) — com **política de retenção**, **agendamento na VPS** e um **procedimento de restore testado e executado ao menos uma vez**. Resolve a lacuna catastrófica de que hoje **não existe nenhum backup** desses dados: a perda do volume `pgblogs_data` significaria a perda **total e irreversível de TODOS os blogs replicados**.

---

## Contexto / Evidência de origem

**Achado F11 — Backups do pg-blogs inexistentes** (`security-audit/02-mapa-riscos.md:59`; classificação **Alto**, confiança **Fato/Alta**). Confirmado por leitura direta dos arquivos em 2026-07-21:

- **O `pg-blogs` guarda TODOS os blogs replicados num único volume, sem durabilidade gerenciada.** `docker-compose.yml:98-108` define o serviço `pg-blogs` (`image: postgres:16`), com o volume nomeado montado em `docker-compose.yml:106` (`- pgblogs_data:/var/lib/postgresql/data`) e declarado em `docker-compose.yml:168` (`pgblogs_data:`). É um Postgres **interno, sem porta no host** (`docker-compose.yml:95`), superusuário `postgres` compartilhado via `PG_BLOGS_SUPERPASS` (`docker-compose.yml:104`). Um DATABASE + uma ROLE por blog (ver `deploy/README.md:27`).
- **O próprio compose reconhece a lacuna como pendente:** comentário em `docker-compose.yml:96-97` — *"Backup externo é responsabilidade nossa (Fase 1 do plano de replicação)."*
- **O runbook de replicação também:** `deploy/README.md:156-158` — *"**backup externo dos bancos do pg-blogs é obrigatório** (script + cron na Fase 1 do plano de replicação)."*
- **O plano de provisionamento já previu o script, mas ele nunca foi criado:** `prompt_replicacao_provisionamento_blogs.md:453` lista `backup-blog.sh` na estrutura `deployments/scripts/`, e `:597` pergunta *"Se cada blog precisará de backup independente"*. Backup aparece tanto em componentes compartilháveis (`:312`) quanto isolados por blog (`:332`).
- **O CLAUDE.md marca isto como INEGOCIÁVEL e ainda pendente:** §19.6 — *"deploy/blog-ctl (backup pg_dump+rclone é INEGOCIÁVEL — pg-blogs não tem durabilidade gerenciada; ...)"*.
- **Ausência confirmada por varredura:** não há nenhum script de backup no repositório (nenhum `*.sh` contendo `pg_dump`/`rclone`; o único match de `backup-blog.sh` em todo o repo é a **menção** no plano em `prompt_replicacao_provisionamento_blogs.md:453`).
- **Contraste (bom):** os bancos do **sp011** e da **central** vivem no **Supabase**, que tem durabilidade gerenciada. O buraco é **exclusivamente** o `pg-blogs` (replicados) + os volumes locais `api_data`/`central_data`.

**Risco concreto (attack path AP-9 — `security-audit/03-threat-model.md:50`):**
> "**AP-9 — Perda de durabilidade (F11).** Sem backup do pg-blogs → perda de volume/drop/ransomware → perda total de todos os blogs, sem recuperação. STRIDE: **D (permanente), R**. Mitiga: PRD-09."

O STRIDE por componente (`security-audit/03-threat-model.md:67`) pede explicitamente para o `pg-blogs`: *"Backups + teste de restore (09)"*. O plano de auditoria (`security-audit/04-plano-auditorias.md:89-93`, Domínio 8) classifica: *"Sem backup do pg-blogs (perda total) — A08(process); CWE-1188; ATT&CK T1485/T1490 — Alto (impacto) — F11 → PRD-09"*. Crown jewel (b) em `security-audit/02-mapa-riscos.md:41`: *"pg-blogs — todos os blogs replicados, sem backup"*. Roadmap (`security-audit/06-roadmap-dimensionamento.md:15,68,82`): **Onda 0**, *"INEGOCIÁVEL; AP-9 catastrófico; barato"*, milestone M0 exige *"backup diário rodando"* (`:17`).

**Referências normativas:** OWASP Top 10 **A08:2021 (Software and Data Integrity Failures — falha de processo/recuperação)**; **CWE-1188** (Insecure Default — recurso sem proteção de recuperação); **CWE-459** (Incomplete Cleanup / falta de estratégia de recuperação, correlato); MITRE ATT&CK **T1485** (Data Destruction) e **T1490** (Inhibit System Recovery). Não é um vetor de exploração remota com CVSS clássico — é **impacto-driven**: severidade dominada pela consequência (**perda total irreversível de todos os tenants replicados**), o que o eleva à Onda 0 mesmo estando fora do caminho de ataque não-autenticado.

---

## Pré-condições

- [ ] **Branch dedicado:** `git checkout -b fix/prd-09-backups-durabilidade`
- [ ] **Baseline de testes registrado.** Este PRD é **aditivo** (só cria arquivos novos em `deploy/blog-ctl/`; **não** altera nenhum pacote de aplicação), então o baseline serve apenas de âncora de sanidade para provar que nada de código foi tocado. Rodar o comando EXATO e anotar a saída em `security-audit/STATUS.md` como linha-base ANTES de qualquer mudança:
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
  ```
- [ ] **Confirmar que os arquivos-alvo NÃO existem ainda** (para não sobrescrever nada) — deve retornar "nada":
  ```bash
  cd "c:/Users/Usuario(a) Master/sp011" && ls deploy/blog-ctl 2>/dev/null || echo "deploy/blog-ctl ainda nao existe (esperado)"
  ```
- [ ] **Ler ANTES de editar/criar** (para reancorar caminhos e convenções; números de linha podem ter deslocado):
  - `docker-compose.yml` (raiz — serviço `pg-blogs` em `:98-108`; volumes em `:163-169`)
  - `deploy/README.md` (runbook de replicação; regra de backup em `:156-158`; acesso a banco de blog replicado)
  - `prompt_replicacao_provisionamento_blogs.md` (estrutura `deployments/scripts/` em `:417-456`; `backup-blog.sh` em `:453`)
  - `CLAUDE.md` §12 (padrões de acesso ao pg-blogs), §13 (regras invioláveis: **NUNCA `docker system prune --volumes`**; heredoc não funciona no terminal do usuário), §18 (comandos de runbook completos p/ colar), §19.6 (blog-ctl pendente)
  - `deploy/beeesportes/GO_LIVE.md` (modelo de runbook copy-paste do usuário: `cd` no início, variável no topo, `grep` de conferência, sem heredoc)
- [ ] **Confirmar acesso à VPS** com o operador. A criação dos scripts é local (dev), mas **rodar o backup, listar o remoto, testar o restore e instalar o agendamento acontecem NA VPS** — Docker/pg_dump/rclone não rodam no ambiente de dev. O operador executa os blocos de VPS e cola as saídas no `security-audit/STATUS.md`.
- [ ] **Confirmar com o operador o destino offsite** (provedor do remoto rclone: S3/B2/Storage Box/Drive etc.) e onde ficará a **passphrase de cifra**. Estes dois valores são operacionais e não vão no repositório.

---

## Escopo (ações em ordem)

> **Regra de ouro deste PRD:** só cria arquivos NOVOS dentro de `deploy/blog-ctl/`. **Não** edita `docker-compose.yml`, **não** edita código de aplicação, **não** toca segredos existentes. Todo bloco destinado a ser **colado pelo operador** (README + comandos de verificação) é **auto-suficiente e sem heredoc** (convenção do usuário, CLAUDE.md §13/§18): `cd` no início, valores do usuário como variável no topo, `grep` de conferência no fim. Os **scripts `.sh`** também são escritos **sem heredoc** (usar `psql -c`/`-Atqc`, loops e pipes) para que possam ser lidos e auditados linha a linha.

### A. Estrutura e configuração

1. **Criar o diretório** `deploy/blog-ctl/` (novo). Todos os artefatos abaixo vivem nele. Esse é o caminho que o CLAUDE.md §19.6 reserva para os utilitários de operação (`deploy/blog-ctl`).
2. **Criar `deploy/blog-ctl/backup.conf.example`** — arquivo de configuração de exemplo (versionado, **sem segredos reais**), com placeholders e comentários. Campos mínimos:
   - `REPO_DIR=/opt/sp011` (onde roda o `docker compose`)
   - `LOCAL_BACKUP_DIR=/opt/backups` (raiz local dos dumps; fora da árvore do git)
   - `PASSPHRASE_FILE=/opt/blog-ctl/backup.pass` (arquivo `chmod 600`, dono root, **fora do repo**; contém a passphrase de cifra GPG)
   - `RCLONE_REMOTE=offsite` (nome do remoto configurado via `rclone config`)
   - `RCLONE_PATH=sp011-backups` (bucket/pasta no remoto)
   - `RETAIN_LOCAL_DAYS=7` (retenção local)
   - `RETAIN_REMOTE_DAYS=30` (retenção offsite)
   - Cabeçalho comentando: "COPIE para `/opt/blog-ctl/backup.conf` e preencha; NUNCA versione o `.conf` preenchido nem a passphrase."
3. **Criar `deploy/blog-ctl/.gitignore`** contendo `backup.conf` e `*.pass` — para impedir que a config preenchida ou a passphrase sejam commitadas por acidente.

### B. Script principal de backup dos bancos

4. **Criar `deploy/blog-ctl/backup-blog.sh`** (executável; `#!/usr/bin/env bash` + `set -euo pipefail`). Comportamento:
   - Carrega a config: `source "${1:-/opt/blog-ctl/backup.conf}"` (aceita caminho de config como 1º argumento; default `/opt/blog-ctl/backup.conf`).
   - Define `STAMP="$(date +%Y%m%d-%H%M%S)"` e `OUT="$LOCAL_BACKUP_DIR/pg-blogs/$STAMP"`; `mkdir -p "$OUT"`.
   - **Enumera os bancos de blog** no `pg-blogs`, excluindo templates e o banco de manutenção `postgres`, via (sem heredoc; `docker compose exec` conecta como superusuário local sem senha, igual ao padrão do CLAUDE.md §12):
     `docker compose -f "$REPO_DIR/docker-compose.yml" exec -T pg-blogs psql -U postgres -Atqc "SELECT datname FROM pg_database WHERE datistemplate=false AND datname NOT IN ('postgres');"`
   - **Para cada banco**, faz `pg_dump` em **formato custom comprimido** e cifra em fluxo (nada em claro no disco), gravando `<db>.dump.gpg`:
     `docker compose -f "$REPO_DIR/docker-compose.yml" exec -T pg-blogs pg_dump -U postgres -Fc -d "$db" | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASSPHRASE_FILE" -o "$OUT/$db.dump.gpg"`
   - **Valida cada dump**: aborta com erro se o arquivo `.dump.gpg` tiver tamanho **0** (`[ -s "$OUT/$db.dump.gpg" ]`), garantindo que nenhum backup vazio seja considerado sucesso.
   - Escreve um manifesto `"$OUT/MANIFEST.txt"` com data, lista de bancos e o `sha256sum` de cada `.dump.gpg` (para verificação de integridade no restore).
   - **Envia offsite:** `rclone copy "$OUT" "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs/$STAMP"` (com `--transfers 2 --checkers 4`; sem `--verbose` no cron para não poluir log).
   - **Retenção local:** apaga diretórios de dump locais mais antigos que `RETAIN_LOCAL_DAYS` — `find "$LOCAL_BACKUP_DIR/pg-blogs" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETAIN_LOCAL_DAYS" -exec rm -rf {} +`.
   - **Retenção offsite:** `rclone delete "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs" --min-age "${RETAIN_REMOTE_DAYS}d"` seguido de `rclone rmdirs "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs" --leave-root` (limpa diretórios vazios).
   - Loga início/fim e contagem de bancos processados em stdout (o agendador captura em journald/arquivo).
   - **Nunca** imprime nem grava a passphrase, nem qualquer valor de `PG_BLOGS_SUPERPASS`, em log/arquivo/stdout. O `pg_dump` roda via `exec` (conexão local, sem senha) — o script **não** manipula a senha do Postgres.

### C. Script de backup dos volumes de dados

5. **Criar `deploy/blog-ctl/backup-volumes.sh`** (executável; mesma cabeçalho `set -euo pipefail`, mesma config). Faz backup **cifrado + offsite** dos volumes que hotlinkam para produção e cuja perda é irrecuperável:
   - **`central_data`** (compose raiz, projeto `sp011`): contém `/data/news-images` — imagens hotlinkadas por artigos publicados (CLAUDE.md §10: "NUNCA apagar: artigos publicados hotlinkam").
   - **`api_data`** (compose raiz, projeto `sp011`): contém `/data/db-config.enc` e `/data/uploads` (uploads do sp011 gravados em disco desde jul/2026).
   - **`api_data` de cada blog replicado** em `/opt/blogs/<id>/` (contém o `db-config.enc` cifrado de cada blog — a conexão do blog ao seu banco).
   - Técnica (streaming, sem plaintext em disco): para cada volume, `docker run --rm -v <volume>:/src:ro alpine tar -C /src -cf - . | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASSPHRASE_FILE" -o "$OUT/<nome>.tar.gpg"`, seguido do mesmo `rclone copy`. O nome real do volume é o do compose (`sp011_api_data`, `sp011_central_data`, `blog-<id>_api_data`) — **descobrir dinamicamente** com `docker volume ls --format '{{.Name}}' | grep -E '_(api|central)_data$'` em vez de hardcodar, para funcionar à medida que novos blogs nascem.
   - Mesma validação de tamanho não-zero, manifesto com `sha256sum`, e mesma política de retenção local/offsite (sob o prefixo `.../volumes/$STAMP`).

### D. Script de restore (usado no teste obrigatório e no desastre real)

6. **Criar `deploy/blog-ctl/restore-blog.sh`** (executável; `set -euo pipefail`). Assinatura: `restore-blog.sh <arquivo.dump.gpg> <banco_destino> [caminho_config]`. Comportamento:
   - Carrega config; lê `PASSPHRASE_FILE`.
   - **Cria o banco destino se não existir** (para o teste, um banco temporário): `docker compose -f "$REPO_DIR/docker-compose.yml" exec -T pg-blogs psql -U postgres -c "CREATE DATABASE \"$TARGET\";"` (idempotente: primeiro `DROP DATABASE IF EXISTS` **apenas** se o nome começar com o prefixo de teste `restore_test_`, para nunca destruir um banco de produção por engano).
   - **Restaura em fluxo** (decifra e injeta via stdin, sem plaintext em disco): `gpg --batch --quiet --decrypt --passphrase-file "$PASSPHRASE_FILE" "$DUMP" | docker compose -f "$REPO_DIR/docker-compose.yml" exec -T pg-blogs pg_restore --no-owner --no-privileges -d "$TARGET"`.
   - Ao final, imprime a **contagem de tabelas** do schema `public` do banco restaurado (`SELECT count(*) FROM information_schema.tables WHERE table_schema='public';`) para conferência imediata.
   - **Guardas de segurança:** recusa (exit 1) se `TARGET` for um dos IDs reservados/produção sem a flag explícita `--force` (proteção contra restaurar por cima de um banco vivo). O `DROP DATABASE` só é permitido para nomes com prefixo `restore_test_`.

### E. Agendamento na VPS (systemd timer — primário; cron — alternativa)

7. **Criar `deploy/blog-ctl/sp011-backup.service`** — unit systemd `Type=oneshot` que roda `/opt/blog-ctl/backup-blog.sh` e depois `/opt/blog-ctl/backup-volumes.sh` (com `WorkingDirectory=/opt/sp011`). Comentar no arquivo que ele é instalado copiando para `/etc/systemd/system/`.
8. **Criar `deploy/blog-ctl/sp011-backup.timer`** — timer diário (`OnCalendar=*-*-* 03:30:00`, `Persistent=true` para recuperar execução perdida se a VPS estava desligada). Comentar a instalação (`systemctl enable --now sp011-backup.timer`).
9. **Documentar a alternativa cron** no README (ação 10): linha de crontab do root `30 3 * * * /opt/blog-ctl/backup-blog.sh >> /var/log/blog-backup.log 2>&1 && /opt/blog-ctl/backup-volumes.sh >> /var/log/blog-backup.log 2>&1`. O operador escolhe **um** dos dois mecanismos.

### F. Runbook de operação (documento que o operador cola)

10. **Criar `deploy/blog-ctl/README.md`** — runbook copy-paste no estilo `deploy/beeesportes/GO_LIVE.md` (CLAUDE.md §18): `cd` no início de cada bloco, variáveis do operador no topo, `grep`/`ls` de conferência no fim, **sem heredoc**. Seções obrigatórias:
    - **Pré-requisitos na VPS (uma vez):** instalar `gnupg` e `rclone` (`apt-get update && apt-get install -y gnupg rclone`); criar `/opt/blog-ctl/` e a passphrase (`install -d -m 700 /opt/blog-ctl` + gravar a passphrase em `/opt/blog-ctl/backup.pass` com `chmod 600`); rodar `rclone config` para criar o remoto (interativo — descrever os passos, sem colar credenciais reais); copiar `backup.conf.example → /opt/blog-ctl/backup.conf` e preencher; copiar os `.sh` e os units para os destinos e dar `chmod +x`.
    - **⚠️ AVISO INEGOCIÁVEL sobre a passphrase:** a passphrase de cifra deve ser guardada **também offline, fora da VPS** (gerenciador de senhas do operador). Se a VPS for perdida junto com a passphrase, **os backups cifrados são irrecuperáveis** — anula o propósito do backup.
    - **Rodar backup manual / verificar.**
    - **Política de retenção** (diário local 7 dias / offsite 30 dias; enhancement futuro: GFS semanal/mensal).
    - **Procedimento de restore de desastre** (real): recriar `pg-blogs`, restaurar cada `<db>.dump.gpg` com `restore-blog.sh` no banco `<db>` original, restaurar os volumes `*.tar.gpg`.
    - **Teste de restore (obrigatório, executar ao menos uma vez)** — passos exatos (ver "Comandos de verificação", Bloco 3).
    - **Nota de segurança operacional:** confirmar que o remoto rclone é **privado** e idealmente com **object-lock/immutability** (defesa contra ransomware/T1490); os dumps contêm PII (e-mails, hashes de senha, `twoFactorSecret` — cf. PRD-01b) — por isso são **cifrados** antes de sair da VPS.

### G. Segurança e higiene do próprio backup

11. **Garantir modos de arquivo no README:** scripts `755`; `backup.conf` e `backup.pass` `600`/`700` dono root; `LOCAL_BACKUP_DIR` (`/opt/backups`) `700`. Nenhum artefato de backup deve ficar dentro de `/opt/sp011` (árvore do git) para não ser servido nem commitado.
12. **Reforçar a regra do CLAUDE.md §13 no README:** **NUNCA** rodar `docker system prune --volumes` (apaga os volumes de banco locais — é exatamente o desastre que este PRD protege).

---

## Fora de escopo

- **NÃO** alterar `docker-compose.yml` (nem adicionar serviço/volume de backup no compose). Este PRD é aditivo em `deploy/blog-ctl/`; o hardening de `mem_limit`/`healthcheck`/`security_opt` do `pg-blogs` é do **PRD-07** — não tocar.
- **NÃO** fazer backup dos bancos do **sp011** nem da **central**: ambos estão no **Supabase** (durabilidade gerenciada). O escopo é só o `pg-blogs` + volumes locais.
- **NÃO** alterar `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` nem qualquer segredo/env (a cifra do backup usa uma passphrase GPG **própria**, independente da chave de envelope da aplicação; re-chaveamento é PRD-01a/01b).
- **NÃO** mexer em código de aplicação, migrações, schema Drizzle ou `ensureSchema.ts`.
- **NÃO** publicar porta do `pg-blogs` no host para facilitar backup — o `pg_dump` roda via `docker compose exec` na rede interna; a superfície de rede não muda (isso é território do PRD-08).
- **NÃO** construir o provisionador autônomo / tela "Novo blog" (Fase 2 do plano) — só o utilitário de backup (Fase 1).
- **NÃO** implementar replicação/streaming físico (WAL archiving/PITR): logical dump diário + offsite é o alvo desta onda; PITR é enhancement futuro.

---

## Comandos de verificação

> **Bloco 1 (estático)** roda no **ambiente de dev** (Windows/Git Bash na raiz do repo) — o agente consegue executar. **Blocos 2–4 (VPS)** exigem Docker/pg_dump/rclone/systemd e são executados pelo **operador na VPS**, que cola as saídas no `security-audit/STATUS.md`. Para cada comando está declarado o que caracteriza **SUCESSO**.

```bash
# === BLOCO 1 — estático (dev, Git Bash na raiz do repo) — executável pelo agente ===
cd "c:/Users/Usuario(a) Master/sp011"

# 1a) Os artefatos foram criados no lugar certo.
ls -1 deploy/blog-ctl/backup-blog.sh deploy/blog-ctl/backup-volumes.sh deploy/blog-ctl/restore-blog.sh deploy/blog-ctl/README.md deploy/blog-ctl/backup.conf.example deploy/blog-ctl/sp011-backup.service deploy/blog-ctl/sp011-backup.timer
# SUCESSO: as 7 linhas listadas existem (nenhum "No such file").

# 1b) Sintaxe dos 3 scripts válida (Git Bash tem bash).
for f in deploy/blog-ctl/backup-blog.sh deploy/blog-ctl/backup-volumes.sh deploy/blog-ctl/restore-blog.sh; do bash -n "$f" && echo "OK $f"; done
# SUCESSO: "OK <arquivo>" para os 3, sem erro de sintaxe.

# 1c) Nenhum heredoc em scripts nem no runbook (convenção do usuário, CLAUDE.md §13).
grep -rn "<<" deploy/blog-ctl/
# SUCESSO: 0 ocorrências.

# 1d) Nenhum segredo real embutido (passphrase/senha/superpass hardcodada).
grep -rniE "PG_BLOGS_SUPERPASS=[^$]|passphrase[[:space:]]*=|password[[:space:]]*=" deploy/blog-ctl/
# SUCESSO: 0 ocorrências (senhas só vêm de arquivo/config em runtime, nunca literais).

# 1e) Os scripts usam pg_dump/rclone/gpg e cifram antes do offsite.
grep -rln "pg_dump" deploy/blog-ctl/backup-blog.sh && grep -rln "gpg" deploy/blog-ctl/backup-blog.sh && grep -rln "rclone" deploy/blog-ctl/backup-blog.sh
# SUCESSO: o arquivo backup-blog.sh aparece nas 3 buscas (usa dump + cifra + offsite).

# 1f) config de exemplo e ignore protegem os segredos.
grep -q "backup.pass\|backup.conf" deploy/blog-ctl/.gitignore && echo "gitignore OK"
# SUCESSO: "gitignore OK".

# 1g) Baseline de sanidade — nada de código de aplicação foi tocado (== baseline das Pré-condições).
cd "c:/Users/Usuario(a) Master/sp011/artifacts/api-server" && node --test
# SUCESSO: mesmo resultado do baseline registrado nas Pré-condições (aditivo não altera testes).

# 1h) git status confirma que só há arquivos NOVOS sob deploy/blog-ctl/ (nada modificado fora dele).
cd "c:/Users/Usuario(a) Master/sp011" && git status --porcelain
# SUCESSO: todas as linhas começam com "??" e apontam para deploy/blog-ctl/ (nenhum " M" fora do diretório).
```

```bash
# === BLOCO 2 — backup real + offsite (VPS, operador) ===
cd /opt/sp011
# pré-requisitos já instalados (gnupg, rclone, /opt/blog-ctl/backup.conf, passphrase, remoto rclone).
/opt/blog-ctl/backup-blog.sh /opt/blog-ctl/backup.conf
# SUCESSO: termina com exit 0; imprime a contagem de bancos processados (>=1).

# 2a) Cada blog gerou um dump NÃO-VAZIO localmente:
ls -lS /opt/backups/pg-blogs/*/ | tail -n +2
# SUCESSO: um <blog>.dump.gpg por banco de blog, todos com tamanho > 0.

# 2b) O offsite recebeu os arquivos:
RCLONE_REMOTE=offsite; RCLONE_PATH=sp011-backups   # ajustar aos valores do backup.conf
rclone lsl "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs" | tail
# SUCESSO: lista os .dump.gpg do STAMP atual no remoto, com tamanhos > 0.

# 2c) Backup dos volumes:
/opt/blog-ctl/backup-volumes.sh /opt/blog-ctl/backup.conf
rclone lsl "$RCLONE_REMOTE:$RCLONE_PATH/volumes" | tail
# SUCESSO: aparecem sp011_api_data.tar.gpg, sp011_central_data.tar.gpg e um blog-<id>_api_data.tar.gpg por blog replicado.
```

```bash
# === BLOCO 3 — TESTE DE RESTORE obrigatório (VPS, operador) — o gate do PRD ===
cd /opt/sp011
BLOG=resenhavip   # escolher um blog replicado existente com dados
LATEST=$(ls -1dt /opt/backups/pg-blogs/*/ | head -1)
# 3a) restaurar num banco TEMPORÁRIO isolado:
/opt/blog-ctl/restore-blog.sh "$LATEST/$BLOG.dump.gpg" "restore_test_$BLOG" /opt/blog-ctl/backup.conf
# SUCESSO: exit 0; imprime a contagem de tabelas do banco restaurado.

# 3b) conferir que o restore tem o MESMO nº de tabelas que a origem (schema íntegro):
echo -n "origem:    "; docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
echo -n "restaurado:"; docker compose exec -T pg-blogs psql -U postgres -d "restore_test_$BLOG" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
# SUCESSO: os dois números são IGUAIS e > 0.

# 3c) conferir uma contagem de linhas de uma tabela real (dado restaurado, não só schema):
echo -n "origem articles:    "; docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -tAc "SELECT count(*) FROM articles;"
echo -n "restaurado articles:"; docker compose exec -T pg-blogs psql -U postgres -d "restore_test_$BLOG" -tAc "SELECT count(*) FROM articles;"
# SUCESSO: os dois números são IGUAIS (se a tabela 'articles' não existir num blog muito novo, repetir com 'settings' ou 'users').

# 3d) limpar o banco temporário (não deixar lixo):
docker compose exec -T pg-blogs psql -U postgres -c "DROP DATABASE restore_test_$BLOG;"
# SUCESSO: DROP DATABASE retorna sem erro.
```

```bash
# === BLOCO 4 — agendamento instalado e ativo (VPS, operador) ===
# systemd (primário):
systemctl list-timers --all | grep sp011-backup
# SUCESSO: aparece sp011-backup.timer com NEXT (próxima execução) agendado.
systemctl status sp011-backup.timer | grep -i "active"
# SUCESSO: "Active: active (waiting)".

# --- OU, se o operador escolheu cron em vez de systemd: ---
crontab -l | grep backup-blog.sh
# SUCESSO: a linha diária do backup aparece no crontab do root.
```

---

## Critérios de aceite

- [ ] `deploy/blog-ctl/` contém `backup-blog.sh`, `backup-volumes.sh`, `restore-blog.sh`, `README.md`, `backup.conf.example`, `.gitignore`, `sp011-backup.service` e `sp011-backup.timer` (Bloco 1a).
- [ ] `bash -n` passa nos 3 scripts; `grep -rn "<<" deploy/blog-ctl/` retorna **0** (sem heredoc); `grep` de segredo hardcodado retorna **0** (Blocos 1b/1c/1d).
- [ ] `backup-blog.sh` usa `pg_dump` + `gpg` + `rclone` (cifra antes do offsite) e **valida dump não-vazio** (Bloco 1e; leitura do script).
- [ ] `.gitignore` protege `backup.conf` e `*.pass`; `git status` mostra **apenas** arquivos novos sob `deploy/blog-ctl/` (Blocos 1f/1h) — nenhum arquivo de aplicação modificado; `node --test` do api-server == baseline (Bloco 1g).
- [ ] **(VPS)** `backup-blog.sh` roda com exit 0 e gera **um `.dump.gpg` não-vazio por banco de blog**; `rclone lsl` mostra os arquivos no remoto (Bloco 2).
- [ ] **(VPS)** `backup-volumes.sh` gera `.tar.gpg` cifrados de `sp011_api_data`, `sp011_central_data` e do `api_data` de cada blog replicado, e os envia offsite (Bloco 2c).
- [ ] **(VPS — GATE)** O **teste de restore foi executado ao menos uma vez**: o dump de um blog restaura num banco temporário e a **contagem de tabelas** e a **contagem de linhas de uma tabela real** batem com a origem; o banco temporário foi removido (Bloco 3).
- [ ] **(VPS)** O agendamento diário está **instalado e ativo** — `systemctl list-timers` mostra `sp011-backup.timer` com próxima execução **OU** `crontab -l` mostra a linha do backup (Bloco 4).
- [ ] `deploy/blog-ctl/README.md` documenta: pré-requisitos, aviso INEGOCIÁVEL da passphrase offline, retenção, procedimento de restore de desastre, o teste de restore e a regra **NUNCA `docker system prune --volumes`**.
- [ ] `security-audit/STATUS.md` atualizado com: PRD-09, hash de commit, saídas dos Blocos 1–4 (incluindo as contagens do teste de restore), destino offsite (nome do remoto, **sem credenciais**) e o mecanismo de agendamento escolhido.

---

## Definition of Done

Existe um backup **diário, cifrado e offsite** de **todos os bancos do `pg-blogs`** e dos volumes `api_data`/`central_data` (raiz + blogs replicados), com **retenção** local e remota configuradas; o **agendamento** (systemd timer ou cron) está **ativo na VPS**; e o **procedimento de restore foi executado com sucesso ao menos uma vez** contra um banco temporário, com contagens de tabelas e de linhas conferidas iguais à origem. A mudança está mergeada na `main` (aditiva, só `deploy/blog-ctl/`), e o `security-audit/STATUS.md` registra as evidências. O milestone **M0** ("backup diário rodando", `security-audit/06-roadmap-dimensionamento.md:17`) fica satisfeito para o `pg-blogs`.

---

## Dependências

- **Nenhuma dependência dura.** É **Onda 0** e pode rodar em paralelo com qualquer outro PRD (`security-audit/06-roadmap-dimensionamento.md:15,68`).
- **Complementaridade (não bloqueante):** o **PRD-07** adiciona `mem_limit`/`healthcheck`/`security_opt` ao `pg-blogs` no `docker-compose.yml` — arquivo diferente do escopo deste PRD (que só cria `deploy/blog-ctl/`), sem conflito de merge. O **PRD-01b** (higiene de segredos em repouso) é a razão de os dumps conterem `twoFactorSecret`/hashes — reforça a exigência de **cifrar** os backups (já contemplada aqui).

---

## Prioridade e esforço

- **Prioridade:** **Quick Win — Onda 0/3.** Fora do caminho de ataque não-autenticado, mas **AP-9 é perda total irreversível** e o custo é baixo; impacto catastrófico vence a regra de exposição (`security-audit/06-roadmap-dimensionamento.md:68`). Marcado **INEGOCIÁVEL** no CLAUDE.md §19.6.
- **Esforço:** **Médio.** Só cria scripts/units/runbook (nenhuma mudança de código de aplicação), mas exige testar cifra, `pg_dump` via `exec`, `rclone`, retenção e — o passo que consome tempo — **executar e validar o restore** na VPS com o operador.

---

## Plano de rollback

- **Reverter os arquivos:** como o PRD é **puramente aditivo**, o rollback é remover o diretório novo. Se já commitado: `git revert <hash-do-commit>` (ou `git rm -r deploy/blog-ctl && git commit`). Nenhum serviço em produção depende desses arquivos — reverter **não** afeta o funcionamento dos blogs.
- **Desativar o agendamento na VPS** (se o timer/cron causar ruído e for preciso pausar sem reverter o código):
  ```bash
  systemctl disable --now sp011-backup.timer
  # ou, se cron: crontab -l | grep -v backup-blog.sh | crontab -
  ```
- **Nota:** nenhum comando deste PRD apaga dados de produção. O único `DROP DATABASE` do fluxo é o do **banco temporário** `restore_test_*` no teste de restore (guardado por prefixo). **Nunca** rodar `docker system prune --volumes` (CLAUDE.md §13) durante rollback — isso destruiria os volumes que o PRD protege.

---

## Notas de execução para o agente

- **Trabalhe SOMENTE neste PRD (PRD-09).** Não misture com o PRD-07 (hardening do compose) nem com a Fase 2 (provisionador autônomo), mesmo que toquem `pg-blogs`/`deploy/`.
- **Só crie arquivos NOVOS em `deploy/blog-ctl/`.** Não edite `docker-compose.yml`, código de aplicação, nem qualquer `.env`/segredo. Confirme com `git status --porcelain` (Bloco 1h) que nada fora de `deploy/blog-ctl/` foi modificado.
- **Regras do repo a respeitar:** todo bloco copy-paste (README + verificação) é **auto-suficiente e SEM heredoc** (CLAUDE.md §13/§18) — `cd` no início, variável no topo, `grep`/`ls` de conferência no fim; scripts `.sh` também sem heredoc; imports de teste com extensão `.ts` explícita não se aplicam aqui (sem código); `node --test` dentro do pacote; nunca unicode literal em regex; **nunca** incluir valores de segredo reais em comandos/exemplos/logs.
- **Isolamento:** o backup enumera os bancos dinamicamente do `pg-blogs` — **não** hardcode a lista de blogs nem conteúdo por blog (regra de isolamento do CLAUDE.md); use `docker volume ls`/`pg_database` para descobrir alvos.
- **A parte de código (scripts + units + runbook) o agente cria e valida localmente (Bloco 1). Os Blocos 2–4 rodam NA VPS** — se o agente não tiver acesso à VPS, ele entrega os artefatos + o runbook e **sinaliza ao operador** que precisa executar Blocos 2–4 e colar as saídas no STATUS.md; o PRD só é **DONE** quando o **teste de restore (Bloco 3)** passou e está registrado.
- **Sensibilidade dos dados:** os dumps contêm PII (e-mails, hashes de senha, `twoFactorSecret`). Garanta que a cifra GPG acontece **antes** de qualquer `rclone copy` (nada em claro sai da VPS) e que a passphrase nunca é logada. No README, instrua o operador a confirmar que o **remoto é privado** (idealmente com object-lock/immutability como defesa anti-ransomware, T1490).
- **Se QUALQUER critério de aceite falhar após implementar, NÃO marque como concluído:** registre o motivo exato (comando, saída, `arquivo:linha`) em `security-audit/STATUS.md` (criar o arquivo se não existir; uma entrada por PRD) e **PARE**. Em especial, se o **teste de restore** não bater as contagens, trate como **falha do PRD** — um backup que não restaura não conta.
- **Ao concluir com sucesso, atualize `security-audit/STATUS.md`** com: PRD-09, hash de commit, saídas dos Blocos 1–4, contagens do teste de restore, nome do remoto offsite (**sem credenciais**) e o mecanismo de agendamento.
- **Revisão humana:** o PRD é aditivo e **não exige revisão humana de código**. Ainda assim, como o fluxo movimenta **dados sensíveis para fora da VPS**, sinalize ao operador para **validar o destino offsite (privacidade/immutability) e a guarda da passphrase** antes de considerar o backup confiável — validação operacional, não bloqueio de merge.
