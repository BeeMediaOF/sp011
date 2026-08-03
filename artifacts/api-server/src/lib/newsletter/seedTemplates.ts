/**
 * Semeadura das molduras (templates) de e-mail de exemplo (PRD-NEWSLETTER-01,
 * pós-MVP). Roda UMA vez por blog no boot: se `newsletterTemplatesSeeded` ainda
 * não está marcado, insere 3 molduras de partida e marca o flag. Deletar todas
 * depois NÃO re-semeia (o flag persiste) — a biblioteca é do usuário.
 *
 * Objetivo: já abrir a aba Modelos com opções para usar/adaptar, incluindo uma
 * moldura no modo "código" (headerHtml) e outra com rodapé em HTML (footerHtml).
 */
import { db, newsletterTemplatesTable } from "@workspace/db";
import { sanitizeEmailHtml } from "@workspace/news-engine/sanitize";
import { store, type NewsletterTemplate } from "../store.js";
import { logger } from "../logger.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function starters(siteName: string, accent: string): { name: string; config: NewsletterTemplate }[] {
  const site = esc(siteName || "Newsletter");
  return [
    {
      name: "Faixa moderna",
      // Cabeçalho no modo "código": faixa com gradiente + nome + selo.
      config: {
        accentColor: accent,
        logoMode: "wordmark",
        headerHtml: sanitizeEmailHtml(
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:${esc(accent)};">` +
          `<tr><td style="padding:30px 40px;text-align:center;">` +
          `<div style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.4px;">${site}</div>` +
          `<div style="color:#dbe4ff;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Newsletter</div>` +
          `</td></tr></table>`,
        ),
        signature: `Equipe ${site}`,
      },
    },
    {
      name: "Institucional",
      // Rodapé no modo "código": barra de links acima das linhas automáticas.
      config: {
        accentColor: accent,
        logoMode: "wordmark",
        signature: `Equipe ${site}`,
        footerText: "Você está recebendo porque assinou a nossa newsletter.",
        footerHtml: sanitizeEmailHtml(
          `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;padding-bottom:12px;">` +
          `<a href="#" style="color:${esc(accent)};text-decoration:none;font-size:12px;font-weight:600;margin:0 10px;">Site</a>` +
          `<a href="#" style="color:${esc(accent)};text-decoration:none;font-size:12px;font-weight:600;margin:0 10px;">Contato</a>` +
          `<a href="#" style="color:${esc(accent)};text-decoration:none;font-size:12px;font-weight:600;margin:0 10px;">Redes sociais</a>` +
          `</td></tr></table>`,
        ),
      },
    },
    {
      name: "Minimalista",
      // Só campos estruturados: sem faixa colorida, fundo branco, texto discreto.
      config: {
        accentColor: "#111827",
        logoMode: "wordmark",
        headerTextColor: "#111827",
        pageBgColor: "#ffffff",
        signature: `— ${site}`,
      },
    },
  ];
}

/** Insere as molduras de exemplo se o blog ainda não foi semeado. Idempotente. */
export async function seedNewsletterTemplates(): Promise<void> {
  const s = store.getSettings();
  if (s.newsletterTemplatesSeeded) return;
  try {
    const accent = (s.newsletterTemplate?.accentColor || s.adminAccentColor || "#0B2A66").trim();
    const rows = starters(s.siteName || "", accent).map((t) => ({
      name: t.name,
      config: t.config as Record<string, unknown>,
    }));
    await db.insert(newsletterTemplatesTable).values(rows);
    store.updateSettings({ newsletterTemplatesSeeded: true });
    logger.info({ count: rows.length }, "Newsletter: molduras de exemplo semeadas");
  } catch (err) {
    // Semeadura é best-effort: não deve derrubar o boot.
    logger.warn({ err }, "Newsletter: falha ao semear molduras de exemplo");
  }
}
