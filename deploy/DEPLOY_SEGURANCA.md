# DEPLOY_SEGURANCA.md — Subir os 17 PRDs de segurança na VPS (runbook)

> Runbook operacional para colocar em produção os 17 PRDs de hardening que
> estão commitados na `main` local (ainda **sem push**). Escrito em 2026-07-21.
> Estilo GO_LIVE: todo bloco é auto-suficiente (cd no início, variáveis no
> topo, `grep` de conferência no fim, **sem heredoc**). Ordem pensada para
> **testar tudo no sp011 (mãe) + central ANTES** de tocar nos blogs replicados.
>
> Regra de ouro: **não avance de fase enquanto a fase anterior não estiver
> verde.** Se algo quebrar, pare e use a seção **ROLLBACK** no fim.

---

## Mapa do que muda (por que a ordem é essa)

| Serviço | PRDs que tocam | Ação de deploy |
|---|---|---|
| `api` (blog) | 03, 05, 06a, 06b, 04a, 11, 14, 13, 01b, 12, 08(amp) | build + **chown volume** + up |
| `web` (blog) | 06a (espelho da allowlist de imagem) | build + up |
| `central-api` | 02, 05, 06b, 04a, 11, 13, 01b | build + **chown volume** + up |
| `central-web` | 04b (DOMPurify) | build + up |
| `caddy` | 08 (CSP Report-Only, headers) | **up --force-recreate** (bind de arquivo único) |
| `pg-blogs` / `ollama` | 07 (mem_limit anti-OOM) | recriar em janela calma (blip curto) |
| imagem `blog-*` | **todos os de api/web** | mesma imagem vai para os replicados no rollout |

**3 riscos que este runbook neutraliza explicitamente:**
1. **PRD-07 / dono de volume** — containers passam a rodar como `node` (uid 1000).
   Volume `api_data`/`central_data` preexistente é dono `root` → `chown` OBRIGATÓRIO
   antes do 1º up não-root, senão o serviço não lê `db-config.enc`/uploads/news-images.
   **Feito com `docker run` PURO**, NUNCA `docker compose run`: o `cap_drop: ALL` do
   serviço tira `CAP_CHOWN` até do root e o chown falha com "Operation not permitted".
2. **PRD-01b / cripto fail-closed** — sem `SESSION_SECRET` (ou `SETTINGS_ENCRYPTION_KEY`)
   o boot **aborta de propósito**. Pré-voo confere que a chave existe.
3. **Ingest (PRD-14 nonce + PRD-03 auth)** — caminho por onde a central publica.
   Tem teste de fumaça dedicado; se quebrar, os blogs param de receber notícia.

---

## FASE 0 — Pré-voo (na sua máquina Windows)

Os 17 commits estão na `main` local mas **não foram pushados**. A VPS faz deploy
por `git pull` de `origin/main`, então **nada sobe sem este push**.

```bash
# Confirme que os 17 PRDs estão na main local e publique
cd "/c/Users/Usuario(a) Master/sp011"   # (no Git Bash) — ou use a raiz do repo
git status
git log --oneline -20 | grep -c "PRD-"    # deve imprimir 17
git push origin main
```

> Depois do push, o GitHub Actions do **PRD-10** (gitleaks / pnpm audit / CodeQL)
> roda sozinho — todos com `continue-on-error`, então **não bloqueiam** nada.
> Confira o resultado em Actions quando quiser (é diagnóstico, não trava deploy).

---

## FASE 1 — Rede de segurança na VPS (backup + âncoras de rollback)

**Antes de puxar qualquer código**, tire um backup e anote de onde dá para voltar.
Vários PRDs criam tabela/coluna no boot (auditoria central, `tokens_valid_from`,
`ingest_nonces`) — tudo aditivo e retrocompatível, mas backup antes de deploy
grande é higiene mínima (e é o 1º backup real do **PRD-09**).

```bash
# 1a) Âncoras de rollback: anote o commit hoje implantado e a versão de imagem
cd /opt/sp011
echo "COMMIT_ATUAL=$(git rev-parse --short HEAD)"
grep -m1 '^BLOG_IMAGE_VERSION=' .env
# >>> ANOTE os dois valores acima. Rollback do código = git checkout <COMMIT_ATUAL>;
#     rollback dos blogs replicados = voltar BLOG_IMAGE_TAG para a versão antiga.
```

```bash
# 1b) Backup do banco CENTRAL (Supabase) — dump lógico
cd /opt/sp011
TS=$(date +%Y%m%d-%H%M)
DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs pg_dump "$DBURL" > "/opt/backup-central-$TS.sql"
ls -lh /opt/backup-central-$TS.sql   # confira tamanho > 0
```

