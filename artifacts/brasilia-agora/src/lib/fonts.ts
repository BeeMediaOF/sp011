/**
 * Registro de fontes selecionáveis por bloco (home e lateral da notícia).
 *
 * Três origens, custo zero por padrão:
 * - "site": Inter/Merriweather já auto-hospedadas em /public/fonts (nenhum download extra);
 * - "system": pilhas nativas do dispositivo (nenhum download);
 * - Google Fonts: carregadas SOB DEMANDA no cliente (ensureFontLoaded) só quando
 *   algum bloco usa a fonte — a CSP do servidor já libera fonts.googleapis.com/gstatic.
 *
 * O bloco persiste só o `id` (HomeBlock.fontFamily). A aplicação no render é feita
 * por blockFontStyle(): além de font-family, sobrescreve as variáveis de tema
 * (--app-font-sans/--app-font-serif) que as utilities `font-sans`/`font-serif` do
 * Tailwind referenciam — assim os títulos serif dos cards também trocam, sem !important.
 */
import type { CSSProperties } from "react";

export interface FontOption {
  /** Slug persistido em HomeBlock.fontFamily. */
  id: string;
  label: string;
  /** Grupo do <optgroup> no seletor do admin. */
  group: "site" | "system" | "sans" | "serif" | "display";
  /** Pilha font-family aplicada no CSS. */
  css: string;
  /** Query css2 do Google Fonts (família + pesos) — ausente = fonte local/sistema. */
  google?: string;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  // ── Fontes do site (auto-hospedadas, sem download extra) ──
  { id: "inter",        label: "Inter (padrão do site)",          group: "site", css: "'Inter', sans-serif" },
  { id: "merriweather", label: "Merriweather (padrão dos títulos)", group: "site", css: "'Merriweather', Georgia, serif" },

  // ── Nativas do dispositivo (sem download) ──
  { id: "system",    label: "Sistema (nativa)",  group: "system", css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "arial",     label: "Arial / Helvetica", group: "system", css: "Arial, Helvetica, sans-serif" },
  { id: "verdana",   label: "Verdana",           group: "system", css: "Verdana, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS",      group: "system", css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: "georgia",   label: "Georgia",           group: "system", css: "Georgia, 'Times New Roman', serif" },
  { id: "times",     label: "Times New Roman",   group: "system", css: "'Times New Roman', Times, serif" },

  // ── Sans-serif (Google Fonts) ──
  { id: "roboto",     label: "Roboto",     group: "sans", css: "'Roboto', Arial, sans-serif",        google: "Roboto:wght@400;500;700;900" },
  { id: "open-sans",  label: "Open Sans",  group: "sans", css: "'Open Sans', Arial, sans-serif",     google: "Open+Sans:wght@400;600;700;800" },
  { id: "lato",       label: "Lato",       group: "sans", css: "'Lato', Arial, sans-serif",          google: "Lato:wght@400;700;900" },
  { id: "montserrat", label: "Montserrat", group: "sans", css: "'Montserrat', Arial, sans-serif",    google: "Montserrat:wght@400;600;700;900" },
  { id: "poppins",    label: "Poppins",    group: "sans", css: "'Poppins', Arial, sans-serif",       google: "Poppins:wght@400;600;700;900" },
  { id: "nunito",     label: "Nunito",     group: "sans", css: "'Nunito', Arial, sans-serif",        google: "Nunito:wght@400;700;900" },
  { id: "raleway",    label: "Raleway",    group: "sans", css: "'Raleway', Arial, sans-serif",       google: "Raleway:wght@400;600;700;900" },
  { id: "work-sans",  label: "Work Sans",  group: "sans", css: "'Work Sans', Arial, sans-serif",     google: "Work+Sans:wght@400;600;700;900" },
  { id: "rubik",      label: "Rubik",      group: "sans", css: "'Rubik', Arial, sans-serif",         google: "Rubik:wght@400;600;700;900" },
  { id: "archivo",    label: "Archivo",    group: "sans", css: "'Archivo', Arial, sans-serif",       google: "Archivo:wght@400;600;700;900" },
  { id: "fira-sans",  label: "Fira Sans",  group: "sans", css: "'Fira Sans', Arial, sans-serif",     google: "Fira+Sans:wght@400;600;700;900" },

