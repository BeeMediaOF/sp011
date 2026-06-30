/**
 * Degradês — modelo estruturado convertido para CSS (linear/radial), usado
 * igualmente no editor (DOM) e no render server-side (Playwright). Como ambos
 * consomem o mesmo CSS, o degradê do preview é idêntico ao da imagem postada.
 *
 * Princípio anti-"faixa marcada": um degradê com poucas paradas e um salto
 * grande de opacidade (ex.: 0 → 0.55 em 35%) é percebido como uma LINHA onde a
 * escuridão "começa". A solução é uma curva suave (smoothstep) com várias
 * paradas — todas compondo UMA única transição contínua, sem blocos. Os helpers
 * `easedScrim`/`smoothGradient` geram exatamente isso.
 */

export interface GradientStop {
  /** Cor CSS (hex, rgb, rgba…). Aceita transparência (rgba). */
  color: string;
  /** Posição 0–100 (%). */
  pos: number;
}

export interface Gradient {
  type: "linear" | "radial";
  /** Ângulo em graus (apenas linear). 0 = de baixo p/ cima, 180 = de cima p/ baixo. */
  angle: number;
  stops: GradientStop[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Curva de suavização (ease-in-out) — base para degradês de aparência natural. */
function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Parser tolerante de cor → {r,g,b,a}. Aceita #rgb, #rrggbb, rgb()/rgba(). */
export function parseRgba(color: string): { r: number; g: number; b: number; a: number } {
  const c = (color || "").trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1]!.split(",").map((x) => parseFloat(x.trim()));
    return { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p[3] === undefined ? 1 : p[3] };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function rgbaString(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Number(a.toFixed(3))})`;
}

/** Converte o modelo de degradê em uma string CSS `*-gradient(...)`. */
export function gradientToCss(g: Gradient): string {
  const stops = [...g.stops]
    .map((s) => ({ color: s.color, pos: clamp(s.pos, 0, 100) }))
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${s.color} ${s.pos}%`)
    .join(", ");
  if (g.type === "radial") return `radial-gradient(circle at center, ${stops})`;
  return `linear-gradient(${g.angle}deg, ${stops})`;
}

/** Fundo resolvido de um container: degradê (se houver paradas) ou cor sólida. */
export function backgroundCss(solid: string, gradient?: Gradient): string {
  return gradient && gradient.stops.length >= 2 ? gradientToCss(gradient) : solid;
}

// ── Geradores de curva suave ──────────────────────────────────────────────────

/**
 * Paradas de uma "cortina" (scrim) que vai de transparente (pos 0) até
 * `maxAlpha` (pos 100) seguindo smoothstep — a opacidade sobe devagar no começo
 * e concentra a escuridão no fim, sem linha perceptível. `steps` paradas
 * eliminam o banding do JPEG.
 */
export function easedScrimStops(
  maxAlpha = 0.92,
  color: [number, number, number] = [0, 0, 0],
  steps = 8,
): GradientStop[] {
  const out: GradientStop[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const a = maxAlpha * smoothstep(t);
    out.push({ color: rgbaString(color[0], color[1], color[2], a), pos: Math.round(t * 100) });
  }
  return out;
}

/** Degradê escuro contínuo (transparente → escuro) num dado ângulo. */
export function easedScrim(angle = 180, maxAlpha = 0.92): Gradient {
  return { type: "linear", angle, stops: easedScrimStops(maxAlpha) };
}

/** Paradas simétricas (escuro nas duas pontas, transparente no centro), suaves. */
function easedSideStops(maxAlpha = 0.85, steps = 6): GradientStop[] {
  const out: GradientStop[] = [];
  // metade esquerda: escuro(0) → transparente(50)
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const a = maxAlpha * (1 - smoothstep(t));
    out.push({ color: rgbaString(0, 0, 0, a), pos: Math.round(t * 50) });
  }
  // metade direita: transparente(50) → escuro(100)
  for (let i = 1; i < steps; i++) {
    const t = i / (steps - 1);
    const a = maxAlpha * smoothstep(t);
    out.push({ color: rgbaString(0, 0, 0, a), pos: Math.round(50 + t * 50) });
  }
  return out;
}

