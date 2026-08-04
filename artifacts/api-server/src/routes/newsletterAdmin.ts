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
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { and, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db, usersTable, newsletterCampaignsTable, newsletterSendQueueTable, newsletterSubscribersTable, newsletterTemplatesTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permissions.js";
import { store } from "../lib/store.js";
import type { SiteSettings, NewsletterTemplate } from "../lib/store.js";
import { sendEmail } from "../lib/mailer.js";
import { getNewsletterSmtpConfig, renderNewsletterEmail } from "../lib/newsletter/email.js";
import { sanitizeEmailHtml } from "@workspace/news-engine/sanitize";
import { startCampaignSend } from "../lib/newsletter/dispatch.js";
import { buildArticleCardsHtml, resolveArticleTokens } from "../lib/newsletter/articleCards.js";
import { loadCardArticles } from "../lib/newsletter/articleSource.js";
import { articleService } from "../lib/articleService.js";
import { LOCAL_UPLOADS_DIR } from "../lib/uploadsFile.js";
import { getPublicBase } from "../lib/social/queueProcessor.js";

const router = Router();

router.use(authMiddleware);
// Acesso à Newsletter (ler inscritos/campanhas/modelos). Ações específicas
// (criar/editar campanha, disparar, gerenciar inscritos/modelos, configurar
// remetente) exigem permissões próprias por rota, abaixo. Admin passa direto.
router.use(requirePermission("newsletter.view"));

const MASK = "••••••••";

const DEFAULT_TEMPLATE: Required<NewsletterTemplate> = {
  accentColor: "",
  logoMode: "wordmark",
  logoUrl: "",
  headerText: "",
  headerTextColor: "",
  pageBgColor: "",
  bodyTextColor: "",
  footerText: "",
  signature: "",
  headerHtml: "",
  footerHtml: "",
  layout: "standard",
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
  const color = (v: unknown): string => {
    const c = typeof v === "string" ? v.trim() : "";
    return c && HEX_RE.test(c) ? c : ""; // "" = herda o default do shell
  };
  const out: NewsletterTemplate = {
    logoMode: t["logoMode"] === "none" ? "none" : t["logoMode"] === "image" ? "image" : "wordmark",
  };
  out.accentColor     = color(t["accentColor"]);
  out.headerTextColor = color(t["headerTextColor"]);
  out.pageBgColor     = color(t["pageBgColor"]);
  out.bodyTextColor   = color(t["bodyTextColor"]);
  const logoUrl = typeof t["logoUrl"] === "string" ? t["logoUrl"].trim().slice(0, 500) : "";
  out.logoUrl = /^(\/|https?:\/\/)/i.test(logoUrl) ? logoUrl : ""; // só root-relativa ou http(s)
  const header = str(t["headerText"], 120);   if (header !== undefined) out.headerText = header;
  const footer = str(t["footerText"], 1000);  if (footer !== undefined) out.footerText = footer;
  const sign   = str(t["signature"], 1000);   if (sign   !== undefined) out.signature   = sign;
  // HTML de cabeçalho/rodapé (modo "código"): sanitizado pela política de e-mail
  // (preserva `style` inline seguro, mata script/js/on*). Limite antes de sanitizar.
  if (typeof t["headerHtml"] === "string") out.headerHtml = sanitizeEmailHtml((t["headerHtml"] as string).slice(0, 20000));
  if (typeof t["footerHtml"] === "string") out.footerHtml = sanitizeEmailHtml((t["footerHtml"] as string).slice(0, 20000));
  out.layout = t["layout"] === "full" ? "full" : "standard";
  return out;
}

// ── GET /settings — remetente + modelo (segredo mascarado) ────────────────────
router.get("/settings", (_req, res) => {
  res.json({ settings: maskNewsletter(store.getSettings()) });
});

// ── PUT /settings — grava só o subconjunto newsletter em site_settings ────────
router.put("/settings", requirePermission("newsletter.settings"), (req, res) => {
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
router.post("/test", requirePermission("newsletter.settings"), async (req, res) => {
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
    baseUrl: getPublicBase() ?? undefined,
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

// ── POST /preview — compõe o shell com corpo de exemplo (prévia ao vivo) ──────
// Usa a MESMA função que compõe o e-mail real (fonte única) → a prévia é fiel.
// Mescla o template enviado (ainda não salvo) sobre as settings atuais.
router.post("/preview", (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const s = store.getSettings();
  const tpl = sanitizeTemplate(b["newsletterTemplate"] ?? b["template"]);
  const fromName = typeof b["fromName"] === "string" ? b["fromName"].trim().slice(0, 120) : undefined;
  const merged: SiteSettings = { ...s, newsletterFromName: fromName ?? s.newsletterFromName };
  const base = getPublicBase() ?? "";
  const sampleBody =
    `<h2 style="margin:0 0 12px;font-size:20px;">Título da matéria</h2>` +
    `<p style="margin:0 0 14px;">Assim o corpo da sua campanha aparece dentro da moldura de marca. ` +
    `O conteúdo você escreve no editor da aba <strong>Campanhas</strong>.</p>` +
    `<p style="margin:0 0 14px;">Mais um parágrafo com um <a href="#">link de exemplo</a> para você ver o espaçamento e as cores.</p>` +
    `<p style="margin:0;">Abraços,<br/>Equipe.</p>`;
  const { html } = renderNewsletterEmail({
    settings: merged,
    template: tpl,
    subject: "Prévia da newsletter",
    bodyHtml: sampleBody,
    unsubscribeUrl: `${base}/api/newsletter/unsubscribe?token=exemplo`,
    baseUrl: base || undefined,
    previewText: "Prévia do modelo de e-mail",
  });
  res.json({ html });
});

// ── Cards de artigo, prévia de corpo e biblioteca de imagens ─────────────────
// Três rotas de apoio ao editor de campanha. Todas sob o `newsletter.view` do
// router: nenhuma delas grava nada.

/** Cor de destaque/texto vindas do corpo da requisição (a moldura da campanha
 *  ainda pode nem estar salva). Sanitizadas pelo próprio articleCards. */
function cardOptsFrom(b: Record<string, unknown>): { accent?: string; textColor?: string } {
  const out: { accent?: string; textColor?: string } = {};
  if (typeof b["accent"] === "string") out.accent = b["accent"];
  if (typeof b["textColor"] === "string") out.textColor = b["textColor"];
  return out;
}

// POST /article-cards — HTML dos cards dos artigos escolhidos no picker.
// Devolve HTML pronto para colar no corpo; a ORDEM segue a dos ids enviados.
router.post("/article-cards", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(b["ids"]) ? (b["ids"] as unknown[]).slice(0, 12).map((v) => String(v)) : [];
  if (ids.length === 0) { res.status(400).json({ ok: false, error: "Nenhum artigo escolhido." }); return; }

  const all = await articleService.getArticles();
  const byKey = new Map<string, (typeof all)[number]>();
  for (const a of all) {
    if (a.status !== "published") continue;
    byKey.set(a.id, a);
    if (a.slug) byKey.set(a.slug, a);
  }
  const chosen = ids.map((id) => byKey.get(id)).filter((a): a is (typeof all)[number] => !!a);
  const html = buildArticleCardsHtml(
    chosen.map((a) => ({ id: a.id, slug: a.slug, title: a.title, category: a.category, imageUrl: a.imageUrl })),
    cardOptsFrom(b),
  );
  res.json({ ok: true, html, count: chosen.length });
});

// POST /render-body — resolve os tokens de artigo do corpo (só isso).
// A prévia do editor é montada no cliente; sem esta rota ela mostraria
// `{{artigos:3}}` cru justamente onde o inscrito verá os cards.
router.post("/render-body", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const bodyHtml = typeof b["bodyHtml"] === "string" ? (b["bodyHtml"] as string).slice(0, 200000) : "";
  res.json({ html: await resolveArticleTokens(bodyHtml, loadCardArticles, cardOptsFrom(b)) });
});

// GET /images — imagens já enviadas pela newsletter (prefixo `nl-`), para reuso
// entre campanhas. Mora AQUI, e não em /api/uploads, de propósito: um listador
// genérico de /data/uploads exporia o acervo inteiro de imagens de artigos.
// Sem DELETE — apagar arquivo quebraria campanha já enviada que alguém reabra.
router.get("/images", (_req, res) => {
  try {
    const files = readdirSync(LOCAL_UPLOADS_DIR)
      .filter((f) => /^nl-/i.test(f))
      .map((filename) => {
        try {
          const st = statSync(join(LOCAL_UPLOADS_DIR, filename));
          return { filename, url: `/api/uploads/${filename}`, size: st.size, mtime: st.mtimeMs };
        } catch { return null; }
      })
      .filter((f): f is { filename: string; url: string; size: number; mtime: number } => !!f)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 200);
    res.json({ images: files });
  } catch {
    // Diretório ausente num ambiente novo não é erro para o painel — é lista vazia.
    res.json({ images: [] });
  }
});

// ── Campanhas (Fase 3: motor exercitável por curl/SQL; UI TipTap na Fase 4) ───
// O corpo (bodyHtml) é sanitizado ANTES de gravar (invariante do PRD; política
// de e-mail, que preserva estilo inline). O disparo real (fan-out + drip + teto) fica
// no produtor `startCampaignSend`; o worker envia.

function parseCampaignInput(b: Record<string, unknown>): { subject?: string; bodyHtml?: string; templateId?: number | null; templateOverride?: NewsletterTemplate | null } {
  const out: { subject?: string; bodyHtml?: string; templateId?: number | null; templateOverride?: NewsletterTemplate | null } = {};
  if (typeof b["subject"]  === "string") out.subject  = (b["subject"] as string).trim().slice(0, 300);
  // Corpo da campanha usa a MESMA política de e-mail do cabeçalho/rodapé
  // (sanitizeEmailHtml): preserva `style` inline e os atributos de tabela, sem
  // os quais um layout rico chega ao inscrito sem nenhum estilo. NÃO usar o
  // sanitizador de artigo/ingest aqui — ele descarta `style` por design.
  if (typeof b["bodyHtml"] === "string") out.bodyHtml = sanitizeEmailHtml((b["bodyHtml"] as string).slice(0, 200000));
  // templateId: null/"" = moldura Padrão; inteiro positivo = moldura da biblioteca.
  if ("templateId" in b) {
    const v = b["templateId"];
    if (v === null || v === "") out.templateId = null;
    else { const n = Number(v); if (Number.isInteger(n) && n > 0) out.templateId = n; }
  }
  // templateOverride: ajuste de cabeçalho/rodapé SÓ desta campanha. null/"" =
  // limpa (segue a moldura); objeto = sanitizado pela política de e-mail.
  if ("templateOverride" in b) {
    const v = b["templateOverride"];
    if (v === null || v === "") out.templateOverride = null;
    else if (typeof v === "object") out.templateOverride = sanitizeTemplate(v);
  }
  return out;
}

function parseId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
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
router.post("/campaigns", requirePermission("newsletter.campaigns"), async (req, res) => {
  const input = parseCampaignInput((req.body ?? {}) as Record<string, unknown>);
  if (!input.subject) { res.status(400).json({ ok: false, error: "Assunto obrigatório." }); return; }
  const [row] = await db
    .insert(newsletterCampaignsTable)
    .values({ subject: input.subject, bodyHtml: input.bodyHtml ?? "", status: "draft", templateId: input.templateId ?? null, templateOverride: (input.templateOverride ?? null) as Record<string, unknown> | null })
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
router.put("/campaigns/:id", requirePermission("newsletter.campaigns"), async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [existing] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ ok: false }); return; }
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    res.status(409).json({ ok: false, error: "Só rascunhos ou campanhas agendadas podem ser editados. Use “Duplicar” para reaproveitar esta campanha." });
    return;
  }
  const input = parseCampaignInput((req.body ?? {}) as Record<string, unknown>);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.subject !== undefined)    patch["subject"]    = input.subject;
  if (input.bodyHtml !== undefined)   patch["bodyHtml"]   = input.bodyHtml;
  if (input.templateId !== undefined) patch["templateId"] = input.templateId;
  if (input.templateOverride !== undefined) patch["templateOverride"] = input.templateOverride;
  await db.update(newsletterCampaignsTable).set(patch).where(eq(newsletterCampaignsTable.id, id));
  const [row] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  res.json({ ok: true, campaign: row });
});

