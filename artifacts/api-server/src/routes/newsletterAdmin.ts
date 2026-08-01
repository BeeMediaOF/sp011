/**
 * Admin da Newsletter — /api/admin/newsletter/* (PRD-NEWSLETTER-01, Fase 2).
 *
 * Decisão travada (usuário, 2026-07-31): a config de remetente/Gmail e o modelo
 * do e-mail são editados EXCLUSIVAMENTE na subaba "Configurações" da aba
 * Newsletter — nunca na página global de Configurações. O armazenamento continua
 * em `site_settings` (config por blog), por isso este router lê/grava só o
 * subconjunto newsletter dessas settings, em vez de dobrar os campos no
 * PUT /settings global.
 *
 * Fase 2 entrega: GET/PUT /settings (remetente + modelo) e POST /test.
 * Inscritos e campanhas chegam nas Fases 3/4 (mesmo router).
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permissions.js";
import { store } from "../lib/store.js";
import type { SiteSettings, NewsletterTemplate } from "../lib/store.js";
import { sendEmail } from "../lib/mailer.js";
import { getNewsletterSmtpConfig, renderNewsletterEmail } from "../lib/newsletter/email.js";

const router = Router();

router.use(authMiddleware);
// Newsletter é config do site (remetente/modelo) → mesma permissão de settings.
// Admin passa direto (ignora permissões por design).
router.use(requirePermission("settings.view"));

const MASK = "••••••••";

const DEFAULT_TEMPLATE: Required<NewsletterTemplate> = {
  accentColor: "",
  logoMode: "wordmark",
  headerText: "",
  footerText: "",
  signature: "",
};

/** Subconjunto newsletter das settings, com o segredo MASCARADO para leitura. */
function maskNewsletter(s: SiteSettings) {
  return {
    newsletterEnabled:   s.newsletterEnabled ?? false,
    newsletterFromName:  s.newsletterFromName ?? "",
    newsletterFromEmail: s.newsletterFromEmail ?? "",
    newsletterSmtpHost:  s.newsletterSmtpHost ?? "smtp.gmail.com",
    newsletterSmtpPort:  s.newsletterSmtpPort ?? 587,
    newsletterSmtpUser:  s.newsletterSmtpUser ?? "",
    newsletterSmtpPass:  s.newsletterSmtpPass ? MASK : "",
    hasNewsletterSmtpPass: !!s.newsletterSmtpPass,
    newsletterReplyTo:   s.newsletterReplyTo ?? "",
    newsletterDailyCap:  s.newsletterDailyCap ?? 450,
    newsletterTemplate:  { ...DEFAULT_TEMPLATE, ...(s.newsletterTemplate ?? {}) },
  };
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function sanitizeTemplate(input: unknown): NewsletterTemplate {
  const t = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === "string" ? v.slice(0, max) : undefined;
  const out: NewsletterTemplate = {
    logoMode: t["logoMode"] === "none" ? "none" : "wordmark",
  };
  const accent = typeof t["accentColor"] === "string" ? t["accentColor"].trim() : "";
  out.accentColor = accent && HEX_RE.test(accent) ? accent : "";
  const header = str(t["headerText"], 120);   if (header !== undefined) out.headerText = header;
  const footer = str(t["footerText"], 1000);  if (footer !== undefined) out.footerText = footer;
  const sign   = str(t["signature"], 1000);   if (sign   !== undefined) out.signature   = sign;
  return out;
}

// ── GET /settings — remetente + modelo (segredo mascarado) ────────────────────
router.get("/settings", (_req, res) => {
  res.json({ settings: maskNewsletter(store.getSettings()) });
});

// ── PUT /settings — grava só o subconjunto newsletter em site_settings ────────
router.put("/settings", (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<SiteSettings> = {};

  if (typeof b["newsletterEnabled"]   === "boolean") patch.newsletterEnabled   = b["newsletterEnabled"];
  if (typeof b["newsletterFromName"]  === "string")  patch.newsletterFromName  = (b["newsletterFromName"] as string).trim().slice(0, 120);
  if (typeof b["newsletterFromEmail"] === "string")  patch.newsletterFromEmail = (b["newsletterFromEmail"] as string).trim().slice(0, 200);
  if (typeof b["newsletterSmtpHost"]  === "string")  patch.newsletterSmtpHost  = (b["newsletterSmtpHost"] as string).trim().slice(0, 200) || "smtp.gmail.com";
  if (b["newsletterSmtpPort"] !== undefined)         patch.newsletterSmtpPort  = Math.max(1, Math.min(65535, Math.floor(Number(b["newsletterSmtpPort"]) || 587)));
  if (typeof b["newsletterSmtpUser"]  === "string")  patch.newsletterSmtpUser  = (b["newsletterSmtpUser"] as string).trim().slice(0, 200);
  // Segredo: só regrava quando enviado sem máscara (evita salvar "••••••••").
  if (typeof b["newsletterSmtpPass"] === "string" && b["newsletterSmtpPass"] && !(b["newsletterSmtpPass"] as string).includes("•")) {
    patch.newsletterSmtpPass = (b["newsletterSmtpPass"] as string).trim();
  }
  if (typeof b["newsletterReplyTo"]   === "string")  patch.newsletterReplyTo   = (b["newsletterReplyTo"] as string).trim().slice(0, 200);
  if (b["newsletterDailyCap"] !== undefined)         patch.newsletterDailyCap  = Math.max(1, Math.min(5000, Math.floor(Number(b["newsletterDailyCap"]) || 450)));
  if (b["newsletterTemplate"] !== undefined)         patch.newsletterTemplate  = sanitizeTemplate(b["newsletterTemplate"]);

  store.updateSettings(patch);
  res.json({ ok: true, settings: maskNewsletter(store.getSettings()) });
});

// ── POST /test — dispara um e-mail de teste ao admin logado ───────────────────
router.post("/test", async (req, res) => {
  const s = store.getSettings();
  const cfg = getNewsletterSmtpConfig(s);
  if (!cfg.ok) { res.status(400).json({ ok: false, error: cfg.error }); return; }

  // E-mail do admin logado. req.userEmail só vem no caminho não-cacheado do
  // authMiddleware — no cacheado, buscar pelo userId.
  let to = req.userEmail;
  if (!to && req.userId) {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.userId)).limit(1);
    to = u?.email;
  }
  if (!to) { res.status(400).json({ ok: false, error: "Não foi possível determinar o e-mail do administrador logado." }); return; }

  const subject = `Teste de configuração — ${s.siteName}`;
  const { html, text } = renderNewsletterEmail({
    settings: s,
    subject,
    bodyHtml:
      `<p style="margin:0 0 12px;">Se você recebeu este e-mail, o remetente do <strong>${s.siteName}</strong> está configurado corretamente e pronto para enviar a newsletter.</p>` +
      `<p style="margin:0;color:#4A5568;font-size:13px;">Servidor: ${s.newsletterSmtpHost || "smtp.gmail.com"}:${s.newsletterSmtpPort || 587} &middot; enviado para ${to}.</p>`,
  });

  const headers: Record<string, string> = {};
  if (s.newsletterReplyTo) headers["Reply-To"] = s.newsletterReplyTo;

  try {
    await sendEmail(cfg.config, { to, subject, html, text, headers });
    res.json({ ok: true, to });
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message });
  }
});

export default router;
