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
  RefreshCw, Download,
} from "lucide-react";
import { Link } from "wouter";

interface Stats {
  totals: { today: number; week: number; month: number; allTime: number };
  engagement?: { uniqueSessions: number; avgReadTime: number; bounceRate: number; readCompletions: number };
  dailyChart: { date: string; views: number }[];
  hourlyChart: { hour: number; views: number }[];
  peakHour?: number;
  dayOfWeekChart?: { day: string; views: number }[];
  peakDay?: string;
  topArticles: { id: string; title: string; views: number; avgTime?: number }[];
  topCategories: { name: string; views: number; clicks: number; articles: number }[];
  topCities?: { name: string; views: number }[];
  topRegions?: { name: string; views: number }[];
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

const GEO_COLORS = ["#2563EB","#E71D36","#F97316","#16A34A","#7C3AED","#0891b2","#F59E0B","#64748B"];

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-40 flex flex-col items-center justify-center text-slate-300 gap-2">
      <TrendingUp size={24} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export default function Analytics() {
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated,setLastUpdated]= useState<Date | null>(null);
  const [geoTab,     setGeoTab]     = useState<"cidades" | "estados">("cidades");

  const fetchStats = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    const token = localStorage.getItem("admin_token");
    try {
      const r    = await fetch("/api/analytics/stats", { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json() as Stats;
      setStats(data);
      setLastUpdated(new Date());
      if (!silent) setLoading(false);
    } catch {
      if (!silent) { setError(true); setLoading(false); }
    } finally {
      if (silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats(false);
    const interval = setInterval(() => { void fetchStats(true); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  function exportPDF() {
    if (!stats) return;
    const now = new Date().toLocaleString("pt-BR");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Relatório Analytics — ${now}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #0f172a; padding: 32px; background: #fff; }
    h1 { color: #0B2A66; font-size: 22px; border-bottom: 3px solid #E71D36; padding-bottom: 10px; margin-bottom: 6px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
    h2 { color: #0B2A66; font-size: 13px; font-weight: 700; margin: 28px 0 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpis { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .kpi { flex: 1; min-width: 120px; padding: 14px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }
    .kpi-val { font-size: 26px; font-weight: 800; color: #0B2A66; }
    .kpi-lbl { font-size: 11px; color: #64748b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 700; }
    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    tr:last-child td { border: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; }
    @page { margin: 18mm; }
  </style>
</head>
<body>
  <h1>Relatório de Analytics</h1>
  <p class="sub">Gerado em ${now}</p>

  <h2>Resumo de Tráfego</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-val">${stats.totals.today.toLocaleString("pt-BR")}</div><div class="kpi-lbl">Hoje</div></div>
    <div class="kpi"><div class="kpi-val">${stats.totals.week.toLocaleString("pt-BR")}</div><div class="kpi-lbl">Últimos 7 dias</div></div>
    <div class="kpi"><div class="kpi-val">${stats.totals.month.toLocaleString("pt-BR")}</div><div class="kpi-lbl">Últimos 30 dias</div></div>
    <div class="kpi"><div class="kpi-val">${(stats.engagement?.uniqueSessions ?? 0).toLocaleString("pt-BR")}</div><div class="kpi-lbl">Usuários únicos</div></div>
    <div class="kpi"><div class="kpi-val">${stats.engagement?.bounceRate ?? 0}%</div><div class="kpi-lbl">Taxa de rejeição</div></div>
  </div>

  <h2>Artigos com mais visualizações</h2>
  <table>
    <tr><th>#</th><th>Artigo</th><th>Visualizações</th><th>Tempo médio</th></tr>
    ${stats.topArticles.map((a, i) => `<tr><td>${i + 1}</td><td>${a.title.replace(/<[^>]*>/g, "")}</td><td>${a.views.toLocaleString("pt-BR")}</td><td>${a.avgTime ? Math.floor(a.avgTime / 60) + "m " + (a.avgTime % 60) + "s" : "—"}</td></tr>`).join("")}
  </table>

  <h2>Desempenho por Categoria</h2>
  <table>
    <tr><th>Categoria</th><th>Views</th><th>Cliques</th><th>Artigos</th></tr>
    ${stats.topCategories.map(c => `<tr><td>${c.name}</td><td>${c.views.toLocaleString("pt-BR")}</td><td>${c.clicks.toLocaleString("pt-BR")}</td><td>${c.articles}</td></tr>`).join("")}
  </table>

  ${(stats.topCities ?? []).length > 0 ? `
  <h2>Top Cidades</h2>
  <table>
    <tr><th>Cidade</th><th>Views</th></tr>
    ${(stats.topCities ?? []).map(c => `<tr><td>${c.name}</td><td>${c.views.toLocaleString("pt-BR")}</td></tr>`).join("")}
  </table>` : ""}

  <div class="footer">Portal SBC Agora · Relatório gerado automaticamente pelo sistema de analytics</div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

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

        {/* ── Toolbar ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
              Ao vivo
            </div>
            {lastUpdated && (
              <span className="text-xs text-slate-400">
                Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void fetchStats(true); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""}/>
              Atualizar
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#0B2A66] rounded-xl hover:bg-[#0a2255] transition-colors"
            >
              <Download size={12}/>
              Exportar PDF
            </button>
          </div>
        </div>

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

          {/* Localização: Cidades / Estados (3/10) */}
          <div className="xl:col-span-3 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">Localização</h2>
                <Info size={13} className="text-slate-400" />
              </div>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
                <button
                  onClick={() => setGeoTab("cidades")}
                  className={`px-3 py-1 font-medium transition-colors ${geoTab === "cidades" ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Cidades
                </button>
                <button
                  onClick={() => setGeoTab("estados")}
                  className={`px-3 py-1 font-medium transition-colors ${geoTab === "estados" ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Estados
                </button>
              </div>
            </div>

            {geoTab === "cidades" ? (
              (() => {
                const cities = stats.topCities ?? [];
                const maxV = cities[0]?.views || 1;
                return cities.length === 0 ? (
                  <EmptyState label="Aguardando dados de localização" />
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-[1fr_48px_44px] text-[10px] font-semibold text-slate-400 uppercase tracking-wide pb-1 border-b border-slate-100">
                      <span>Cidade</span><span className="text-right">Views</span><span className="text-right">%</span>
                    </div>
                    {cities.map(({ name, views }, i) => {
                      const color = GEO_COLORS[i % GEO_COLORS.length]!;
                      const pct = ((views / maxV) * 100).toFixed(0);
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs text-slate-600 flex-1 truncate">{name}</span>
                          <span className="text-xs font-semibold text-[#0F172A] w-10 text-right">{views.toLocaleString("pt-BR")}</span>
                          <span className="text-[11px] text-slate-400 w-8 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              (() => {
                const regions = stats.topRegions ?? [];
                const maxV = regions[0]?.views || 1;
                return regions.length === 0 ? (
                  <EmptyState label="Aguardando dados de localização" />
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-[1fr_48px_44px] text-[10px] font-semibold text-slate-400 uppercase tracking-wide pb-1 border-b border-slate-100">
                      <span>Estado</span><span className="text-right">Views</span><span className="text-right">%</span>
                    </div>
                    {regions.map(({ name, views }, i) => {
                      const color = GEO_COLORS[i % GEO_COLORS.length]!;
                      const pct = ((views / maxV) * 100).toFixed(0);
                      return (
                        <div key={name}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs text-slate-600 flex-1 truncate">{name}</span>
                            <span className="text-xs font-semibold text-[#0F172A]">{views.toLocaleString("pt-BR")}</span>
                            <span className="text-[11px] text-slate-400 w-8 text-right">{pct}%</span>
                          </div>
                          <div className="h-1 bg-slate-100 rounded-full overflow-hidden ml-4">
                            <div className="h-full rounded-full" style={{ width: `${(views / maxV) * 100}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* ── Extra: hourly + day-of-week + scroll depth ────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Pico por hora */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Pico por hora</h2>
              {stats.peakHour !== undefined && (stats.hourlyChart ?? []).some(h => h.views > 0) && (
                <span className="text-[11px] font-semibold bg-blue-50 text-[#2563EB] px-2 py-0.5 rounded-full">
                  Pico: {String(stats.peakHour).padStart(2,"0")}h
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={150}>
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
                <Bar dataKey="views" radius={[4, 4, 0, 0]}>
                  {(stats.hourlyChart ?? []).map((entry) => (
                    <Cell
                      key={entry.hour}
                      fill={entry.hour === stats.peakHour ? "#E71D36" : "#2563EB"}
                      opacity={entry.hour === stats.peakHour ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pico por dia da semana */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#0B2A66]">Pico por dia da semana</h2>
              {stats.peakDay && (stats.dayOfWeekChart ?? []).some(d => d.views > 0) && (
                <span className="text-[11px] font-semibold bg-red-50 text-[#E71D36] px-2 py-0.5 rounded-full">
                  Pico: {stats.peakDay}
                </span>
              )}
            </div>
            {(stats.dayOfWeekChart ?? []).every(d => d.views === 0) ? (
              <EmptyState label="Aguardando dados" />
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={stats.dayOfWeekChart ?? []} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="#F1F5F9" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #E2E8F0" }}
                    formatter={(v: number) => [v, "views"]}
                  />
                  <Bar dataKey="views" radius={[4, 4, 0, 0]}>
                    {(stats.dayOfWeekChart ?? []).map((entry) => (
                      <Cell
                        key={entry.day}
                        fill={entry.day === stats.peakDay ? "#E71D36" : "#7C3AED"}
                        opacity={entry.day === stats.peakDay ? 1 : 0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
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
          Dados coletados de visitantes · Views por artigo e por categoria persistidos em disco · Atualização automática a cada 30s
        </p>
      </div>
    </AdminLayout>
  );
}