// POST /campaigns/:id/duplicate — clona como RASCUNHO novo (assunto, corpo,
// moldura e personalização). É o caminho para reaproveitar o layout de uma
// campanha já enviada: editar a original mudaria o que os inscritos já leram.
router.post("/campaigns/:id/duplicate", requirePermission("newsletter.campaigns"), async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [src] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!src) { res.status(404).json({ ok: false }); return; }
  const [row] = await db
    .insert(newsletterCampaignsTable)
    .values({
      subject:          `Cópia de ${src.subject}`.slice(0, 300),
      bodyHtml:         src.bodyHtml ?? "",
      status:           "draft",
      templateId:       src.templateId ?? null,
      templateOverride: (src.templateOverride ?? null) as Record<string, unknown> | null,
    })
    .returning();
  res.json({ ok: true, campaign: row });
});

// POST /campaigns/:id/resend — reenvia uma campanha JÁ ENVIADA só a quem entrou
// depois (inscrito confirmado sem linha na fila desta campanha). Não reenvia
// para quem já recebeu, e não altera o corpo já lido por eles.
router.post("/campaigns/:id/resend", requirePermission("newsletter.send"), async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [campaign] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ ok: false }); return; }
  if (campaign.status !== "sent" && campaign.status !== "failed") {
    res.status(409).json({ ok: false, error: `Só campanhas já enviadas podem ser reenviadas (esta está '${campaign.status}').` });
    return;
  }
  if (!store.getSettings().newsletterEnabled) {
    res.status(400).json({ ok: false, error: "A newsletter está desligada (Configurações → Ativar)." });
    return;
  }
  const added = await startCampaignSend(id, { firstAt: new Date(), onlyNew: true });
  res.json({ ok: true, added });
});