/**
 * Reamostra um degradê arbitrário numa curva suave (smoothstep) entre as paradas
 * de menor e maior posição. Usado pelo botão "Suavizar": preserva as cores das
 * pontas e a posição vertical, mas elimina saltos bruscos no meio.
 */
export function smoothGradient(g: Gradient, steps = 8): Gradient {
  const sorted = [...g.stops].sort((a, b) => a.pos - b.pos);
  if (sorted.length < 2) return g;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const c0 = parseRgba(first.color);
  const c1 = parseRgba(last.color);
  const p0 = clamp(first.pos, 0, 100);
  const p1 = clamp(last.pos, 0, 100);
  const stops: GradientStop[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const e = smoothstep(t);
    stops.push({
      color: rgbaString(
        c0.r + (c1.r - c0.r) * e,
        c0.g + (c1.g - c0.g) * e,
        c0.b + (c1.b - c0.b) * e,
        c0.a + (c1.a - c0.a) * e,
      ),
      pos: Math.round(p0 + (p1 - p0) * t),
    });
  }
  return { ...g, stops };
}

/** Degradê padrão de novos elementos: scrim escuro suave de cima p/ baixo. */
export function defaultGradient(): Gradient {
  return easedScrim(180, 0.92);
}

export interface GradientPreset {
  name: string;
  gradient: Gradient;
}

/**
 * Degradês prontos (1 clique no editor). Os "escuros" usam curva suave
 * (várias paradas smoothstep) para integrar à foto sem faixa visível; os
 * coloridos são transições de marca opacas (sem banding de alpha).
 */
export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: "Escuro embaixo (suave)",  gradient: easedScrim(180, 0.92) },
  { name: "Escuro embaixo (forte)",  gradient: easedScrim(180, 0.97) },
  { name: "Escuro em cima (suave)",  gradient: easedScrim(0, 0.92) },
  { name: "Escuro nas laterais",     gradient: { type: "linear", angle: 90, stops: easedSideStops(0.85) } },
  { name: "Vinheta (radial)",        gradient: { type: "radial", angle: 0, stops: [
      { color: "rgba(0,0,0,0)", pos: 35 },
      { color: "rgba(0,0,0,0.06)", pos: 55 },
      { color: "rgba(0,0,0,0.22)", pos: 70 },
      { color: "rgba(0,0,0,0.45)", pos: 84 },
      { color: "rgba(0,0,0,0.7)", pos: 94 },
      { color: "rgba(0,0,0,0.85)", pos: 100 },
    ] } },
  { name: "Azul da marca",           gradient: { type: "linear", angle: 135, stops: [{ color: "#0B2A66", pos: 0 }, { color: "#1e4fbf", pos: 100 }] } },
  { name: "Vermelho destaque",       gradient: { type: "linear", angle: 135, stops: [{ color: "#E71D36", pos: 0 }, { color: "#8a0f20", pos: 100 }] } },
  { name: "Azul → transparente",     gradient: { type: "linear", angle: 180, stops: easedScrimStops(0.95, [11, 42, 102]) } },
  { name: "Pôr do sol",              gradient: { type: "linear", angle: 135, stops: [{ color: "#f12711", pos: 0 }, { color: "#f5af19", pos: 100 }] } },
  { name: "Oceano",                  gradient: { type: "linear", angle: 135, stops: [{ color: "#2193b0", pos: 0 }, { color: "#6dd5ed", pos: 100 }] } },
  { name: "Roxo suave",              gradient: { type: "linear", angle: 135, stops: [{ color: "#654ea3", pos: 0 }, { color: "#eaafc8", pos: 100 }] } },
  { name: "Verde",                   gradient: { type: "linear", angle: 135, stops: [{ color: "#11998e", pos: 0 }, { color: "#38ef7d", pos: 100 }] } },
  { name: "Grafite",                 gradient: { type: "linear", angle: 135, stops: [{ color: "#232526", pos: 0 }, { color: "#414345", pos: 100 }] } },
];
