/**
 * O que responder para uma rota: status, redirect e indexabilidade.
 *
 * Mora aqui, e não no `vite.config.ts`, pelo mesmo motivo do `ssrRoutes.ts` e do
 * `categoryRoutes.ts`: é regra de negócio, precisa de teste, e o middleware não
 * pode ser o lugar onde ela é inventada. O `vite.config.ts` executa a decisão;
 * quem decide é este arquivo.
 *
 * Três perguntas, separadas de propósito:
 *   1. o que existe nesta URL?          (dado: a `api` responde)
 *   2. qual é a URL canônica disso?     (`canonicalArticlePath`)
 *   3. esta página deve ser indexada?   (`noindex` — só do conteúdo, nunca do menu)
 */

/** O que a `api` disse. "Não existe" e "não deu para saber" são coisas diferentes. */
export type LookupState = "found" | "notFound" | "unavailable";

export interface ArticleIdentity {
  slug?: string | null;
  id?: string | null;
}

export interface RouteDecision {
  status: 200 | 301 | 404 | 503;
  /** `stale` = servir o HTML velho do cache; `render` = renderizar agora. */
  action: "render" | "stale" | "redirect" | "notFound" | "unavailable";
  /** Destino do 301, com a query preservada. */
  location?: string;
  /** `noindex, follow` na resposta. */
  noindex?: boolean;
}

/**
 * Indisponibilidade da `api`, com a cascata obrigatória:
 * HTML velho dentro da janela → 200; sem ele → 503 com `Retry-After`.
 *
 * NUNCA 404: timeout, 5xx e banco fora não são "não existe" — responder 404
 * tiraria do índice conteúdo publicado. E nunca 200 com página vazia, que é o
 * defeito que este módulo existe para corrigir e ainda esconde o incidente de
 * qualquer monitoramento.
 */
export function decideUnavailable(hasStale: boolean): RouteDecision {
  return hasStale ? { status: 200, action: "stale" } : { status: 503, action: "unavailable" };
}

/** Identificador canônico do artigo: o slug; sem ele, o id. */
export function canonicalArticleSlug(a: ArticleIdentity | null | undefined): string {
  const slug = (a?.slug ?? "").trim();
  if (slug) return slug;
  return (a?.id ?? "").trim();
}

/** URL canônica do artigo, já percent-encoded (há slug com acento e com espaço). */
export function canonicalArticlePath(a: ArticleIdentity | null | undefined): string {
  const canonical = canonicalArticleSlug(a);
  return canonical ? `/artigo/${encodeURIComponent(canonical)}` : "";
}

/** `decodeURIComponent` que não explode em `%` solto vindo de um bot. */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface ArticleDecisionInput {
  /** Segmento cru da URL, como chegou (pode vir percent-encoded). */
  requested: string;
  /** Query string com o "?", ou vazio. O 301 preserva. */
  query?: string;
  state: LookupState;
  article?: ArticleIdentity | null;
  /** Existe HTML em cache dentro da janela de stale? */
  hasStale?: boolean;
}

/**
 * Decisão de `/artigo/<x>`.
 *
 * O backend resolve por id OU slug — é o que mantém link histórico de pé — mas
 * duas URLs servindo a mesma matéria com 200 são conteúdo duplicado. Muda o
 * status, nunca a resolução: o UUID continua funcionando, só que redirecionando.
 */
export function decideArticle(p: ArticleDecisionInput): RouteDecision {
  if (p.state === "unavailable") return decideUnavailable(p.hasStale === true);
  if (p.state === "notFound") return { status: 404, action: "notFound", noindex: true };

  const canonical = canonicalArticleSlug(p.article);
  // Artigo sem slug E sem id: nada a canonicalizar, serve o que foi pedido.
  if (!canonical) return { status: 200, action: "render" };

  /* A comparação é entre valores DECODIFICADOS: `/artigo/uts-rio-jo%C3%A3o` e o
     slug `uts-rio-joão` são a mesma URL, e tratá-los como diferentes criaria um
     301 para o mesmo lugar — um laço de redirect por encoding. */
  if (safeDecode(p.requested) === canonical) return { status: 200, action: "render" };

  return {
    status: 301,
    action: "redirect",
    location: `${canonicalArticlePath(p.article)}${p.query ?? ""}`,
  };
}

export interface CategoryDecisionInput {
  /** O slug está na superfície do blog (menu ou editorias do painel)? */
  declared: boolean;
  /** Artigos publicados na editoria. */
  total: number;
  state: LookupState;
  hasStale?: boolean;
}

/**
 * Decisão de `/<editoria>`. As quatro classes, na ordem em que se resolvem:
 *
 *   1. declarada e COM conteúdo   → 200 indexável        (Oley /futebol)
 *   2. declarada e VAZIA          → 200 + noindex        (Oley /basquete)
 *   3. NÃO declarada, com conteúdo→ 200 indexável        (sp011 /seguranca, 163
 *                                                         artigos fora do menu)
 *   -. não declarada e vazia      → 404                  (Oley /politica)
 *
 * A classe 3 é a razão de a contagem entrar aqui. Ausência no menu é decisão de
 * NAVEGAÇÃO; desindexar por causa dela apagaria arquivo real do portal. E o
 * inverso também vale: ter artigo não é passe livre para o índice — a editoria
 * vazia continua servida (é navegável) e fora do índice.
 *
 * Slug corrompido por erro histórico (`tebol`, 39 artigos) cai na classe 3 e é
 * servido: o engine não tem como distinguir, em código, "erro de digitação" de
 * "editoria legítima que saiu do menu", e tentar seria inventar regra de produto
 * sem evidência. A correção é higiene de dados — e, depois dela, o slug fica com
 * zero artigos e passa a responder 404 sem uma linha de código nova.
 */
export function decideCategory(p: CategoryDecisionInput): RouteDecision {
  if (p.state === "unavailable") return decideUnavailable(p.hasStale === true);
  if (p.state === "notFound") return { status: 404, action: "notFound", noindex: true };
  if (p.total > 0) return { status: 200, action: "render" };
  if (p.declared) return { status: 200, action: "render", noindex: true };
  return { status: 404, action: "notFound", noindex: true };
}
