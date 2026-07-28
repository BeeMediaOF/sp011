import { useState, useEffect } from "react";
import { articlesUrl, listLimitForRoute } from "../lib/articlesQuery";

export interface Article {
  id: string;
  slug?: string;
  title: string;
  subtitle: string;
  content: string;
  category: string;
  tag: string;
  imageUrl: string;
  author: string;
  publishedAt: string;
  keywords?: string;
  origin?: "manual" | "rss";
  rssSourceId?: string;
  rssSourceName?: string;
  rssSourceUrl?: string;
  aiRewritten?: boolean;
  canonicalUrl?: string;
  /** Crédito da fonte: true/false força; null/ausente segue settings.showSourceCredit. */
  showSourceCredit?: boolean | null;
  /** Crédito da foto principal; vazio/ausente cai em rssSourceName. */
  imageCredit?: string;
  /** Crédito da foto: true/false força; null/ausente segue settings.showImageCredit. */
  showImageCredit?: boolean | null;
  /** Leituras registradas pelo analytics — ordena os blocos "Mais lidas". */
  views?: number;
  /** Tempo de leitura estimado em minutos (calculado no api-server; ausente em
   *  payload de imagem antiga — exibição sempre condicional). */
  readingMinutes?: number;
}

// ─── Singleton module-level cache (2 min TTL) ─────────────────────────────────
const ARTICLES_TTL = 2 * 60_000;

let _cache: Article[] | null = null;
let _cacheAt = 0;
let _fetch: Promise<void> | null = null;
const _subscribers = new Set<(a: Article[]) => void>();

function isCacheStale() {
  return !_cache || Date.now() - _cacheAt > ARTICLES_TTL;
}

function notifySubscribers() {
  if (_cache) _subscribers.forEach((cb) => cb(_cache!));
}

/** Consome a promessa de boot (prefetch inline no index.html) se disponível. */
function takeBoot(key: string): Promise<unknown> | null {
  if (typeof window === "undefined") return null;
  const boot = (window as unknown as { __BOOT__?: Record<string, Promise<unknown> | null> }).__BOOT__;
  const p = boot?.[key] ?? null;
  if (boot && p) boot[key] = null; // consome uma única vez
  return p;
}

function publishedTime(a: Article): number {
  const t = new Date(a.publishedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Mescla uma página de "mais recentes" no cache existente.
 *
 * A lista virou paginada (PRD-PERF-01) e o SSR semeia, além dos recentes, um pool
 * por categoria para as editorias de baixo volume (vite.config.ts). Um refetch de
 * 200 recentes que simplesmente SUBSTITUÍSSE o cache apagaria esse pool e blocos
 * da home cairiam em placeholder. Regra: dentro da janela coberta pela página
 * nova ela é a verdade (artigo despublicado some); item mais antigo que o corte
 * da página só ficou de fora por limite — permanece.
 */
function mergeRecent(prev: Article[] | null, next: Article[]): Article[] {
  if (!prev || prev.length === 0 || next.length === 0) return next;
  const oldest = next.reduce((min, a) => Math.min(min, publishedTime(a)), Infinity);
  const ids = new Set(next.map((a) => a.id));
  const extras = prev.filter((a) => !ids.has(a.id) && publishedTime(a) < oldest);
  return extras.length > 0 ? [...next, ...extras] : next;
}

async function doFetch() {
  try {
    let data = (await takeBoot("articles")) as { articles?: Article[] } | null;
    if (!data) {
      const r = await fetch(articlesUrl({ limit: listLimitForRoute(), offset: 0, sort: "recent" }));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json() as { articles: Article[] };
    }
    _cache = mergeRecent(_cache, data.articles ?? []);
    _cacheAt = Date.now();
    notifySubscribers();
  } catch { /* keep stale cache on error */ } finally {
    _fetch = null;
  }
}

export function invalidateArticlesCache() {
  _cache = null;
  _cacheAt = 0;
  _fetch = doFetch().catch(() => { _fetch = null; });
}

/**
 * Semeia o cache sincronamente (SSR no servidor; e no cliente antes de hidratar,
 * a partir de window.__SSR_DATA__). Mantém o 1º render do cliente igual ao do
 * servidor → sem mismatch de hidratação.
 */
export function seedArticles(articles: Article[]): void {
  _cache = articles;
  _cacheAt = Date.now();
  notifySubscribers();
}

export function useArticles() {
  const [articles, setArticles] = useState<Article[]>(_cache ?? []);
  const [loading, setLoading]   = useState(_cache === null);

  useEffect(() => {
    const subscriber = (a: Article[]) => { setArticles(a); setLoading(false); };
    _subscribers.add(subscriber);

    if (_cache) { setArticles(_cache); setLoading(false); }

    if (!_fetch && isCacheStale()) {
      _fetch = doFetch().catch(() => { _fetch = null; });
    }

    if (_fetch) {
      _fetch.then(() => { if (_cache) setArticles(_cache); setLoading(false); });
    }

    return () => { _subscribers.delete(subscriber); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { articles, loading };
}

// ─── Single-article cache (5 min TTL per slug/id) ────────────────────────────
const _articleCache = new Map<string, { article: Article; at: number }>();
const ARTICLE_TTL = 5 * 60_000;
/* Teto de entradas. No navegador o cache morre com a aba, mas este módulo também
   roda no processo de SSR (PRD-PERF-05), que fica de pé por semanas: sem teto,
   cada artigo renderizado deixaria o corpo inteiro na memória do container `web`
   para sempre. Map itera por ordem de inserção — descarta-se a mais antiga. */
const ARTICLE_CACHE_MAX = 60;

function rememberArticle(key: string, article: Article, at: number): void {
  _articleCache.delete(key);
  _articleCache.set(key, { article, at });
  while (_articleCache.size > ARTICLE_CACHE_MAX) {
    const oldest = _articleCache.keys().next().value;
    if (oldest === undefined) break;
    _articleCache.delete(oldest);
  }
}

/**
 * Semeia o cache do artigo único (SSR + hidratação) — o par de `seedArticles`
 * para a rota /artigo/:slug. Grava sob a chave CRUA da URL (é ela que o
 * `useArticle(slug)` procura no 1º render) e também sob o slug e o id do
 * artigo, para que uma navegação SPA que chegue pelo outro identificador
 * acerte o cache em vez de refazer o fetch.
 */
export function seedArticle(key: string, article: Article): void {
  const at = Date.now();
  for (const k of [key, article.slug, article.id]) {
    if (k) rememberArticle(k, article, at);
  }
}

export function useArticle(id: string) {
  const cached = _articleCache.get(id);
  const fresh  = cached && Date.now() - cached.at < ARTICLE_TTL ? cached.article : null;

  const [article, setArticle] = useState<Article | null>(fresh);
  const [loading, setLoading] = useState(fresh === null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    const hit = _articleCache.get(id);
    if (hit && Date.now() - hit.at < ARTICLE_TTL) {
      setArticle(hit.article);
      setLoading(false);
      return;
    }
    fetch(`/api/articles/${id}`)
      .then((r) => r.json())
      .then((data: { article?: Article }) => {
        if (data.article) {
          rememberArticle(id, data.article, Date.now());
          setArticle(data.article);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  return { article, loading };
}
