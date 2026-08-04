/**
 * Motor de disparo da newsletter (PRD-NEWSLETTER-01, Fase 3).
 *
 * Espelha o padrão da central (`deliveryWorker.ts`): tabela-fila Postgres +
 * worker in-process, sem fila externa. Duas peças:
 *
 *  - PRODUTOR (`startCampaignSend`): fan-out de uma campanha para
 *    `newsletter_send_queue`, uma linha por inscrito `confirmed`, com
 *    `scheduledAt` distribuído por dias respeitando o teto diário (drip
 *    intra-dia). Idempotente por UNIQUE(campaignId, subscriberId).
 *
 *  - WORKER (`startNewsletterWorker`): poll ~30s, claim condicional, envia via
 *    SMTP do blog (`sendEmail`), backoff 1m→5m→15m→1h→6h (5 → dead). Reforça o
 *    teto diário na hora do envio (conta `sent` de campanha no dia do blog) —
 *    cinto e suspensório contra estourar o limite do Gmail. Também dispara o
 *    e-mail de confirmação (double opt-in) enfileirado pela captura (Fase 1) e
 *    promove campanhas agendadas cujo horário venceu.
 *
 * Todo e-mail carrega o link de descadastro tokenizado do inscrito no corpo e
 * nos headers List-Unsubscribe / List-Unsubscribe-Post (RFC 8058, exigência de
 * bulk do Gmail/Yahoo). Só roda com `newsletterEnabled`.
 */
import { randomBytes } from "node:crypto";
import {
  db,
  newsletterCampaignsTable,
  newsletterSendQueueTable,
  newsletterSubscribersTable,
  newsletterTemplatesTable,
  type NewsletterSendQueueRow,
} from "@workspace/db";
import { and, asc, count, eq, gte, inArray, lte, or, isNull, sql } from "drizzle-orm";
import { store, type SiteSettings, type NewsletterTemplate } from "../store.js";
import { logger } from "../logger.js";
import { sendEmail, type SmtpConfig } from "../mailer.js";
import { getPublicBase } from "../social/queueProcessor.js";
import { backoffMsForAttempt, MAX_SEND_ATTEMPTS } from "./backoff.js";
import { planCampaignSchedule, startOfDayInTz } from "./schedule.js";
import {
  getNewsletterSmtpConfig,
  renderNewsletterEmail,
  confirmationBodyHtml,
} from "./email.js";
import { resolveArticleTokens } from "./articleCards.js";
import { loadCardArticles } from "./articleSource.js";

const POLL_MS = 30_000;
const BATCH = 10;
const INSERT_CHUNK = 500;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

function blogTz(s: SiteSettings): string {
  return s.siteTimezone || "America/Sao_Paulo";
}

function genToken(): string {
  return randomBytes(32).toString("hex");
}

/** Envios de CAMPANHA já efetivados no dia civil do blog (consomem o teto). */
async function campaignSentToday(tz: string, now: Date): Promise<number> {
  const dayStart = startOfDayInTz(now, tz);
  const [row] = await db
    .select({ c: count() })
    .from(newsletterSendQueueTable)
    .where(and(
      eq(newsletterSendQueueTable.kind, "campaign"),
      eq(newsletterSendQueueTable.status, "sent"),
      gte(newsletterSendQueueTable.sentAt, dayStart),
    ));
  return Number(row?.c ?? 0);
}

// ── Produtor: fan-out de campanha ─────────────────────────────────────────────
export interface StartSendOptions {
  /** Quando começar o primeiro dia de envio (agendamento). Default: agora. */
  firstAt?: Date;
}

/**
 * Enfileira uma campanha: uma linha por inscrito `confirmed`, com `scheduledAt`
 * distribuído de modo que nenhum dia do blog receba mais que o teto diário.
 * Retorna quantos inscritos foram enfileirados. Idempotente (onConflictDoNothing).
 */
