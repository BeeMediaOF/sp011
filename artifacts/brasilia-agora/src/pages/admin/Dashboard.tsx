import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article, type AnalyticsStats, type Ad } from "../../lib/adminApi";
import { FileText, CheckCircle, Clock, Menu, Settings, Eye, TrendingUp, Megaphone, Zap } from "lucide-react";
import { Link } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

const CAT_COLORS = ["#c8102e", "#0b3d91", "#16a34a", "#f59e0b", "#6b21a8", "#0284c7"];

export default function Dashboard() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.getArticles().then((r) => setArticles(r.articles)).catch(() => {}),
      adminApi.getAnalyticsStats().then(setStats).catch(() => {}),
      adminApi.getAds().then((r) => setAds(r.ads)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const published = articles.filter((a) => a.status === "published").length;
  const drafts = articles.filter((a) => a.status === "draft").length;
  const activeAds = ads.filter((a) => a.active).length;

  const articleStats = [
    { label: "Total de Artigos", value: articles.length, icon: FileText, color: "bg-blue-500" },
    { label: "Publicados",       value: published,        icon: CheckCircle, color: "bg-green-500" },
    { label: "Rascunhos",        value: drafts,           icon: Clock,       color: "bg-yellow-500" },
  ];

  const analyticsStats = [
    { label: "Views Hoje",        value: stats?.totals.today ?? 0,  icon: Eye,        color: "bg-[#c8102e]" },
    { label: "Views esta semana", value: stats?.totals.week ?? 0,   icon: TrendingUp, color: "bg-[#0b3d91]" },
    { label: "Propagandas ativas",value: activeAds,                  icon: Megaphone,  color: "bg-purple-600" },
    { label: "Total histórico",   value: stats?.totals.allTime ?? 0, icon: Zap,        color: "bg-orange-500" },
  ];

  const last7 = stats?.dailyChart.slice(-7).map((d) => ({
    date: d.date.slice(5),
    views: d.views,
  })) ?? [];

  const shortcuts = [
    { label: "Novo Artigo",  href: "/admin/artigos/novo",   icon: FileText,  desc: "Criar e publicar conteúdo" },
    { label: "Editar Menu",  href: "/admin/menu",           icon: Menu,      desc: "Gerenciar itens de navegação" },
    { label: "Configurações",href: "/admin/configuracoes",  icon: Settings,  desc: "Logo, nome do site e mais" },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">

        {/* Article stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {articleStats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
              <div className={`${color} text-white p-3 rounded-lg`}><Icon size={20} /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{loading ? "—" : value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Analytics bignumbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {analyticsStats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-3">
              <div className={`${color} text-white p-2.5 rounded-lg`}><Icon size={18} /></div>
              <div>
                <p className="text-xl font-bold text-gray-800">{loading ? "—" : value.toLocaleString("pt-BR")}</p>
                <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Line chart */}
          <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Pageviews — últimos 7 dias</h2>
            {last7.length === 0 || last7.every((d) => d.views === 0) ? (
              <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sem dados ainda</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={last7}>
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c8102e" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#c8102e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <Area type="monotone" dataKey="views" stroke="#c8102e" strokeWidth={2} fill="url(#colorViews)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top categories */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Top Categorias</h2>
            {!stats || stats.topCategories.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.topCategories.slice(0, 5)} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <Bar dataKey="views" radius={[0, 4, 4, 0]}>
                    {stats.topCategories.slice(0, 5).map((_, i) => (
                      <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bottom row: top articles + active ads + quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Top articles */}
          <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Mais lidas</h2>
              <Link href="/admin/artigos" className="text-xs text-[#1a2448] hover:underline">Ver todos</Link>
            </div>
            {!stats || stats.topArticles.length === 0 ? (
              <div className="text-center text-gray-300 text-sm py-6">Sem dados de leitura ainda</div>
            ) : (
              <div className="space-y-2">
                {stats.topArticles.slice(0, 5).map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-gray-300 w-4">{i + 1}</span>
                    <p className="flex-1 text-sm text-gray-700 truncate">{a.title}</p>
                    <span className="text-xs text-gray-400 font-medium shrink-0">{a.views} views</span>
                  </div>
                ))}
              </div>
            )}
            {/* Recent articles fallback if no analytics */}
            {(!stats || stats.topArticles.length === 0) && articles.length > 0 && (
              <div className="space-y-2">
                {articles.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <p className="flex-1 text-sm text-gray-700 truncate">{a.title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {a.status === "published" ? "Publicado" : "Rascunho"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active ads + quick actions */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Propagandas Ativas</h2>
                <Link href="/admin/propagandas" className="text-xs text-[#1a2448] hover:underline">Gerenciar</Link>
              </div>
              {ads.filter((a) => a.active).length === 0 ? (
                <p className="text-xs text-gray-400">Nenhuma ativa</p>
              ) : (
                <div className="space-y-2">
                  {ads.filter((a) => a.active).slice(0, 3).map((ad) => (
                    <div key={ad.id} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                      <p className="text-xs text-gray-700 truncate flex-1">{ad.name}</p>
                      <span className="text-[10px] text-gray-400">{ad.position}</span>
                    </div>
                  ))}
                  {ads.filter((a) => a.active).length > 3 && (
                    <p className="text-[11px] text-gray-400">+{ads.filter((a) => a.active).length - 3} mais</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Ações rápidas</h2>
              <div className="space-y-2">
                {shortcuts.map(({ label, href, icon: Icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
                    <div className="w-7 h-7 bg-[#1a2448]/10 rounded-lg flex items-center justify-center group-hover:bg-[#1a2448] transition-colors">
                      <Icon size={14} className="text-[#1a2448] group-hover:text-white transition-colors" />
                    </div>
                    <span className="text-sm text-gray-700">{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </AdminLayout>
  );
}
