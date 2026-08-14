# Blogs replicados — guia de operação (Fase 0)

Como subir N blogs independentes na mesma VPS usando **uma única base de
código e um único par de imagens** (`blog-api:vN` / `blog-web:vN`), cada blog
com projeto compose, `.env`, banco e volume próprios. Complementa o
`README_NOVA_INSTANCIA.md` (que cobre a instância em VPS separada do cliente).

## Arquitetura

```
/opt/sp011  (repo + compose raiz)          /opt/blogs/<id>/  (um dir por blog)
  caddy  ── 80/443 (único exposto)           compose.yml   (cópia do template)
  ollama, central-api, central-web           .env          (segredos próprios)
  api, web (sp011)                           volume api_data (db-config.enc)
  pg-blogs (postgres:16, sem porta host)
        └────────── rede compartilhada `blogs_shared` ──────────┘
```

- Cada blog mantém os serviços internos `api`/`web` (projetos compose não
  colidem entre si) e entra na `blogs_shared` com aliases únicos
  `<id>-api`/`<id>-web` — **os únicos nomes que o Caddy e o `API_URL` usam**
  (o alias automático `api` é ambíguo na rede compartilhada). Vale para o
  Caddy INTEIRO: até o sp011 usa aliases únicos (`sp011-api`/`sp011-web`) no
  Caddyfile — apontar para `api`/`web` curtos fez o tráfego do sp011 cair no
  container de outro blog (incidente 2026-07-07). IDs reservados: `sp011`,
  `central`.
- Banco: um `DATABASE` + uma `ROLE` por blog no `pg-blogs`; configurado pelo
  assistente `/admin/setup` (fica criptografado em `db-config.enc`).
- Uploads: um projeto Supabase dedicado só a Storage, um bucket por blog.
- O blog nasce em modo central-push puro (fontes seed inativas; sem
  `OLLAMA_BASE_URL`/chaves de IA no `.env`) — coleta/reescrita ficam no
  painel central, que entrega via `POST /api/ingest` (HMAC).

## Preparação única da VPS

```bash
cd /opt/sp011 && git pull

# 1) Senha do superusuário do pg-blogs no .env da raiz
echo "PG_BLOGS_SUPERPASS=$(openssl rand -hex 24)" >> .env

# 2) Builda e tagueia blog-api:v1 / blog-web:v1 (NÃO recria containers)
docker compose build api web

# 3) Cria a rede blogs_shared, sobe o pg-blogs e recria SÓ o caddy
#    (blip de ~2–5s na borda; certificados persistem em caddy_data)
docker compose up -d pg-blogs caddy
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
```

> ⚠️ Enquanto o sp011 não for recriado num deploy normal, evite
> `docker compose up -d` sem lista de serviços: a linha `image:` nova muda o
> config-hash de api/web e o compose os recriaria (breve indisponibilidade).

Uma vez só, também:
- **DNS**: registro wildcard `*.seudominio.com.br → IP da VPS` (blogs novos
  já nascem resolvendo).
- **Storage**: criar o projeto Supabase dedicado a Storage; anotar a URL e a
  `service_role` key.

## Subir um blog novo (~15 min)

```bash
ID=cliente-a
DOMAIN=cliente-a.seudominio.com.br
DBNAME=${ID//-/_}          # hífen não vale em nome de banco/role

# 0) Painel central → Blogs → Novo (name, domain, apiUrl=https://$DOMAIN)
#    → copiar o segredo de integração (exibido UMA única vez).

# 1) Banco (senha: openssl rand -hex 16 — sem caracteres especiais)
docker compose -f /opt/sp011/docker-compose.yml exec -T pg-blogs psql -U postgres <<SQL
CREATE ROLE ${DBNAME}_user LOGIN PASSWORD '<senha>';
CREATE DATABASE ${DBNAME} OWNER ${DBNAME}_user;
REVOKE CONNECT ON DATABASE ${DBNAME} FROM PUBLIC;
SQL

# 2) Storage: criar bucket público "$ID" no projeto Supabase de Storage.

# 3) Scaffold
mkdir -p /opt/blogs/$ID && cd /opt/blogs/$ID
cp /opt/sp011/deploy/blog-template/compose.yml .
cp /opt/sp011/deploy/blog-template/.env.example .env
nano .env   # BLOG_ID, COMPOSE_PROJECT_NAME=blog-$ID, URLs, SESSION_SECRET e
            # SETTINGS_ENCRYPTION_KEY (2x openssl rand -hex 32), CENTRAL_INGEST_SECRET

# 4) Subir + rota no Caddy
docker compose up -d
printf '%s {\n\timport blog %s\n}\n' "$DOMAIN" "$ID" > /opt/sp011/caddy/sites/$ID.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# 5) Setup token (regenerado a cada boot — leia AGORA)
docker compose logs --tail 100 api | grep -i "setup token"

# 6) Navegador: https://$DOMAIN/admin/setup
#    token + connection string  postgresql://<db>_user:<senha>@pg-blogs:5432/<db>
#    com SSL = "disable" (rede interna) + Storage (URL/service_role/bucket)
#    + primeiro admin → Aplicar (a api sai com exit 0 e o Docker religa).

# 7) Painel central → Blogs → Testar conexão → "online".
#    Enviar 1 notícia real e conferir no blog.
```

