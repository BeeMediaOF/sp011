import type { ArticleData, SocialTemplate, TemplateElement } from "./types";
import { isImageType } from "./types";
import { resolveContent } from "./resolveContent";
import {
  elementBoxStyle,
  imageInnerStyle,
  styleToCss,
  textInnerStyle,
} from "./elementStyle";
import { fontLinksHtml, GOOGLE_FONTS_HREF } from "./fonts";
import { backgroundCss } from "./gradient";
import { parseHighlight, DEFAULT_ACCENT } from "./highlight";

export interface BuildHtmlOptions {
  /** Stylesheet de fontes (default: Google Fonts). */
  fontsHref?: string;
  /**
   * URL base para resolver `src` relativos (ex.: "/api/uploads/x.png").
   * Emite `<base href>` no head. Necessário no render server-side (Playwright),
   * onde não há origem implícita.
   */
  baseHref?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function renderElement(el: TemplateElement, article: ArticleData): string {
  const box = styleToCss(elementBoxStyle(el));

  if (isImageType(el.type)) {
    // image → imagem do artigo (fallback: content). logo/overlay → URL em content.
    const rawSrc = el.type === "image" ? article.imageUrl || el.content : el.content;
    const src = resolveContent(rawSrc || "", article).trim();
    const inner = src
      ? `<img src="${escapeAttr(src)}" style="${styleToCss(imageInnerStyle(el))}" alt="">`
      : "";
    return `<div style="${box}">${inner}</div>`;
  }

  const text = resolveContent(el.content || "", article);
  const accent = el.accentColor || DEFAULT_ACCENT;
  const innerHtml = parseHighlight(text)
    .map((s) => (s.accent ? `<span style="color:${escapeAttr(accent)}">${escapeHtml(s.text)}</span>` : escapeHtml(s.text)))
    .join("");
  const fitAttr = el.autoFit ? ` data-fit="1"` : "";
  // O conteúdo (texto + spans de destaque) fica num ÚNICO filho: a coluna flex
  // (alinhamento vertical) deve ter um só item, senão os trechos inline iriam
  // empilhar verticalmente.
  const inner = `<div style="${styleToCss(textInnerStyle(el))}"${fitAttr}><div style="width:100%">${innerHtml}</div></div>`;
  return `<div style="${box}">${inner}</div>`;
}

/**
 * Monta o documento HTML completo de um template (tamanho real, ex.: 1080×1350).
 * O Playwright dá `setContent()` nesse HTML e tira o screenshot. O editor usa os
 * MESMOS helpers de estilo, então o resultado é idêntico.
 */
export function buildTemplateHtml(
  template: SocialTemplate,
  article: ArticleData,
  opts: BuildHtmlOptions = {},
): string {
  const elements = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
  const body = elements.map((el) => renderElement(el, article)).join("\n");
  const fonts = fontLinksHtml(opts.fontsHref ?? GOOGLE_FONTS_HREF);
  const base = opts.baseHref ? `<base href="${escapeAttr(opts.baseHref)}">` : "";
  const canvasBg = backgroundCss(template.backgroundColor, template.backgroundGradient);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
${base}
${fonts}
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
img{display:block}
</style>
</head>
<body>
<div style="position:relative;overflow:hidden;width:${template.width}px;height:${template.height}px;background:${escapeAttr(canvasBg)}">
${body}
</div>
</body>
</html>`;
}
