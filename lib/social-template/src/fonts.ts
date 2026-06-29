/**
 * Fontes do editor — uma única lista usada pelo seletor do editor e pelo
 * renderizador. As 4 primeiras são carregadas via Google Fonts (no editor e no
 * Chromium do servidor), garantindo que o preview e a arte final usem
 * exatamente a mesma tipografia. Georgia/Arial são fallbacks de sistema.
 */
export const FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Oswald",
  "Merriweather",
  "Georgia",
  "Arial",
] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

/**
 * Stylesheet do Google Fonts com os pesos usados pelo editor (300/400/700…).
 * Incluído via <link> tanto no editor quanto no HTML renderizado pelo Playwright.
 */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2" +
  "?family=Inter:wght@300;400;600;700;800" +
  "&family=Roboto:wght@300;400;500;700;900" +
  "&family=Oswald:wght@300;400;500;600;700" +
  "&family=Merriweather:wght@300;400;700;900" +
  "&display=swap";

/** Tags <link> de fontes para injetar no <head> (preconnect + stylesheet). */
export function fontLinksHtml(href: string = GOOGLE_FONTS_HREF): string {
  return (
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link rel="stylesheet" href="${href}">`
  );
}