### Checklist de verificação

- `dig +short $DOMAIN` → IP da VPS
- `curl -sI https://$DOMAIN` → 200 com TLS (emissão ACME leva 10–60s após o reload)
- `curl -s https://$DOMAIN/api/setup` → `{"setupRequired":false}` pós-wizard
- Login em `https://$DOMAIN/admin`
- Ingest test "online" no painel central + push real aparece no blog
- OG/WhatsApp: `curl -s -A "facebookexternalhit/1.1" https://$DOMAIN/ | grep og:`
- `docker stats --no-stream` → anotar RAM/CPU (calibração da Fase 1)
- `docker compose logs --tail 50` sem erros recorrentes

### ⚠️ Alterou o `Caddyfile` (via git pull)? Recrie o caddy

O `Caddyfile` é montado como bind de **arquivo único** — e o `git pull` troca o
arquivo por um novo (novo inode), então o container continua preso à versão
antiga. `caddy reload`/`restart` releem o arquivo VELHO. Sempre que um pull
mudar o `Caddyfile`:

```bash
docker compose up -d --force-recreate caddy   # blip ~3s; certificados persistem
```

O diretório `caddy/sites/` NÃO sofre disso (montagem de diretório) — para os
arquivos por blog, o `caddy reload` continua sendo o caminho.

### Remover um blog (rollback)

```bash
cd /opt/blogs/$ID && docker compose down -v   # -v apaga o db-config.enc; o banco fica
rm /opt/sp011/caddy/sites/$ID.caddy
docker compose -f /opt/sp011/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
rm -rf /opt/blogs/$ID
# Opcional: DROP DATABASE no pg-blogs. Remover/desativar o blog no painel central.
```

## Domínio próprio depois (upgrade de um blog)

Feito em 2026-08-14 para oleysports.com.br, ocomandantenews.com.br e credito.vc.

**Nunca troque o `.midia.run` por redirect no mesmo passo que sobe o domínio
novo**: se o certificado do domínio novo falhar, o blog fica inacessível nos
DOIS hosts ao mesmo tempo. Passo A põe o domínio novo no ar com o host antigo
ainda servindo; passo B só troca depois do `200` confirmado.

1. **DNS** → IP da VPS. Confirme que chega até nós antes de mexer em qualquer
   coisa: `curl -sI http://<dominio>/ | grep -i server` tem que dizer
   `Server: Caddy` (um host sem bloco de site cai no 308 genérico do Caddy —
   é justamente o que prova que o pacote chegou aqui).
2. **Passo A** — `caddy/sites/<id>.caddy` com três blocos: domínio novo
   (`import blog <id>`), `www.<dominio>` (`redir` permanente para o apex) e o
   `<id>.midia.run` ainda com `import blog <id>`. `caddy validate` + `reload`.
3. `.env` do blog: `APP_URL`/`SITE_URL` → domínio novo; `ALLOWED_ORIGINS` com
   o novo, o `www` e o antigo. `docker compose up -d --force-recreate api` no
   dir do blog (só o `api` lê o `.env`; `restart` NÃO relê `env_file`).
