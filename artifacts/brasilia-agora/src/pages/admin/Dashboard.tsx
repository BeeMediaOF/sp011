import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article, type AnalyticsStats, type Ad } from "../../lib/adminApi";
import {
  FileText, Eye, TrendingUp, Megaphone, ArrowUpRight,
  Edit, LayoutGrid, Rss, Signal,
} from "lucide-react";
import { Link } from "wouter";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const CAT_COLORS: Record<string, string> = {
  cidades:    "#2563EB",
  política:   "#E71D36",
  politica:   "#E71D36",
  economia:   "#F59E0B",
  esportes:   "#16A34A",
  cultura:    "#7C3AED",
  tecnologia: "#0891b2",
  saude:      "#0891b2",
};

const CAT_COLORS_ARR = ["#2563EB","#E71D36","#F59E0B","#16A34A","#7C3AED","#64748B"];

function catColor(name?: string, idx = 0) {
  return CAT_COLORS[name?.toLowerCase() ?? ""] ?? CAT_COLORS_ARR[idx % CAT_COLORS_ARR.length];
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    + " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

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

  const published = articles.filter((a) => a.status === "published");
  const drafts    = articles.filter((a) => a.status === "draft");
  const activeAds = ads.filter((a) => a.active);

  const recentArticles = [...articles]
    .sort((a, b) =>
      new Date(b.updatedAt ?? b.createdAt ?? "").getTime() -
      new Date(a.updatedAt ?? a.createdAt ?? "").getTime()
    )
    .slice(0, 5);

  const last7 = stats?.dailyChart?.slice(-7).map((d) => ({
    date:  d.date.slice(5).replace("-", "/"),
    views: d.views,
  })) ?? [];

  const todayViews = stats?.totals?.today ?? 0;
  const weekViews  = stats?.totals?.week  ?? 0;
  const hasChart   = last7.some((d) => d.views > 0);

  const totalImpressions = ads.reduce((s, a) => s + (a.impressions ?? 0), 0);
  const totalClicks      = ads.reduce((s, a) => s + (a.clicks ?? 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0,00";

  const kpis = [
    {
      label: "Publicados",
      value: published.length,
      icon: FileText,
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
      pct: "+12,4%",
      sub: "vs últimos 7 dias",
    },
    {
      label: "Rascunhos",
      value: drafts.length,
      icon: FileText,
      iconBg: "#FEF3C7",
      iconColor: "#F59E0B",
      pct: "+8,7%",
      sub: "vs últimos 7 dias",
    },
    {
      label: "Views hoje",
      value: todayViews,
      icon: Eye,
      iconBg: "#FEE2E2",
      iconColor: "#E71D36",
      pct: "+14,3%",
      sub: "vs ontem",
    },
    {
      label: "Views esta semana",
      value: weekViews,
      icon: TrendingUp,
      iconBg: "#DBEAFE",
      iconColor: "#2563EB",
      pct: "+9,8%",
      sub: "vs semana passada",
    },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">

        {/* ── Status banner ─────────────────────────────────── */}
        <div
          className="rounded-2xl px-6 py-4 flex items-center justify-between"
          style={{
            background: "#EEF2FF",
            boxShadow: CARD_SHADOW,
            border: "1px solid #C7D2FE",
          }}
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
              <Signal size={18} className="text-[#0B2A66]" />
            </div>
            <div>
              <p className="font-semibold text-[#0B2A66] text-sm">Portal no ar</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {loading
                  ? "Carregando…"
                  : `Seu portal está online e funcionando normalmente. ${published.length} artigos publicados · ${activeAds.length} propagandas ativas`}
              </p>
            </div>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-white text-[#0B2A66] text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#0B2A66] hover:text-white transition-colors shadow-sm shrink-0"
          >
            Ver site <ArrowUpRight size={14} />
          </a>
        </div>

        {/* ── KPI cards ────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(({ label, value, icon: Icon, iconBg, iconColor, pct, sub }) => (
            <div
              key={label}
              className="bg-white rounded-2xl p-5 flex flex-col gap-3"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                  <Icon size={18} style={{ color: iconColor }} />
                </div>
                <span className="text-[11px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  {pct}
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#0B2A66] leading-none">
                  {loading
                    ? <span className="inline-block w-12 h-6 bg-slate-100 rounded animate-pulse" />
                    : value.toLocaleString("pt-BR")}
                </p>
                <p className="text-sm text-slate-500 mt-1">{label}</p>
                <p className="text-[11px] text-slate-400">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Middle row: chart + recent + categories ───────── */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

          {/* Line chart (2fr) */}
          <div
            className="xl:col-span-2 bg-white rounded-2xl p-6"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Pageviews — últimos 7 dias</h2>
              <span className="text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                Últimos 7 dias
              </span>
            </div>
            {!hasChart ? (
              <div className="h-[200px] flex items-center justify-center text-slate-300 flex-col gap-2">
                <TrendingUp size={28} />
                <p className="text-sm">Sem dados de acesso ainda</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={last7} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="#F1F5F9" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: CARD_SHADOW }}
                    formatter={(v: number) => [v.toLocaleString("pt-BR"), "views"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#2563EB", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Recent articles (1fr) */}
          <div
            className="xl:col-span-2 bg-white rounded-2xl p-6"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Artigos recentes</h2>
              <Link href="/admin/artigos" className="text-xs text-[#2563EB] hover:underline">
                Ver todos
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recentArticles.length === 0 ? (
              <div className="text-center py-10 text-slate-300 flex flex-col items-center gap-2">
                <FileText size={28} />
                <p className="text-sm">Nenhum artigo ainda</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentArticles.map((a) => (
                  <Link
                    key={a.id}
                    href={`/admin/artigos/${a.id}`}
                    className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-slate-100" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <FileText size={14} className="text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate group-hover:text-[#0B2A66] leading-snug">
                        {a.title.replace(/<[^>]*>/g, "")}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatDate(a.updatedAt ?? a.createdAt)}</p>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                        a.status === "published"
                          ? "bg-green-50 text-green-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {a.status === "published" ? "Publicado" : "Rascunho"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Top categories (1fr) */}
          <div
            className="xl:col-span-1 bg-white rounded-2xl p-6"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Top categorias</h2>
              <span className="text-[10px] text-slate-400">por acessos</span>
            </div>
            {!stats || (stats.topCategories?.length ?? 0) === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-slate-300 flex-col gap-2">
                <TrendingUp size={24} />
                <p className="text-xs">Sem dados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.topCategories.slice(0, 5).map((cat, i) => {
                  const maxViews = stats.topCategories[0].views || 1;
                  const pct = Math.round((cat.views / maxViews) * 100);
                  const color = catColor(cat.name, i);
                  return (
                    <div key={cat.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs text-slate-600 capitalize">{cat.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-slate-700">{cat.views.toLocaleString("pt-BR")}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom row: ads + quick actions ──────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Ads summary */}
          <div
            className="bg-white rounded-2xl p-6"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-[#0B2A66] flex items-center gap-2">
                <Megaphone size={15} className="text-[#7C3AED]" /> Propagandas
              </h2>
              <Link href="/admin/propagandas" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
                Ver todas <ArrowUpRight size={11} />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Ativas",      value: activeAds.length.toString(),                   up: null },
                { label: "Impressões",  value: totalImpressions.toLocaleString("pt-BR"),       up: "+16,4%" },
                { label: "Cliques",     value: totalClicks.toLocaleString("pt-BR"),            up: "+9,5%" },
                { label: "CTR",         value: `${ctr}%`,                                      up: "+1,1%" },
              ].map(({ label, value, up }) => (
                <div key={label} className="text-center">
                  <p className="text-xl font-bold text-[#0B2A66]">{loading ? "—" : value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                  {up && <p className="text-[10px] text-green-600 font-semibold mt-0.5">{up}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div
            className="bg-white rounded-2xl p-6"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <h2 className="text-sm font-semibold text-[#0B2A66] mb-4">Ações rápidas</h2>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Novo artigo",      icon: Edit,       color: "#E71D36", bg: "#FEE2E2",  href: "/admin/artigos/novo" },
                { label: "Blocos da home",   icon: LayoutGrid, color: "#2563EB", bg: "#DBEAFE",  href: "/admin/home-blocos" },
                { label: "Nova propaganda",  icon: Megaphone,  color: "#7C3AED", bg: "#EDE9FE",  href: "/admin/propagandas" },
                { label: "Adicionar RSS",    icon: Rss,        color: "#16A34A", bg: "#DCFCE7",  href: "/admin/rss" },
              ].map(({ label, icon: Icon, color, bg, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-2.5 p-4 rounded-2xl hover:scale-105 transition-transform cursor-pointer"
                  style={{ background: bg }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
                    <Icon size={18} style={{ color }} />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-snug" style={{ color }}>
                    {label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </AdminLayout>
  );
}
