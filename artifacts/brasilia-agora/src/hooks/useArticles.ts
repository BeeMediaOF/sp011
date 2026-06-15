import { useState, useEffect } from "react";

export interface Article {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  category: string;
  tag: string;
  imageUrl: string;
  author: string;
  publishedAt: string;
  origin?: "manual" | "rss";
  rssSourceId?: string;
  rssSourceName?: string;
  rssSourceUrl?: string;
  aiRewritten?: boolean;
}

// ─── Singleton module-level cache ─────────────────────────────────────────────
let _cache: Article[] | null = null;
let _fetch: Promise<void> | null = null;

export function invalidateArticlesCache() {
  _cache = null;
  _fetch = null;
}

export function useArticles() {
  const [articles, setArticles] = useState<Article[]>(_cache ?? []);
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    if (_cache) {
      setArticles(_cache);
      setLoading(false);
      return;
    }

    if (!_fetch) {
      _fetch = fetch("/api/articles")
        .then((r) => r.json())
        .then((data) => { _cache = data.articles ?? []; })
        .catch(() => {});
    }

    _fetch.then(() => {
      if (_cache) setArticles(_cache);
      setLoading(false);
    });
  }, []);

  return { articles, loading };
}

export function useArticle(id: string) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    fetch(`/api/articles/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setArticle(data.article ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  return { article, loading };
}
