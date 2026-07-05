/** Tipos compartilhados do motor de notícias. */

/** Fonte de coleta (RSS ou homepage) — independente do schema de qualquer app. */
export interface EngineSource {
  id: string;
  name: string;
  url: string;
  category: string;
  /** Máximo de artigos por rodada desta fonte (1–20). */
  fetchLimit?: number | null;
  giveCredit?: boolean;
  customPrompt?: string | null;
}

/** Artigo bruto coletado de uma fonte, antes de dedup/reescrita. */
export interface FetchedArticle {
  sourceId: string;
  sourceName: string;
  category: string;
  title: string;
  link: string;
  /** GUID do item RSS quando disponível (âncora de dedup). */
  guid?: string;
  pubDate: string;
  imageUrl: string;
  excerpt: string;
  fullText: string;
}

/** Consumo de tokens de uma chamada de IA (usageMetadata / usage). */
export interface TokenUsage {
  provider: string;
  model: string;
  /** Últimos 4 caracteres da chave usada (nunca a chave inteira). */
  keyHint?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Blob de prompts (global + por categoria) — mesmo formato do `rss_prompts` do blog. */
export interface PromptsBlob {
  global?: string;
  categories?: Record<string, string>;
}

/** Logger mínimo compatível com pino (`logger.warn({...}, "msg")`). */
export interface EngineLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export const consoleLogger: EngineLogger = {
  info: (obj, msg) => console.info(msg ?? "", obj),
  warn: (obj, msg) => console.warn(msg ?? "", obj),
  error: (obj, msg) => console.error(msg ?? "", obj),
};
