# Deploy na Hostinger (VPS) — Portal SBC / Brasília Agora

Guia para publicar o portal numa **VPS Hostinger** (Ubuntu) usando o banco e o storage no
**Supabase**. Este guia está alinhado ao código real do projeto — siga os valores como estão.

> **Banco já migrado:** os dados estão no projeto Supabase **SP011**
> (`ref: yfmyufqfepzwjtzblths`, região `sa-east-1`). **Não** use o projeto antigo
> "Brasília Agora" (us-east-2), cujo schema é diferente.

---

## Arquitetura na VPS

```
                 Internet (HTTPS :443)
                        │
                     [ Nginx ]
            ┌───────────┴────────────┐
            │ /                      │ /api
            ▼                        ▼
   Frontend (vite preview)     API (Express)
     localhost:3000              localhost:8080
            │                        │
            │                        ├── Postgres → Supabase (Session Pooler, SP011)
            │                        └── Uploads  → Supabase Storage (bucket "uploads")
```

- **API** (`@workspace/api-server`): Node/Express na porta **8080**.
- **Frontend** (`@workspace/sbc-agora`): servido por **`vite preview`** na porta **3000**
  (não como arquivos estáticos puros — o preview faz o *prerender* de Open Graph para o
  preview de links no WhatsApp/Facebook).
- **Nginx**: TLS + roteia `/ → 3000` e `/api → 8080`.

---

## Pré-requisitos

- VPS Hostinger (KVM) com Ubuntu e acesso **SSH** (root ou sudo).
- **Node.js 24** e **pnpm** instalados na VPS.
- Um **domínio** apontando (registro A) para o IP da VPS.
- Acesso ao painel do **Supabase** (projeto SP011): connection string, service_role key e Storage.

```bash
# Node 24 + pnpm (na VPS)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pnpm pm2
```

---

## 1. Obter o código e instalar dependências

```bash
sudo mkdir -p /var/www && cd /var/www
git clone <URL_DO_SEU_REPO> sbcagora
cd /var/www/sbcagora

# Instala TUDO (inclui devDependencies — o frontend usa o vite preview, que é devDependency).
# NÃO rode "pnpm prune --prod": isso remove o vite e quebra o frontend.
pnpm install --frozen-lockfile
```

---

## 2. Configurar as variáveis de ambiente (`.env`)

> ⚠️ **Importante:** este projeto **não usa dotenv**. O `.env` é injetado no processo via
> `node --env-file=.env` (configurado no PM2, passo 6). Sem isso, o app não enxerga as variáveis.

```bash
cd /var/www/sbcagora
cp .env.example .env
nano .env
```

Preencha com base no [.env.example](.env.example). Pontos de atenção:

| Variável | Valor |
|----------|-------|
| `SUPABASE_DATABASE_URL` | String do **Session Pooler** do SP011 (ver passo 3) |
| `SUPABASE_URL` | `https://yfmyufqfepzwjtzblths.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (secreta!) |
| `SUPABASE_STORAGE_BUCKET` | `uploads` |
| `SESSION_SECRET` | string aleatória longa — gere com `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `APP_URL` / `SITE_URL` | `https://seudominio.com.br` |
| `ALLOWED_ORIGINS` | `https://seudominio.com.br` |
| `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD` | credenciais do 1º admin |
| `GEMINI_API_KEY` | chave do Google AI Studio (ver passo 7.2) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | copie de [.replit](.replit) (push) |
| `PERPLEXITY_API_KEY`, `SMTP_*` | opcionais |

> O app prioriza `SUPABASE_DATABASE_URL`; `SESSION_SECRET` é **obrigatória** em produção
> (o servidor não sobe sem ela).

---

## 3. Banco de dados (Supabase SP011)

1. No painel do Supabase → projeto **SP011** → **Connect** → **Session pooler**.
2. Copie a string (formato abaixo) e coloque em `SUPABASE_DATABASE_URL`. Use o **Session
   Pooler** (IPv4) — a conexão direta `db.<ref>.supabase.co` é só IPv6 e **falha** na Hostinger.
   ```
   postgresql://postgres.yfmyufqfepzwjtzblths:SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
   ```
   > Se a senha tiver caracteres especiais, **codifique na URL** (`@`→`%40`, `#`→`%23`).
3. O schema **já existe e está populado** (696 artigos, 69 fontes RSS, etc.). O comando abaixo
   é idempotente — rode só para confirmar que o código e o banco estão em sincronia:
   ```bash
   pnpm --filter @workspace/db run push
   ```

---

## 4. Segurança do Supabase — fechar a Data API pública 🔴

O linter do Supabase acusou **RLS desabilitado** em todas as 23 tabelas e **colunas sensíveis
expostas** (`social_accounts.access_token`, `session_id`). Isso deixa a **Data API (PostgREST)**
do Supabase aberta: qualquer um com a *anon key* poderia ler/gravar nas tabelas (inclusive
`settings`, que guarda chaves de IA/VAPID/webhook).

Este portal **não usa** o cliente Supabase/anon key (conecta direto no Postgres com o role
`postgres`, que ignora RLS), então **habilitar RLS não quebra nada**. Escolha **uma** opção:

**Opção A (recomendada) — habilitar RLS.** No Supabase → **SQL Editor**, rode:
```sql
ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_sources               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perplexity_topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_event_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_rate_limits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_views             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_views            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_stats                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_publication_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_daily_stats            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavior_events           ENABLE ROW LEVEL SECURITY;
```
> Habilitar RLS **sem políticas** bloqueia o acesso anônimo via PostgREST — exatamente o que
> queremos. Não crie políticas: o app não usa essa via.