  // ── Serif (Google Fonts) ──
  { id: "playfair",          label: "Playfair Display",  group: "serif", css: "'Playfair Display', Georgia, serif",  google: "Playfair+Display:wght@400;700;900" },
  { id: "lora",              label: "Lora",              group: "serif", css: "'Lora', Georgia, serif",              google: "Lora:wght@400;600;700" },
  { id: "pt-serif",          label: "PT Serif",          group: "serif", css: "'PT Serif', Georgia, serif",          google: "PT+Serif:wght@400;700" },
  { id: "libre-baskerville", label: "Libre Baskerville", group: "serif", css: "'Libre Baskerville', Georgia, serif", google: "Libre+Baskerville:wght@400;700" },
  { id: "source-serif",      label: "Source Serif 4",    group: "serif", css: "'Source Serif 4', Georgia, serif",    google: "Source+Serif+4:wght@400;600;700;900" },
  { id: "bitter",            label: "Bitter",            group: "serif", css: "'Bitter', Georgia, serif",            google: "Bitter:wght@400;700;900" },

  // ── Display / títulos (Google Fonts) ──
  { id: "oswald", label: "Oswald",     group: "display", css: "'Oswald', 'Arial Narrow', sans-serif",     google: "Oswald:wght@400;500;700" },
  { id: "bebas",  label: "Bebas Neue", group: "display", css: "'Bebas Neue', 'Arial Narrow', sans-serif", google: "Bebas+Neue" },
];

export const FONT_GROUP_LABELS: Record<FontOption["group"], string> = {
  site:    "Fontes do site",
  system:  "Do sistema (sem download)",
  sans:    "Sans-serif (Google Fonts)",
  serif:   "Serif (Google Fonts)",
  display: "Display / títulos (Google Fonts)",
};

const FONT_BY_ID = new Map(FONT_OPTIONS.map((f) => [f.id, f]));

/** Pilha CSS da fonte, ou null se o id for vazio/desconhecido (= padrão do site). */
export function fontCss(id: string | null | undefined): string | null {
  if (!id) return null;
  return FONT_BY_ID.get(id)?.css ?? null;
}

/**
 * Estilo aplicado no wrapper do bloco. Sobrescreve as variáveis que alimentam
 * `font-sans`/`font-serif` (index.css usa @theme inline → as utilities apontam
 * para --app-font-*) e o font-family herdado — cobre títulos serif, texto sans
 * e elementos sem utility, tudo por cascata.
 */
export function blockFontStyle(id: string | null | undefined): CSSProperties | undefined {
  const css = fontCss(id);
  if (!css) return undefined;
  return {
    fontFamily: css,
    "--app-font-sans": css,
    "--app-font-serif": css,
    "--font-sans": css,
    "--font-serif": css,
  } as CSSProperties;
}

const loadedFonts = new Set<string>();

/**
 * Injeta o stylesheet do Google Fonts da fonte (uma vez por sessão). No-op para
 * fontes locais/do sistema e no SSR — o HTML do servidor sai com o font-family
 * certo e a fonte troca no cliente via font-display:swap (sem quebrar hidratação).
 */
export function ensureFontLoaded(id: string | null | undefined): void {
  if (!id || typeof document === "undefined") return;
  const opt = FONT_BY_ID.get(id);
  if (!opt?.google || loadedFonts.has(opt.id)) return;
  loadedFonts.add(opt.id);

  if (!document.getElementById("gfonts-preconnect")) {
    const pre = document.createElement("link");
    pre.id = "gfonts-preconnect";
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "anonymous";
    document.head.appendChild(pre);
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${opt.google}&display=swap`;
  document.head.appendChild(link);
}
