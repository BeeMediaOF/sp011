/**
 * Classificação de path do middleware de SSR (PRD-PERF-05) — sem tocar em rede.
 *
 * Mora aqui, e não dentro do `vite.config.ts`, para ter teste: é a função que
 * decide o que NUNCA pode ser renderizado no servidor (o painel, os assets, a
 * API). Um falso positivo aqui não é lentidão, é o painel vazando para o HTML
 * público ou um .jpg respondido como documento.
 */

import { STATIC_PAGE_PATHS } from "./categoryRoutes";

export type SsrRouteKind = "home" | "article" | "category" | "static" | "unknown";

export interface SsrRoute {
  kind: SsrRouteKind;
  /** Chave do cache de HTML (o host entra na chave final, não aqui). */
  key: string;
  /** Slug do artigo ou da editoria; vazio na home. */
  slug: string;
}

const ARTICLE_PATH_RE = /^\/artigo\/([^/]+)$/;

/**
 * `null` = o path não é candidato a SSR (segue para a SPA). "category" é só
 * candidato: quem confirma é o `resolveCategoryRoute`, que precisa do menu do
 * portal e portanto de uma ida ao /api/site.
 */
export function classifySsrPath(pathOnly: string): SsrRoute | null {
  const p = pathOnly || "/";
  if (p === "/" || p === "//" || p === "/index.html") return { kind: "home", key: "home", slug: "" };
  /* Barra final não é normalizada: o SSR renderiza com o path que o wouter vai
     receber no cliente, e "/futebol/" pode não casar a mesma rota que
     "/futebol". Servir a página certa para uma URL que o cliente resolve de
     outro jeito é trocar lentidão por hidratação quebrada — melhor deixar a
     SPA responder, como antes deste PRD. */
  if (p.endsWith("/")) return null;
  // Painel JAMAIS renderiza no servidor; assets e /api seguem o fluxo normal.
  if (p.startsWith("/api/") || /^\/admin(\/|$)/.test(p) || /\.[a-zA-Z0-9]+$/.test(p)) return null;
  const art = ARTICLE_PATH_RE.exec(p);
  if (art?.[1]) return { kind: "article", key: `artigo:${art[1]}`, slug: art[1] };
  /* Páginas institucionais existem sempre: não passam pela pergunta "esta
     editoria tem conteúdo?" e portanto nunca viram 404. */
  if (STATIC_PAGE_PATHS.has(p)) return { kind: "static", key: `static:${p}`, slug: p.slice(1) };
  if (/^\/[^/]+$/.test(p)) return { kind: "category", key: `cat:${p.slice(1)}`, slug: p.slice(1) };
  /* Sobrou path de dois ou mais segmentos que não é artigo, painel, API nem
     arquivo: no App não existe rota assim. Antes caía no `null` e o fallback
     respondia 200 com o shell — o soft-404 universal, que fazia
     `/rota-inventada-xyz` e `/caminho/de/dois` "existirem" em todo blog. */
  return { kind: "unknown", key: `unknown:${p}`, slug: "" };
}
