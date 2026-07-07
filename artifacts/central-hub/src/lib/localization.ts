/**
 * Regras puras do localizer (tradução + classificação por entrega) — módulo
 * sem banco/IO, testável com node --test (padrão de lib/backoff.ts).
 */
import type { BlogCategory } from "@workspace/central-db";

export const MAX_TRANSLATION_ATTEMPTS = 3;

/** Backoff da tradução por tentativa (1-indexado): 1m → 5m → 15m. */
export const TRANSLATION_BACKOFF_MINUTES = [1, 5, 15] as const;

export function translationBackoffMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), TRANSLATION_BACKOFF_MINUTES.length) - 1;
  return TRANSLATION_BACKOFF_MINUTES[idx]! * 60_000;
}

/** Idioma do blog difere do idioma da reescrita (null = legado pt-BR)? */
export function needsTranslation(blogLanguage: string, rewriteLanguage: string | null | undefined): boolean {
  return blogLanguage !== (rewriteLanguage ?? "pt-BR");
}

/** Blog tem taxonomia e a entrega ainda não tem categoria explícita da regra? */
export function needsClassification(
  categories: BlogCategory[] | null | undefined,
  targetCategory: string | null | undefined,
): boolean {
  return (categories?.length ?? 0) > 0 && !targetCategory;
}

/**
 * Precedência da categoria de uma entrega:
 * 1. targetCategory da regra (intenção explícita do operador) — SEMPRE vence;
 * 2. classificação por IA (validada contra a taxonomia);
 * 3. fallback "others" (ou o último slug da lista) — classificação NUNCA bloqueia;
 * 4. null quando o blog não tem taxonomia (ingest usa a categoria da notícia).
 */
export function resolveDeliveryCategory(opts: {
  ruleCategory?: string | null;
  aiCategory?: string | null;
  categories?: BlogCategory[] | null;
}): string | null {
  if (opts.ruleCategory) return opts.ruleCategory;
  const cats = opts.categories ?? [];
  if (opts.aiCategory && cats.some((c) => c.slug === opts.aiCategory)) return opts.aiCategory;
  if (cats.length === 0) return null;
  return cats.find((c) => c.slug === "others")?.slug ?? cats[cats.length - 1]!.slug;
}

/** Status pós-localização: aprovação acontece DEPOIS de traduzir/classificar. */
export function postLocalizationStatus(requireApproval: boolean): "awaiting_approval" | "pending" {
  return requireApproval ? "awaiting_approval" : "pending";
}

/** Erros de quota/configuração de provider não consomem tentativa de tradução. */
export function isProviderUnavailableError(msg: string): boolean {
  return msg.includes("QUOTA_COOLDOWN")
    || msg.includes("QUOTA_EXHAUSTED")
    || msg.includes("não configurada");
}
