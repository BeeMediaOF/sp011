import type { TemplateElement } from "./types";
import { gradientToCss } from "./gradient";
import { fontStack } from "./fonts";

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
  // Figuras (shape) desenham fundo/contorno no próprio SVG; a caixa não deve
  // pintar background/border (e não pode cortar o traço de linha/seta).
  const isShape = el.type === "shape";
  const s: StyleObject = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.width}px`,
    height: `${el.height}px`,
    opacity: el.opacity,
    zIndex: el.zIndex,
    borderRadius: `${el.borderRadius}px`,
    overflow: isShape ? "visible" : "hidden",
    boxSizing: "border-box",
  };
  // Rotação compartilhada (editor e Playwright giram igual).
  if (el.rotation) {
    s["transform"] = `rotate(${el.rotation}deg)`;
    s["transformOrigin"] = "center";
  }
  if (isShape) return s;
  if (el.fill === "gradient" && el.gradient && el.gradient.stops.length >= 2) {
    s["background"] = gradientToCss(el.gradient);
  } else if (hasBackground(el.backgroundColor)) {
    s["background"] = el.backgroundColor;
  }
  if (el.borderWidth && el.borderWidth > 0) {
    s["border"] = `${el.borderWidth}px solid ${el.borderColor || "#ffffff"}`;
  }
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
    fontFamily: fontStack(el.fontFamily),
    fontWeight: fontWeightCss(el.fontWeight),
    fontStyle: el.fontStyle ?? "normal",
    textDecoration: el.textDecoration ?? "none",
    textTransform: el.textTransform ?? "none",
    color: el.color || "#ffffff",
    textAlign: el.textAlign,
    lineHeight: el.lineHeight ?? 1.3,
    letterSpacing: `${el.letterSpacing ?? 0}px`,
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
