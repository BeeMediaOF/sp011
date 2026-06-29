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
  | "gradient";

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";
export type ObjectFit = "cover" | "contain" | "fill";
export type Fill = "solid" | "gradient";

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
}

export function isImageType(type: ElementType): boolean {
  return type === "image" || type === "logo" || type === "overlay";
}
