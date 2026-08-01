/**
 * routes/newsletter — captura pública de newsletter (PRD-NEWSLETTER-01, Fase 1).
 *
 * Substitui o caminho antigo (o formulário fazia POST /analytics/behavior só como
 * MÉTRICA, atrás do gate de cookies de analytics — quem recusava cookies e queria
 * assinar era descartado). Aqui a inscrição é um ato de consentimento próprio de
 * marketing: SEMPRE permitida, com prova LGPD (IP/UA/origem/timestamp) e double
 * opt-in. A métrica `trackNewsletter` continua no front, atrás do gate, em paralelo.
 *
 * Fase 1 = captura (subscribe) + confirmação (double opt-in). O e-mail de
 * confirmação é ENFILEIRADO na Fase 3 (fila+worker); aqui o inscrito nasce
 * `pending` com o token pronto e o operador/usuário confirma pelo link.
 */
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, newsletterSubscribersTable } from "@workspace/db";
import { store } from "../lib/store.js";
import { logger } from "../lib/logger.js";
import { isBotRequest, overRateLimit } from "../lib/trafficGuard.js";
import { cleanStr, normalizeIp } from "../lib/analyticsShared.js";
import { enqueueConfirmation } from "../lib/newsletter/dispatch.js";

const router = Router();

// Mesma validação do formulário no front (brasilia-agora) — MVP: forma, não MX.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Teto por IP por minuto. Captura é rara por usuário; um valor baixo corta abuso
// sem punir quem corrige o e-mail e reenvia. Fail-open (janela em memória).
const SUBSCRIBE_RATE_LIMIT = 10;

/** Token opaco de single/perene use (confirmação e descadastro). */
function genToken(): string {
  return randomBytes(32).toString("hex");
}

/** Normaliza o e-mail para a chave UNIQUE: trim + lowercase. */
function normalizeEmail(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

// ─── POST /api/newsletter/subscribe ───────────────────────────────────────────
// Público, sem auth, rate-limited. NUNCA faz SMTP no caminho da requisição
// (RNF-Perf-1): responde rápido e idempotente. Bot/limite → ok silencioso (não
// persiste, não recompensa quem sonda o endpoint).
router.post("/subscribe", async (req, res) => {
  try {
    if (isBotRequest(req)) { res.json({ ok: true }); return; }
    const ip = normalizeIp(req.ip ?? "");
    if (overRateLimit(`nl:${ip}`, SUBSCRIBE_RATE_LIMIT)) { res.json({ ok: true }); return; }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = normalizeEmail(cleanStr(b["email"], 254));
    if (!email || !EMAIL_RE.test(email)) { res.status(400).json({ ok: false }); return; }

    const rawSource = cleanStr(b["source"], 30);
    const source = rawSource === "footer" || rawSource === "home_block" ? rawSource : null;
    const ua = String(req.headers["user-agent"] ?? "").slice(0, 500);

    const existing = await db
      .select()
      .from(newsletterSubscribersTable)
      .where(eq(newsletterSubscribersTable.email, email))
      .limit(1);
    const row = existing[0];

    if (row) {
      // Já confirmado → idempotente: nada muda, não reenvia confirmação.
      if (row.status === "confirmed") { res.json({ ok: true }); return; }
      // Supressão dura (denúncia/hard bounce) não ressuscita por um novo submit.
      if (row.status === "bounced" || row.status === "complained") { res.json({ ok: true }); return; }
      // pending/unsubscribed → (re)abre o opt-in, renovando a prova de consentimento.
      await db.update(newsletterSubscribersTable).set({
        status:           "pending",
        confirmToken:     row.confirmToken ?? genToken(),
        unsubscribeToken: row.unsubscribeToken ?? genToken(),
        consentIp:        ip || null,
        consentUserAgent: ua || null,
        source:           source ?? row.source ?? null,
        updatedAt:        new Date(),
      }).where(eq(newsletterSubscribersTable.id, row.id));
      // Enfileira a confirmação (double opt-in) — envio assíncrono no worker,
      // nunca no caminho da requisição (RNF-Perf-1). Não-fatal.
      try { await enqueueConfirmation(row.id, email); }
      catch (e) { logger.warn({ err: e }, "newsletter: enfileirar confirmação falhou (não-fatal)"); }
      res.json({ ok: true });
      return;
    }

    const inserted = await db.insert(newsletterSubscribersTable).values({
      email,
      status:           "pending",
      confirmToken:     genToken(),
      unsubscribeToken: genToken(),
      consentIp:        ip || null,
      consentUserAgent: ua || null,
      source,
    }).returning({ id: newsletterSubscribersTable.id });
    const newId = inserted[0]?.id;
    if (newId != null) {
      try { await enqueueConfirmation(newId, email); }
      catch (e) { logger.warn({ err: e }, "newsletter: enfileirar confirmação falhou (não-fatal)"); }
    }
    res.json({ ok: true });
  } catch (err) {
    // Corrida de UNIQUE (dois submits simultâneos do mesmo e-mail) ou banco fora:
    // não falha o formulário do site. Loga para diagnóstico.
    logger.warn({ err }, "newsletter subscribe falhou (não-fatal)");
    res.status(200).json({ ok: true });
  }
});

// ─── GET /api/newsletter/confirm?token= ───────────────────────────────────────
// Double opt-in: o clique humano no link do e-mail confirma a inscrição. Token de
// single-use (limpo ao confirmar) → repetir o link mostra a página genérica.
router.get("/confirm", async (req, res) => {
  const token = cleanStr(req.query["token"], 200);
  let confirmed = false;
  if (token) {
    try {
      const updated = await db.update(newsletterSubscribersTable)
        .set({ status: "confirmed", confirmedAt: new Date(), confirmToken: null, updatedAt: new Date() })
        .where(and(
          eq(newsletterSubscribersTable.confirmToken, token),
          eq(newsletterSubscribersTable.status, "pending"),
        ))
        .returning({ id: newsletterSubscribersTable.id });
      confirmed = updated.length > 0;
    } catch (err) {
      logger.warn({ err }, "newsletter confirm falhou (não-fatal)");
    }
  }
  const site = store.getSettings().siteName || "Newsletter";
  res.status(200).type("html").send(
    confirmed
      ? renderPage(site, "Inscrição confirmada!", "Pronto — você vai receber as novidades por e-mail. Todo e-mail traz um link para cancelar quando quiser.")
      : renderPage(site, "Link não é mais válido", "Talvez sua inscrição já tenha sido confirmada, ou o link expirou. Se precisar, inscreva-se de novo pelo site."),
  );
});

// ─── Descadastro (obrigatório em todo e-mail) ─────────────────────────────────
// O MESMO token perene (unsubscribe_token) serve os três caminhos: o link
// visível no corpo (GET), o header List-Unsubscribe (GET) e o botão nativo do
// Gmail/Yahoo (POST one-click, RFC 8058). Idempotente e sem login.

/** Efetiva o descadastro pelo token. Retorna true se um inscrito foi (ou já
 *  estava) descadastrado. Só sai de estados não-terminais (bounced/complained
 *  ficam como estão). */
async function unsubscribeByToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const updated = await db.update(newsletterSubscribersTable)
      .set({ status: "unsubscribed", unsubscribedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(newsletterSubscribersTable.unsubscribeToken, token),
        inArray(newsletterSubscribersTable.status, ["pending", "confirmed", "unsubscribed"]),
      ))
      .returning({ id: newsletterSubscribersTable.id });
    return updated.length > 0;
  } catch (err) {
    logger.warn({ err }, "newsletter unsubscribe falhou (não-fatal)");
    return false;
  }
}