// POST /campaigns/:id/send — envia agora ou agenda (scheduledAt futuro).
router.post("/campaigns/:id/send", requirePermission("newsletter.send"), async (req, res) => {
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

// POST /campaigns/:id/test — envia ESTA campanha ao e-mail do admin logado.
// O /test de cima só valida o remetente (corpo fixo); sem esta rota não havia
// como conferir o corpo real — cards, imagens e moldura — sem disparar para a
// lista inteira. Não mexe no status nem na fila: é um envio avulso.
router.post("/campaigns/:id/test", requirePermission("newsletter.campaigns"), async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [campaign] = await db.select().from(newsletterCampaignsTable).where(eq(newsletterCampaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ ok: false }); return; }

  const s = store.getSettings();
  const cfg = getNewsletterSmtpConfig(s);
  if (!cfg.ok) { res.status(400).json({ ok: false, error: cfg.error }); return; }

  let to = req.userEmail;
  if (!to && req.userId) {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.userId)).limit(1);
    to = u?.email;
  }
  if (!to) { res.status(400).json({ ok: false, error: "Não foi possível determinar o e-mail do administrador logado." }); return; }

  const base = getPublicBase() ?? "";
  const template = (campaign.templateOverride as NewsletterTemplate | null)
    ?? (campaign.templateId
      ? (await db.select({ config: newsletterTemplatesTable.config }).from(newsletterTemplatesTable)
          .where(eq(newsletterTemplatesTable.id, campaign.templateId)).limit(1))[0]?.config as NewsletterTemplate | undefined
      : undefined);

  // MESMO caminho do envio real (dispatch.buildMessage): resolve tokens e só
  // então absolutiza — o teste tem de mentir o mínimo possível.
  const withCards = await resolveArticleTokens(campaign.bodyHtml, loadCardArticles, {
    accent: template?.accentColor || s.adminAccentColor,
    textColor: template?.bodyTextColor,
  });
  const bodyHtml = base ? withCards.replace(/(\b(?:src|href)=")\/(?!\/)/gi, `$1${base.replace(/\/+$/, "")}/`) : withCards;

  const opts: Parameters<typeof renderNewsletterEmail>[0] = {
    settings: s,
    subject: `[TESTE] ${campaign.subject}`,
    bodyHtml,
    footerNote: "E-mail de TESTE desta campanha — os inscritos não receberam nada.",
  };
  if (base) opts.baseUrl = base;
  if (template) opts.template = template;
  const { html, text } = renderNewsletterEmail(opts);

  const headers: Record<string, string> = {};
  if (s.newsletterReplyTo) headers["Reply-To"] = s.newsletterReplyTo;
  try {
    await sendEmail(cfg.config, { to, subject: `[TESTE] ${campaign.subject}`, html, text, headers });
    res.json({ ok: true, to });
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message });
  }
});

