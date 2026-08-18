/**
 * Normalização da taxonomia de um blog (slugs kebab-case).
 *
 * Módulo puro de propósito: esta função morava dentro de `routes/blogs.ts`, que
 * importa o banco, então nunca pôde ser testada — e carregou por meses um bug
 * que corrompia TODA taxonomia salva pelo painel.
 *
 * O bug (2026-08-14): a remoção de acentos estava escrita
 * `.replace(/[\u0300-\u036f]/g, "")`, com barra DUPLA. Numa regex literal isso
 * deixa de ser o intervalo de marcas combinantes e vira uma classe com os
 * caracteres `\`, `u`, `0`, `3`, `6`, `f` mais o intervalo `0`-`\` (0x30–0x5C).
 * Como o `.toLowerCase()` já rodou antes, o efeito visível é apagar `u`, `f` e
 * todos os DÍGITOS do slug:
 *     outros              -> otros
 *     organizar-financas  -> organizar-inancas
 *     planejar-o-futuro   -> planejar-o-tro
 *     football            -> ootball
 *     formula-1           -> orma
 * Slug sem u/f/dígito passava intacto, e foi por isso que o estrago passou
 * despercebido: metade da lista parecia certa.
 *
 * Consequência a jusante: `resolveDeliveryCategory` valida a classificação da
 * IA contra ESTA lista. Com `otros` gravado aqui, `otros` virou categoria
 * legítima e 117 artigos do credito.vc foram parar numa rota inexistente.
 */
export interface BlogCategoryInput {
  slug?: unknown;
  hint?: unknown;
}

export interface NormalizedCategory {
  slug: string;
  hint?: string;
}

/** Slug kebab-case sem acento. Devolve "" para entrada inaproveitável. */
export function slugifyCategory(raw: unknown): string {
  return String(raw ?? "")
    .trim().toLowerCase()
    // Intervalo das marcas combinantes — barra SIMPLES (ver o comentário acima).
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Normaliza a lista vinda do painel; null = blog sem classificação. */
export function normalizeCategories(input: unknown): NormalizedCategory[] | null {
  if (!Array.isArray(input)) return null;
  const out: NormalizedCategory[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const slug = slugifyCategory((item as BlogCategoryInput).slug);
    if (!slug || out.some((c) => c.slug === slug)) continue;
    const hint = String((item as BlogCategoryInput).hint ?? "").trim().slice(0, 200);
    out.push(hint ? { slug, hint } : { slug });
  }
  return out.length > 0 ? out : null;
}
