/**
 * Tempo de leitura estimado de um artigo, em minutos.
 * Derivado do content na hora (não persiste no banco): palavras do texto
 * sem tags HTML / 200 ppm, mínimo 1. Exposto no payload de lista do
 * /api/articles para os cards da home (layout "mini"/"hero").
 */
export function readingMinutes(html: string): number {
  const words = html
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