// POST /campaigns/:id/cancel — cancela (encerra as linhas pendentes da fila).
router.post("/campaigns/:id/cancel", requirePermission("newsletter.send"), async (req, res) => {
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

// ── Molduras (biblioteca de templates de e-mail) ──────────────────────────────
// A moldura "Padrão" é a de site_settings.newsletterTemplate (aba Configurações);
// esta biblioteca guarda molduras EXTRAS, nomeadas. `config` é sanitizado (o HTML
// de cabeçalho/rodapé pela política de e-mail; ver sanitizeTemplate).

function parseTemplateBody(b: Record<string, unknown>): { name?: string; config?: NewsletterTemplate } {
  const out: { name?: string; config?: NewsletterTemplate } = {};
  if (typeof b["name"] === "string") out.name = (b["name"] as string).trim().slice(0, 120);
  const raw = b["template"] ?? b["config"] ?? b["newsletterTemplate"];
  if (raw !== undefined) out.config = sanitizeTemplate(raw);
  return out;
}

// GET /templates — lista (editadas mais recentemente primeiro).
router.get("/templates", async (_req, res) => {
  const rows = await db.select().from(newsletterTemplatesTable).orderBy(desc(newsletterTemplatesTable.updatedAt)).limit(200);
  res.json({ templates: rows });
});

// POST /templates — cria uma moldura.
router.post("/templates", requirePermission("newsletter.templates"), async (req, res) => {
  const input = parseTemplateBody((req.body ?? {}) as Record<string, unknown>);
  if (!input.name) { res.status(400).json({ ok: false, error: "Nome obrigatório." }); return; }
  const [row] = await db
    .insert(newsletterTemplatesTable)
    .values({ name: input.name, config: (input.config ?? {}) as Record<string, unknown> })
    .returning();
  res.json({ ok: true, template: row });
});

// GET /templates/:id — uma moldura.
router.get("/templates/:id", async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const [row] = await db.select().from(newsletterTemplatesTable).where(eq(newsletterTemplatesTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ ok: false }); return; }
  res.json({ template: row });
});

