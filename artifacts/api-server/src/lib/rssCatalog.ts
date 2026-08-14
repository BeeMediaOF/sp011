/**
 * Decisões PURAS da sincronização de fontes RSS com o painel central — sem I/O
 * nem runtime de banco, para serem testáveis por `node --test` (mesmo motivo do
 * split auditRow/auditLog da central). O `store.ts` importa daqui e faz o SQL.
 *
 * Contexto: até 2026-08-14 a imagem instalava 25 feeds fixos do sp011 em TODO
 * blog da rede — um blog de esporte exibia política do DF no painel. A imagem é
 * compartilhada e não sabe qual blog está rodando (CLAUDE.md §13), então quem
 * manda a lista é a central, que sabe pelas regras de distribuição quais fontes
 * alimentam cada blog.
 */

/** Uma fonte como a central manda (shape do POST /api/ingest/sources). */
export interface CentralSourceInput {
  name: string;
  url: string;
  category?: string;
  language?: string;
}

/** O mínimo de uma linha de `rss_sources` para decidir remoção. */
export interface RssRowForPrune {
  id: string;
  url: string;
  active: boolean;
  lastFetchedAt: Date | null;
}

/**
 * Normaliza e deduplica a lista recebida da central. Dedupe por URL em código
 * de propósito: `rss_sources` não tem UNIQUE em `url`, então um
 * `onConflictDoNothing` (que só cobre a PK) duplicaria tudo na 2ª sincronização.
 * A 1ª ocorrência vence.
 */
export function normalizeCentralSources(
  entrada: readonly CentralSourceInput[],
): Map<string, CentralSourceInput> {
  const out = new Map<string, CentralSourceInput>();
  for (const s of entrada) {
    const url = (s?.url ?? "").trim();
    const name = (s?.name ?? "").trim();
    if (!/^https?:\/\//i.test(url) || name === "") continue;
    if (!out.has(url)) out.set(url, { ...s, url, name });
  }
  return out;
}

/**
 * Quais linhas a sincronização pode APAGAR — é o único pedaço que destrói dado.
 * Uma linha só sai quando as TRÊS valem:
 *   1. foi esta automação que a plantou (`plantadas`) — fonte cadastrada à mão
 *      pelo operador nunca está nesse conjunto, então nunca é removida;
 *   2. a central não a manda mais (`desejadas`);
 *   3. continua inativa e sem nenhuma coleta (`lastFetchedAt === null`) — o que
 *      já rodou tem histórico e pode estar amarrado a artigos.
 */
export function rssSourcesToRemove(
  existentes: readonly RssRowForPrune[],
  desejadas: ReadonlySet<string>,
  plantadas: ReadonlySet<string>,
): string[] {
  return existentes
    .filter((r) => plantadas.has(r.url)
      && !desejadas.has(r.url)
      && !r.active
      && r.lastFetchedAt === null)
    .map((r) => r.id);
}
