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

export function parseHighlight(input: string): TextSegment[] {
  const parts = (input ?? "").split("*");
  const segs: TextSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    segs.push({ text: parts[i]!, accent: i % 2 === 1 });
  }
  return segs.length ? segs : [{ text: input ?? "", accent: false }];
}

export const DEFAULT_ACCENT = "#9EFF00";