// PUT /templates/:id — renomeia e/ou atualiza a config.
router.put("/templates/:id", requirePermission("newsletter.templates"), async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  const input = parseTemplateBody((req.body ?? {}) as Record<string, unknown>);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    if (!input.name) { res.status(400).json({ ok: false, error: "Nome obrigatório." }); return; }
    patch["name"] = input.name;
  }
  if (input.config !== undefined) patch["config"] = input.config as Record<string, unknown>;
  const upd = await db.update(newsletterTemplatesTable).set(patch).where(eq(newsletterTemplatesTable.id, id)).returning();
  if (upd.length === 0) { res.status(404).json({ ok: false }); return; }
  res.json({ ok: true, template: upd[0] });
});

// DELETE /templates/:id — remove; campanhas que a usavam voltam à Padrão.
router.delete("/templates/:id", requirePermission("newsletter.templates"), async (req, res) => {
  const id = parseId(req.params.id ?? "");
  if (id == null) { res.status(400).json({ ok: false }); return; }
  await db.update(newsletterCampaignsTable)
    .set({ templateId: null, updatedAt: new Date() })
    .where(eq(newsletterCampaignsTable.templateId, id));
  await db.delete(newsletterTemplatesTable).where(eq(newsletterTemplatesTable.id, id));
  res.json({ ok: true });
});

