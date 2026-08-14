/**
 * Falhas de origem do proxy de imagens: o que não adianta re-tentar e por
 * quanto tempo parar de tentar (2026-08-14).
 *
 * Nasceu de dois OOM-kills de api de blog (12 e 13/08) em que o log do dia
 * mostrava a MESMA foto sendo baixada de novo a cada visita ao artigo: uma
 * "HighRes" da Gazeta Esportiva que estoura o cap de 12 MiB do safeFetch,
 * falha, e ainda era re-tentada na hora — 24 MiB de rede por leitor, para
 * sempre servir o mesmo placeholder.
 *
 * Módulo puro (sem I/O) para poder ser testado por `node --test`.
 */

/**
 * Falha que NÃO adianta re-tentar para esta URL: 4xx, conteúdo que não é
 * imagem, URL inválida e origem acima do cap de bytes do safeFetch.
 * Erro transitório (5xx, timeout, rede) fica de fora de propósito — a capa
 * re-hospedada na central engasga sob carga e precisa da segunda chance.
 */
export function isPermanentOriginError(err: unknown): boolean {
  const e = err as { message?: unknown; code?: unknown } | null | undefined;
  const msg = typeof e?.message === "string" ? e.message : String(err);
  return (
    e?.code === "response_too_large" ||
    /^origin_error:4\d\d$/.test(msg) ||
    msg === "not_an_image" ||
    msg === "invalid_url"
  );
}

/** Janela em que uma origem reprovada deixa de ser buscada. */
export const NEGATIVE_TTL_MS = 10 * 60_000;
const NEGATIVE_MAX = 500;

/** url → instante em que a entrada vence. */
const negativeCache = new Map<string, number>();

export function isNegativeCached(url: string, now = Date.now()): boolean {
  const ate = negativeCache.get(url);
  if (ate === undefined) return false;
  if (ate <= now) {
    negativeCache.delete(url);
    return false;
  }
  return true;
}

export function rememberOriginFailure(url: string, now = Date.now()): void {
  if (negativeCache.size >= NEGATIVE_MAX) {
    const maisAntigo = negativeCache.keys().next().value;
    if (maisAntigo !== undefined) negativeCache.delete(maisAntigo);
  }
  negativeCache.set(url, now + NEGATIVE_TTL_MS);
}

/** Só para teste: o cache é de processo e não tem invalidação externa. */
export function clearNegativeCache(): void {
  negativeCache.clear();
}
