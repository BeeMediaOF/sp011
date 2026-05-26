import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import { Plus, Pencil, Trash2, Send, Search } from "lucide-react";
import { Link } from "wouter";

export default function Articles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
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
    if (!confirm("Excluir este artigo?")) return;
    setDeleting(id);
    try {
      await adminApi.deleteArticle(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ } finally {
      setDeleting(null);
    }
  }

  async function handlePublish(id: string) {
    setPublishing(id);
    try {
      const { article } = await adminApi.publishArticle(id);
      setArticles((prev) => prev.map((a) => a.id === id ? article : a));
    } catch { /* ignore */ } finally {
      setPublishing(null);
    }
  }

  const filtered = articles.filter(
    (a) => a.title.toLowerCase().includes(search.toLowerCase()) ||
           a.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title="Artigos">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar artigos..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
            />
          </div>
          <Link href="/admin/artigos/novo">
            <a className="flex items-center gap-2 bg-[#1a2448] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#243060] transition-colors">
              <Plus size={16} /> Novo Artigo
            </a>
          </Link>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {search ? "Nenhum artigo encontrado" : "Nenhum artigo cadastrado"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Título</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Categoria</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Atualizado</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 line-clamp-1">{a.title}</p>
                        <p className="text-xs text-gray-400 line-clamp-1">{a.subtitle}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 capitalize hidden md:table-cell">{a.category}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${a.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
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
                              onClick={() => handlePublish(a.id)}
                              disabled={publishing === a.id}
                              title="Publicar"
                              className="text-green-500 hover:text-green-700 disabled:opacity-40 transition-colors"
                            >
                              <Send size={15} />
                            </button>
                          )}
                          <Link href={`/admin/artigos/${a.id}`}>
                            <a className="text-blue-500 hover:text-blue-700 transition-colors" title="Editar">
                              <Pencil size={15} />
                            </a>
                          </Link>
                          <button
                            onClick={() => handleDelete(a.id)}
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
      </div>
    </AdminLayout>
  );
}
