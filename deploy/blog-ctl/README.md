# blog-ctl — Backup, restore e durabilidade do pg-blogs (PRD-09)

Backup **diário, cifrado e offsite** de todos os bancos do `pg-blogs` (um por
blog replicado) e dos volumes que hotlinkam para produção (`api_data`,
`central_data`). Fecha o achado **F11 / AP-9**: hoje a perda do volume
`pgblogs_data` significaria a perda **total e irreversível de TODOS os blogs
replicados** (os bancos do sp011 e da central vivem no Supabase, com
durabilidade gerenciada — o buraco é só o `pg-blogs` e os volumes locais).

> ⚠️ **CHAVE DE CIFRA — INEGOCIÁVEL.** A passphrase GPG (`/opt/blog-ctl/backup.pass`)
> deve ser guardada **também offline, fora da VPS** (no gerenciador de senhas do
> operador). Se a VPS for perdida junto com a passphrase, os backups cifrados são
> **irrecuperáveis** — o que anula todo o propósito do backup.
>
> ⚠️ **NUNCA** rode `docker system prune --volumes` (CLAUDE.md §13): isso apaga
> os volumes de banco locais — exatamente o desastre que este utilitário protege.

Arquivos deste diretório:

| Arquivo | O que é |
|---|---|
| `backup-blog.sh` | Dump cifrado + offsite de cada banco do pg-blogs |
| `backup-volumes.sh` | Tar cifrado + offsite dos volumes `*_api_data` / `*_central_data` |
| `restore-blog.sh` | Restaura um dump num banco (usado no teste e no desastre real) |
| `backup.conf.example` | Modelo de configuração (copie para `/opt/blog-ctl/backup.conf`) |
| `sp011-backup.service` / `.timer` | Agendamento systemd (primário) |
| `.gitignore` | Impede versionar `backup.conf` e `*.pass` |

---

## 1) Pré-requisitos na VPS (uma vez)

```bash
# Instalar dependencias.
apt-get update && apt-get install -y gnupg rclone

# Criar o diretorio de controle (dono root, 700) e a chave de cifra (600).
install -d -m 700 /opt/blog-ctl
# Gere uma chave forte e grave-a no arquivo (guarde a MESMA chave OFFLINE tambem):
openssl rand -base64 48 > /opt/blog-ctl/backup.pass
chmod 600 /opt/blog-ctl/backup.pass

# Raiz local dos dumps, FORA da arvore do git.
install -d -m 700 /opt/backups

# Copiar os scripts e units do repo para os destinos.
cp /opt/sp011/deploy/blog-ctl/backup-blog.sh    /opt/blog-ctl/
cp /opt/sp011/deploy/blog-ctl/backup-volumes.sh /opt/blog-ctl/
cp /opt/sp011/deploy/blog-ctl/restore-blog.sh   /opt/blog-ctl/
chmod 755 /opt/blog-ctl/backup-blog.sh /opt/blog-ctl/backup-volumes.sh /opt/blog-ctl/restore-blog.sh

# Config: copiar o exemplo e preencher (REPO_DIR, remoto, retencao).
cp /opt/sp011/deploy/blog-ctl/backup.conf.example /opt/blog-ctl/backup.conf
chmod 600 /opt/blog-ctl/backup.conf
# edite /opt/blog-ctl/backup.conf conforme sua VPS.
grep -E '^(REPO_DIR|LOCAL_BACKUP_DIR|PASSPHRASE_FILE|RCLONE_REMOTE|RCLONE_PATH)=' /opt/blog-ctl/backup.conf
```

Configurar o **remoto offsite** com `rclone config` (interativo):

```bash
rclone config
# 'n' (new remote) -> nome: offsite -> escolha o provedor (S3/B2/Storage Box/Drive)
# -> preencha as credenciais do provedor -> 'q' para sair.
# Confira que o remoto responde (deve listar sem erro, mesmo que vazio):
rclone lsd offsite:
```

> **Segurança do destino:** use um bucket/pasta **privado** e, se o provedor
> permitir, com **object-lock/immutability** (defesa anti-ransomware, ATT&CK
> T1490). Os dumps contêm PII (e-mails, hashes de senha, `twoFactorSecret`) — por
> isso são **cifrados** antes de sair da VPS.

---

## 2) Rodar um backup manual e conferir