// ── Inscritos (RF6: lista paginada + contadores + export CSV) ──────────────────
const SUB_PAGE_SIZE = 50;
const SUB_STATUSES = ["pending", "confirmed", "unsubscribed", "bounced", "complained"] as const;

/** Célula CSV: aspas + escape, com guarda contra injeção de fórmula em planilha. */
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // neutraliza =SUM(), +cmd, etc.
  return `"${s.replace(/"/g, '""')}"`;
}

function subStatusFilter(raw: unknown): string | null {
  return typeof raw === "string" && (SUB_STATUSES as readonly string[]).includes(raw) ? raw : null;
}

// GET /subscribers?status=&page=&q= — página + total do filtro + contadores globais.
router.get("/subscribers", async (req, res) => {
  const status = subStatusFilter(req.query.status);
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().slice(0, 120) : "";
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));

  const filters: SQL[] = [];
  if (status) filters.push(eq(newsletterSubscribersTable.status, status));
  if (q) filters.push(ilike(newsletterSubscribersTable.email, `%${q}%`));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, totRows, byStatus] = await Promise.all([
    db.select({
        id: newsletterSubscribersTable.id,
        email: newsletterSubscribersTable.email,
        status: newsletterSubscribersTable.status,
        source: newsletterSubscribersTable.source,
        createdAt: newsletterSubscribersTable.createdAt,
        confirmedAt: newsletterSubscribersTable.confirmedAt,
        unsubscribedAt: newsletterSubscribersTable.unsubscribedAt,
      })
      .from(newsletterSubscribersTable)
      .where(where)
      .orderBy(desc(newsletterSubscribersTable.createdAt))
      .limit(SUB_PAGE_SIZE)
      .offset((page - 1) * SUB_PAGE_SIZE),
    db.select({ c: count() }).from(newsletterSubscribersTable).where(where),
    db.select({ status: newsletterSubscribersTable.status, c: count() })
      .from(newsletterSubscribersTable)
      .groupBy(newsletterSubscribersTable.status),
  ]);

  const counts: Record<string, number> = { all: 0, pending: 0, confirmed: 0, unsubscribed: 0, bounced: 0, complained: 0 };
  for (const r of byStatus) { counts[r.status] = Number(r.c); counts.all += Number(r.c); }

  res.json({
    subscribers: rows,
    page,
    pageSize: SUB_PAGE_SIZE,
    total: Number(totRows[0]?.c ?? 0),
    counts,
  });
});

// GET /subscribers.csv?status= — export CSV (auth via Bearer no router). BOM p/ Excel.
router.get("/subscribers.csv", requirePermission("newsletter.subscribers"), async (req, res) => {
  const status = subStatusFilter(req.query.status);
  const where = status ? eq(newsletterSubscribersTable.status, status) : undefined;

  const rows = await db.select({
      email: newsletterSubscribersTable.email,
      status: newsletterSubscribersTable.status,
      source: newsletterSubscribersTable.source,
      createdAt: newsletterSubscribersTable.createdAt,
      confirmedAt: newsletterSubscribersTable.confirmedAt,
      unsubscribedAt: newsletterSubscribersTable.unsubscribedAt,
    })
    .from(newsletterSubscribersTable)
    .where(where)
    .orderBy(desc(newsletterSubscribersTable.createdAt))
    .limit(100_000);

  const header = ["email", "status", "origem", "inscrito_em", "confirmado_em", "descadastrado_em"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.email, r.status, r.source ?? "",
      r.createdAt ? r.createdAt.toISOString() : "",
      r.confirmedAt ? r.confirmedAt.toISOString() : "",
      r.unsubscribedAt ? r.unsubscribedAt.toISOString() : "",
    ].map(csvCell).join(","));
  }
  const csv = String.fromCharCode(0xfeff) + lines.join("\r\n"); // BOM p/ acentos no Excel
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="inscritos-${status ?? "todos"}-${stamp}.csv"`);
  res.send(csv);
});

export default router;
