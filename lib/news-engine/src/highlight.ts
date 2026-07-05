/**
 * Cópia de `lib/social-template/src/highlight.ts` (apenas o sanitizador).
 *
 * Motivo da cópia: o news-engine roda também sob `node --test` com type
 * stripping nativo, que exige imports com extensão explícita — e o
 * social-template usa imports sem extensão. A função é pequena e estável;
 * mudanças lá devem ser espelhadas aqui (ver README).
 */

/**
 * Normaliza/valida a marcação de destaque vinda da IA para que o parser nunca
 * quebre nem destaque o texto inteiro: remove `**` vazios, mantém no máximo UM
 * par `*…*` (o primeiro válido), remove `*` ímpar e, se o destaque cobrir o
 * texto inteiro, remove o destaque.
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
