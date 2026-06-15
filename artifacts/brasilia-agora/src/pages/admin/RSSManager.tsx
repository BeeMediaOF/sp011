import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  Plus, Trash2, RefreshCw, Wand2, Send, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, Rss, ExternalLink,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const token = () => localStorage.getItem("admin_token") ?? "";

interface RssSource {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  createdAt: string;
}

interface FetchedArticle {
  sourceId: string;
  sourceName: string;
  category: string;
  title: string;
  link: string;
  pubDate: string;
  imageUrl: string;
  excerpt: string;
  fullText: string;
}

interface ArticleState extends FetchedArticle {
  rewritten?: string;
  rewriting?: boolean;
  importing?: boolean;
  imported?: boolean;
  error?: string;
  expanded?: boolean;
  editTitle?: string;
  editSubtitle?: string;
  editContent?: string;
}

const CATEGORIES = [
  "politica", "cidade", "seguranca", "transporte", "saude",
  "educacao", "cultura", "esportes", "economia", "tecnologia", "geral",
];

const TAG_MAP: Record<string, string> = {
  politica: "POLÍTICA", cidade: "CIDADE", seguranca: "SEGURANÇA",
  transporte: "TRANSPORTE", saude: "SAÚDE", educacao: "EDUCAÇÃO",
  cultura: "CULTURA", esportes: "ESPORTES", economia: "ECONOMIA",
  tecnologia: "TECNOLOGIA", geral: "GERAL",
};

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}api/admin/rss${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export default function RSSManager() {
  const [sources, setSources] = useState<RssSource[]>([]);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCat, setNewCat] = useState("geral");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [articles, setArticles] = useState<ArticleState[]>([]);

  const loadSources = useCallback(async () => {
    try {
      const data = await apiFetch<{ sources: RssSource[] }>("/sources");
      setSources(data.sources);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { void loadSources(); }, [loadSources]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) { setAddError("Nome e URL são obrigatórios"); return; }
    setAdding(true); setAddError("");
    try {
      await apiFetch<{ source: RssSource }>("/sources", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), url: newUrl.trim(), category: newCat }),
      });
      setNewName(""); setNewUrl(""); setNewCat("geral");
      await loadSources();
    } catch (e) {
      setAddError(String(e));
    } finally { setAdding(false); }
  }

  async function deleteSource(id: string) {
    if (!confirm("Remover esta fonte RSS?")) return;
    try {
      await apiFetch(`/sources/${id}`, { method: "DELETE" });
      await loadSources();
      setArticles((prev) => prev.filter((a) => a.sourceId !== id));
    } catch (e) { alert(String(e)); }
  }

  async function toggleSource(src: RssSource) {
    try {
      await apiFetch(`/sources/${src.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !src.active }),
      });
      await loadSources();
    } catch (e) { alert(String(e)); }
  }

  async function fetchArticles() {
    setFetching(true); setFetchError(""); setArticles([]);
    try {
      const data = await apiFetch<{ articles: FetchedArticle[] }>("/fetch", {
        method: "POST",
        body: JSON.stringify(selectedSource === "all" ? {} : { sourceId: selectedSource }),
      });
      setArticles(data.articles.map((a) => ({
        ...a,
        editTitle: a.title,
        editSubtitle: a.excerpt.slice(0, 160),
        editContent: a.fullText,
        expanded: false,
      })));
    } catch (e) {
      setFetchError(String(e));
    } finally { setFetching(false); }
  }

  function updateArticle(idx: number, patch: Partial<ArticleState>) {
    setArticles((prev) => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));
  }

  async function rewrite(idx: number) {
    const art = articles[idx];
    if (!art) return;
    updateArticle(idx, { rewriting: true, error: undefined });
    try {
      const data = await apiFetch<{ rewritten: string }>("/rewrite", {
        method: "POST",
        body: JSON.stringify({
          title: art.title,
          text: art.fullText || art.excerpt,
          sourceName: art.sourceName,
        }),
      });
      updateArticle(idx, {
        rewriting: false,
        rewritten: data.rewritten,
        editContent: data.rewritten,
        expanded: true,
      });
    } catch (e) {
      updateArticle(idx, { rewriting: false, error: String(e) });
    }
  }

  async function importArticle(idx: number, status: "draft" | "published") {
    const art = articles[idx];
    if (!art) return;
    updateArticle(idx, { importing: true, error: undefined });
    try {
      await apiFetch("/import", {
        method: "POST",
        body: JSON.stringify({
          title: art.editTitle ?? art.title,
          subtitle: art.editSubtitle ?? art.excerpt.slice(0, 160),
          content: art.editContent ?? art.fullText,
          category: art.category,
          tag: TAG_MAP[art.category] ?? "GERAL",
          imageUrl: art.imageUrl,
          author: `Redação (via ${art.sourceName})`,
          status,
        }),
      });
      updateArticle(idx, { importing: false, imported: true });
    } catch (e) {
      updateArticle(idx, { importing: false, error: String(e) });
    }
  }

  return (
    <AdminLayout title="Importar via RSS">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* ── Sources ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <Rss size={18} className="text-[#c8102e]" />
            <h2 className="font-semibold text-gray-800">Fontes RSS</h2>
          </div>

          <div className="p-6 space-y-4">
            <form onSubmit={(e) => { void addSource(e); }} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                <input
                  value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Correio Braziliense"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"
                />
              </div>
              <div className="flex-[2] min-w-[260px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">URL do Feed</label>
                <input
                  value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"
                />
              </div>
              <div className="min-w-[130px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
                <select
                  value={newCat} onChange={(e) => setNewCat(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{TAG_MAP[c] ?? c.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit" disabled={adding}
                className="flex items-center gap-2 bg-[#0b3d91] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0b3d91]/90 disabled:opacity-50 transition-colors"
              >
                <Plus size={16} /> {adding ? "Adicionando…" : "Adicionar"}
              </button>
            </form>
            {addError && <p className="text-sm text-red-500">{addError}</p>}

            {sources.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma fonte cadastrada</p>
            ) : (
              <div className="divide-y rounded-lg border overflow-hidden">
                {sources.map((src) => (
                  <div key={src.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                    <button
                      onClick={() => { void toggleSource(src); }}
                      className={`w-8 h-5 rounded-full transition-colors flex-shrink-0 ${src.active ? "bg-green-500" : "bg-gray-300"}`}
                      title={src.active ? "Desativar" : "Ativar"}
                    >
                      <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform mx-auto ${src.active ? "translate-x-1.5" : "-translate-x-0.5"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{src.name}</p>
                      <p className="text-xs text-gray-400 truncate">{src.url}</p>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">
                      {TAG_MAP[src.category] ?? src.category.toUpperCase()}
                    </span>
                    <button
                      onClick={() => { void deleteSource(src.id); }}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Fetch ────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <RefreshCw size={18} className="text-[#0b3d91]" />
            <h2 className="font-semibold text-gray-800">Buscar Artigos</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"
              >
                <option value="all">Todas as fontes ativas</option>
                {sources.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={() => { void fetchArticles(); }}
                disabled={fetching || sources.filter((s) => s.active).length === 0}
                className="flex items-center gap-2 bg-[#c8102e] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#c8102e]/90 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={16} className={fetching ? "animate-spin" : ""} />
                {fetching ? "Buscando…" : "Buscar Agora"}
              </button>
            </div>
            {fetchError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
                <AlertCircle size={16} /> {fetchError}
              </div>
            )}
          </div>
        </section>

        {/* ── Results ──────────────────────────────────────────────── */}
        {articles.length > 0 && (
          <section className="space-y-4">
            <p className="text-sm text-gray-500">{articles.length} artigo(s) encontrado(s)</p>
            {articles.map((art, idx) => (
              <div
                key={`${art.sourceId}-${idx}`}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden ${art.imported ? "opacity-60" : ""}`}
              >
                <div className="flex gap-4 p-4">
                  {art.imageUrl && (
                    <img
                      src={art.imageUrl}
                      alt=""
                      className="w-24 h-16 object-cover rounded-lg flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-[#c8102e] uppercase tracking-wide">
                        {TAG_MAP[art.category] ?? art.category}
                      </span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">{art.sourceName}</span>
                      {art.link && (
                        <a href={art.link} target="_blank" rel="noreferrer"
                          className="text-gray-400 hover:text-[#0b3d91] ml-auto flex-shrink-0">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800 text-sm leading-snug line-clamp-2">{art.title}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{art.excerpt}</p>
                  </div>
                </div>

                {/* Expand / edit area */}
                <div className="border-t px-4 py-3">
                  <button
                    onClick={() => updateArticle(idx, { expanded: !art.expanded })}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {art.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {art.expanded ? "Recolher" : "Editar / Publicar"}
                  </button>

                  {art.expanded && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                        <input
                          value={art.editTitle ?? art.title}
                          onChange={(e) => updateArticle(idx, { editTitle: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subtítulo</label>
                        <input
                          value={art.editSubtitle ?? ""}
                          onChange={(e) => updateArticle(idx, { editSubtitle: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Conteúdo
                          {art.rewritten && (
                            <span className="ml-2 text-green-600 font-medium">✓ Reescrito com IA</span>
                          )}
                        </label>
                        <textarea
                          value={art.editContent ?? art.fullText}
                          onChange={(e) => updateArticle(idx, { editContent: e.target.value })}
                          rows={8}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91] font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {art.error && (
                    <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={12} /> {art.error}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {art.imported ? (
                      <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                        <CheckCircle size={16} /> Importado!
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => { void rewrite(idx); }}
                          disabled={art.rewriting || art.importing}
                          className="flex items-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                          <Wand2 size={14} className={art.rewriting ? "animate-pulse" : ""} />
                          {art.rewriting ? "Reescrevendo…" : "Reescrever com IA"}
                        </button>
                        <button
                          onClick={() => { void importArticle(idx, "draft"); }}
                          disabled={art.importing || art.rewriting}
                          className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          <Send size={14} />
                          {art.importing ? "Salvando…" : "Salvar Rascunho"}
                        </button>
                        <button
                          onClick={() => { void importArticle(idx, "published"); }}
                          disabled={art.importing || art.rewriting}
                          className="flex items-center gap-1.5 bg-[#c8102e] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#c8102e]/90 disabled:opacity-50 transition-colors"
                        >
                          <Send size={14} />
                          {art.importing ? "Publicando…" : "Publicar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