```bash
# 1c) Backup de CADA blog replicado que existe (banco local no pg-blogs)
cd /opt/sp011
TS=$(date +%Y%m%d-%H%M)
for b in ksports resenhavip esporteagora oleysports beeesportes pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || continue
  docker compose exec -T pg-blogs pg_dump -U postgres -d "$b" > "/opt/backup-$b-$TS.sql" \
    && echo "OK  $b -> /opt/backup-$b-$TS.sql"
done
ls -lh /opt/backup-*-$TS.sql
```

> O banco do sp011 (mãe) é Supabase gerenciado (tem PITR próprio) — o dump acima
> cobre central + replicados, que são os que vivem no `pg-blogs` sem durabilidade
> gerenciada. Guarde os `.sql` fora da VPS se puder (rclone — bloco 2 do PRD-09).

---

## FASE 2 — Pré-voo de configuração na VPS (evita boot abortado)

```bash
# 2a) PRD-01b fail-closed: a chave de envelope PRECISA existir, senão o boot aborta.
cd /opt/sp011
echo "== .env (blog sp011) =="        ; grep -E '^(SESSION_SECRET|SETTINGS_ENCRYPTION_KEY)=' .env         | sed 's/=.*/=<<definido>>/'
echo "== .env.central (central) =="   ; grep -E '^(SESSION_SECRET|SETTINGS_ENCRYPTION_KEY)=' .env.central | sed 's/=.*/=<<definido>>/'
# Cada arquivo DEVE mostrar pelo menos SESSION_SECRET=<<definido>>. Se não mostrar, PARE.
```

> **NUNCA** troque `SESSION_SECRET`/`SETTINGS_ENCRYPTION_KEY` — só confirme que já
> existem. Todo segredo cifrado no banco deriva deles; trocar torna tudo ilegível.

---

## FASE 3 — Deploy no sp011 (mãe) + central  ← o canário de verdade

Aqui **todo o código novo entra**, mas só na mãe e no central. Os blogs replicados
continuam na imagem antiga até a Fase 5.

```bash
# 3a) Puxar o código e SUBIR a versão da imagem (mantém a antiga p/ rollback)
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env      # confirme que subiu (ex.: v23 -> v24)
```

```bash
# 3b) Buildar as 4 imagens de app (api/web/central-api/central-web)
cd /opt/sp011
docker compose build api web central-api central-web
```

```bash
# 3c) PRD-07: chown dos volumes ANTES do 1º up não-root (passo que evita queda).
#     ATENÇÃO: NÃO usar `docker compose run` — o serviço tem cap_drop:ALL (PRD-07),
#     que remove CAP_CHOWN até do root → chown falha com "Operation not permitted".
#     Use `docker run` PURO (caps padrão incluem CHOWN), montando o volume pelo nome.
#     Projeto compose = "sp011" → volumes sp011_api_data / sp011_central_data.
cd /opt/sp011
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2)
docker volume ls | grep -E 'api_data|central_data'   # confirme os nomes
docker run --rm --user root -v sp011_api_data:/data     blog-api:$N chown -R node:node /data && echo CHOWN_API_OK
docker run --rm --user root -v sp011_central_data:/data blog-api:$N chown -R node:node /data && echo CHOWN_CENTRAL_OK
# Ambos devem imprimir ..._OK. (web e central-web não têm volume — nada a fazer.)
```

```bash
# 3d) Subir os 4 serviços de app (recria como non-root + hardening do PRD-07)
cd /opt/sp011
docker compose up -d api web central-api central-web
```

```bash
# 3e) Caddy (PRD-08): bind de arquivo único — git pull troca o inode, então
#     reload leria o Caddyfile VELHO. Force-recreate relê o novo (CSP Report-Only).
cd /opt/sp011
docker compose up -d --force-recreate caddy
```

```bash
# 3f) Saúde dos containers — espere ~40s (start_period) e confira "healthy"
cd /opt/sp011
sleep 45
docker compose ps
# Todos os app devem estar Up (healthy). Se algum ficar (unhealthy)/reiniciando,
# vá direto aos logs (bloco 4a) — NÃO prossiga.
```

---

## FASE 4 — Testes de fumaça (o "quebrou algo?" central)

Rode **todos** antes de tocar nos blogs replicados. Marque cada ✔.

```bash
# 4a) Boot limpo? (procure erros de cripto/ensureSchema; veja a migração de 2FA)
cd /opt/sp011
docker compose logs --tail=120 api         | grep -iE 'error|assertEncryption|encryption|listen|two.?factor|2fa|migrat' || true
docker compose logs --tail=120 central-api | grep -iE 'error|assertEncryption|encryption|listen|migrat|ensureSchema' || true
# Esperado: linha de "listening"/porta; SEM stack trace de assertEncryptionConfigured;
# se havia 2FA em texto puro, uma linha da migração (PRD-01b) cifrando os segredos.
```

