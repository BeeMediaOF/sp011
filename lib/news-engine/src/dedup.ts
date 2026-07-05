/**
 * Deduplicação — parte pura, extraída de `articleService.isDuplicateArticle`
 * do api-server. A consulta SQL (match exato de título/URL/imagem) fica em
 * cada app; aqui vivem a normalização e a similaridade por sobreposição de
 * palavras usadas no segundo estágio.
 */

/** Limiar de sobreposição de palavras acima do qual dois títulos são duplicatas. */
export const OVERLAP_THRESHOLD = 0.65;

/** Normalização usada para match exato de título (paridade com `lower(trim(title))`). */
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Palavras significativas de um título (sem acentos, >3 letras). */
export function titleKeywords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/**
 * Sobreposição de palavras entre dois títulos, em 0..1.
 * Títulos com menos de 4 palavras significativas nunca casam (retorna 0),
 * igual ao comportamento original do blog.
 */
export function titleOverlap(a: string, b: string): number {
  const wa = titleKeywords(a);
  const wb = titleKeywords(b);
  if (wa.size < 4 || wb.size < 4) return 0;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.min(wa.size, wb.size);
}

/** True quando os títulos são similares o bastante para serem a mesma notícia. */
export function isSimilarTitle(a: string, b: string): boolean {
  return titleOverlap(a, b) >= OVERLAP_THRESHOLD;
}
