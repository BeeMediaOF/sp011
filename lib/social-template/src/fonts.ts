/**
 * Fontes do editor — uma única lista usada pelo seletor do editor e pelo
 * renderizador. As famílias web são carregadas via Google Fonts (no editor e no
 * Chromium do servidor), garantindo que o preview e a arte final usem
 * exatamente a mesma tipografia. Georgia/Arial são fallbacks de sistema.
 *
 * Para adicionar uma fonte: inclua o nome em FONT_FAMILIES, acrescente a família
 * (com os pesos) em GOOGLE_FONTS_HREF e, se for serifada/display, ajuste
 * `fontStack()` para o fallback genérico correto.
 */
export const FONT_FAMILIES = [
  // Sans modernas / legíveis
  "Inter",
  "Open Sans",
  "Montserrat",
  "Poppins",
  "Lato",
  "Roboto",
  "Archivo",
  // Condensadas (ótimas para manchete)
  "Oswald",
  "Roboto Condensed",
  // Display / impacto
  "Bebas Neue",
  "Anton",
  // Serifadas / elegantes
  "Playfair Display",
  "Merriweather",
  // Fallbacks de sistema
  "Georgia",
  "Arial",
] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

/** Famílias que devem cair em fonte serifada quando a web font não carregar. */
const SERIF_FAMILIES = new Set<string>(["Playfair Display", "Merriweather", "Georgia"]);

/**
 * Monta a `font-family` CSS com o fallback genérico adequado, evitando que uma
 * serifada caia em sans (ou vice-versa) durante o carregamento.
 */
export function fontStack(family: string | undefined): string {
  const name = family || "Inter";
  const generic = SERIF_FAMILIES.has(name) ? "serif" : "sans-serif";
  return `'${name}', ${generic}`;
}

/**
 * Stylesheet do Google Fonts com os pesos usados pelo editor.
 * Incluído via <link> tanto no editor quanto no HTML renderizado pelo Playwright,
 * então preview e arte final usam a MESMA tipografia.
 */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2" +
  "?family=Inter:wght@300;400;600;700;800" +
  "&family=Open+Sans:wght@300;400;600;700;800" +
  "&family=Montserrat:wght@300;400;600;700;800;900" +
  "&family=Poppins:wght@300;400;500;600;700;800" +
  "&family=Lato:wght@300;400;700;900" +
  "&family=Roboto:wght@300;400;500;700;900" +
  "&family=Archivo:wght@400;500;600;700;800;900" +
  "&family=Oswald:wght@300;400;500;600;700" +
  "&family=Roboto+Condensed:wght@300;400;700" +
  "&family=Bebas+Neue" +
  "&family=Anton" +
  "&family=Playfair+Display:wght@400;500;600;700;800;900" +
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