```bash
# 4b) Site público do sp011 responde e é ele mesmo (não misturou blog)
curl -s https://sp011.com.br/api/site | grep -o '"siteName":"[^"]*"'
curl -sI https://sp011.com.br/ | grep -iE 'HTTP/|content-security-policy'
# Esperado: siteName do sp011; HTTP 200; header "Content-Security-Policy-Report-Only".
```

```bash
# 4c) Central responde
curl -sI https://central.midia.run/ | grep -iE 'HTTP/|content-security-policy|x-robots'
# Ajuste o domínio se o seu CENTRAL_DOMAIN for outro. Esperado: 200 + CSP Report-Only + x-robots noindex.
```

**Checks visuais (abra no navegador) — os que mais pegam regressão:**

- ✔ **Home do sp011** carrega, com **imagens** (valida PRD-06a: a allowlist do proxy
  de imagem não pode ter cortado os CDNs legítimos das notícias).
- ✔ Abra **um artigo** com imagem hotlinkada da central → imagem aparece
  (proxy `/api/image` + PRD-06a). Se sumiu, é allowlist — ver ROLLBACK/ajuste.
- ✔ **Versão AMP** de um artigo (`?amp=1` ou `/amp/...` conforme suas rotas)
  renderiza (PRD-04a `sanitizeAmpHtml` + PRD-08 CSP no amp.ts).
- ✔ **Login no `/admin` do sp011** funciona, inclusive **2FA** (PRD-01b: segredo
  agora cifrado at-rest + migração no boot; PRD-03: revogação de token/`tokens_valid_from`).
  Faça **logout e login de novo** para exercitar a revogação.
- ✔ **Painel central**: login OK; abra **uma notícia** (o corpo passa por
  DOMPurify — PRD-04b) e a página de **Entregas** carrega (você é admin → RBAC do
  PRD-02 não te bloqueia; confirme que nada dá 403 indevido).

```bash
# 4d) INGEST fim-a-fim (PRD-14 nonce + PRD-03 auth + PRD-06 no scrape): o teste
#     mais importante. No painel central, em "Entregas", pegue uma entrega
#     pending/awaiting_approval de um blog QUE JÁ ESTÁ NA IMAGEM NOVA (por ora só
#     o sp011 é a mãe; use uma entrega destinada ao sp011) e clique "Publicar agora".
#     Depois confirme no log do worker que foi entregue (HTTP 200), sem 401/503:
cd /opt/sp011
docker compose logs --tail=60 central-api | grep -iE 'ingest|delivery|deliver|entrega|401|503|nonce|hmac' || true
# Esperado: entrega concluída (2xx). 401 = assinatura; 503 = nonce/cripto — investigar antes de seguir.
```

> Se **4a–4d** passaram e os checks visuais estão OK, o núcleo do hardening está
> saudável na mãe. Pode ir aos replicados. Se qualquer um falhou, **pare** e
> use ROLLBACK — não propague a imagem quebrada para a rede toda.

---

## FASE 5 — Rollout para os blogs replicados (canário → resto)

Todos os replicados usam a **mesma imagem** que você acabou de buildar. Cada um
tem seu volume `api_data` com o `db-config.enc` (dono root) → **chown obrigatório
antes do up**, senão o blog **não conecta ao banco e cai**.

### 5a) Canário: resenhavip (chown → apontar imagem → subir → testar)

```bash
cd /opt/blogs/resenhavip
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
# chown do volume (PRD-07) — docker run PURO (cap_drop:ALL do serviço bloquearia o chown).
# CRÍTICO no replicado: aqui mora o db-config.enc (chmod 600 root) — sem chown, uid 1000
# não lê e o blog NÃO conecta ao banco (fica fora do ar). Projeto = blog-resenhavip.
docker volume ls | grep resenhavip     # confirme: blog-resenhavip_api_data
docker run --rm --user root -v blog-resenhavip_api_data:/data blog-api:$N chown -R node:node /data && echo CHOWN_OK
# apontar para a imagem nova e subir
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
grep '^BLOG_IMAGE_TAG=' .env
docker compose up -d
```

```bash
# 5b) Testar o canário
cd /opt/blogs/resenhavip
sleep 45
docker compose ps
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
docker compose logs --tail=80 api | grep -iE 'error|db-config|decrypt|connect|listen|permission|denied' || true
# Esperado: (healthy); siteName do Resenha Vip; SEM erro de leitura de db-config/permission denied.
```

> **Se o canário falhar com "permission denied"/não lê db-config** → o chown não
> pegou aquele volume. Refaça o bloco de chown (5a, 1ª linha) e `docker compose up -d`.
> **Se falhar com pnpm/permissão no `web`** → veja os logs do `web`; foi o que o
> canário serve para pegar antes de espalhar.

### 5c) Demais blogs (só depois do canário verde) — chown + imagem + up em loop

