# Como subir um blog novo para um cliente (instância instalável)

Cada blog é uma instância independente deste repositório com **banco próprio**
(projeto Supabase do cliente ou Postgres genérico). O painel central nunca
conhece as credenciais de banco do cliente — só fala com o blog pela API
assinada (`/api/ingest`).

## Pré-requisitos

- VPS com Docker + Docker Compose e portas 80/443 abertas.
- Domínio do cliente apontando (DNS A) para o IP da VPS.
- Banco PostgreSQL 14+ vazio do cliente (recomendado: projeto Supabase próprio —
  use a connection string do **Session Pooler**, IPv4).
- Uploads de mídia: nada a criar — são gravados no disco da VPS (volume
  `api_data`, em `/data/uploads`). Supabase Storage não é necessário (fica
  apenas como fallback de leitura de arquivos legados, se configurado).

## Passo a passo

1. **Clonar e configurar o ambiente**

   ```bash
   git clone https://github.com/BeeMediaOF/sp011.git /opt/<cliente>
   cd /opt/<cliente>
   cp .env.example .env
   ```

   No `.env`, preencha **sem** `SUPABASE_DATABASE_URL`/`DATABASE_URL` (deixe
   comentadas — o banco será configurado pela interface):

   - `SESSION_SECRET` — string aleatória longa, única desta instância;
   - `SETTINGS_ENCRYPTION_KEY` — string aleatória longa, única desta instância.
     **Imutável**: trocá-la depois quebra os segredos salvos e o arquivo de
     conexão do assistente;
   - `SITE_DOMAIN`, `APP_URL`, `SITE_URL`, `ALLOWED_ORIGINS` — domínio do cliente.

2. **Subir os containers**

   ```bash
   docker compose up -d --build api web caddy
   ```

   Sem banco configurado, a api entra em **modo instalação**: só `/api/setup`
   responde; o resto retorna 503 `{ setupRequired: true }`.

3. **Pegar o setup token no log**

   ```bash
   docker compose logs api | grep "setup token"
   ```

   O token é gerado a cada boot e protege o assistente numa instância exposta.

4. **Rodar o assistente** — abra `https://<dominio>/admin/setup` e informe:

   - o **setup token** do log;
   - a **conexão do banco** (connection string do Session Pooler, ou campos
     separados — que codificam sozinhos senhas com `@`/`#`);
   - (opcional) o **Storage** do cliente (Supabase URL + service_role key);
   - o **primeiro administrador** (nome, e-mail, senha).

   O assistente testa a conexão (PostgreSQL ≥ 14 + permissão de CREATE), aplica
   as migrations (baseline `lib/db/migrations/0000_init.sql` + incrementos
   idempotentes), cria o admin, grava a conexão **criptografada** em
   `/data/db-config.enc` (volume `api_data`) e reinicia o container. Ao voltar,
   o painel está pronto (`/admin/login`).

5. **Conectar ao painel central** (opcional)

   No painel central: cadastrar o blog (nome, domínio, URL da API) → copiar o
   segredo de integração (exibido uma vez). No blog: colar o segredo em
   Configurações. O central valida com `POST /api/ingest/test` → status `online`
   → criar as regras de distribuição.

## Operação

- **Recuperação**: se o banco salvo parar de conectar, o boot entra em **modo
  recuperação** — o mesmo `/admin/setup`, mostrando o erro traduzido; o arquivo
  antigo só é substituído após a nova conexão validar (backup em
  `db-config.enc.bak`).
- **Troca de banco**: Configurações → Conexões → Banco de Dados (exige senha do
  admin + teste da nova conexão + reinício automático). Migração de dados não é
  feita pela interface — use dump/restore antes:

  ```bash
  pg_dump "postgresql://...antigo..." | psql "postgresql://...novo..."
  ```

- **Rollback da troca**: restaurar o backup dentro do volume e reiniciar:

  ```bash
  docker compose exec api sh -c "cp /data/db-config.enc.bak /data/db-config.enc"
  docker compose restart api
  ```

- **Env tem prioridade**: se `SUPABASE_DATABASE_URL`/`DATABASE_URL` estiver no
  `.env`, o arquivo do assistente é ignorado e a tela de troca fica
  somente-leitura (deploys existentes, como o SP011, continuam idênticos).

## Segurança (não pular)

- `SESSION_SECRET` e `SETTINGS_ENCRYPTION_KEY` **únicos por instância** e
  imutáveis.
- A connection string do cliente vive **apenas** no `/data/db-config.enc`
  (criptografado) desta instância — nunca no painel central, em logs ou no
  navegador.
- O setup token muda a cada boot e as rotas do assistente morrem (403) depois
  da instalação.