4. Verifique o domínio novo em `200` e o `siteName` correto antes de seguir.
5. **Passo B** — troque o bloco do `<id>.midia.run` por redirect permanente
   **preservando o `/api/*`**:

   ```
   <id>.midia.run {
   	handle /api/* {
   		reverse_proxy <id>-api:8080
   	}
   	handle {
   		redir https://<dominio-novo>{uri} permanent
   	}
   }
   ```

   O `/api/*` fica de fora do redirect de propósito: um 301 num
   `POST /api/ingest` faz o `fetch` do deliveryWorker virar GET e a entrega
   quebra em silêncio. Assim a ordem entre Caddy e painel central deixa de
   importar. O redirect do resto é o que consolida o SEO — o canonical e o
   `sitemap.xml` saem do HOST DA REQUISIÇÃO (`req.get("host")`), então dois
   hosts servindo = duas cópias do site indexadas.
6. Painel central: `domain`/`api_url` do blog. Use `replace()` no UPDATE em
   vez de escrever a URL inteira — preserva o sufixo (`/api` ou não) que já
   estiver gravado.
7. Pontas soltas: callback do Meta é `{APP_URL}/meta-auth-complete.html` (tem
   que ser registrado no Meta for Developers e a conta reconectada); as
   assinaturas de Web Push são por origem e nascem zeradas no domínio novo.

### Variante: domínio atrás do Cloudflare (nuvem laranja)

Com a nuvem laranja em modo Full, o Cloudflare fala HTTPS com a origem em TODA
requisição — inclusive nas do Let's Encrypt. O desafio HTTP-01 chega pelo mesmo
caminho que está falhando por falta de certificado, e o TLS-ALPN-01 nunca
funciona atrás de proxy (o Cloudflare termina o TLS na borda). **O Caddy não
consegue emitir certificado nenhum nessa configuração** — o sintoma é HTTP 525
(falha de handshake TLS entre Cloudflare e origem; 522 seria o Cloudflare nem
alcançar a VPS).

Saída: certificado de ORIGEM emitido pelo próprio Cloudflare (15 anos, sem
renovação) + snippet `(blog-cf)` do `Caddyfile`.

1. Cloudflare → SSL/TLS → Origin Server → Create Certificate, para
   `<dominio>` e `*.<dominio>`. A chave privada aparece UMA vez.
2. Na VPS, `/opt/certs/<dominio>.pem` e `.key` (`mkdir -p /opt/certs`,
   `chmod 600` na chave). **Fora do repositório** — chave privada não se
   commita; o `docker-compose.yml` monta `/opt/certs:/etc/caddy/certs:ro`.
3. `caddy/sites/<id>.caddy` usa `tls` explícito + `import blog-cf <id>`:

   ```
   <dominio> {
   	tls /etc/caddy/certs/<dominio>.pem /etc/caddy/certs/<dominio>.key
   	import blog-cf <id>
   }
   ```

   O `tls` explícito também desliga o HTTPS automático para esse nome, que é o
   que encerra o impasse do ACME.
4. Cloudflare → SSL/TLS → **Full (strict)**. E desligue Rocket Loader e Auto
   Minify: os dois reescrevem o HTML servido, e a home tem SSR — HTML alterado
   na borda vira mismatch de hidratação (React #418).
5. O snippet `(blog-cf)` reescreve o `X-Forwarded-For` a partir do
   `Cf-Connecting-Ip` **só quando o peer é um IP do Cloudflare**. Sem isso o
   `app.set("trust proxy", 1)` do api-server entrega o IP do EDGE como se
   fosse o do leitor, e analytics/`is_internal`/rate limit decidem em cima
   dele. Subir o `trust proxy` para 2 corrigiria este blog e abriria os
   outros nove — a correção é por site, nunca na imagem compartilhada.

## Atualizar/reverter versão (fluxo por tag)

```bash
cd /opt/sp011 && git pull
# suba a versão no .env da raiz: BLOG_IMAGE_VERSION=v2
docker compose build api web            # gera blog-api:v2 / blog-web:v2
# canário: em /opt/blogs/<id>/.env mude BLOG_IMAGE_TAG=v2 e rode docker compose up -d
# ok no checklist → repita nos demais. Rollback = voltar a tag anterior.
```

Regras: manter as 3 últimas tags; `docker builder prune` mensal; **backup
externo dos bancos do pg-blogs é obrigatório** (script + cron na Fase 1 do
plano de replicação).