// GET — clique humano no link visível do e-mail → página de confirmação.
router.get("/unsubscribe", async (req, res) => {
  const token = cleanStr(req.query["token"], 200);
  await unsubscribeByToken(token);
  const site = store.getSettings().siteName || "Newsletter";
  // Página genérica mesmo quando o token não casa (não revela se o e-mail existe).
  res.status(200).type("html").send(
    renderPage(site, "Inscrição cancelada", "Pronto — você não vai mais receber a nossa newsletter. Se mudar de ideia, é só assinar de novo pelo site."),
  );
});

// POST — one-click do Gmail/Yahoo (List-Unsubscribe-Post): efetiva e responde
// 204 SEM página/redirect. Sem esse POST o header mente e o usuário cai no
// "Denunciar spam" (pior para a reputação do remetente).
router.post("/unsubscribe", async (req, res) => {
  const token = cleanStr(req.query["token"], 200);
  await unsubscribeByToken(token); // idempotente; 204 mesmo se o token não casar
  res.status(204).end();
});

/** Página pública mínima e autossuficiente (sem bundle/SSR) para confirm/descadastro. */
function renderPage(site: string, title: string, message: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  ));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — ${esc(site)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:#f7f9fb; color:#0f172a; padding:24px; }
  .card { max-width:440px; width:100%; background:#fff; border:1px solid #e5e7eb; border-radius:16px;
    padding:32px 28px; box-shadow:0 8px 28px rgba(15,23,42,.06); text-align:center; }
  h1 { font-size:20px; margin:0 0 10px; }
  p { font-size:15px; line-height:1.55; color:#475569; margin:0 0 18px; }
  a { color:#1e2d5e; font-weight:600; text-decoration:none; }
  .site { font-size:12px; color:#94a3b8; margin-top:8px; }
  @media (prefers-color-scheme: dark) {
    body { background:#0d1533; color:#e5e7eb; }
    .card { background:#111a3d; border-color:#1e2a55; }
    p { color:#a9b4d0; } a { color:#9db2ff; }
  }
</style></head><body><div class="card">
<h1>${esc(title)}</h1>
<p>${esc(message)}</p>
<p class="site">${esc(site)}</p>
</div></body></html>`;
}

export default router;
