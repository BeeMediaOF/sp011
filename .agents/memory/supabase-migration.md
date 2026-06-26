---
name: Migração para Supabase
description: Como o app conecta ao Supabase e por que a conexão direta não funciona
---

# Conexão com Supabase

- A conexão **direta** do Supabase (`db.<ref>.supabase.co:5432`) resolve **apenas para IPv6** e NÃO funciona do Replit (nem da maioria dos servidores IPv4, como Hostinger). Sempre usar o **Session Pooler** (`aws-<n>-<regiao>.pooler.supabase.com:5432`, usuário `postgres.<ref>`), que tem IPv4.
- Senhas com caracteres especiais precisam ser **codificadas na URL** (`@` → `%40`, `#` → `%23`), senão o `pg.Pool` falha ao parsear a connection string.

## Prioridade de DATABASE_URL
- `lib/db/src/index.ts` e `lib/db/drizzle.config.ts` priorizam `SUPABASE_DATABASE_URL ?? DATABASE_URL`.
- **Why:** o `DATABASE_URL` do Replit é runtime-managed (banco nativo, travado) e não pode ser sobrescrito; usar uma var separada deixa o app ignorar o banco nativo e usar só o Supabase.
- **How to apply:** no Replit, setar o secret `SUPABASE_DATABASE_URL`. Na Hostinger, pode setar `DATABASE_URL` ou `SUPABASE_DATABASE_URL` com a URL do pooler.

## Procedimento de migração de dados
1. Criar schema: `SUPABASE_DATABASE_URL=<pooler> pnpm --filter @workspace/db run push`
2. Exportar: `pg_dump <replit_url> --data-only --no-owner --no-acl --disable-triggers -f dump.sql`
3. Importar: `psql <pooler_url> --single-transaction --set ON_ERROR_STOP=on -f dump.sql`
4. Conferir contagens de linhas tabela a tabela entre origem e destino.
