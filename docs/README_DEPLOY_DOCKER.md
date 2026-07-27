# Deploy via Docker (Hostinger VPS — Docker Manager)

Sobe o portal em 3 containers, com HTTPS automático:

```
Internet :443 ─→ [caddy]  (TLS Let's Encrypt automático)
                   ├─ /api/*  → [api]  Express   :8080
                   └─ /*      → [web]  vite preview :3000
                                  api ─→ Supabase (Postgres + Storage)
```

Arquivos desta configuração (já no repositório):
`docker-compose.yml`, `Caddyfile`, `artifacts/api-server/Dockerfile`,
`artifacts/brasilia-agora/Dockerfile`, `.dockerignore`.

---

## Pré-requisitos

1. **Domínio apontando para a VPS:** no DNS, registro **A** de `sp011.com.br` → IP da VPS
   (a Hostinger mostra o IP em VPS → Overview). Sem isso o Caddy não consegue emitir o HTTPS.
2. **Portas 80 e 443 abertas** na VPS (o `docker-compose.yml` publica elas no Caddy).
3. **Arquivo `.env`** com os segredos (o mesmo que já preparamos). Ele **não** vai no Git,
   então precisa existir no servidor — veja os caminhos abaixo.

> ⚠️ O `.env` precisa conter `SITE_DOMAIN=sp011.com.br` (já incluído) — é o domínio que o
> Caddy usa para o certificado.

---

## Caminho A — Terminal da VPS (recomendado, mais confiável)

Use o botão **Terminal** no topo do Docker Manager (ou SSH). Assim você controla o `.env`
e o repositório privado sem depender da UI.

```bash
# 1. Clonar o repositório (vai pedir login/credencial do GitHub)
cd /opt
git clone https://github.com/BeeMediaOF/sp011.git
cd sp011

# 2. Criar o .env com os segredos (cole o conteúdo que já montamos)
nano .env        # salve com Ctrl+O, saia com Ctrl+X

# 3. Subir tudo (build + start em background)
docker compose up -d --build

# 4. Acompanhar (a 1ª vez baixa imagens e builda — pode levar alguns minutos)
docker compose logs -f
```

Pronto: o Caddy emite o certificado sozinho e o site responde em `https://sp011.com.br`.

**Comandos úteis depois:**
```bash
docker compose ps                 # status dos 3 containers
docker compose logs -f api        # logs só da API
docker compose down               # parar tudo
# Atualizar após novos commits:
git pull && docker compose up -d --build
```

---

## Caminho B — Docker Manager (interface)

Na tela **Docker Manager → Projects → Compose**:

1. Em **"Compose"**, escolha **importar do repositório** e informe a URL
   `https://github.com/BeeMediaOF/sp011.git`. Como o repositório é **privado**, conecte/autorize
   sua conta do GitHub quando solicitado.
2. Aponte o arquivo compose para **`docker-compose.yml`** (raiz).
3. **Variáveis de ambiente:** o `.env` não vem no clone (é ignorado pelo Git). Then:
   - Se a interface tiver um campo de **Environment variables / .env**, cole ali todo o
     conteúdo do `.env` (incluindo `SITE_DOMAIN`).
   - Se **não** tiver, use o **Caminho A** para criar o `.env` no diretório do projeto antes
     de subir (a UI e o terminal compartilham o mesmo Docker).
4. **Deploy** e acompanhe os logs pela própria interface.

> Se a importação do repositório privado ou a injeção do `.env` derem trabalho na UI, o
> Caminho A (Terminal) resolve os dois pontos de forma direta — é o recomendado.

---

## Verificação

- `https://sp011.com.br` abre o site (cadeado válido).
- `https://sp011.com.br/api/healthz` responde (API no ar).
- `docker compose logs api` mostra **"Server listening"** na porta 8080.
- Login no admin, upload de imagem e reescrita por IA funcionando.

## Notas

- **Arquitetura:** as imagens são **glibc/x86_64** (Debian). Não troque para Alpine — o
  workspace exclui os binários musl e o build quebraria.
- **Uma instância de cada** serviço (o agendador RSS/social roda em processo; múltiplas
  instâncias duplicariam os jobs).
- **www:** para responder também em `www.sp011.com.br`, edite o `Caddyfile`
  (`{$SITE_DOMAIN}, www.{$SITE_DOMAIN} {`) e garanta o registro A do `www` no DNS.
- **Mídia antiga:** uploads feitos no Replit precisam ser copiados para o bucket
  `uploads` do Supabase (os novos já vão direto).
