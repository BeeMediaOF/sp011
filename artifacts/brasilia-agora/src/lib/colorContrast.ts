/**
 * Tinta legível sobre uma cor de fundo escolhida no painel.
 *
 * As barras de menu do cabeçalho ("bar" e o estilo Centralizado) tinham a cor
 * do texto FIXA em branco, porque nasceram com fundo escuro. Quando um template
 * traz `menuBarBgColor` claro (o "O Comandante - Revista" usa #ffffff), o menu
 * sumia: texto branco sobre barra branca. Aqui a tinta é decidida pela
 * luminância do fundo, do mesmo jeito nos dois lados do SSR.
 *
 * Sem React nem DOM — importado pelo Header e testável com node --test.
 */

/** #abc, #aabbcc ou rgb(...) → [r,g,b] 0-255. Devolve null se não reconhecer. */
function parseColor(input: string): [number, number, number] | null {
  const s = (input ?? "").trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** Luminância relativa WCAG (0 = preto, 1 = branco). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Fundo escuro o bastante para receber tinta branca? O corte em 0,45 fica
 * acima do ponto em que o branco cai abaixo de 4,5:1 — cor não reconhecida
 * conta como escura, preservando o visual histórico das barras.
 */
export function isDarkBg(color: string): boolean {
  const lum = relativeLuminance(color);
  return lum === null || lum < 0.45;
}

/** Cor de texto legível sobre `bg`. */
export function inkOn(bg: string, darkInk = "#101418"): string {
  return isDarkBg(bg) ? "#ffffff" : darkInk;
}
