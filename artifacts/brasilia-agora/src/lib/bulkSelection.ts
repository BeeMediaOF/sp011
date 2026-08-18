/**
 * Seleção múltipla das listas do painel (Artigos e Fontes RSS).
 *
 * Toda a lógica mora aqui, fora do React, por um motivo prático: o que estraga
 * uma seleção múltipla não é o desenho da caixinha, é o ESTADO — id que ficou
 * marcado depois de sumir da lista, "marcar todos" que só marcou a página, e o
 * contador do botão de excluir mentindo sobre quantos itens vão embora. Isso é
 * aritmética de conjunto e dá para provar com teste.
 *
 * Um `Set` nunca é mutado no lugar: toda função devolve um Set NOVO, senão o
 * React não vê a mudança (mesma referência = mesmo estado) e a tela não redesenha.
 */

/** Marca/desmarca um id. */
export function toggleId(sel: ReadonlySet<string>, id: string): Set<string> {
  const novo = new Set(sel);
  if (novo.has(id)) novo.delete(id); else novo.add(id);
  return novo;
}

/** Marca (on) ou desmarca (off) um conjunto de ids de uma vez. */
export function setMany(sel: ReadonlySet<string>, ids: readonly string[], on: boolean): Set<string> {
  const novo = new Set(sel);
  for (const id of ids) { if (on) novo.add(id); else novo.delete(id); }
  return novo;
}

/** Todos os ids da lista estão marcados? Lista vazia é `false` — não existe "todos" de nada. */
export function allSelected(sel: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => sel.has(id));
}

/** Alguns (mas não todos) marcados — é o estado `indeterminate` da caixinha do cabeçalho. */
export function someSelected(sel: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.some((id) => sel.has(id)) && !allSelected(sel, ids);
}

/**
 * Descarta da seleção o que não existe mais na lista.
 *
 * É o que impede o contador de mentir depois de uma exclusão ou de um filtro:
 * sem isso, "Excluir 316" continuaria dizendo 316 depois de 300 já terem ido
 * embora, e o POST seguinte levaria ids fantasmas.
 */
export function pruneSelection(sel: ReadonlySet<string>, existentes: readonly string[]): Set<string> {
  const vivos = new Set(existentes);
  const novo = new Set<string>();
  for (const id of sel) if (vivos.has(id)) novo.add(id);
  return novo;
}

/** Só os ids marcados que ainda estão na lista visível — é o que vai no POST. */
export function selectedFrom(sel: ReadonlySet<string>, ids: readonly string[]): string[] {
  return ids.filter((id) => sel.has(id));
}

/**
 * Divide uma lista grande em levas do tamanho do teto do servidor
 * (`BULK_DELETE_MAX`). "Selecionar todos" num blog com 600 artigos passa do
 * teto, e a tela precisa mandar em partes em vez de tomar 400.
 */
export function chunk<T>(itens: readonly T[], tamanho: number): T[][] {
  const n = Math.max(1, Math.floor(tamanho));
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += n) out.push(itens.slice(i, i + n));
  return out;
}

/** Teto por requisição — espelha `BULK_DELETE_MAX` do api-server (routes/admin.ts). */
export const BULK_DELETE_MAX = 500;
