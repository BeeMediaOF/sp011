// analyticsDisplay — funções PURAS de normalização para barras/percentuais de
// "participação" nos cards do dashboard admin (PRD 10 RF1). Zero import de React:
// mesmo padrão de `analyticsClient.ts`, testável por `tsx --test` sem DOM.
//
// Corrigem a base bugada de "usar só o primeiro item do array" (que pode NÃO ser o
// líder real quando a ordenação do backend tem fallback — ver PRD 06 RF-1 /
// analytics-audit item 3/14), garantindo:
//   (a) a base é o MAIOR valor real da lista inteira, nunca só o item 0;
//   (b) o resultado nunca passa de 100%, nunca é NaN/Infinity/negativo;
//   (c) quando não há NENHUM item com valor > 0, o resultado é 0% honesto —
//       nunca 100% "por acidente" de divisão 0/0 nem crash.

/** Maior valor entre os itens, segundo `pick`. Lista vazia, ou todo valor <= 0
 *  (ou não-finito), retorna 0. Percorre TODOS os itens — nunca assume ordenação.
 *  NUNCA lança. */
export function maxMetric<T>(items: readonly T[], pick: (item: T) => number): number {
  let max = 0;
  for (const item of items) {
    const v = pick(item);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

/** value/max em pontos percentuais, SEMPRE dentro de [0, 100]. `max <= 0`
 *  (nenhum item com atividade real) ou `value` não-finito/<=0 → 0. Nunca
 *  NaN/Infinity/negativo — nunca uma barra CSS width > 100% nem um chip "300%". */
export function pctOfMax(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}
