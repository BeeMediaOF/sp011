/**
 * Marcação inline de destaque: trechos entre asteriscos `*assim*` são pintados
 * com a cor de destaque (accentColor) do elemento. Ex.: `WWW.*SEUSITE*.COM.BR`
 * pinta "SEUSITE" na cor de destaque e o resto na cor normal.
 *
 * O mesmo parser é usado no editor (React) e no render (Playwright), então o
 * resultado é idêntico.
 */
export interface TextSegment {
  text: string;
  accent: boolean;
}

/**
 * Normaliza/valida a marcação de destaque vinda da IA (ou digitada à mão) para
 * que o parser nunca quebre nem destaque o texto inteiro. Regras:
 *  - remove `**` vazios (destaque sem conteúdo);
 *  - colapsa um excesso de marcadores: mantém no máximo UM par `*…*`
 *    (o primeiro par válido encontrado), removendo os asteriscos restantes;
 *  - se sobrar um `*` sem par (ímpar), remove-o (destaque inválido → texto limpo);
 *  - se o destaque cobrir o texto inteiro (sem nada fora dele), remove o destaque,
 *    pois pintar a manchete toda anula o propósito do realce.
 * Retorna o texto com, no máximo, um par `*…*` consistente.
 */
export function sanitizeHighlightMarkers(input: string): string {
  let s = input ?? "";
  if (!s.includes("*")) return s;

  // remove destaques vazios e espaços presos dentro dos marcadores
  s = s.replace(/\*\s*\*/g, "");

  // mantém só o primeiro par `*...*`; tudo depois perde os asteriscos
  const open = s.indexOf("*");
  if (open === -1) return s;
  const close = s.indexOf("*", open + 1);
  if (close === -1) {
    // marcador ímpar/solto → texto limpo
    return s.replace(/\*/g, "");
  }
  const before = s.slice(0, open);
  const inner = s.slice(open + 1, close);
  const after = s.slice(close + 1).replace(/\*/g, ""); // sem mais marcadores

  // destaque cobre o texto inteiro → não destaca nada
  if (!before.trim() && !after.trim()) return inner;
  if (!inner.trim()) return (before + after).replace(/\s{2,}/g, " ").trim();

  return `${before}*${inner}*${after}`;
}

/**
 * Remove tags HTML de campos que devem ser TEXTO PURO (título, subtítulo,
 * resumo social): a IA às vezes vaza `<b>`/`<em>` do content_html para esses
 * campos, e a tag aparece literal no card do blog, na notificação e na legenda.
 * Também decodifica as entidades mais comuns.
 */
export function stripInlineHtml(input: string): string {
  let s = input ?? "";
  if (!s.includes("<") && !s.includes("&")) return s;
  s = s.replace(/<[^>]*>/g, "");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
  return s.replace(/\s{2,}/g, " ").trim();
}

/**
 * social_title: preserva o destaque quando a IA usa `<b>`/`<strong>` no lugar
 * dos asteriscos — o par de tags vira o marcador `*…*` antes da limpeza, e o
 * sanitizador garante no máximo um par válido.
 */
export function sanitizeSocialTitle(input: string): string {
  const withMarkers = (input ?? "").replace(/<\/?(?:b|strong)\b[^>]*>/gi, "*");
  return sanitizeHighlightMarkers(stripInlineHtml(withMarkers));
}

export function parseHighlight(input: string): TextSegment[] {
  const parts = sanitizeHighlightMarkers(input ?? "").split("*");
  const segs: TextSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    segs.push({ text: parts[i]!, accent: i % 2 === 1 });
  }
  return segs.length ? segs : [{ text: input ?? "", accent: false }];
}

export const DEFAULT_ACCENT = "#9EFF00";
