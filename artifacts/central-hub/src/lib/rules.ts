/**
 * Motor de regras de distribuição (funções puras, testáveis).
 *
 * Semântica por regra: os critérios de inclusão definidos são AND entre
 * dimensões (categoria ∈ categoriesInclude, fonte ∈ sourcesInclude, alguma
 * keywordInclude presente no texto); dimensão vazia/ausente = passa. A regra
 * NÃO casa se qualquer exclude dela bater. O blog é elegível se ALGUMA regra
 * ativa dele casar; vence a de maior priority (desempate: primeira).
 */

export interface RuleForMatch {
  isActive: boolean;
  priority: number;
  categoriesInclude?: string[] | null;
  categoriesExclude?: string[] | null;
  sourcesInclude?: string[] | null;
  sourcesExclude?: string[] | null;
  keywordsInclude?: string[] | null;
  keywordsExclude?: string[] | null;
  targetCategory?: string | null;
  targetTag?: string | null;
}

export interface NewsForMatch {
  category: string;
  sourceId: string;
  /** Texto de busca das keywords (título + descrição), qualquer caixa. */
  text: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function hasAny(list: string[] | null | undefined): list is string[] {
  return Array.isArray(list) && list.length > 0;
}

export function ruleMatches(rule: RuleForMatch, news: NewsForMatch): boolean {
  if (!rule.isActive) return false;

  const category = norm(news.category);
  const text = norm(news.text);

  // Excludes primeiro — qualquer um que bater invalida a regra
  if (hasAny(rule.categoriesExclude) && rule.categoriesExclude.some((c) => norm(c) === category)) return false;
  if (hasAny(rule.sourcesExclude) && rule.sourcesExclude.includes(news.sourceId)) return false;
  if (hasAny(rule.keywordsExclude) && rule.keywordsExclude.some((k) => norm(k) && text.includes(norm(k)))) return false;

  // Includes: dimensão definida precisa casar; ausente/vazia passa
  if (hasAny(rule.categoriesInclude) && !rule.categoriesInclude.some((c) => norm(c) === category)) return false;
  if (hasAny(rule.sourcesInclude) && !rule.sourcesInclude.includes(news.sourceId)) return false;
  if (hasAny(rule.keywordsInclude) && !rule.keywordsInclude.some((k) => norm(k) && text.includes(norm(k)))) return false;

  return true;
}

export interface BlogMatchResult {
  matched: boolean;
  targetCategory?: string;
  targetTag?: string;
}

/** Avalia as regras de UM blog; devolve o override da regra vencedora. */
export function matchBlogRules(rules: RuleForMatch[], news: NewsForMatch): BlogMatchResult {
  const winners = rules
    .filter((r) => ruleMatches(r, news))
    .sort((a, b) => b.priority - a.priority);
  const winner = winners[0];
  if (!winner) return { matched: false };
  return {
    matched: true,
    targetCategory: winner.targetCategory ?? undefined,
    targetTag: winner.targetTag ?? undefined,
  };
}