export async function startCampaignSend(campaignId: number, opts: StartSendOptions = {}): Promise<number> {
  const [campaign] = await db
    .select()
    .from(newsletterCampaignsTable)
    .where(eq(newsletterCampaignsTable.id, campaignId))
    .limit(1);
  if (!campaign) return 0;
  if (campaign.status === "sent" || campaign.status === "canceled") return 0;

  const s = store.getSettings();
  const tz = blogTz(s);
  const cap = Math.max(1, Number(s.newsletterDailyCap) || 450);

  // Somente inscritos confirmados (supressão = filtro por status: unsubscribed/
  // bounced/complained/pending nunca entram no fan-out).
  const subs = await db
    .select({ id: newsletterSubscribersTable.id, email: newsletterSubscribersTable.email })
    .from(newsletterSubscribersTable)
    .where(eq(newsletterSubscribersTable.status, "confirmed"));

  const now = new Date();
  const sentToday = await campaignSentToday(tz, now);
  const schedule = planCampaignSchedule({
    count: subs.length,
    now,
    tz,
    cap,
    sentToday,
    firstAt: opts.firstAt,
  });

  const rows = subs.map((sub, i) => ({
    kind:         "campaign" as const,
    campaignId,
    subscriberId: sub.id,
    email:        sub.email,
    status:       "pending" as const,
    scheduledAt:  schedule[i] ?? now,
  }));

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db
      .insert(newsletterSendQueueTable)
      .values(rows.slice(i, i + INSERT_CHUNK))
      .onConflictDoNothing({
        target: [newsletterSendQueueTable.campaignId, newsletterSendQueueTable.subscriberId],
      });
  }

  await db
    .update(newsletterCampaignsTable)
    .set({
      status:     subs.length > 0 ? "sending" : "sent",
      recipients: subs.length,
      sentAt:     subs.length > 0 ? null : new Date(),
      updatedAt:  new Date(),
    })
    .where(eq(newsletterCampaignsTable.id, campaignId));

  logger.info({ campaignId, recipients: subs.length }, "Newsletter: campanha enfileirada");
  return subs.length;
}

/** Promove campanhas agendadas cujo horário venceu (status scheduled → fan-out). */
async function promoteScheduledCampaigns(now: Date): Promise<void> {
  const due = await db
    .select({ id: newsletterCampaignsTable.id })
    .from(newsletterCampaignsTable)
    .where(and(
      eq(newsletterCampaignsTable.status, "scheduled"),
      lte(newsletterCampaignsTable.scheduledAt, now),
    ));
  for (const c of due) {
    await startCampaignSend(c.id, { firstAt: now });
  }
}

// ── Confirmação (double opt-in) — enfileirada pela captura (Fase 1) ──────────
/**
 * Enfileira o e-mail de confirmação de um inscrito. Chamado no caminho do
 * /subscribe (rápido, sem SMTP). Dedupe: remove confirmações `pending` antigas
 * do mesmo inscrito antes de inserir (reenviar não empilha e-mails).
 */
export async function enqueueConfirmation(subscriberId: number, email: string): Promise<void> {
  await db.delete(newsletterSendQueueTable).where(and(
    eq(newsletterSendQueueTable.subscriberId, subscriberId),
    eq(newsletterSendQueueTable.kind, "confirmation"),
    eq(newsletterSendQueueTable.status, "pending"),
  ));
  await db.insert(newsletterSendQueueTable).values({
    kind:         "confirmation",
    campaignId:   null,
    subscriberId,
    email,
    status:       "pending",
    scheduledAt:  new Date(),
  });
}

