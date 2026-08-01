# STATUS — Newsletter

| Etapa | Estado | Data |
|---|---|---|
| Fase 0 — Investigação (`00-investigacao.md`) | ✅ Concluída | 2026-07-31 |
| Fase 1 — PRD (`PRD-NEWSLETTER-01-captura-e-disparo.md`) | ✅ Concluído | 2026-07-31 |
| Revisão pós-aprovação (POST one-click RFC 8058 + teto diário) | ✅ Aplicada | 2026-07-31 |
| Execução — Fase interna 1 (captura + consentimento) | ✅ Validada em prod (VPS, sp011) | 2026-07-31 |
| Execução — Fase interna 2 (admin: remetente + modelo) | ⬜ Pendente | — |
| Execução — Fase interna 3 (motor de disparo assíncrono) | ⬜ Pendente | — |
| Execução — Fase interna 4 (ponta a ponta) | ⬜ Pendente | — |
| `RELATORIO-FINAL.md` (pós-implementação) | ⬜ Pendente | — |

## Decisões travadas (Fase 0)
- Lista **isolada por blog**; disparo **manual + agendado**; remetente **Gmail próprio
  por blog**; editor **texto rico (TipTap)**.

## Achados que mudam o plano original
- O "bypass de LGPD" do prompt **já foi corrigido** (commit `b6d58b8`). O escopo real é
  **desacoplar** a inscrição do cookie de analytics + persistir inscrito + **double
  opt-in** (não existe hoje).
- Já existe SMTP sem dependências (`api-server/src/lib/mailer.ts`) — reusar, não criar
  do zero. Falta exportar/parametrizar por blog e des-chumbar a marca (`BRAND`).
- Sem n8n/fila externa — motor = tabela-fila Postgres + worker in-process (espelhar
  `deliveryWorker.ts`/`backoff.ts`).

## Fase 1 — o que entrou (2026-07-31)
- Tabela `newsletter_subscribers` (schema `lib/db` + autocriação em `ensureSchema.ts`).
- Rota pública `POST /api/newsletter/subscribe` (persiste `pending` com IP/UA/origem,
  idempotente, fora do gate de analytics) e `GET /api/newsletter/confirm?token=`
  (double opt-in → `confirmed`, página pública).
- Front: helper `subscribeNewsletter` (`brasilia-agora/src/lib/newsletter.ts`), fiado
  em `Footer.tsx` e `HomeCustomBlocks.tsx` ao lado da métrica `trackNewsletter` (mesmo
  markup → CLS=0). Inscrição sai sempre; métrica segue atrás do gate.
- **Pendente por design até a Fase 3:** o e-mail de confirmação ainda NÃO é
  disparado (depende da fila+worker). Na Fase 1 o inscrito nasce `pending` com token
  pronto e a confirmação é feita abrindo o link (validação por SQL/curl na VPS). O
  site não regride: antes o e-mail caía efêmero em `behavior_events` e nunca era usado.
- Local: `lib/db` `tsc -b` ✅, api-server typecheck ✅ + 232 testes ✅ + esbuild ✅,
  frontend typecheck ✅.
- **Validação em prod (VPS sp011, 2026-07-31):** subscribe → linha `pending` com
  `consent_ip` + `source='footer'` (prova do desacoplamento do gate + consentimento
  LGPD); `confirm?token=` → `confirmed` com `confirmed_at`. Filtro de bot confirmado
  (curl puro = bot → `ok` silencioso sem persistir; UA de navegador persiste).

## Modo atual
**Execução — Fase 1 validada em prod (sp011).** Rollout ainda só no sp011 (blogs
replicados seguem na imagem anterior). Próximo passo: **Fase 2** (admin: subaba
Configurações com remetente Gmail encriptado/mascarado + modelo de e-mail; refactor
de `mailer.ts` com `rejectUnauthorized:true`, `List-Unsubscribe` e `Message-ID`;
botão "enviar e-mail de teste").
