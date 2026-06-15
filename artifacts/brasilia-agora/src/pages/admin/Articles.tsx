import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import { Plus, Pencil, Trash2, Send, Search, Rss, Wand2, Filter } from "lucide-react";
import { Link } from "wouter";

type FilterTab = "all" | "published" | "draft" | "rss" | "ai";

const TAB_LABELS: Record<FilterTab, string> = {
  all:       "Todos",
  published: "Publicados",
  draft:     "Rascunhos",
  rss:       "Importados RSS",
  ai:        "Reescritos com IA",
};

export default function Articles() {
  const [articles, setArticles]   = useState<Article[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [tab, setTab]             = useState<FilterTab>("all");
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    adminApi.getArticles()
      .then((r) => setArticles(r.articles))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este artigo permanentemente?")) return;
    setDeleting(id);
    try {
      await adminApi.deleteArticle(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ } finally { setDeleting(null); }
  }

  async function handlePublish(id: string) {
    setPublishing(id);
    try {
      const { article } = await adminApi.publishArticle(id);
      setArticles((prev) => prev.map((a) => a.id === id ? article : a));
    } catch { /* ignore */ } finally { setPublishing(null); }
  }

  // ── Filter chain ──
  const byTab = articles.filter((a) => {
    if (tab === "published") return a.status === "published";
    if (tab === "draft")     return a.status === "draft";
    if (tab === "rss")       return a.origin === "rss";
    if (tab === "ai")        return a.aiRewritten === true;
    return true;
  });

  const filtered = byTab.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.rssSourceName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase())
  );

  // ── Tab counts ──
  const counts: Record<FilterTab, number> = {
    all:       articles.length,
    published: articles.filter((a) => a.status === "published").length,
    draft:     articles.filter((a) => a.status === "draft").length,
    rss:       articles.filter((a) => a.origin === "rss").length,
    ai:        articles.filter((a) => a.aiRewritten === true).length,
  };

  return (
    <AdminLayout title="Artigos">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, fonte ou categoria…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
            />
          </div>
          <Link
            href="/admin/artigos/novo"
            className="flex items-center gap-2 bg-[#1a2448] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#243060] transition-colors whitespace-nowrap"
          >
            <Plus size={15} /> Novo Artigo
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(TAB_LABELS) as FilterTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t
                  ? "bg-[#1a2448] text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {t === "rss" && <Rss size={11} />}
              {t === "ai"  && <Wand2 size={11} />}
              {t === "all" && <Filter size={11} />}
              {TAB_LABELS[t]}
              <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t ? "bg-white/20" : "bg-gray-100 text-gray-500"
              }`}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {search ? "Nenhum artigo encontrado para esta busca" : "Nenhum artigo nesta categoria"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Título</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Categoria</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Data</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 line-clamp-1 leading-snug">{a.title}</p>
                        {a.subtitle && (
                          <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{a.subtitle}</p>
                        )}
                        {/* Origin badges */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {a.origin === "rss" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                              <Rss size={9} />
                              {a.rssSourceName ? a.rssSourceName : "RSS"}
                            </span>
                          )}
                          {a.aiRewritten && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                              <Wand2 size={9} />
                              IA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 capitalize hidden md:table-cell text-xs">
                        {a.category}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          a.status === "published"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {a.status === "published" ? "Publicado" : "Rascunho"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                        {new Date(a.updatedAt).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {a.status === "draft" && (
                            <button
                              onClick={() => { void handlePublish(a.id); }}
                              disabled={publishing === a.id}
                              title="Publicar agora"
                              className="text-green-500 hover:text-green-700 disabled:opacity-40 transition-colors"
                            >
                              <Send size={15} />
                            </button>
                          )}
                          <Link
                            href={`/admin/artigos/${a.id}`}
                            className="text-blue-500 hover:text-blue-700 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </Link>
                          <button
                            onClick={() => { void handleDelete(a.id); }}
                            disabled={deleting === a.id}
                            title="Excluir"
                            className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-right">
          {filtered.length} artigo(s) exibido(s)
        </p>
      </div>
    </AdminLayout>
  );
}