// ── Worker ────────────────────────────────────────────────────────────────────
interface BuiltMessage {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

/** Garante um token de descadastro perene no inscrito (autocorrige se faltar). */
async function ensureUnsubToken(subId: number, current: string | null): Promise<string> {
  if (current) return current;
  const token = genToken();
  await db
    .update(newsletterSubscribersTable)
    .set({ unsubscribeToken: token, updatedAt: new Date() })
    .where(eq(newsletterSubscribersTable.id, subId));
  return token;
}

type SubscriberRow = typeof newsletterSubscribersTable.$inferSelect;

/**
 * Reescreve URLs root-relativas (`src`/`href="/…"`) do corpo da campanha para
 * absolutas usando a base pública do blog — imagens e links relativos NÃO
 * resolvem num cliente de e-mail. Protocol-relative (`//host`) e absolutas
 * (`http`, `mailto`, `data:`) passam intactas.
 */
function absolutizeHtml(html: string, base: string): string {
  const b = base.replace(/\/+$/, "");
  return html.replace(/(\b(?:src|href)=")\/(?!\/)/gi, `$1${b}/`);
}

/** Config da moldura escolhida pela campanha; `undefined` (= moldura Padrão das
 *  settings) quando não há template_id ou a moldura foi removida. */
async function loadTemplateConfig(templateId: number | null): Promise<NewsletterTemplate | undefined> {
  if (!templateId) return undefined;
  const [row] = await db
    .select({ config: newsletterTemplatesTable.config })
    .from(newsletterTemplatesTable)
    .where(eq(newsletterTemplatesTable.id, templateId))
    .limit(1);
  return row ? (row.config as NewsletterTemplate) : undefined;
}

/**
 * Monta a mensagem de uma linha da fila, ou `null` se a linha deve ser
 * DESCARTADA sem envio (supressão/estado inválido) — o chamador aplica o
 * término não-retriável.
 */
async function buildMessage(
  row: NewsletterSendQueueRow,
  sub: SubscriberRow | undefined,
  s: SiteSettings,
  base: string,
): Promise<BuiltMessage | { skip: string }> {
  if (!sub) return { skip: "inscrito não existe mais" };

  const replyTo = (s.newsletterReplyTo || s.newsletterFromEmail || "").trim();

  if (row.kind === "confirmation") {
    // Só faz sentido confirmar quem ainda está pendente com token vivo.
    if (sub.status !== "pending" || !sub.confirmToken) return { skip: "inscrito não está mais pendente" };
    const confirmUrl = `${base}/api/newsletter/confirm?token=${encodeURIComponent(sub.confirmToken)}`;
    const subject = `Confirme sua inscrição — ${s.siteName || "Newsletter"}`;
    // TRANSACIONAL (double opt-in): SEM List-Unsubscribe e SEM rodapé de
    // descadastro. Esses sinais fazem o Gmail arquivar o e-mail como "inscrição
    // gerenciável" (aba Gerenciar inscrições/Promoções) e tirá-lo da Principal —
    // justo o e-mail que PRECISA do clique. A pessoa ainda nem é assinante; o
    // corpo já traz o "se não pediu, ignore". (Refina o literal do RF5, que
    // pedia o header em TODO e-mail — mantido só nas campanhas, onde é exigido.)
    const { html, text } = renderNewsletterEmail({
      settings: s,
      subject,
      bodyHtml: confirmationBodyHtml(s, confirmUrl),
      baseUrl: base,
    });
    const headers: Record<string, string> = {};
    if (replyTo) headers["Reply-To"] = replyTo;
    return { subject, html, text, headers };
  }

  // Campanha: só inscritos confirmados recebem.
  if (sub.status !== "confirmed") return { skip: "inscrito suprimido (não confirmado)" };
  const [campaign] = await db
    .select()
    .from(newsletterCampaignsTable)
    .where(eq(newsletterCampaignsTable.id, row.campaignId ?? -1))
    .limit(1);
  if (!campaign) return { skip: "campanha não existe mais" };
  if (campaign.status === "canceled") return { skip: "campanha cancelada" };

  const unsubToken = await ensureUnsubToken(sub.id, sub.unsubscribeToken);
  const unsubscribeUrl = `${base}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
  // Precedência: ajuste desta campanha (templateOverride) > moldura escolhida
  // (templateId) > moldura Padrão das settings. O override já é sanitizado ao gravar.
  const template = (campaign.templateOverride as NewsletterTemplate | null)
    ?? await loadTemplateConfig(campaign.templateId);
  // Tokens de artigo (`{{artigos:3}}`) resolvem AQUI, antes da absolutização: os
  // cards nascem root-relativos (`/artigo/…`) e o passo seguinte os torna
  // absolutos com a base do blog. Resolver depois deixaria link relativo no
  // e-mail. A cor vem da moldura desta campanha, para o card não destoar.
  const bodyWithCards = await resolveArticleTokens(campaign.bodyHtml, loadCardArticles, {
    accent: template?.accentColor || s.adminAccentColor,
    textColor: template?.bodyTextColor,
  });
  const { html, text } = renderNewsletterEmail({
    settings: s,
    subject: campaign.subject,
    bodyHtml: absolutizeHtml(bodyWithCards, base),
    unsubscribeUrl,
    baseUrl: base,
    template,
  });
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  if (replyTo) headers["Reply-To"] = replyTo;
  return { subject: campaign.subject, html, text, headers };
}

/** Fecha a campanha se não restar nenhuma linha pendente/enviando. */
async function finalizeCampaignIfDone(campaignId: number): Promise<void> {
  const [rem] = await db
    .select({ c: count() })
    .from(newsletterSendQueueTable)
    .where(and(
      eq(newsletterSendQueueTable.campaignId, campaignId),
      inArray(newsletterSendQueueTable.status, ["pending", "sending"]),
    ));
  if (Number(rem?.c ?? 0) > 0) return;
  const [c] = await db
    .select({ sent: newsletterCampaignsTable.sentCount })
    .from(newsletterCampaignsTable)
    .where(eq(newsletterCampaignsTable.id, campaignId))
    .limit(1);
  await db
    .update(newsletterCampaignsTable)
    .set({ status: (c?.sent ?? 0) > 0 ? "sent" : "failed", sentAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(newsletterCampaignsTable.id, campaignId),
      eq(newsletterCampaignsTable.status, "sending"),
    ));
}

async function processRow(row: NewsletterSendQueueRow, cfg: SmtpConfig, s: SiteSettings, base: string): Promise<void> {
  // Claim condicional: só um worker/tick leva a linha.
  const claimed = await db
    .update(newsletterSendQueueTable)
    .set({ status: "sending" })
    .where(and(eq(newsletterSendQueueTable.id, row.id), eq(newsletterSendQueueTable.status, "pending")))
    .returning({ id: newsletterSendQueueTable.id });
  if (claimed.length === 0) return;

  const [sub] = await db
    .select()
    .from(newsletterSubscribersTable)
    .where(eq(newsletterSubscribersTable.id, row.subscriberId))
    .limit(1);

  const built = await buildMessage(row, sub, s, base);

  // Descarte não-retriável (supressão/estado inválido).
  if ("skip" in built) {
    await db
      .update(newsletterSendQueueTable)
      .set({ status: "failed", lastError: built.skip.slice(0, 500) })
      .where(eq(newsletterSendQueueTable.id, row.id));
    if (row.kind === "campaign" && row.campaignId != null) {
      await db
        .update(newsletterCampaignsTable)
        .set({ failedCount: sql`${newsletterCampaignsTable.failedCount} + 1`, updatedAt: new Date() })
        .where(eq(newsletterCampaignsTable.id, row.campaignId));
      await finalizeCampaignIfDone(row.campaignId);
    }
    return;
  }

  try {
    await sendEmail(cfg, { to: row.email, subject: built.subject, html: built.html, text: built.text, headers: built.headers });
    const now = new Date();
    await db
      .update(newsletterSendQueueTable)
      .set({ status: "sent", sentAt: now, lastError: null })
      .where(eq(newsletterSendQueueTable.id, row.id));
    if (row.kind === "confirmation") {
      await db
        .update(newsletterSubscribersTable)
        .set({ confirmSentAt: now, updatedAt: now })
        .where(eq(newsletterSubscribersTable.id, row.subscriberId));
    } else if (row.campaignId != null) {
      await db
        .update(newsletterCampaignsTable)
        .set({ sentCount: sql`${newsletterCampaignsTable.sentCount} + 1`, updatedAt: now })
        .where(eq(newsletterCampaignsTable.id, row.campaignId));
      await finalizeCampaignIfDone(row.campaignId);
    }
  } catch (err) {
    const attemptNo = row.attempts + 1;
    const exhausted = attemptNo >= MAX_SEND_ATTEMPTS;
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(newsletterSendQueueTable)
      .set({
        status:      exhausted ? "dead" : "pending",
        attempts:    attemptNo,
        nextRetryAt: exhausted ? null : new Date(Date.now() + backoffMsForAttempt(attemptNo)),
        lastError:   msg.slice(0, 500),
      })
      .where(eq(newsletterSendQueueTable.id, row.id));
    if (exhausted && row.kind === "campaign" && row.campaignId != null) {
      await db
        .update(newsletterCampaignsTable)
        .set({ failedCount: sql`${newsletterCampaignsTable.failedCount} + 1`, updatedAt: new Date() })
        .where(eq(newsletterCampaignsTable.id, row.campaignId));
      await finalizeCampaignIfDone(row.campaignId);
    }
    logger.warn({ err, queueId: row.id, attemptNo, kind: row.kind }, "Newsletter: envio falhou");
  }
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const s = store.getSettings();
    if (!s.newsletterEnabled) return;

    const cfg = getNewsletterSmtpConfig(s);
    if (!cfg.ok) return; // remetente não configurado → nada a enviar

    const base = getPublicBase();
    if (!base) {
      logger.warn("Newsletter: APP_URL/PUBLIC_URL ausente — links de confirmação/descadastro impossíveis; pulando envio");
      return;
    }

    const now = new Date();
    await promoteScheduledCampaigns(now);

    const tz = blogTz(s);
    const cap = Math.max(1, Number(s.newsletterDailyCap) || 450);
    const capReached = (await campaignSentToday(tz, now)) >= cap;

    const dueConds = and(
      eq(newsletterSendQueueTable.status, "pending"),
      or(isNull(newsletterSendQueueTable.nextRetryAt), lte(newsletterSendQueueTable.nextRetryAt, now)),
      or(isNull(newsletterSendQueueTable.scheduledAt), lte(newsletterSendQueueTable.scheduledAt, now)),
      // Teto atingido: só confirmações (transacionais) continuam saindo hoje;
      // as campanhas esperam o teto do próximo dia.
      capReached ? eq(newsletterSendQueueTable.kind, "confirmation") : undefined,
    );

    const batch = await db
      .select()
      .from(newsletterSendQueueTable)
      .where(dueConds)
      .orderBy(asc(newsletterSendQueueTable.scheduledAt), asc(newsletterSendQueueTable.id))
      .limit(BATCH);

    for (const row of batch) {
      await processRow(row, cfg.config, s, base);
    }
  } catch (err) {
    logger.error({ err }, "Erro no tick do worker de newsletter");
  } finally {
    _running = false;
  }
}

export function startNewsletterWorker(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("Worker de newsletter iniciado (poll 30s)");
}
