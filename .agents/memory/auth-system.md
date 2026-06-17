---
name: Sistema de autenticação admin
description: Auth DB-backed com scrypt, roles admin/editor, seed automático, lockout por tentativas, audit e security logs
---

## Regras

- **Hash de senha:** `crypto.scryptSync` — formato `salt:hash` (sem deps extras)
- **Token:** `userId:role:timestamp:hmacSig` (base64url), TTL 7 dias, verificado via HMAC-SHA256 com `SESSION_SECRET`
- **Seed:** `index.ts` chama `seedAdminUser()` no startup — cria admin se tabela `users` estiver vazia. Credenciais via `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD`
- **Login:** aceita campo `email` (não `username`). Fallback `username` removido da nova versão
- **Lockout:** 5 tentativas inválidas → bloqueia conta por 30 min (campo `lockedUntil`)
- **Rate limiting:** 10 req/min por IP no endpoint de login
- **Role storage no frontend:** `localStorage` chaves: `admin_token`, `admin_role`, `admin_user` (JSON)
- **RequireAdmin** bloqueia editores no frontend com tela de "Acesso Restrito"
- **AdminLayout** filtra menu pelo role — editores veem subconjunto de páginas

**Why:** Sistema sem sessão stateless (tokens Bearer), resistente a CSRF. scrypt é mais seguro que bcrypt sem deps externas.

**How to apply:** Ao criar novas rotas admin restritas: use `authMiddleware` + `requireAdmin`. No frontend: envolva a rota com `<RequireAdmin>`.

## Tabelas DB
- `users` — id, name, email, password_hash, role(admin|editor), status(active|inactive|blocked), failed_login_attempts, locked_until
- `audit_logs` — todas as ações dos usuários
- `security_logs` — eventos de segurança (falhas de login, lockout, acesso negado)

## Erros pré-existentes a ignorar
`rssProcessor.ts`, `quotes.ts`, `webhook.ts` — têm erros TS pre-existentes, não corrigir.
