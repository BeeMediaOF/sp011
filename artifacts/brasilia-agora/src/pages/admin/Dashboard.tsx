import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article, type AnalyticsStats, type Ad } from "../../lib/adminApi";
import {
  FileText, CheckCircle, Clock, Settings, Eye, TrendingUp, Megaphone,
  Zap, ArrowRight, PlusCircle, Globe, BarChart2, Radio, Pencil,
} from "lucide-react";
import { Link } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

const CAT_COLORS = ["#c8102e", "#0b3d91", "#16a34a", "#f59e0b", "#6b21a8", "#0284c7"];

const EDITORIAL_COLOR: Record<string, string> = {
  politica:   "#c8102e",
  esportes:   "#16a34a",
  economia:   "#f59e0b",
  cultura:    "#6b21a8",
  tecnologia: "#0284c7",
  saude:      "#0891b2",
};

function categoryColor(cat?: string) {
  return EDITORIAL_COLOR[cat?.toLowerCase() ?? ""] ?? "#0b3d91";
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default function Dashboard() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [stats, setStats]       = useState<AnalyticsStats | null>(null);
  const [ads, setAds]           = useState<Ad[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.getArticles().then((r) => setArticles(r.articles)).catch(() => {}),
      adminApi.getAnalyticsStats().then(setStats).catch(() => {}),
      adminApi.getAds().then((r) => setAds(r.ads)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const published  = articles.filter((a) => a.status === "published");
  const drafts     = articles.filter((a) => a.status === "draft");
  const activeAds  = ads.filter((a) => a.active);

  const recentPubs = [...published]
    .sort((a, b) =>
      new Date(b.updatedAt ?? b.createdAt ?? "").getTime() -
      new Date(a.updatedAt ?? a.createdAt ?? "").getTime()
    )
    .slice(0, 6);

  const last7 = stats?.dailyChart?.slice(-7).map((d) => ({
    date:  d.date.slice(5),
    views: d.views,
  })) ?? [];

  const todayViews = stats?.totals?.today   ?? 0;
  const weekViews  = stats?.totals?.week    ?? 0;
  const hasData    = last7.some((d) => d.views > 0);

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-5">

        {/* ── Status bar ──────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-[#1a2448] to-[#0b3d91] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <Radio size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Portal no ar</p>
              <p className="text-white/60 text-xs">
                {loading
                  ? "Carregando…"
                  : `${published.length} artigo${published.length !== 1 ? "s" : ""} publicado${published.length !== 1 ? "s" : ""} · ${activeAds.length} propaganda${activeAds.length !== 1 ? "s" : ""} ativa${activeAds.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/artigos/novo"
              className="flex items-center gap-1.5 bg-white text-[#1a2448] text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
            >
              <PlusCircle size={14} /> Novo artigo
            </Link>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-white/20 transition-colors border border-white/20"
            >
              <Globe size={14} /> Ver site
            </a>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Publicados",      value: published.length, icon: CheckCircle, bg: "bg-green-50",  text: "text-green-600" },
            { label: "Rascunhos",       value: drafts.length,    icon: Clock,       bg: "bg-yellow-50", text: "text-yellow-600" },
            { label: "Views hoje",      value: todayViews,       icon: Eye,         bg: "bg-red-50",    text: "text-[#c8102e]" },
            { label: "Views esta semana",value: weekViews,       icon: TrendingUp,  bg: "bg-blue-50",   text: "text-[#0b3d91]" },
          ].map(({ label, value, icon: Icon, bg, text }) => (
            <div key={label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
              <div className={`${bg} p-2.5 rounded-lg`}>
                <Icon size={18} className={text} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800 leading-none">
                  {loading ? <span className="text-gray-200 animate-pulse">—</span> : value.toLocaleString("pt-BR")}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Charts row ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <BarChart2 size={15} className="text-gray-400" /> Pageviews — últimos 7 dias
              </h2>
              {hasData && (
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                  {weekViews.toLocaleString("pt-BR")} esta semana
                </span>
              )}
            </div>
            {!hasData ? (
              <div className="h-36 flex flex-col items-center justify-center text-gray-300 gap-2">
                <BarChart2 size={28} />
                <p className="text-sm">Sem dados de acesso ainda</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={last7}>
                  <defs>
                    <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#c8102e" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#c8102e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}
                    formatter={(v: number) => [v.toLocaleString("pt-BR"), "views"]}
                  />
                  <Area type="monotone" dataKey="views" stroke="#c8102e" strokeWidth={2.5} fill="url(#gViews)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Top categorias</h2>
            <p className="text-[10px] text-gray-400 mb-3">por acessos (barras) e artigos publicados</p>
            {!stats || (stats.topCategories?.length ?? 0) === 0 ? (
              <div className="h-36 flex flex-col items-center justify-center text-gray-300 gap-2">
                <FileText size={24} />
                <p className="text-sm">Sem dados</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={stats.topCategories.slice(0, 6)} layout="vertical" margin={{ right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={72} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      formatter={(v: number, name: string) => [v, name === "views" ? "Acessos" : "Artigos"]}
                    />
                    <Bar dataKey="views" name="Acessos" radius={[0, 3, 3, 0]} stackId="a">
                      {stats.topCategories.slice(0, 6).map((_e, i) => (
                        <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {stats.topCategories.slice(0, 5).map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                      <span className="flex-1 text-gray-600 truncate capitalize">{cat.name}</span>
                      <span className="text-gray-400">{cat.views > 0 ? `${cat.views} acesso${cat.views !== 1 ? "s" : ""}` : ""}</span>
                      <span className="font-semibold text-gray-700">{cat.articles} art.</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Bottom row ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Recent published articles */}
          <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Publicados recentes</h2>
              <Link href="/admin/artigos" className="text-xs text-[#1a2448] hover:underline flex items-center gap-1">
                Ver todos <ArrowRight size={11} />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recentPubs.length === 0 ? (
              <div className="text-center py-8 text-gray-300 flex flex-col items-center gap-2">
                <FileText size={28} />
                <p className="text-sm">Nenhum artigo publicado ainda</p>
                <Link href="/admin/artigos/novo" className="text-xs text-[#1a2448] hover:underline mt-1">
                  Criar primeiro artigo →
                </Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentPubs.map((a) => (
                  <Link
                    key={a.id}
                    href={`/admin/artigos/${a.id}`}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: categoryColor(a.category) }}
                    />
                    <p className="flex-1 text-sm text-gray-700 truncate group-hover:text-[#1a2448] transition-colors">
                      {a.title.replace(/<[^>]*>/g, "")}
                    </p>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize hidden sm:block"
                      style={{
                        backgroundColor: `${categoryColor(a.category)}18`,
                        color: categoryColor(a.category),
                      }}
                    >
                      {a.category ?? "Geral"}
                    </span>
                    <span className="text-[11px] text-gray-400 shrink-0 w-16 text-right">
                      {timeAgo(a.updatedAt ?? a.createdAt)}
                    </span>
                    <Pencil size={12} className="text-gray-300 group-hover:text-[#1a2448] transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {stats && (stats.topArticles?.length ?? 0) > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <TrendingUp size={11} /> Mais lidas
                </p>
                <div className="space-y-0.5">
                  {stats.topArticles.slice(0, 3).map((a, i) => (
                    <div key={a.id} className="flex items-center gap-3 px-2 py-1.5">
                      <span className="text-[11px] font-bold text-gray-200 w-3 text-right">{i + 1}</span>
                      <p className="flex-1 text-sm text-gray-600 truncate">{a.title.replace(/<[^>]*>/g, "")}</p>
                      <span className="text-xs text-gray-400 shrink-0">{a.views.toLocaleString("pt-BR")} views</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">

            {/* Active ads */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Megaphone size={14} className="text-purple-500" /> Propagandas
                </h2>
                <Link href="/admin/propagandas" className="text-xs text-[#1a2448] hover:underline">Gerenciar</Link>
              </div>
              {activeAds.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">Nenhuma propaganda ativa</p>
              ) : (
                <div className="space-y-2.5">
                  {activeAds.slice(0, 4).map((ad) => (
                    <div key={ad.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                        <p className="text-xs text-gray-700 truncate flex-1 font-medium">{ad.name}</p>
                        <span className="text-[10px] text-gray-400 shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">{ad.position}</span>
                      </div>
                      <div className="flex gap-3 pl-4 text-[10px]">
                        <span className="flex items-center gap-1 text-blue-600">
                          <span>👁</span>
                          <span>{(ad.impressions ?? 0).toLocaleString("pt-BR")} views</span>
                        </span>
                        <span className="flex items-center gap-1 text-[#c8102e]">
                          <span>🖱</span>
                          <span>{(ad.clicks ?? 0).toLocaleString("pt-BR")} cliques</span>
                        </span>
                        {(ad.impressions ?? 0) > 0 && (
                          <span className="text-gray-400">
                            CTR {((ad.clicks / ad.impressions) * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {activeAds.length > 4 && (
                    <p className="text-[11px] text-gray-400 pl-4">+{activeAds.length - 4} mais</p>
                  )}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold text-gray-800">{activeAds.length}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Ativas</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-[#0b3d91]">{ads.reduce((s, a) => s + (a.impressions ?? 0), 0).toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Views</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-[#c8102e]">{ads.reduce((s, a) => s + (a.clicks ?? 0), 0).toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Cliques</p>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Ações rápidas</h2>
              <div className="space-y-0.5">
                {[
                  { label: "Novo artigo",    href: "/admin/artigos/novo",  icon: PlusCircle, desc: "Criar e publicar conteúdo" },
                  { label: "Blocos da home", href: "/admin/home-blocos",   icon: Zap,        desc: "Layout e cabeçalho" },
                  { label: "Propagandas",    href: "/admin/propagandas",   icon: Megaphone,  desc: "Gerenciar anúncios" },
                  { label: "Configurações",  href: "/admin/configuracoes", icon: Settings,   desc: "Logo, cores e mais" },
                ].map(({ label, href, icon: Icon, desc }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-[#1a2448] transition-colors">
                      <Icon size={14} className="text-[#1a2448] group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 group-hover:text-[#1a2448] font-medium leading-tight">{label}</p>
                      <p className="text-[10px] text-gray-400 truncate">{desc}</p>
                    </div>
                    <ArrowRight size={12} className="text-gray-300 group-hover:text-[#1a2448] transition-colors shrink-0" />
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
