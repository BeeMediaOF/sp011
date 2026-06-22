---
name: Features de segurança do portal admin
description: TOTP 2FA, CAPTCHA matemático, token 8h, log retention e AMP route
---

## 2FA (TOTP)
- Rotas backend: POST `/api/admin/2fa/setup`, `verify`, `disable`, `login`, GET `status`
- Fluxo login: se `twoFactorEnabled=true`, login retorna `{ requiresTwoFactor: true, tempToken }` em vez de token real
- `tempToken` = HMAC assinado com sentinela `2fa-pending`, expira em 10 min (ver `generateTempToken` em auth.ts)
- Frontend: Login.tsx exibe tela de código quando `requiresTwoFactor=true`
- Setup UI: `/admin/2fa-setup` → TwoFactorSetup.tsx

## Math CAPTCHA
- Ativado após 3 falhas de login (`failedAttempts >= 3` em Login.tsx)
- Backend sinaliza com `requiresCaptcha: true` na resposta 401
- Frontend gera desafio `a + b = ?` e bloqueia submit sem resposta correta

## Token de sessão
- Expiração: 8 horas (28_800_000 ms) em auth.ts
- `lastSeenAt` atualizado no background a cada request autenticado

## Log retention (cron diário)
- audit_logs: 90 dias
- security_logs: 180 dias  
- rss_event_logs: 30 dias
- Roda via `setInterval` no scheduler.ts, primeira execução 2min após startup

## AMP
- Rota: GET `/api/amp/artigos/:slug` → HTML AMP válido com Schema.org
- Artigo.tsx injeta `<link rel="amphtml">` via useEffect (dinâmico)

## OG tags dinâmicas
- Artigo.tsx usa useEffect para injetar og:*, twitter:*, article:* tags por artigo
- Limpeza automática no unmount (dataset.articleDynamic = "1")

## Anúncios com expiração
- Campo `expiresAt` na tabela ads
- Rota pública `/api/ads` filtra anúncios expirados com `gte(adsTable.expiresAt, now)`
- Admin UI permite definir data de expiração no formulário de criação/edição

## CSP (Helmet)
- script-src: 'self', 'unsafe-inline', cdn.ampproject.org
- style-src: 'self', 'unsafe-inline', fonts.googleapis.com
- img-src: 'self', data:, https:
- font-src: 'self', fonts.gstatic.com
