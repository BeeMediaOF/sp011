/**
 * Degradês — modelo estruturado convertido para CSS (linear/radial), usado
 * igualmente no editor (DOM) e no render server-side (Playwright). Como ambos
 * consomem o mesmo CSS, o degradê do preview é idêntico ao da imagem postada.
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

/** Converte o modelo de degradê em uma string CSS `*-gradient(...)`. */
export function gradientToCss(g: Gradient): string {
  const stops = [...g.stops]
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

export function defaultGradient(): Gradient {
  return {
    type: "linear",
    angle: 180,
    stops: [
      { color: "rgba(0,0,0,0)", pos: 0 },
      { color: "rgba(0,0,0,0.85)", pos: 100 },
    ],
  };
}

export interface GradientPreset {
  name: string;
  gradient: Gradient;
}

/** Vários tipos de degradê prontos (1 clique no editor). */
export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: "Escuro embaixo", gradient: { type: "linear", angle: 180, stops: [{ color: "rgba(0,0,0,0)", pos: 0 }, { color: "rgba(0,0,0,0.9)", pos: 100 }] } },
  { name: "Escuro em cima", gradient: { type: "linear", angle: 0, stops: [{ color: "rgba(0,0,0,0)", pos: 0 }, { color: "rgba(0,0,0,0.9)", pos: 100 }] } },
  { name: "Escuro nas laterais", gradient: { type: "linear", angle: 90, stops: [{ color: "rgba(0,0,0,0.85)", pos: 0 }, { color: "rgba(0,0,0,0)", pos: 50 }, { color: "rgba(0,0,0,0.85)", pos: 100 }] } },
  { name: "Vinheta (radial)", gradient: { type: "radial", angle: 0, stops: [{ color: "rgba(0,0,0,0)", pos: 45 }, { color: "rgba(0,0,0,0.8)", pos: 100 }] } },
  { name: "Azul da marca", gradient: { type: "linear", angle: 135, stops: [{ color: "#0B2A66", pos: 0 }, { color: "#1e4fbf", pos: 100 }] } },
  { name: "Vermelho destaque", gradient: { type: "linear", angle: 135, stops: [{ color: "#E71D36", pos: 0 }, { color: "#8a0f20", pos: 100 }] } },
  { name: "Azul → transparente", gradient: { type: "linear", angle: 180, stops: [{ color: "rgba(11,42,102,0)", pos: 0 }, { color: "rgba(11,42,102,0.95)", pos: 100 }] } },
  { name: "Pôr do sol", gradient: { type: "linear", angle: 135, stops: [{ color: "#f12711", pos: 0 }, { color: "#f5af19", pos: 100 }] } },
  { name: "Oceano", gradient: { type: "linear", angle: 135, stops: [{ color: "#2193b0", pos: 0 }, { color: "#6dd5ed", pos: 100 }] } },
  { name: "Roxo suave", gradient: { type: "linear", angle: 135, stops: [{ color: "#654ea3", pos: 0 }, { color: "#eaafc8", pos: 100 }] } },
  { name: "Verde", gradient: { type: "linear", angle: 135, stops: [{ color: "#11998e", pos: 0 }, { color: "#38ef7d", pos: 100 }] } },
  { name: "Grafite", gradient: { type: "linear", angle: 135, stops: [{ color: "#232526", pos: 0 }, { color: "#414345", pos: 100 }] } },
];
