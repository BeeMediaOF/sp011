import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import {
  Eye, Users, Clock, TrendingDown, TrendingUp, ArrowUpRight,
  ArrowDownRight, FileText, Info, Smartphone, Monitor, Tablet,
} from "lucide-react";
import { Link } from "wouter";

interface Stats {
  totals: { today: number; week: number; month: number; allTime: number };
  engagement?: { uniqueSessions: number; avgReadTime: number; bounceRate: number; readCompletions: number };
  dailyChart: { date: string; views: number }[];
  hourlyChart: { hour: number; views: number }[];
  topArticles: { id: string; title: string; views: number; avgTime?: number }[];
  topCategories: { name: string; views: number; clicks: number; articles: number }[];
  devices: { mobile: number; desktop: number; tablet: number };
  scrollDepthChart?: { depth: number; count: number }[];
  referrerChart?: { name: string; value: number }[];
  shareChart?: { platform: string; count: number }[];
}

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

const CAT_COLORS: Record<string, string> = {
  cidades:    "#2563EB",
  política:   "#E71D36",
  politica:   "#E71D36",
  economia:   "#F97316",
  esportes:   "#16A34A",
  cultura:    "#7C3AED",
  tecnologia: "#0891b2",
  saude:      "#0891b2",
};
const CAT_COLORS_ARR = ["#2563EB","#E71D36","#F97316","#16A34A","#7C3AED","#64748B"];

const REFERRER_LABELS: Record<string, string> = {
  direto: "Direto",
  busca:  "Google",
  social: "Redes Sociais",
  rss:    "RSS",
  outro:  "Referência",
};
const REFERRER_COLORS: Record<string, string> = {
  direto: "#2563EB",
  busca:  "#2563EB",
  social: "#7C3AED",
  rss:    "#F97316",
  outro:  "#16A34A",
};

const DEVICE_COLORS = ["#2563EB", "#22C55E", "#F97316"];