**Opção B — desligar a Data API.** Project Settings → API → **Data API** → desabilitar
(o app não precisa dela). Doc: https://supabase.com/docs/guides/database/postgres/row-level-security

---

## 5. Storage de uploads (imagens/vídeos)

As URLs `/api/uploads/...` são servidas pela API a partir do **Supabase Storage**.

1. No Supabase → **Storage** → crie o bucket **`uploads`** (pode ser **privado** — o app usa a
   `service_role` para ler/gravar).
2. **Migre os arquivos antigos:** os uploads manuais que ficavam no Object Storage do Replit
   precisam ser copiados para o bucket `uploads`, senão as mídias antigas retornam **404**.
   (Imagens de fontes RSS são externas, servidas via `/api/image` por proxy, e **não** são afetadas.)

> Em produção, sem `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` configuradas, qualquer upload
> retorna **503** — não há fallback para disco.

---

## 6. Build e execução com PM2

```bash
cd /var/www/sbcagora

# Build da API (esbuild → artifacts/api-server/dist/index.mjs)
pnpm --filter @workspace/api-server run build

# Build do frontend — exige PORT e BASE_PATH no ambiente (validados pelo vite.config.ts).
# Saída: artifacts/brasilia-agora/dist/public
BASE_PATH=/ PORT=3000 API_URL=http://localhost:8080 \
  pnpm --filter @workspace/sbc-agora run build
```

Crie `ecosystem.config.cjs` na raiz do projeto:

```js
module.exports = {
  apps: [
    {
      name: "sbcagora-api",
      cwd: "/var/www/sbcagora/artifacts/api-server",
      script: "node",
      // --env-file injeta o .env (o app NÃO usa dotenv). Node 24 suporta --env-file.
      args: "--env-file=/var/www/sbcagora/.env --enable-source-maps dist/index.mjs",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
    },
    {
      name: "sbcagora-web",
      cwd: "/var/www/sbcagora",
      script: "pnpm",
      args: "--filter @workspace/sbc-agora run serve",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      // PORT/BASE_PATH/API_URL não são segredos — passados direto ao vite preview.
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        BASE_PATH: "/",
        API_URL: "http://localhost:8080",
      },
    },
  ],
};
```

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # siga a instrução que ele imprime (reinício automático com a VPS)
pm2 logs           # verifique: API "Server listening" :8080 e o front no :3000
```

> Use **1 instância** de cada (não use cluster/autoscale): o agendador RSS/social roda
> em processo e duplicaria jobs com múltiplas instâncias.

---

## 7. Nginx (proxy reverso + TLS)

`/etc/nginx/sites-available/sbcagora`:

```nginx
server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seudominio.com.br www.seudominio.com.br;

    ssl_certificate     /etc/letsencrypt/live/seudominio.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com.br/privkey.pem;

    client_max_body_size 100M;   # uploads de vídeo até 100MB

    # API
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend (vite preview)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sbcagora /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### SSL com Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
```

---

## 8. Pós-deploy

### 7.1 Primeiro admin
O admin inicial é criado **automaticamente** no 1º boot, com `ADMIN_DEFAULT_EMAIL` /
`ADMIN_DEFAULT_PASSWORD`. **(O banco já migrado pode já ter usuários** — nesse caso use os
existentes.) Troque a senha após o primeiro login.

### 7.2 Provedor de IA (reescrita RSS)
No painel **Admin → Configurações**, confirme o provedor de IA. Se vier do Replit como
`gemini_free`, a IA **quebra** na VPS (depende do proxy do Replit). Use **`gemini_direct`**
e configure `GEMINI_API_KEY` (chave gratuita em https://aistudio.google.com) — no `.env` ou nas Configurações.

### 7.3 Validação de segurança
Admin → **Segurança → Checkup**:
- [ ] Banco: Conectado · [ ] HTTPS ativo · [ ] `NODE_ENV=production`
- [ ] Senha padrão do admin trocada · [ ] `SESSION_SECRET` longa e aleatória

---

## Checklist final

```
[ ] .env preenchido (SUPABASE_DATABASE_URL = Session Pooler do SP011)
[ ] SUPABASE_URL + SERVICE_ROLE_KEY + bucket "uploads" criados
[ ] Arquivos de mídia antigos migrados do Replit p/ o bucket
[ ] RLS habilitado (ou Data API desligada) no Supabase
[ ] pnpm install (com devDeps) + build API + build front
[ ] PM2 rodando 2 apps (api :8080, web :3000) + pm2 save/startup
[ ] Nginx (/ → 3000, /api → 8080) + SSL ativo
[ ] Provedor de IA = gemini_direct + GEMINI_API_KEY
[ ] VAPID_* copiadas do .replit (push notifications)
[ ] Senha do admin trocada
```

---

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Upload retorna **503** | `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` ausentes no `.env` |
| Imagens antigas dão **404** | arquivos de mídia não migrados p/ o bucket `uploads` |
| App não sobe: *"SESSION_SECRET not set"* | falta `SESSION_SECRET` (obrigatória em prod) |
| App não enxerga variáveis | `--env-file=.env` ausente no comando do PM2 (não há dotenv) |
| IA falha: *"AI_INTEGRATIONS_GEMINI_BASE_URL"* | provedor está em `gemini_free`; troque p/ `gemini_direct` |
| Preview de link no WhatsApp sem imagem | frontend servido como estático; use `vite preview` (script `serve`) |
| Erro de conexão ao banco na Hostinger | usou conexão direta (IPv6); use o **Session Pooler** |
| Build do front falha (PORT/BASE_PATH) | exporte `BASE_PATH=/ PORT=3000` antes do `build` |

## Suporte Hostinger
- https://support.hostinger.com · https://www.hostinger.com.br/suporte