```bash
cd /opt/sp011
/opt/blog-ctl/backup-blog.sh /opt/blog-ctl/backup.conf
# SUCESSO: exit 0 e "[backup-blog] OK: <N> bancos ...".

# Cada blog gerou um dump NAO-VAZIO localmente:
ls -lS /opt/backups/pg-blogs/*/ | tail -n +2

# O offsite recebeu os arquivos (ajuste os valores ao seu backup.conf):
RCLONE_REMOTE=offsite; RCLONE_PATH=sp011-backups
rclone lsl "$RCLONE_REMOTE:$RCLONE_PATH/pg-blogs" | tail

# Backup dos volumes:
/opt/blog-ctl/backup-volumes.sh /opt/blog-ctl/backup.conf
rclone lsl "$RCLONE_REMOTE:$RCLONE_PATH/volumes" | tail
# SUCESSO: sp011_api_data.tar.gpg, sp011_central_data.tar.gpg e um
#          blog-<id>_api_data.tar.gpg por blog replicado.
```

---

## 3) Teste de restore (OBRIGATÓRIO — executar ao menos uma vez)

Um backup que não restaura não conta. Restaura num banco **temporário** isolado
(prefixo `restore_test_`, protegido pelas guardas do `restore-blog.sh`).

```bash
cd /opt/sp011
BLOG=resenhavip                                   # um blog replicado com dados
LATEST=$(ls -1dt /opt/backups/pg-blogs/*/ | head -1)

/opt/blog-ctl/restore-blog.sh "$LATEST/$BLOG.dump.gpg" "restore_test_$BLOG" /opt/blog-ctl/backup.conf
# SUCESSO: exit 0; imprime a contagem de tabelas do banco restaurado.

# Conferir schema integro (mesmo nº de tabelas que a origem):
echo -n "origem:     "; docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
echo -n "restaurado: "; docker compose exec -T pg-blogs psql -U postgres -d "restore_test_$BLOG" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
# SUCESSO: os dois numeros sao IGUAIS e > 0.

# Conferir dado real (nao so schema) — se 'articles' nao existir num blog novo, use 'settings' ou 'users':
echo -n "origem articles:     "; docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -tAc "SELECT count(*) FROM articles;"
echo -n "restaurado articles: "; docker compose exec -T pg-blogs psql -U postgres -d "restore_test_$BLOG" -tAc "SELECT count(*) FROM articles;"

# Limpar o banco temporario:
docker compose exec -T pg-blogs psql -U postgres -c "DROP DATABASE restore_test_$BLOG;"
```

---

## 4) Agendamento diário

**systemd (primário):**

```bash
cp /opt/sp011/deploy/blog-ctl/sp011-backup.service /etc/systemd/system/
cp /opt/sp011/deploy/blog-ctl/sp011-backup.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sp011-backup.timer
systemctl list-timers --all | grep sp011-backup      # deve mostrar NEXT agendado
systemctl status sp011-backup.timer | grep -i active # "active (waiting)"
```

**cron (alternativa — escolha UM dos dois):**

```bash
# Adicione ao crontab do root (crontab -e):
30 3 * * * /opt/blog-ctl/backup-blog.sh >> /var/log/blog-backup.log 2>&1 && /opt/blog-ctl/backup-volumes.sh >> /var/log/blog-backup.log 2>&1
crontab -l | grep backup-blog.sh
```

---

## 5) Restore de desastre (perda real do pg-blogs)

1. Recriar a infra (`cd /opt/sp011 && docker compose up -d pg-blogs`).
2. Trazer o último STAMP do offsite: `rclone copy offsite:sp011-backups/pg-blogs/<STAMP> /opt/backups/pg-blogs/<STAMP>`.
3. Recriar ROLE + DATABASE de cada blog (ver `deploy/README.md` §replicação).
4. Restaurar cada banco pelo NOME original, com `--force`:
   `/opt/blog-ctl/restore-blog.sh /opt/backups/pg-blogs/<STAMP>/<blog>.dump.gpg <blog> /opt/blog-ctl/backup.conf --force`
5. Restaurar os volumes (`*.tar.gpg`): decifrar com `gpg --decrypt --passphrase-file /opt/blog-ctl/backup.pass` e extrair com `tar -x` para dentro do volume recriado.
6. Reconferir cada blog no painel central (Testar conexão → "online").

---

## 6) Retenção e higiene

- **Retenção padrão:** local 7 dias (`RETAIN_LOCAL_DAYS`), offsite 30 dias
  (`RETAIN_REMOTE_DAYS`). Enhancement futuro: GFS (semanal/mensal) e WAL/PITR.
- **Modos de arquivo:** scripts `755`; `backup.conf` e `backup.pass` `600` dono
  root; `/opt/blog-ctl` e `/opt/backups` `700`. Nenhum artefato de backup dentro
  de `/opt/sp011` (árvore do git).
- **Verificar de tempos em tempos** que o timer roda (`journalctl -u sp011-backup.service --since "-2 days"`) e refazer o teste de restore periodicamente.
