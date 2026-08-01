/**
 * Newsletter e-mail — construção do remetente SMTP por blog e do "shell" de
 * marca que envolve o corpo de cada campanha (PRD-NEWSLETTER-01 RF2/RF3).
 *
 * O corpo de cada campanha é HTML (editor de texto rico) — sanitizado antes de
 * chegar aqui (Fase 3/4). Este módulo NÃO envia nada: só monta config + HTML.
 */

import type { SiteSettings, NewsletterTemplate } from "../store.js";
import type { SmtpConfig } from "../mailer.js";

export type SmtpConfigResult =
  | { ok: true; config: SmtpConfig }
  | { ok: false; error: string };

/** Deriva a config SMTP do blog a partir das settings. Erro claro se faltar
 *  usuário/senha (o remetente ainda não foi configurado na subaba). */
export function getNewsletterSmtpConfig(s: SiteSettings): SmtpConfigResult {
  const host = (s.newsletterSmtpHost || "smtp.gmail.com").trim();
  const port = Number(s.newsletterSmtpPort) || 587;
  const user = (s.newsletterSmtpUser || "").trim();
  const pass = (s.newsletterSmtpPass || "").trim();
  const fromEmail = (s.newsletterFromEmail || user).trim();
  const fromName = (s.newsletterFromName || s.siteName || "Newsletter").trim();
  if (!user || !pass) {
    return { ok: false, error: "Remetente incompleto: informe o usuário e a senha de app do Gmail na aba Newsletter → Configurações." };
  }
  if (!fromEmail) {
    return { ok: false, error: "Remetente incompleto: informe o e-mail do remetente." };
  }
  return { ok: true, config: { host, port, user, pass, from: `${fromName} <${fromEmail}>` } };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Nome do remetente para exibição (cabeçalho/rodapé). */
function senderName(s: SiteSettings): string {
  return (s.newsletterFromName || s.siteName || "Newsletter").trim();
}

/**
 * Corpo (interno ao shell) do e-mail de double opt-in. O botão aponta para o
 * GET /api/newsletter/confirm?token=… — a confirmação é o clique humano.
 */
export function confirmationBodyHtml(s: SiteSettings, confirmUrl: string): string {
  const tpl: NewsletterTemplate = s.newsletterTemplate ?? {};
  const accent = (tpl.accentColor || s.adminAccentColor || "#0B2A66").trim();
  const site = (s.siteName || "nossa newsletter").trim();
  return (
    `<p style="margin:0 0 16px;">Recebemos um pedido para assinar a newsletter do <strong>${esc(site)}</strong>. ` +
    `Para confirmar sua inscrição, clique no botão abaixo:</p>` +
    `<p style="margin:0 0 20px;text-align:center;">` +
    `<a href="${esc(confirmUrl)}" style="display:inline-block;background:${esc(accent)};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 30px;border-radius:8px;font-size:15px;">Confirmar inscrição</a>` +
    `</p>` +
    `<p style="margin:0;color:#4A5568;font-size:13px;line-height:1.6;">Se você não fez este pedido, ignore este e-mail — nenhuma mensagem será enviada sem a confirmação.</p>`
  );
}

interface RenderOpts {
  settings: SiteSettings;
  subject: string;
  /** Corpo HTML da campanha (já sanitizado). */
  bodyHtml: string;
  /** URL de descadastro tokenizada; ausente = e-mail transacional (teste). */
  unsubscribeUrl?: string;
  /** Texto de pré-visualização (preheader) escondido no topo. */
  previewText?: string;
}

/**
 * Envolve o corpo da campanha no shell de marca do blog (tabelas + estilos
 * inline, à prova de cliente de e-mail). Base derivada de `welcomeEmailHtml`,
 * parametrizada por blog (cores/nome das settings, NÃO de BRAND).
 */
export function renderNewsletterEmail(opts: RenderOpts): { html: string; text: string } {
  const { settings: s, subject, bodyHtml, unsubscribeUrl, previewText } = opts;
  const tpl: NewsletterTemplate = s.newsletterTemplate ?? {};
  const accent = (tpl.accentColor || s.adminAccentColor || "#0B2A66").trim();
  const showHeader = tpl.logoMode !== "none";
  const name = senderName(s);
  const headerText = tpl.headerText?.trim() || name;
  const footerText = tpl.footerText?.trim() || "";
  const signature = tpl.signature?.trim() || "";
  const replyTo = (s.newsletterReplyTo || s.newsletterFromEmail || "").trim();

  const preheader = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(previewText)}</div>`
    : "";

  const header = showHeader
    ? `<tr><td style="background:${esc(accent)};padding:26px 40px;text-align:center;">
         <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${esc(headerText)}</span>
       </td></tr>`
    : "";

  const footerBlocks: string[] = [];
  if (signature) {
    footerBlocks.push(`<p style="margin:0 0 12px;color:#4A5568;font-size:14px;line-height:1.6;">${esc(signature).replace(/\n/g, "<br/>")}</p>`);
  }
  if (footerText) {
    footerBlocks.push(`<p style="margin:0 0 8px;color:#A0AEC0;font-size:12px;line-height:1.5;">${esc(footerText).replace(/\n/g, "<br/>")}</p>`);
  }
  footerBlocks.push(`<p style="margin:0 0 8px;color:#A0AEC0;font-size:12px;">${esc(name)}${replyTo ? ` &middot; ${esc(replyTo)}` : ""}</p>`);
  if (unsubscribeUrl) {
    footerBlocks.push(
      `<p style="margin:0;color:#A0AEC0;font-size:12px;">Você recebe este e-mail porque assinou a newsletter. ` +
      `<a href="${esc(unsubscribeUrl)}" style="color:${esc(accent)};text-decoration:underline;">Cancelar inscrição</a>.</p>`,
    );
  } else {
    footerBlocks.push(`<p style="margin:0;color:#A0AEC0;font-size:12px;">E-mail de teste de configuração — nenhuma ação necessária.</p>`);
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  ${preheader}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          ${header}
          <tr>
            <td style="padding:32px 40px;color:#1A202C;font-size:15px;line-height:1.7;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:#F7F9FC;border-top:1px solid #E2E8F0;padding:22px 40px;text-align:center;">
              ${footerBlocks.join("\n              ")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Versão texto: fallback simples (o cliente que preferir text/plain).
  const textParts = [
    headerText,
    "",
    bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    "",
    signature,
    footerText,
    name + (replyTo ? ` · ${replyTo}` : ""),
  ];
  if (unsubscribeUrl) textParts.push(`Cancelar inscrição: ${unsubscribeUrl}`);
  const text = textParts.filter((p) => p !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { html, text };
}