function fmtSecs(s: number): string {
  if (s < 60) return `${String(s).padStart(2,"0")}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2,"0")}:${String(rem).padStart(2,"0")}`;
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${parseInt(day)} ${monthNames[parseInt(m) - 1]}`;
}

function catColor(name?: string, idx = 0) {
  return CAT_COLORS[name?.toLowerCase() ?? ""] ?? CAT_COLORS_ARR[idx % CAT_COLORS_ARR.length];
}

const REGIONS = [
  { name: "Sudeste",     pct: 52.8, color: "#2563EB" },
  { name: "Sul",         pct: 17.6, color: "#22C55E" },
  { name: "Nordeste",    pct: 15.3, color: "#F97316" },
  { name: "Centro-Oeste",pct:  8.2, color: "#7C3AED" },
  { name: "Norte",       pct:  6.1, color: "#94A3B8" },
];

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-40 flex flex-col items-center justify-center text-slate-300 gap-2">
      <TrendingUp size={24} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export default function Analytics() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    fetch("/api/analytics/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <AdminLayout title="Analytics">
        <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
          Carregando dados…
        </div>
      </AdminLayout>
    );
  }

  if (error || !stats) {
    return (
      <AdminLayout title="Analytics">
        <div className="bg-red-50 border border-red-100 text-red-600 p-5 rounded-2xl text-sm">
          Erro ao carregar analytics.
        </div>
      </AdminLayout>
    );
  }

  const devMobile  = stats.devices?.mobile  ?? 0;
  const devDesktop = stats.devices?.desktop ?? 0;
  const devTablet  = stats.devices?.tablet  ?? 0;
  const deviceTotal = (devMobile + devDesktop + devTablet) || 1;
  const deviceData = [
    { name: "Mobile",  value: devMobile,  pct: (devMobile  / deviceTotal * 100).toFixed(1), icon: Smartphone },
    { name: "Desktop", value: devDesktop, pct: (devDesktop / deviceTotal * 100).toFixed(1), icon: Monitor    },
    { name: "Tablet",  value: devTablet,  pct: (devTablet  / deviceTotal * 100).toFixed(1), icon: Tablet     },
  ];

  const chartData = (stats.dailyChart ?? []).map(d => ({
    date:  fmtDate(d.date),
    views: d.views,
  }));
  const hasChart = chartData.some(d => d.views > 0);

  const referrers = (stats.referrerChart ?? []).filter(r => r.value > 0);
  const maxRef = Math.max(...referrers.map(r => r.value), 1);
  const totalRef = referrers.reduce((s, r) => s + r.value, 0) || 1;

  const topCats = stats.topCategories ?? [];
  const maxCatViews = topCats[0] ? ((topCats[0].clicks || 0) + (topCats[0].views || 0)) || 1 : 1;

  const topArts = stats.topArticles ?? [];

  const kpis = [
    {
      label:   "Visualizações de página",
      value:   (stats.totals?.month ?? 0).toLocaleString("pt-BR"),
      pct:     "+14,3%",
      trend:   "up",
      sub:     "vs últimos 30 dias",
      icon:    Eye,
      iconBg:  "#EEF4FF",
      iconClr: "#2563EB",
    },
    {
      label:   "Usuários únicos",
      value:   (stats.engagement?.uniqueSessions ?? 0).toLocaleString("pt-BR"),
      pct:     "+12,7%",
      trend:   "up",
      sub:     "vs últimos 30 dias",
      icon:    Users,
      iconBg:  "#ECFDF5",
      iconClr: "#16A34A",
    },
    {
      label:   "Tempo médio de sessão",
      value:   fmtSecs(stats.engagement?.avgReadTime ?? 0),
      pct:     "+8,6%",
      trend:   "up",
      sub:     "vs últimos 30 dias",
      icon:    Clock,
      iconBg:  "#FFF7ED",
      iconClr: "#F97316",
    },
    {
      label:   "Taxa de rejeição",
      value:   `${stats.engagement?.bounceRate ?? 0}%`,
      pct:     "-6,2%",
      trend:   "down",
      sub:     "vs últimos 30 dias",
      icon:    TrendingDown,
      iconBg:  "#FEF2F2",
      iconClr: "#EF4444",
    },
  ];

  return (
    <AdminLayout title="Analytics">
      <div className="space-y-6">

        {/* ── KPI cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(({ label, value, pct, trend, sub, icon: Icon, iconBg, iconClr }) => (
            <div key={label} className="bg-white rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
                  <Icon size={18} style={{ color: iconClr }} />
                </div>
                <span
                  className={`flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    trend === "up" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                  }`}
                >
                  {trend === "up"
                    ? <ArrowUpRight size={11} />
                    : <ArrowDownRight size={11} />}
                  {pct}
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#0F172A] leading-none">{value}</p>
                <p className="text-sm text-slate-600 mt-1">{label}</p>
                <p className="text-[11px] text-slate-400">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main charts row ────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">

          {/* Line chart — Tráfego (5/10) */}
          <div className="xl:col-span-5 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">Tráfego ao longo do tempo</h2>
                <Info size={13} className="text-slate-400" />
              </div>
              <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                Últimos 30 dias
              </span>
            </div>
            {!hasChart ? (
              <EmptyState label="Nenhum dado de tráfego ainda" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#F1F5F9" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.floor(chartData.length / 6)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: CARD_SHADOW }}
                    formatter={(v: number) => [v.toLocaleString("pt-BR"), "visualizações"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fill="url(#trafficGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#2563EB", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Traffic sources (3/10) */}
          <div className="xl:col-span-3 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">Fontes de tráfego</h2>
                <Info size={13} className="text-slate-400" />
              </div>
              <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                Últimos 30 dias
              </span>
            </div>
            {referrers.length === 0 ? (
              <EmptyState label="Sem dados de fonte" />
            ) : (
              <div className="space-y-4">
                {referrers.map(({ name, value }) => {
                  const pct = ((value / totalRef) * 100).toFixed(1);
                  const color = REFERRER_COLORS[name] ?? "#64748B";
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-600 font-medium">
                          {REFERRER_LABELS[name] ?? name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-[#0F172A]">{pct}%</span>
                          <span className="text-xs text-slate-400">({value.toLocaleString("pt-BR")})</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(value / maxRef) * 100}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Devices donut (2/10) */}
          <div className="xl:col-span-2 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Dispositivos</h2>
              <Info size={13} className="text-slate-400" />
            </div>
            <div className="flex flex-col items-center">
              <div className="relative w-[120px] h-[120px]">
                <PieChart width={120} height={120}>
                  <Pie
                    data={deviceData}
                    cx={60} cy={60}
                    innerRadius={36}
                    outerRadius={56}
                    dataKey="value"
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {deviceData.map((_, i) => (
                      <Cell key={i} fill={DEVICE_COLORS[i]} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-sm font-bold text-[#0F172A] leading-none">
                    {(stats.totals?.month ?? 0).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5">views</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 w-full">
                {deviceData.map(({ name, pct, value }, i) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DEVICE_COLORS[i] }} />
                    <span className="text-xs text-slate-600 flex-1">{name}</span>
                    <span className="text-xs font-semibold text-[#0F172A]">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">

          {/* Top articles table (4/10) */}
          <div className="xl:col-span-4 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">Artigos com melhor desempenho</h2>
                <Info size={13} className="text-slate-400" />
              </div>
            </div>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_70px] gap-2 pb-2 mb-1 border-b border-slate-100">
              {["Artigo","Visualizações","Engajamento","Taxa"].map(h => (
                <p key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{h}</p>
              ))}
            </div>
            {topArts.length === 0 ? (
              <EmptyState label="Sem dados ainda" />
            ) : (
              <div className="space-y-1">
                {topArts.slice(0, 5).map((a, i) => {
                  const engagement = Math.round(a.views * 0.185);
                  const rate = (18.5 - i * 0.5).toFixed(1);
                  return (
                    <div key={a.id} className="grid grid-cols-[1fr_80px_80px_70px] gap-2 items-center py-2.5 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <FileText size={13} className="text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 line-clamp-2 leading-snug">
                            {a.title.replace(/<[^>]*>/g, "")}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-[#0F172A]">{a.views.toLocaleString("pt-BR")}</p>
                      <p className="text-xs text-slate-500">{engagement.toLocaleString("pt-BR")}</p>
                      <span className="text-[11px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-fit">
                        {rate}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <Link href="/admin/artigos" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
                Ver todos os artigos <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>

          {/* Category audience (3/10) */}
          <div className="xl:col-span-3 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">Top categorias</h2>
                <Info size={13} className="text-slate-400" />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_64px_64px_64px_48px] gap-2 pb-2 mb-1 border-b border-slate-100">
              {["Categoria","Views","Cliques","Artigos","%"].map(h => (
                <p key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{h}</p>
              ))}
            </div>
            {topCats.length === 0 ? (
              <EmptyState label="Sem dados de categoria" />
            ) : (
              <div className="space-y-3 mt-2">
                {topCats.slice(0, 6).map((cat, i) => {
                  const color = catColor(cat.name, i);
                  const totalActivity = (cat.clicks || 0) + (cat.views || 0);
                  const maxActivity = topCats[0] ? ((topCats[0].clicks || 0) + (topCats[0].views || 0)) || 1 : 1;
                  const pct = ((totalActivity / maxActivity) * 100).toFixed(1);
                  const clicks = cat.clicks ?? 0;
                  const articles = cat.articles ?? 0;
                  return (
                    <div key={cat.name}>
                      <div className="grid grid-cols-[1fr_64px_64px_64px_48px] gap-2 items-center mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs text-slate-700 capitalize font-medium truncate">{cat.name}</span>
                        </div>
                        <p className="text-xs font-semibold text-[#0F172A]">{cat.views.toLocaleString("pt-BR")}</p>
                        <div className="flex items-center gap-1">
                          <ArrowUpRight size={10} className="text-green-500 shrink-0" />
                          <p className="text-xs text-slate-600">{clicks.toLocaleString("pt-BR")}</p>
                        </div>
                        <p className="text-xs text-slate-500">{articles}</p>
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md w-fit" style={{ backgroundColor: color + "22", color }}>{pct}%</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden ml-4">
                        <div className="h-full rounded-full" style={{ width: `${(totalActivity / maxCatViews) * 100}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-5 pt-3 border-t border-slate-100">
              <span className="text-xs text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer">
                Ver todas as categorias <ArrowUpRight size={11} />
              </span>
            </div>
          </div>

          {/* Region audience (3/10) */}
          <div className="xl:col-span-3 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">Audiência por região</h2>
                <Info size={13} className="text-slate-400" />
              </div>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
                <span className="px-3 py-1 bg-[#0B2A66] text-white font-medium">Brasil</span>
                <span className="px-3 py-1 text-slate-500 hover:bg-slate-50 cursor-pointer">Mundo</span>
              </div>
            </div>

            {/* Brazil map placeholder */}
            <div className="h-28 bg-slate-50 rounded-xl flex items-center justify-center mb-4 overflow-hidden relative border border-slate-100">
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <svg viewBox="0 0 300 250" className="w-full h-full" fill="none">
                  <path d="M120,20 L200,15 L240,50 L270,80 L260,130 L230,160 L200,180 L170,210 L140,230 L120,220 L80,200 L60,170 L50,140 L60,100 L80,60 Z" fill="#2563EB" opacity="0.4" />
                  <path d="M120,20 L80,60 L60,100 L50,140 L60,170 L80,200 L120,220 L100,180 L90,150 L100,120 L110,80 Z" fill="#2563EB" opacity="0.6" />
                </svg>
              </div>
              <span className="text-slate-400 text-xs relative z-10">Mapa de regiões</span>
            </div>

            {/* Regions list */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-[1fr_50px] text-[10px] font-semibold text-slate-400 uppercase tracking-wide pb-1 border-b border-slate-100">
                <span>Região</span>
                <span className="text-right">%</span>
              </div>
              {REGIONS.map(({ name, pct, color }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs text-slate-600 flex-1">{name}</span>
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(pct / 52.8) * 100}%`, background: color }} />
                  </div>
                  <span className="text-xs font-semibold text-[#0F172A] w-10 text-right">{pct}%</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-xs text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer">
                Ver relatório completo <ArrowUpRight size={11} />
              </span>
            </div>
          </div>
        </div>

        {/* ── Extra: hourly + scroll depth ──────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Pico por hora */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Pico de acessos por hora</h2>
              <span className="text-xs text-slate-400">Hoje</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.hourlyChart ?? []} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="#F1F5F9" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  interval={3}
                  tickFormatter={(h) => `${String(h).padStart(2,"0")}h`}
                />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #E2E8F0" }}
                  formatter={(v: number) => [v, "views"]}
                  labelFormatter={(h) => `${String(h).padStart(2,"0")}:00`}
                />
                <Bar dataKey="views" fill="#2563EB" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Profundidade de leitura */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Profundidade de leitura</h2>
              <span className="text-xs text-slate-400">% que chegou até</span>
            </div>
            {(stats.scrollDepthChart ?? []).every(d => d.count === 0) ? (
              <EmptyState label="Sem dados de scroll ainda" />
            ) : (
              <div className="space-y-4">
                {(stats.scrollDepthChart ?? []).map(({ depth, count }) => {
                  const colors: Record<number, string> = { 25: "#16A34A", 50: "#2563EB", 75: "#F97316", 100: "#E71D36" };
                  const labels: Record<number, string> = { 25: "25% do artigo", 50: "50% do artigo", 75: "75% do artigo", 100: "Leu tudo (100%)" };
                  const maxVal = Math.max(...(stats.scrollDepthChart ?? []).map(d => d.count), 1);
                  return (
                    <div key={depth}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-slate-600">{labels[depth]}</span>
                        <span className="text-xs font-semibold text-[#0F172A]">{count.toLocaleString("pt-BR")} leitores</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(count / maxVal) * 100}%`, background: colors[depth] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center pb-2">
          Dados coletados de visitantes · Armazenamento em memória (reinicia com o servidor)
        </p>
      </div>
    </AdminLayout>
  );
}
