import type { TemplateElement } from "./types";

/** Objeto de estilo CSS agnóstico de framework (compatível com React.CSSProperties). */
export type StyleObject = Record<string, string | number>;

export function fontWeightCss(w: string): number {
  return w === "bold" ? 700 : w === "light" ? 300 : 400;
}

export function hasBackground(bg: string | undefined): boolean {
  return !!bg && bg !== "transparent" && bg !== "rgba(0,0,0,0)";
}

/**
 * Estilo da CAIXA do elemento (div absoluto, em px no tamanho real 1080×N).
 * O editor desenha isso dentro de um container `transform: scale(1/3)`, então
 * o mesmo CSS serve para o preview e para o screenshot do Playwright.
 */
export function elementBoxStyle(el: TemplateElement): StyleObject {
  const s: StyleObject = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.width}px`,
    height: `${el.height}px`,
    opacity: el.opacity,
    zIndex: el.zIndex,
    borderRadius: `${el.borderRadius}px`,
    overflow: "hidden",
    boxSizing: "border-box",
  };
  if (hasBackground(el.backgroundColor)) s["background"] = el.backgroundColor;
  return s;
}

/** Estilo do conteúdo de TEXTO dentro da caixa (flex p/ alinhamento vertical). */
export function textInnerStyle(el: TemplateElement): StyleObject {
  const va = el.verticalAlign ?? "top";
  return {
    width: "100%",
    height: "100%",
    padding: `${el.padding}px`,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: va === "middle" ? "center" : va === "bottom" ? "flex-end" : "flex-start",
    fontSize: `${el.fontSize}px`,
    fontFamily: `'${el.fontFamily || "Inter"}', sans-serif`,
    fontWeight: fontWeightCss(el.fontWeight),
    color: el.color || "#ffffff",
    textAlign: el.textAlign,
    lineHeight: 1.3,
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    overflow: "hidden",
  };
}

/** Estilo da <img> dentro da caixa (imagem/logo/overlay). */
export function imageInnerStyle(el: TemplateElement): StyleObject {
  return {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: el.objectFit ?? "cover",
  };
}

/** Converte um StyleObject em string CSS inline (camelCase → kebab-case). */
export function styleToCss(s: StyleObject): string {
  return Object.entries(s)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
    .join(";");
}