```bash
cd /opt/sp011
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || { echo "pula $b (não existe)"; continue; }
  cd "/opt/blogs/$b"
  # chown via docker run PURO (o cap_drop:ALL do serviço impede chown via compose run).
  # Volume do blog = blog-<id>_api_data. Sem isto o uid 1000 não lê db-config.enc → blog cai.
  docker run --rm --user root -v "blog-${b}_api_data:/data" blog-api:$N chown -R node:node /data \
    && echo "chown OK: $b"
  sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
  docker compose up -d
done
cd /opt/sp011
```

```bash
# 5d) Verificação anti-mistura: cada domínio deve devolver o PRÓPRIO nome
for u in ksports.bebee.me esporteagora.midia.run oleysports.midia.run beeesportes.midia.run; do
  printf '%s -> ' "$u"; curl -s "https://$u/api/site" | grep -o '"siteName":"[^"]*"' || echo "(sem resposta)"
done
```

---

## FASE 6 — Aplicar limites de memória em pg-blogs/ollama (PRD-07, janela calma)

O `docker-compose.yml` também ganhou `mem_limit` anti-OOM em `pg-blogs` (4g) e
`ollama` (16g). Recriar esses dois causa **blip curto** (o `pg-blogs` derruba
conexões e os blogs reconectam sozinhos; o `ollama` recarrega o modelo em segundos).
Faça **fora do horário de pico**.

```bash
cd /opt/sp011
docker compose up -d pg-blogs ollama
sleep 20
docker compose ps pg-blogs ollama         # ambos (healthy)
# sanity: um blog qualquer volta a responder após a reconexão do banco
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
```

---

## FASE 7 — Pós-deploy (higiene, não urgente)

- **Backups automáticos (PRD-09, bloco 2-4)**: configurar `rclone` para remote
  offsite, preencher `deploy/blog-ctl/backup.conf` e ligar o
  `sp011-backup.timer` (systemd) — só depois de um **teste de restore** bem
  sucedido. Enquanto isso, os dumps da Fase 1 são seu ponto de restauração.
- **CSP (PRD-08)**: fica em **Report-Only** de propósito. Ao longo dos próximos
  dias, abra o **console do navegador** no sp011 e no central e veja se aparecem
  violações de CSP. Só troque `Report-Only` → `Content-Security-Policy` (enforce)
  quando o console estiver limpo — é a FASE de enforce **deferida** (não agora).
- **Scanners (PRD-10)**: confira o resultado dos workflows em GitHub → Actions.
  São informativos; trate os achados como backlog.

---

## ROLLBACK (se algo quebrar)

As adições de schema (tabelas/colunas novas) são **retrocompatíveis** — o código
antigo simplesmente as ignora. Então rollback = voltar o **código/imagem**, sem
mexer no banco.

**Um blog replicado quebrou** (volta para a imagem anterior — o `<VELHA>` que
você anotou na Fase 1):
```bash
cd /opt/blogs/<id>
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=<VELHA>|" .env   # ex.: v23
docker compose up -d
curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'
```
> Voltar a imagem antiga (que roda como root) sobre um volume agora dono `node`
> funciona — root lê arquivos de qualquer dono. Não precisa desfazer o chown.

**sp011/central quebraram** (volta o código e rebuilda):
```bash
cd /opt/sp011
git checkout <COMMIT_ATUAL>          # o short-hash anotado na Fase 1
docker compose build api web central-api central-web
docker compose up -d api web central-api central-web
docker compose up -d --force-recreate caddy
```
> Se precisar reverter a mudança de `mem_limit`/hardening do compose junto,
> o `git checkout` já traz o `docker-compose.yml` antigo — o `up -d` reconcilia.

---

## O que NÃO fazer agora (continua deferido p/ decisão sua/operador)

Estes exigem passo destrutivo, canário longo, ou virada de "shadow → enforce" —
**fora deste deploy**:

- **01a-B**: rotacionar `VAPID_PRIVATE_KEY` (era versionada no `.replit`) e confirmar
  par por blog.
- **01b-Frente 3**: purge do histórico git da VAPID (`git filter-repo` + force-push).
- **03-D**: cookie HttpOnly no central-web (tirar token do localStorage) + cookie-parser.
- **04a-FASE B**: virar o gate de sanitização de `log`/shadow → `enforce` (após ≥72h de shadow).
- **07-sandbox**: remover `--no-sandbox` do Chromium (canário do render social).
- **08-enforce**: CSP `Report-Only` → enforce + `HSTS preload`.
- **09-blocos 2-4**: backup real offsite + **teste de restore** (gate) + agendar timer.
- **13-B**: `ensureSchema` fail-loud (pode bloquear boot — decisão consciente).
- **12**: rodar o `retentionSweep` em dry-run e, se aprovado, apply (dupla trava).
