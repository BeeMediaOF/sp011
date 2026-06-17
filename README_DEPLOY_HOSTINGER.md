# Deploy na Hostinger — SBC Agora

Guia completo para publicar a plataforma SBC Agora na Hostinger.

---

## Pré-requisitos

- Plano Hostinger com suporte a Node.js (Business ou superior)
- PostgreSQL provisionado (Hostinger VPS ou banco externo)
- Acesso SSH ao servidor

---

## 1. Configurar o Banco de Dados

1. Acesse o painel Hostinger → **Databases**
2. Crie um banco PostgreSQL
3. Anote: `host`, `porta`, `database`, `usuário`, `senha`
4. Monte a connection string:
   ```
   postgresql://usuario:senha@host:5432/nome_banco
   ```

---

## 2. Configurar o arquivo `.env`

No servidor, crie o arquivo `.env` na raiz do projeto:

```bash
cp .env.example .env
nano .env
```

Preencha **todos** os valores:

```env
DATABASE_URL=postgresql://usuario:senha@host:5432/sbcagora
SESSION_SECRET=string-aleatoria-longa-e-unica-min-32-chars
APP_URL=https://seudominio.com.br
NODE_ENV=production
CORS_ORIGIN=https://seudominio.com.br
ADMIN_DEFAULT_EMAIL=admin@seudominio.com.br
ADMIN_DEFAULT_PASSWORD=SenhaForteAqui123!
LOG_LEVEL=warn
PORT=5000
PERPLEXITY_API_KEY=sua_chave_perplexity
```

> ⚠️ **NUNCA** commite o arquivo `.env` no repositório.

---

## 3. Instalar Dependências

```bash
# Na raiz do projeto
npm install -g pnpm
pnpm install --frozen-lockfile
```

---

## 4. Rodar as Migrations

Cria todas as tabelas do banco de dados:

```bash
pnpm --filter @workspace/db run push
```

Tabelas criadas:
- `users` — usuários do painel administrativo
- `audit_logs` — log de todas as ações
- `security_logs` — log de eventos de segurança

---

## 5. Criar o Primeiro Administrador

O sistema cria o administrador inicial **automaticamente** na primeira inicialização se o banco estiver vazio.

As credenciais vêm das variáveis:
- `ADMIN_DEFAULT_EMAIL`
- `ADMIN_DEFAULT_PASSWORD`

> **Importante:** Troque a senha padrão imediatamente após o primeiro login em **Usuários > Alterar Senha**.

Para criar manualmente via SQL (alternativa):

```sql
-- Execute no psql ou pgAdmin
-- Substitua o hash abaixo pelo gerado com a função hashPassword do projeto
INSERT INTO users (name, email, password_hash, role, status)
VALUES ('Administrador', 'admin@seudominio.com.br', '<hash>', 'admin', 'active');
```

---

## 6. Build e Start em Produção

```bash
# Build da API
pnpm --filter @workspace/api-server run build

# Build do frontend
pnpm --filter @workspace/brasilia-agora run build

# Iniciar o servidor
pnpm --filter @workspace/api-server run start
```

Para manter o processo ativo, use **PM2**:

```bash
npm install -g pm2

# Iniciar
pm2 start "pnpm --filter @workspace/api-server run start" --name "sbcagora-api"

# Salvar para reiniciar com o servidor
pm2 save
pm2 startup
```

---

## 7. Configurar Nginx (Proxy Reverso)

```nginx
server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;

    # Redirecionar HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seudominio.com.br www.seudominio.com.br;

    ssl_certificate     /etc/letsencrypt/live/seudominio.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com.br/privkey.pem;

    # Frontend (arquivos estáticos)
    location / {
        root /var/www/sbcagora/artifacts/brasilia-agora/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 8. SSL com Certbot

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
```

---

## 9. Validar Segurança Após o Deploy

Acesse **Painel Admin → Segurança → Checkup** e verifique:

- [ ] Score de segurança ≥ 80%
- [ ] Banco de dados: Conectado
- [ ] Nenhum evento crítico nos logs de segurança
- [ ] HTTPS ativo no domínio
- [ ] Senha padrão do admin foi trocada
- [ ] `NODE_ENV=production` está definido
- [ ] `SESSION_SECRET` é uma string longa e aleatória

---

## 10. Checklist Final

```
[ ] .env configurado com valores reais
[ ] DATABASE_URL apontando para o banco de produção
[ ] Migrations rodadas (pnpm --filter @workspace/db run push)
[ ] Admin seed criado e senha trocada
[ ] PM2 configurado para reinício automático
[ ] Nginx configurado como proxy reverso
[ ] SSL/HTTPS ativo
[ ] Backup automático configurado na Hostinger
[ ] CORS_ORIGIN configurado com o domínio real
[ ] Logs sendo gravados corretamente
```

---

## Suporte

Para dúvidas sobre a Hostinger:
- Documentação: https://support.hostinger.com
- Suporte: https://www.hostinger.com.br/suporte
