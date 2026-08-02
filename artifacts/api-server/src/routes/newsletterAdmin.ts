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
import { and, count, desc, eq } from "drizzle-orm";
import { db, usersTable, newsletterCampaignsTable, newsletterSendQueueTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permissions.js";
import { store } from "../lib/store.js";
import type { SiteSettings, NewsletterTemplate } from "../lib/store.js";
import { sendEmail } from "../lib/mailer.js";
import { getNewsletterSmtpConfig, renderNewsletterEmail } from "../lib/newsletter/email.js";
import { sanitizeIngestHtml } from "../lib/ingestSanitize.js";
import { startCampaignSend } from "../lib/newsletter/dispatch.js";

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
    footerNote: "E-mail de teste de configuração — nenhuma ação necessária.",
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

// ── Campanhas (Fase 3: motor exercitável por curl/SQL; UI TipTap na Fase 4) ───
// O corpo (bodyHtml) é sanitizado ANTES de gravar (invariante do PRD; o mesmo
// sanitizador isomórfico do ingest). O disparo real (fan-out + drip + teto) fica
// no produtor `startCampaignSend`; o worker envia.

function parseCampaignInput(b: Record<string, unknown>): { subject?: string; bodyHtml?: string } {
  const out: { subject?: string; bodyHtml?: string } = {};
  if (typeof b["subject"]  === "string") out.subject  = (b["subject"] as string).trim().slice(0, 300);
  if (typeof b["bodyHtml"] === "string") out.bodyHtml = sanitizeIngestHtml(b["bodyHtml"] as string);
  return out;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /campaigns — lista (mais recentes primeiro).
router.get("/campaigns", async (_req, res) => {
  const rows = await db
    .select()
    .from(newsletterCampaignsTable)
    .orderBy(desc(newsletterCampaignsTable.createdAt))
    .limit(200);
  res.json({ campaigns: rows });
});

// POST /campaigns — cria rascunho.
router.post("/campaigns", async (req, res) => {
  const input = parseCampaignInput((req.body ?? {}) as Record<string, unknown>);
  if (!input.subject) { res.status(400).json({ ok: false, error: "Assunto obrigatório." }); return; }
  const [row] = await db
    .insert(newsletterCampaignsTable)
    .values({ subject: input.subject, bodyHtml: input.bodyHtml ?? "", status: "draft" })
    .returning();
  res.json({ ok: true, campaign: row });
});

// GET /campaigns/:id — campanha + contagem da fila por status.
router.get("/campaigns/:id", async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [campaign] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ ok: false }); return; }
  const queue = await db
    .select({ status: newsletterSendQueueTable.status, count: count() })
    .from(newsletterSendQueueTable)
    .where(eq(newsletterSendQueueTable.campaignId, id))
    .groupBy(newsletterSendQueueTable.status);
  res.json({ campaign, queue });
});

// PUT /campaigns/:id — edita assunto/corpo (só rascunho/agendada).
router.put("/campaigns/:id", async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [existing] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ ok: false }); return; }
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    res.status(409).json({ ok: false, error: "Só rascunhos ou campanhas agendadas podem ser editados." });
    return;
  }
  const input = parseCampaignInput((req.body ?? {}) as Record<string, unknown>);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.subject !== undefined)  patch["subject"]  = input.subject;
  if (input.bodyHtml !== undefined) patch["bodyHtml"] = input.bodyHtml;
  await db.update(newsletterCampaignsTable).set(patch).where(eq(newsletterCampaignsTable.id, id));
  const [row] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  res.json({ ok: true, campaign: row });
});

// POST /campaigns/:id/send — envia agora ou agenda (scheduledAt futuro).
router.post("/campaigns/:id/send", async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [campaign] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ ok: false }); return; }
  if (campaign.status === "sent" || campaign.status === "sending" || campaign.status === "canceled") {
    res.status(409).json({ ok: false, error: `Campanha já está '${campaign.status}'.` });
    return;
  }
  if (!store.getSettings().newsletterEnabled) {
    res.status(400).json({ ok: false, error: "A newsletter está desligada (Configurações → Ativar)." });
    return;
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const rawWhen = typeof b["scheduledAt"] === "string" ? b["scheduledAt"] : null;
  const when = rawWhen ? new Date(rawWhen) : null;
  if (when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now()) {
    await db.update(newsletterCampaignsTable)
      .set({ status: "scheduled", scheduledAt: when, updatedAt: new Date() })
      .where(eq(newsletterCampaignsTable.id, id));
    res.json({ ok: true, scheduled: true, scheduledAt: when.toISOString() });
    return;
  }

  const recipients = await startCampaignSend(id, { firstAt: new Date() });
  res.json({ ok: true, scheduled: false, recipients });
});

// POST /campaigns/:id/cancel — cancela (encerra as linhas pendentes da fila).
router.post("/campaigns/:id/cancel", async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [campaign] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ ok: false }); return; }
  if (campaign.status === "sent") { res.status(409).json({ ok: false, error: "Campanha já foi enviada." }); return; }
  await db.update(newsletterSendQueueTable)
    .set({ status: "dead", lastError: "campanha cancelada" })
    .where(and(eq(newsletterSendQueueTable.campaignId, id), eq(newsletterSendQueueTable.status, "pending")));
  await db.update(newsletterCampaignsTable)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(newsletterCampaignsTable.id, id));
  res.json({ ok: true });
});

export default router;
