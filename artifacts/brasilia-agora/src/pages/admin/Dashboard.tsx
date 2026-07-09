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
import { useAdminT, resolveAdminLang } from "../../lib/adminI18n";

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
  const loc = resolveAdminLang() === "en" ? "en-US" : "pt-BR";
  const d = new Date(dateStr);
  return d.toLocaleDateString(loc, { day: "2-digit", month: "short", year: "numeric" })
    + " · " + d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
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
  const { t } = useAdminT();
  const [articles, setArticles] = useState<Article[]>([]);
  const [stats, setStats]       = useState<AnalyticsStats | null>(null);
  const [ads, setAds]           = useState<Ad[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      Promise.all([
        adminApi.getArticles().then((r) => { if (active) setArticles(r.articles); }).catch(() => {}),
        adminApi.getAnalyticsStats().then((s) => { if (active) setStats(s); }).catch(() => {}),
        adminApi.getAds().then((r) => { if (active) setAds(r.ads); }).catch(() => {}),
      ]).finally(() => { inFlight = false; if (active) setLoading(false); });
    };
    load();
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const interval = setInterval(load, 60_000);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(interval);
    };
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

  // Tendências reais vindas do servidor (null = sem base de comparação → sem badge).
  const fmtDelta = (v: number | null | undefined): string | null =>
    v === null || v === undefined
      ? null
      : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  const kpis = [
    {
      label: t("dash.kpiPublished"),
      value: published.length,
      icon: FileText,
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
      delta: null as number | null,
      sub: t("dash.kpiPublishedSub"),
    },
    {
      label: t("dash.kpiDrafts"),
      value: drafts.length,
      icon: FileText,
      iconBg: "#FEF3C7",
      iconColor: "#F59E0B",
      delta: null as number | null,
      sub: t("dash.kpiDraftsSub"),
    },
    {
      label: t("dash.kpiViewsToday"),
      value: todayViews,
      icon: Eye,
      iconBg: "#FEE2E2",
      iconColor: "#E71D36",
      delta: stats?.trends?.today ?? null,
      sub: t("dash.vsYesterday"),
    },
    {
      label: t("dash.kpiViews7d"),
      value: weekViews,
      icon: TrendingUp,
      iconBg: "#DBEAFE",
      iconColor: "#2563EB",
      delta: stats?.trends?.week ?? null,
      sub: t("dash.vsPrev7d"),
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
              <p className="font-semibold text-[#0B2A66] text-sm">{t("dash.portalUp")}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {loading
                  ? t("common.loading")
                  : `${t("dash.online")} ${published.length} ${t("dash.publishedArticles")} · ${activeAds.length} ${t("dash.activeAds")}`}
              </p>
            </div>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-white text-[#0B2A66] text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#0B2A66] hover:text-white transition-colors shadow-sm shrink-0"
          >
            {t("shell.viewSite")} <ArrowUpRight size={14} />
          </a>
        </div>

        {/* ── KPI cards ────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(({ label, value, icon: Icon, iconBg, iconColor, delta, sub }) => (
            <div
              key={label}
              className="bg-white rounded-2xl p-5 flex flex-col gap-3"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                  <Icon size={18} style={{ color: iconColor }} />
                </div>
                {fmtDelta(delta) !== null && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    (delta ?? 0) > 0
                      ? "text-green-600 bg-green-50"
                      : (delta ?? 0) < 0
                        ? "text-red-500 bg-red-50"
                        : "text-slate-500 bg-slate-50"
                  }`}>
                    {fmtDelta(delta)}
                  </span>
                )}
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
              <h2 className="text-sm font-semibold text-[#0B2A66]">{t("dash.pageviews7d")}</h2>
              <span className="text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                {t("dash.last7days")}
              </span>
            </div>
            {!hasChart ? (
              <div className="h-[200px] flex items-center justify-center text-slate-300 flex-col gap-2">
                <TrendingUp size={28} />
                <p className="text-sm">{t("dash.noAccessData")}</p>
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
              <h2 className="text-sm font-semibold text-[#0B2A66]">{t("dash.recentArticles")}</h2>
              <Link href="/admin/artigos" className="text-xs text-[#2563EB] hover:underline">
                {t("dash.seeAll")}
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
                <p className="text-sm">{t("dash.noArticles")}</p>
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
                      {a.status === "published" ? t("dash.published") : t("dash.draft")}
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
              <h2 className="text-sm font-semibold text-[#0B2A66]">{t("dash.topCategories")}</h2>
              <span className="text-[10px] text-slate-400">{t("dash.byViews")}</span>
            </div>
            {!stats || (stats.topCategories?.length ?? 0) === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-slate-300 flex-col gap-2">
                <TrendingUp size={24} />
                <p className="text-xs">{t("dash.noData")}</p>
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
                <Megaphone size={15} className="text-[#7C3AED]" /> {t("nav.ads")}
              </h2>
              <Link href="/admin/propagandas" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
                {t("dash.seeAllFem")} <ArrowUpRight size={11} />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[
                // Sem % fake aqui: totais de anúncio são acumulados (all-time),
                // não há janela anterior comparável neste card.
                { label: t("dash.adsActiveShort"), value: activeAds.length.toString(),              up: null },
                { label: t("dash.impressions"),    value: totalImpressions.toLocaleString("pt-BR"), up: null },
                { label: t("dash.clicks"),         value: totalClicks.toLocaleString("pt-BR"),      up: null },
                { label: "CTR",                    value: `${ctr}%`,                                up: null },
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
            <h2 className="text-sm font-semibold text-[#0B2A66] mb-4">{t("dash.quickActions")}</h2>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: t("dash.qaNewArticle"), icon: Edit,       color: "#E71D36", bg: "#FEE2E2",  href: "/admin/artigos/novo" },
                { label: t("dash.qaHomeBlocks"), icon: LayoutGrid, color: "#2563EB", bg: "#DBEAFE",  href: "/admin/home-blocos" },
                { label: t("dash.qaNewAd"),      icon: Megaphone,  color: "#7C3AED", bg: "#EDE9FE",  href: "/admin/propagandas" },
                { label: t("dash.qaAddRss"),     icon: Rss,        color: "#16A34A", bg: "#DCFCE7",  href: "/admin/rss" },
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
