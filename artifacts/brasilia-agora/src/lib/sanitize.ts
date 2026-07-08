/**
 * Sanitização de conteúdo vindo da API antes de renderizar como HTML.
 *
 * Títulos e corpos de artigos passam por fontes externas (feeds RSS, scraping,
 * reescrita por IA) — nunca devem chegar ao DOM sem sanitização, senão uma
 * fonte comprometida vira XSS armazenado no site público.
 */
import DOMPurify from "dompurify";

/** Decodifica as entidades HTML mais comuns em feeds/títulos (isomórfico, sem DOM). */
function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…",
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
    laquo: "«", raquo: "»", eacute: "é", aacute: "á", iacute: "í",
    oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ", ccedil: "ç",
    acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à",
  };
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const n = parseInt(code.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    if (code.startsWith("#")) {
      const n = parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}

/**
 * Título seguro para dangerouslySetInnerHTML: remove qualquer tag, decodifica
 * entidades (&quot; &amp; etc.) e re-escapa o resultado. O texto exibido fica
 * idêntico ao esperado, mas nenhuma marcação/script sobrevive.
 * Isomórfico — funciona no SSR da home e no cliente.
 */
export function safeTitleHtml(input: string | null | undefined): string {
  if (!input) return "";
  const text = decodeEntities(String(input).replace(/<[^>]*>/g, ""));
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sanitização leve SEM DOM, usada no SSR (DOMPurify exige DOM de navegador).
 * Remove blocos executáveis, handlers inline e URLs javascript:. Precisa
 * devolver o HTML renderizável: retornar "" no servidor fazia o banner do
 * cabeçalho e os blocos HTML da home NÃO existirem no HTML do SSR mas
 * aparecerem na hidratação → mismatch (#418) e o React descartava todo o
 * SSR, arrasando o LCP.
 */
function stripDangerousHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, "");
}

/**
 * Sanitiza HTML de corpo de artigo (parágrafos, títulos, listas, imagens,
 * links...) removendo scripts, event handlers e URLs javascript:.
 * No cliente usa DOMPurify; no SSR usa a variante leve acima (o conteúdo que
 * chega ao SSR vem das settings do próprio painel — banner/blocos html).
 */
export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window === "undefined") return stripDangerousHtml(html);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
