import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import { FileText, CheckCircle, Clock, Menu, Settings } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getArticles()
      .then((r) => setArticles(r.articles))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const published = articles.filter((a) => a.status === "published").length;
  const drafts = articles.filter((a) => a.status === "draft").length;

  const stats = [
    { label: "Total de Artigos", value: articles.length, icon: FileText, color: "bg-blue-500" },
    { label: "Publicados",       value: published,        icon: CheckCircle, color: "bg-green-500" },
    { label: "Rascunhos",        value: drafts,           icon: Clock,       color: "bg-yellow-500" },
  ];

  const shortcuts = [
    { label: "Novo Artigo",  href: "/admin/artigos/novo",   icon: FileText,  desc: "Criar e publicar conteúdo" },
    { label: "Editar Menu",  href: "/admin/menu",           icon: Menu,      desc: "Gerenciar itens de navegação" },
    { label: "Configurações",href: "/admin/configuracoes",  icon: Settings,  desc: "Logo, nome do site e mais" },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
              <div className={`${color} text-white p-3 rounded-lg`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{loading ? "—" : value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick access */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Ações rápidas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {shortcuts.map(({ label, href, icon: Icon, desc }) => (
              <Link key={href} href={href}>
                <a className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer group block">
                  <div className="w-10 h-10 bg-[#1a2448]/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-[#1a2448] transition-colors">
                    <Icon size={20} className="text-[#1a2448] group-hover:text-white transition-colors" />
                  </div>
                  <p className="font-semibold text-gray-800 text-sm">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </a>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent articles */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Artigos recentes</h2>
            <Link href="/admin/artigos">
              <a className="text-xs text-[#1a2448] hover:underline">Ver todos</a>
            </Link>
          </div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Carregando...</div>
            ) : articles.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">Nenhum artigo ainda</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Título</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Categoria</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {articles.slice(0, 8).map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-800 font-medium truncate max-w-xs">{a.title}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell capitalize">{a.category}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${a.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {a.status === "published" ? "Publicado" : "Rascunho"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/artigos/${a.id}`}>
                          <a className="text-xs text-[#1a2448] hover:underline">Editar</a>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
