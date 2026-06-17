import React, { useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  Search, Wand2, Send, Loader2, ExternalLink, CheckCircle,
  AlertCircle, RefreshCw, ChevronDown, ChevronUp, Zap,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const token = () => localStorage.getItem("admin_token") ?? "";

const CATEGORIES = [
  "cidade","politica","seguranca","transporte","saude",
  "educacao","cultura","esportes","economia","tecnologia",
  "brasil","mundo","geral",
];

interface PerplexityArticle {
  title: string;
  excerpt: string;
  fullText: string;
  sourceUrl: string;
  sourceName: string;
  imageUrl: string;
  publishedAt: string;
}

interface RewriteResult {
  rewritten: string;
  keywords: string;
  slug: string;
  title: string;
  subtitle: string;
}

interface ArticleState {
  article: PerplexityArticle;
  expanded: boolean;
  rewriting: boolean;
  rewritten: RewriteResult | null;
  publishing: boolean;
  published: boolean;
  error: string | null;
  category: string;
  status: "draft" | "published";
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}api/admin/perplexity/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data;
}

export default function PerplexitySearch() {
  const [query, setQuery]         = useState("");
  const [maxResults, setMaxResults] = useState(5);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [articles, setArticles]   = useState<ArticleState[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setArticles([]);
    try {
      const res = await apiPost<{ articles: PerplexityArticle[] }>("search", {
        query: query.trim(),
        maxResults,
      });
      setArticles(
        (res.articles ?? []).map((a) => ({
          article: a,
          expanded: false,
          rewriting: false,
          rewritten: null,
          publishing: false,
          published: false,
          error: null,
          category: "cidade",
          status: "draft",
        }))
      );
    } catch (err) {
      setSearchError(String(err));
    } finally {
      setSearching(false);
    }
  }

  function updateArticle(idx: number, patch: Partial<ArticleState>) {
    setArticles((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  async function handleRewrite(idx: number) {
    const s = articles[idx]!;
    updateArticle(idx, { rewriting: true, error: null });
    try {
      const res = await apiPost<RewriteResult>("rewrite", {
        title:      s.article.title,
        text:       s.article.fullText || s.article.excerpt,
        sourceName: s.article.sourceName,
      });
      updateArticle(idx, { rewriting: false, rewritten: res, expanded: true });
    } catch (err) {
      updateArticle(idx, { rewriting: false, error: String(err) });
    }
  }

  async function handlePublish(idx: number) {
    const s = articles[idx]!;
    if (!s.rewritten) return;
    updateArticle(idx, { publishing: true, error: null });
    try {
      await apiPost("publish", {
        title:      s.rewritten.title      || s.article.title,
        subtitle:   s.rewritten.subtitle   || s.article.excerpt,
        content:    s.rewritten.rewritten,
        imageUrl:   s.article.imageUrl,
        category:   s.category,
        keywords:   s.rewritten.keywords,
        slug:       s.rewritten.slug,
        sourceUrl:  s.article.sourceUrl,
        sourceName: s.article.sourceName,
        status:     s.status,
      });
      updateArticle(idx, { publishing: false, published: true });
    } catch (err) {
      updateArticle(idx, { publishing: false, error: String(err) });
    }
  }

  async function handleRewriteAndPublish(idx: number) {
    const s = articles[idx]!;
    updateArticle(idx, { rewriting: true, error: null });
    let rewritten: RewriteResult;
    try {
      rewritten = await apiPost<RewriteResult>("rewrite", {
        title:      s.article.title,
        text:       s.article.fullText || s.article.excerpt,
        sourceName: s.article.sourceName,
      });
      updateArticle(idx, { rewriting: false, rewritten, publishing: true });
    } catch (err) {
      updateArticle(idx, { rewriting: false, error: String(err) });
      return;
    }
    try {
      await apiPost("publish", {
        title:      rewritten.title      || s.article.title,
        subtitle:   rewritten.subtitle   || s.article.excerpt,
        content:    rewritten.rewritten,
        imageUrl:   s.article.imageUrl,
        category:   s.category,
        keywords:   rewritten.keywords,
        slug:       rewritten.slug,
        sourceUrl:  s.article.sourceUrl,
        sourceName: s.article.sourceName,
        status:     s.status,
      });
      updateArticle(idx, { publishing: false, published: true });
    } catch (err) {
      updateArticle(idx, { publishing: false, error: String(err) });
    }
  }

  return (
    <AdminLayout title="Busca Perplexity">
      {/* ── Search bar ── */}
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#0b3d91] flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Busca Inteligente de Notícias</h2>
              <p className="text-xs text-gray-500">
                Pesquise notícias recentes via Perplexity, reescreva com IA e publique diretamente
              </p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: São Bernardo do Campo trânsito, saúde pública SBC..."
                className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]/30 focus:border-[#0b3d91]"
              />
            </div>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]/30"
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>{n} notícias</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0b3d91] text-white rounded-lg text-sm font-medium hover:bg-[#0b3d91]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {searchError && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              <AlertCircle size={16} className="shrink-0" />
              {searchError}
            </div>
          )}
        </div>

        {/* ── Results ── */}
        {articles.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 font-medium">
              {articles.length} resultado{articles.length !== 1 ? "s" : ""} encontrado{articles.length !== 1 ? "s" : ""} para "{query}"
            </p>

            {articles.map((s, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                  s.published ? "border-green-300" : ""
                }`}
              >
                {/* Card header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Origin badge */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0b3d91]/10 text-[#0b3d91] uppercase tracking-wide">
                          <Zap size={10} />
                          Perplexity
                        </span>
                        {s.article.sourceName && (
                          <span className="text-[11px] text-gray-400">{s.article.sourceName}</span>
                        )}
                        {s.published && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase">
                            <CheckCircle size={10} />
                            Publicado
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-gray-800 leading-snug">
                        {s.article.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.article.excerpt}</p>
                    </div>

                    {s.article.sourceUrl && (
                      <a
                        href={s.article.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-[#0b3d91] shrink-0 mt-0.5"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>

                  {/* Controls */}
                  {!s.published && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={s.category}
                        onChange={(e) => updateArticle(idx, { category: e.target.value })}
                        className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#0b3d91]/30"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                      </select>

                      <select
                        value={s.status}
                        onChange={(e) => updateArticle(idx, { status: e.target.value as "draft" | "published" })}
                        className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#0b3d91]/30"
                      >
                        <option value="draft">Rascunho</option>
                        <option value="published">Publicar</option>
                      </select>

                      <button
                        onClick={() => updateArticle(idx, { expanded: !s.expanded })}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded border hover:bg-gray-50"
                      >
                        {s.expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {s.expanded ? "Recolher" : "Ver texto"}
                      </button>

                      <button
                        onClick={() => handleRewrite(idx)}
                        disabled={s.rewriting || s.publishing}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#0b3d91] text-[#0b3d91] hover:bg-[#0b3d91]/5 disabled:opacity-50 transition-colors"
                      >
                        {s.rewriting ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                        Reescrever
                      </button>

                      <button
                        onClick={() => handleRewriteAndPublish(idx)}
                        disabled={s.rewriting || s.publishing}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#c8102e] text-white hover:bg-[#c8102e]/90 disabled:opacity-50 transition-colors"
                      >
                        {s.rewriting || s.publishing
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Zap size={13} />
                        }
                        {s.rewriting ? "Reescrevendo..." : s.publishing ? "Publicando..." : "Reescrever e Publicar"}
                      </button>
                    </div>
                  )}

                  {s.error && (
                    <div className="mt-2 flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle size={13} className="shrink-0" />
                      {s.error}
                    </div>
                  )}
                </div>

                {/* Expanded: original text */}
                {s.expanded && (
                  <div className="border-t bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Texto coletado</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {s.article.fullText || s.article.excerpt}
                    </p>
                  </div>
                )}

                {/* Rewritten preview */}
                {s.rewritten && (
                  <div className="border-t">
                    <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                          <Wand2 size={12} />
                          Texto reescrito pela IA
                        </p>
                        {!s.published && (
                          <button
                            onClick={() => handlePublish(idx)}
                            disabled={s.publishing}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {s.publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            {s.publishing ? "Publicando..." : "Publicar agora"}
                          </button>
                        )}
                      </div>
                      {s.rewritten.title && (
                        <p className="text-sm font-bold text-gray-800 mb-1">{s.rewritten.title}</p>
                      )}
                      {s.rewritten.subtitle && (
                        <p className="text-xs text-gray-600 italic mb-2">{s.rewritten.subtitle}</p>
                      )}
                      <div
                        className="text-xs text-gray-700 leading-relaxed prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: s.rewritten.rewritten }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!searching && articles.length === 0 && !searchError && (
          <div className="text-center py-16 text-gray-400">
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Digite um tema para buscar as notícias mais recentes</p>
            <p className="text-xs mt-1 opacity-70">
              Ex: "saúde pública São Bernardo", "obras cidade", "concurso público SBC"
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
