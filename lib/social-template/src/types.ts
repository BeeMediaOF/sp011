/**
 * Tipos compartilhados do editor de template social.
 *
 * Fonte única de verdade consumida tanto pelo editor (browser, em
 * `artifacts/brasilia-agora`) quanto pelo renderizador server-side
 * (Playwright, em `artifacts/api-server`). Manter ambos no mesmo modelo
 * é o que garante o WYSIWYG: o que você desenha é exatamente o que é postado.
 */

import type { Gradient } from "./gradient";

export type ElementType =
  | "title"
  | "category"
  | "image"
  | "logo"
  | "cta"
  | "text"
  | "overlay"
  | "gradient"
  | "shape";

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";
export type ObjectFit = "cover" | "contain" | "fill";
export type Fill = "solid" | "gradient";

/** Tipo geométrico de uma figura (elemento `shape`). */
export type ShapeKind =
  | "rect"
  | "ellipse"
  | "triangle"
  | "polygon"
  | "star"
  | "line"
  | "arrow"
  | "chevron"
  | "corners";

/** Estilo do traço (borda) de figuras e caixas. */
export type StrokeStyle = "solid" | "dashed" | "dotted";

/** Estilos inline de texto (independentes do peso). */
export type FontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";
export type TextTransform = "none" | "uppercase";

export interface TemplateElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  textAlign: TextAlign;
  padding: number;
  borderRadius: number;
  opacity: number;
  zIndex: number;
  content: string;
  objectFit?: ObjectFit;
  /** Alinhamento vertical do texto dentro da caixa. Default "top" (legado). */
  verticalAlign?: VerticalAlign;
  /** Preenchimento do fundo da caixa: sólido (backgroundColor) ou degradê. */
  fill?: Fill;
  gradient?: Gradient;
  /** Borda/contorno da caixa (ex.: pílula de URL). 0 = sem borda. */
  borderWidth?: number;
  borderColor?: string;
  /** Espaçamento entre letras em px (caixa-alta fica melhor com +1/+2). */
  letterSpacing?: number;
  /** Entrelinha (line-height) como múltiplo do tamanho da fonte. Default 1.3. */
  lineHeight?: number;
  /** Rotação do elemento em graus (transform: rotate). Default 0. */
  rotation?: number;
  /** Estilos inline de texto (independentes de fontWeight). */
  fontStyle?: FontStyle;
  textDecoration?: TextDecoration;
  textTransform?: TextTransform;
  /** Encolhe a fonte automaticamente para o texto caber na caixa (sem cortar). */
  autoFit?: boolean;
  /** Cor dos trechos marcados com *asteriscos* (destaque inline). */
  accentColor?: string;
  /** Tipo geométrico da figura (apenas type === "shape"). */
  shapeKind?: ShapeKind;
  /** Nº de lados de um polígono (apenas shapeKind === "polygon"). */
  sides?: number;
  /** Nº de pontas de uma estrela (apenas shapeKind === "star"). */
  points?: number;
  /** Estilo do traço/contorno: sólido, tracejado ou pontilhado. */
  strokeStyle?: StrokeStyle;
}

export interface SocialTemplate {
  width: number;
  height: number;
  backgroundColor: string;
  /** Degradê de fundo do canvas (opcional; tem prioridade sobre backgroundColor). */
  backgroundGradient?: Gradient;
  elements: TemplateElement[];
}

/**
 * Dados do artigo injetados nos placeholders do template
 * (`{{title}}`, `{{category}}`, etc.). Campos opcionais degradam para "".
 */
export interface ArticleData {
  title: string;
  category: string;
  subtitle?: string;
  author?: string;
  imageUrl?: string;
  publishedAt?: string;
  link?: string;
  site?: string;
  /** Pré-resolvido (ex.: "#politica #noticias") — usado em legendas. */
  hashtags?: string;
  /** Trecho inicial real do corpo da matéria (sem HTML) — usado em legendas. */
  excerpt?: string;
  /** Resumo curto (gerado pela IA) — usado em legendas. */
  summary?: string;
}

export function isImageType(type: ElementType): boolean {
  return type === "image" || type === "logo" || type === "overlay";
}
