import { useState, useEffect } from "react";

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

async function doFetch() {
  try {
    const r = await fetch("/api/articles");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json() as { articles: Article[] };
    _cache = data.articles ?? [];
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
          _articleCache.set(id, { article: data.article, at: Date.now() });
          setArticle(data.article);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  return { article, loading };
}
