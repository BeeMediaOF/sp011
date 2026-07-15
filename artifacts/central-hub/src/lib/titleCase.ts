/**
 * Padronização de caixa do TÍTULO das postagens por blog (pedido do usuário:
 * "ou sai tudo em caixa alta, ou sai em caixa normal — selecionável").
 * Aplicada pelo deliveryWorker ao montar o payload do /api/ingest, então vale
 * para TODAS as entregas (reescrita, tradução e publicação manual).
 * Módulo puro, testável sem banco.
 */

export type TitleCaseMode = "original" | "upper" | "sentence";

export const TITLE_CASE_MODES: TitleCaseMode[] = ["original", "upper", "sentence"];

export function normalizeTitleCaseMode(v: unknown): TitleCaseMode {
  return v === "upper" || v === "sentence" ? v : "original";
}

/** Proporção de letras maiúsculas entre as letras do texto (0–1). */
function upperRatio(s: string): number {
  let letters = 0;
  let uppers = 0;
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const upper = ch.toUpperCase();
    if (lower === upper) continue; // não é letra bicameral
    letters++;
    if (ch === upper) uppers++;
  }
  return letters === 0 ? 0 : uppers / letters;
}

/**
 * 'upper' → TÍTULO TODO EM MAIÚSCULAS (sem perdas).
 * 'sentence' → conserta título que veio GRITADO (≥70% maiúsculas): baixa tudo
 *   e capitaliza o início de cada frase. Título já em caixa mista fica como
 *   está (não dá para recuperar siglas de um texto todo em caps — por isso a
 *   heurística só age no caso claramente errado).
 * 'original' → como veio da IA.
 */
export function applyTitleCase(title: string, mode: TitleCaseMode): string {
  const t = (title ?? "").trim();
  if (!t || mode === "original") return t;
  if (mode === "upper") return t.toLocaleUpperCase("pt-BR");

  // sentence
  if (upperRatio(t) < 0.7) return t; // já está em caixa normal
  const lowered = t.toLocaleLowerCase("pt-BR");
  return lowered.replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, sep: string, ch: string) =>
    sep + ch.toLocaleUpperCase("pt-BR"));
}
