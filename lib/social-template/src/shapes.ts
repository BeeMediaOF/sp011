/**
 * Figuras (elemento `shape`) renderizadas como SVG inline.
 *
 * O mesmo gerador de string é usado no editor (injetado via innerHTML) e no
 * render server-side (Playwright), então a figura do preview é idêntica à da
 * imagem postada. O `<svg>` usa `viewBox="0 0 W H"` com `preserveAspectRatio="none"`:
 * como a caixa do elemento mede exatamente `W×H` px, o mapeamento é 1:1 e o
 * traço sai uniforme (no editor tudo está dentro de um `scale()`, que escala
 * proporcionalmente).
 */
import type { StrokeStyle, TemplateElement } from "./types";
import { gradientToSvg } from "./gradient";

function isSolid(color: string | undefined): boolean {
  return !!color && color !== "transparent" && color !== "rgba(0,0,0,0)";
}

/** Atributo `stroke-dasharray` para tracejado/pontilhado (escala com a espessura). */
function dashAttrs(style: StrokeStyle | undefined, sw: number): string {
  if (style === "dashed") return ` stroke-dasharray="${(sw * 3).toFixed(1)} ${(sw * 2).toFixed(1)}"`;
  if (style === "dotted") return ` stroke-dasharray="0 ${(sw * 2).toFixed(1)}" stroke-linecap="round"`;
  return "";
}

/** Vértices de um polígono regular inscrito na caixa W×H (1ª ponta no topo). */
function polygonPoints(w: number, h: number, sides: number): string {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const n = Math.max(3, Math.round(sides || 3));
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push(`${(cx + rx * Math.cos(ang)).toFixed(2)},${(cy + ry * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Vértices de uma estrela de N pontas (raio interno = `innerRatio` do externo). */
function starPoints(w: number, h: number, points: number, innerRatio = 0.45): string {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
  const p = Math.max(3, Math.round(points || 5));
  const n = p * 2;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const ang = -Math.PI / 2 + (i * Math.PI) / p;
    pts.push(`${(cx + rx * r * Math.cos(ang)).toFixed(2)},${(cy + ry * r * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Constrói o `<svg>` completo (string) de um elemento de figura. */
export function shapeSvg(el: TemplateElement): string {
  const w = Math.max(1, el.width);
  const h = Math.max(1, el.height);
  const kind = el.shapeKind ?? "rect";

  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;overflow:visible">`;

  // ── Linha e seta: o próprio traço é a figura (sem preenchimento) ──
  if (kind === "line" || kind === "arrow") {
    const sw = el.borderWidth && el.borderWidth > 0 ? el.borderWidth : Math.max(2, Math.round(h * 0.5));
    const col = el.borderColor || (isSolid(el.backgroundColor) ? el.backgroundColor : "") || "#0B2A66";
    const cy = h / 2;
    const dash = dashAttrs(el.strokeStyle, sw);
    if (kind === "line") {
      return `${open}<line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"${dash}/></svg>`;
    }
    const headLen = Math.min(w * 0.5, Math.max(sw * 3, h));
    const headW = Math.min(cy, headLen * 0.6);
    const shaftEnd = Math.max(0, w - headLen);
    return (
      `${open}` +
      `<line x1="0" y1="${cy}" x2="${shaftEnd}" y2="${cy}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"${dash}/>` +
      `<polygon points="${w},${cy} ${shaftEnd.toFixed(2)},${(cy - headW).toFixed(2)} ${shaftEnd.toFixed(2)},${(cy + headW).toFixed(2)}" fill="${col}"/>` +
      `</svg>`
    );
  }

  // ── Chevron (">"): traço grosso apontando p/ a direita (rotação orienta) ──
  if (kind === "chevron") {
    const sw = el.borderWidth && el.borderWidth > 0 ? el.borderWidth : Math.max(4, Math.round(w * 0.3));
    const col = isSolid(el.backgroundColor) ? el.backgroundColor : el.borderColor || "#2EE6A0";
    const p = sw / 2;
    const dash = dashAttrs(el.strokeStyle, sw);
    return `${open}<polyline points="${p.toFixed(2)},${p.toFixed(2)} ${(w - p).toFixed(2)},${(h / 2).toFixed(2)} ${p.toFixed(2)},${(h - p).toFixed(2)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash}/></svg>`;
  }

  // ── Cantos de registro (4 colchetes em L): moldura de foto sem fechar o quadro ──
  if (kind === "corners") {
    const col = el.borderColor || (isSolid(el.backgroundColor) ? el.backgroundColor : "") || "#ffffff";
    const sw = el.borderWidth && el.borderWidth > 0 ? el.borderWidth : Math.max(2, Math.round(Math.min(w, h) * 0.012));
    const arm = Math.max(sw * 3, Math.min(w, h) * 0.16);
    const i = sw / 2;
    const x0 = i, y0 = i, x1 = w - i, y1 = h - i;
    const a = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
    const common = `fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="square"`;
    const dash = dashAttrs(el.strokeStyle, sw);
    return (
      `${open}` +
      `<polyline points="${a(x0, y0 + arm)} ${a(x0, y0)} ${a(x0 + arm, y0)}" ${common}${dash}/>` +
      `<polyline points="${a(x1 - arm, y0)} ${a(x1, y0)} ${a(x1, y0 + arm)}" ${common}${dash}/>` +
      `<polyline points="${a(x1, y1 - arm)} ${a(x1, y1)} ${a(x1 - arm, y1)}" ${common}${dash}/>` +
      `<polyline points="${a(x0 + arm, y1)} ${a(x0, y1)} ${a(x0, y1 - arm)}" ${common}${dash}/>` +
      `</svg>`
    );
  }

  // ── Figuras preenchidas (retângulo, elipse, triângulo, polígono, estrela) ──
  const useGradient = el.fill === "gradient" && el.gradient && el.gradient.stops.length >= 2;
  const gid = `gsh-${(el.id || "x").replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = useGradient ? `url(#${gid})` : isSolid(el.backgroundColor) ? el.backgroundColor : "none";
  const sw = el.borderWidth ?? 0;
  const strokeAttrs =
    sw > 0 ? ` stroke="${el.borderColor || "#ffffff"}" stroke-width="${sw}"${dashAttrs(el.strokeStyle, sw)}` : "";
  const defs = useGradient && el.gradient ? `<defs>${gradientToSvg(el.gradient, gid)}</defs>` : "";

  let figure: string;
  switch (kind) {
    case "ellipse":
      figure = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}"${strokeAttrs}/>`;
      break;
    case "triangle":
      // Apex no topo-centro, base ocupando toda a largura na parte de baixo.
      figure = `<polygon points="${w / 2},0 ${w},${h} 0,${h}" fill="${fill}"${strokeAttrs}/>`;
      break;
    case "polygon":
      figure = `<polygon points="${polygonPoints(w, h, el.sides ?? 6)}" fill="${fill}"${strokeAttrs}/>`;
      break;
    case "star":
      figure = `<polygon points="${starPoints(w, h, el.points ?? 5)}" fill="${fill}"${strokeAttrs}/>`;
      break;
    case "rect":
    default: {
      const r = Math.max(0, el.borderRadius || 0);
      figure = `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"${strokeAttrs}/>`;
      break;
    }
  }
  return `${open}${defs}${figure}</svg>`;
}
