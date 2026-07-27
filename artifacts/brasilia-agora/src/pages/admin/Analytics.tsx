import React, { useEffect, useState } from "react";
import { BRAND } from "../../brand";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import {
  Eye, Users, Clock, TrendingDown, TrendingUp, ArrowUpRight,
  ArrowDownRight, FileText, Info, Smartphone, Monitor, Tablet,
  RefreshCw, Download, Megaphone, MousePointerClick, Search,
  ExternalLink, BarChart2, Mail, AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { useAdminT, type AdminLang, type AdminTKey } from "../../lib/adminI18n";
import { maxMetric, pctOfMax } from "../../lib/analyticsDisplay";

interface AdStat {
  id: string; name: string; position: string; active: boolean;
  impressions: number; clicks: number; ctr: number;
  /** false = nenhum registro diário no período (≠ zero real). */
  hasData?: boolean;
}
type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "custom";
interface Stats {
  /** Janela efetivamente aplicada pelo servidor (ecoada — a UI nunca mente). */
  period?: { key: PeriodKey; from: string; to: string; label: string; days: number };
  totals: { today: number; week: number; month: number; allTime: number; window?: number };
  engagement?: { uniqueSessions: number; avgReadTime: number; bounceRate: number; readCompletions: number };
  /** Visitantes anônimos persistentes — coletados a partir de `since`. */
  visitors?: { unique: number; new: number; returning: number; since: string };
  /** Variação real vs a janela anterior de mesmo tamanho (null = sem base de comparação).
   *  bounceRate vem em pontos percentuais; os demais em %. */
  trends?: {
    today: number | null; week: number | null; month: number | null;
    window?: number | null; visitors?: number | null;
    uniqueSessions: number | null; avgReadTime: number | null; bounceRate: number | null;
  };
  dailyChart: { date: string; views: number }[];
  hourlyChart: { hour: number; views: number }[];
  peakHour?: number | null;
  // occurrences/avg são aditivos do PRD 06 RF-3 (opcionais — tolerantes a API antiga).
  dayOfWeekChart?: { day: string; views: number; occurrences?: number; avg?: number | null }[];
  peakDay?: string | null;
  topArticles: { id: string; title: string; views: number; avgTime?: number }[];
  topCategories: { name: string; views: number; clicks: number; articles: number }[];
  topCities?: { name: string; views: number }[];
  topRegions?: { name: string; views: number }[];
  devices: { mobile: number; desktop: number; tablet: number };
  browsers?: { name: string; views: number }[];
  osList?: { name: string; views: number }[];
  scrollDepthChart?: { depth: number; count: number }[];
  referrerChart?: { name: string; value: number }[];
  topRefHosts?: { name: string; views: number }[];
  topCampaigns?: { name: string; views: number }[];
  shareChart?: { platform: string; count: number }[];
  // Ad analytics
  adStats?: AdStat[];
  adDailyChart?: Record<string, unknown>[];
  adTopNames?: string[];
  /** false = nunca houve registro diário de anúncio (coleta não iniciada). */
  adHasAnyData?: boolean;
  adKpis?: {
    totalImpressions: number; totalClicks: number;
    avgCtr: number; bestAdName: string | null; bestAdCtr: number;
  };
  // Behavior analytics
  behaviorStats?: {
    totalEvents: number; newsletterSignups: number;
    // Totais NÃO truncados servidos pelo PRD 07 (aditivos — ausentes em API antiga).
    searchesTotal?: number; externalClicksTotal?: number;
    searchTermsDistinct?: number; linkDomainsDistinct?: number;
    topSearchTerms: { term: string; count: number }[];
    topLinkDomains: { domain: string; count: number }[];
  };
}

/** GET /api/analytics/health — contadores de coleta desde o boot do servidor. */
interface HealthEndpointCounters {
  received: number; droppedBot: number; droppedRate: number;
  droppedInvalid: number; droppedDuplicate: number; flaggedInternal: number;
}
interface HealthAlert { id: string; severity: "critical" | "warning"; params: Record<string, number | string>; }
interface Health {
  received: number; droppedBot: number; droppedRate: number; droppedInvalid: number;
  droppedDuplicate: number; flaggedInternal: number; flushedOk: number; flushFailed: number;
  buffered: number; lastEventAt: string | null; lastFlushAt: string | null;
  reliableSince: string; filters: string[];
  // Aditivos do PRD 08 (opcionais — tolerantes a API antiga durante rollout parcial).
  byEndpoint?: Record<"event" | "behavior" | "adImpression" | "adClick", HealthEndpointCounters>;
  internalByReason?: { flag: number; configuredIp: number; privateIp: number };
  alerts?: HealthAlert[];
  alertsSkipped?: { id: string; reason: string }[];
  adsReliableSince?: string | null;
  bootAt?: string;
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

/** referrer key → chave de tradução (o rótulo é traduzido no render). */
const REFERRER_TKEYS: Record<string, AdminTKey> = {
  direto:       "an.refDireto",
  busca:        "an.refBusca",
  social:       "an.refSocial",
  referencia:   "an.refReferencia",
  email:        "an.refEmail",
  pago:         "an.refPago",
  desconhecido: "an.refDesconhecido",
  outro:        "an.refReferenciaShort", // legado (linhas antigas; o servidor já remapeia)
};

/** period key → chave do rótulo longo da janela (usado nos badges e no PDF). */
const WIN_TKEYS: Record<Exclude<PeriodKey, "custom">, AdminTKey> = {
  today:     "an.winToday",
  yesterday: "an.winYesterday",
  "7d":      "an.win7d",
  "30d":     "an.win30d",
};

/** Dias da semana do servidor (pt) → en. */
const DOW_EN: Record<string, string> = {
  Dom: "Sun", Seg: "Mon", Ter: "Tue", Qua: "Wed", Qui: "Thu", Sex: "Fri", "Sáb": "Sat",
};
const REFERRER_COLORS: Record<string, string> = {
  direto:       "#2563EB",
  busca:        "#F97316",
  social:       "#7C3AED",
  referencia:   "#16A34A",
  email:        "#0891b2",
  pago:         "#E71D36",
  desconhecido: "#94A3B8",
  outro:        "#16A34A",
};

const PERIOD_PRESETS: { key: PeriodKey; tk: AdminTKey }[] = [
  { key: "today",     tk: "an.periodToday" },
  { key: "yesterday", tk: "an.periodYesterday" },
  { key: "7d",        tk: "an.period7d" },
  { key: "30d",       tk: "an.period30d" },
  { key: "custom",    tk: "an.periodCustom" },
];

/** dd/mm/aaaa a partir de YYYY-MM-DD. */
function fmtDayBr(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** Interpola {param} numa mensagem de alerta (PRD 08). Placeholder sem valor fica literal. */
function fillParams(msg: string, params: Record<string, number | string>): string {
  return msg.replace(/\{(\w+)\}/g, (_m, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

const DEVICE_COLORS = ["#2563EB", "#22C55E", "#F97316"];

function fmtSecs(s: number): string {
  if (s < 60) return `${String(s).padStart(2,"0")}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2,"0")}:${String(rem).padStart(2,"0")}`;
}

/** Formata a variação calculada pelo servidor; null = sem base de comparação. */
function fmtDelta(v: number | null | undefined, suffix: string, loc = "pt-BR"): string | null {
  if (v === null || v === undefined) return null;
  const s = v.toLocaleString(loc, { maximumFractionDigits: 1 });
  return `${v > 0 ? "+" : ""}${s}${suffix}`;
}

function fmtDate(d: string, lang: AdminLang = "pt-BR") {
  const [, m, day] = d.split("-");
  const monthsPt = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const monthsEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mo = (lang === "en" ? monthsEn : monthsPt)[parseInt(m) - 1];
  return lang === "en" ? `${mo} ${parseInt(day)}` : `${parseInt(day)} ${mo}`;
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
  const [health,     setHealth]     = useState<Health | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated,setLastUpdated]= useState<Date | null>(null);
  const [geoTab,     setGeoTab]     = useState<"cidades" | "estados">("cidades");
  // Período do relatório (o servidor ecoa a janela aplicada em stats.period).
  const [periodKey,  setPeriodKey]  = useState<PeriodKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");

  const { t, lang } = useAdminT();
  const nloc = lang === "en" ? "en-US" : "pt-BR";
  const dow = (d: string) => (lang === "en" ? DOW_EN[d] ?? d : d);

  const fetchStats = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    const token = localStorage.getItem("admin_token");
    const headers = { Authorization: `Bearer ${token}` };
    const qs = new URLSearchParams({ period: periodKey });
    if (periodKey === "custom") {
      // Sem as duas datas o servidor cai no padrão de 30 dias — não envia pela metade.
      if (!customFrom || !customTo) { if (silent) setRefreshing(false); return; }
      qs.set("from", customFrom);
      qs.set("to", customTo);
    }
    try {
      const [r, rh] = await Promise.all([
        fetch(`/api/analytics/stats?${qs.toString()}`, { headers }),
        fetch("/api/analytics/health", { headers }),
      ]);
      const data = await r.json() as Stats;
      setStats(data);
      if (rh.ok) setHealth(await rh.json() as Health);
      setLastUpdated(new Date());
      if (!silent) setLoading(false);
    } catch {
      if (!silent) { setError(true); setLoading(false); }
    } finally {
      if (silent) setRefreshing(false);
    }
  }, [periodKey, customFrom, customTo]);

  useEffect(() => {
    void fetchStats(false);
    const interval = setInterval(() => { void fetchStats(true); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  function exportPDF() {
    if (!stats) return;
    const now = new Date().toLocaleString(nloc);
    const periodLbl = stats.period
      ? (stats.period.key === "custom"
          ? stats.period.label
          : t(WIN_TKEYS[stats.period.key as Exclude<PeriodKey, "custom">]))
      : t("an.win30d");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="${lang === "en" ? "en" : "pt-BR"}">
<head>
  <meta charset="UTF-8"/>
  <title>${t("an.pdfReportTitle")} — ${now}</title>
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
  <h1>${t("an.pdfH1")}</h1>
  <p class="sub">${t("an.pdfGeneratedAt")} ${now} · ${t("an.pdfPeriod")} ${periodLbl} · ${t("an.pdfFiltered")}</p>

  <h2>${t("an.pdfTrafficSummary")}</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-val">${stats.totals.today.toLocaleString(nloc)}</div><div class="kpi-lbl">${t("an.winToday")}</div></div>
    <div class="kpi"><div class="kpi-val">${stats.totals.week.toLocaleString(nloc)}</div><div class="kpi-lbl">${t("an.win7d")}</div></div>
    <div class="kpi"><div class="kpi-val">${stats.totals.month.toLocaleString(nloc)}</div><div class="kpi-lbl">${t("an.win30d")}</div></div>
    <div class="kpi"><div class="kpi-val">${(stats.engagement?.uniqueSessions ?? 0).toLocaleString(nloc)}</div><div class="kpi-lbl">${t("an.kpiUniqueSessions")}</div></div>
    <div class="kpi"><div class="kpi-val">${stats.engagement?.bounceRate ?? 0}%</div><div class="kpi-lbl">${t("an.kpiBounce")}</div></div>
  </div>

  <h2>${t("an.pdfTopArticles")}</h2>
  <table>
    <tr><th>#</th><th>${t("an.colArticle")}</th><th>${t("an.colViews")}</th><th>${t("an.colAvgTime")}</th></tr>
    ${stats.topArticles.map((a, i) => `<tr><td>${i + 1}</td><td>${a.title.replace(/<[^>]*>/g, "")}</td><td>${a.views.toLocaleString(nloc)}</td><td>${a.avgTime ? Math.floor(a.avgTime / 60) + "m " + (a.avgTime % 60) + "s" : "—"}</td></tr>`).join("")}
  </table>

  <h2>${t("an.pdfCategoryPerf")}</h2>
  <table>
    <tr><th>${t("an.colCategory")}</th><th>${t("an.colViewsShort")}</th><th>${t("an.colClicks")}</th><th>${t("an.colArticles")}</th></tr>
    ${stats.topCategories.map(c => `<tr><td>${c.name}</td><td>${c.views.toLocaleString(nloc)}</td><td>${c.clicks.toLocaleString(nloc)}</td><td>${c.articles}</td></tr>`).join("")}
  </table>

  ${(stats.topCities ?? []).length > 0 ? `
  <h2>${t("an.pdfTopCities")}</h2>
  <table>
    <tr><th>${t("an.colCity")}</th><th>${t("an.colViewsShort")}</th></tr>
    ${(stats.topCities ?? []).map(c => `<tr><td>${c.name}</td><td>${c.views.toLocaleString(nloc)}</td></tr>`).join("")}
  </table>` : ""}

  <div class="footer">${BRAND.name} · ${t("an.pdfFooter")}</div>
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
          {t("an.loading")}
        </div>
      </AdminLayout>
    );
  }

  if (error || !stats) {
    return (
      <AdminLayout title="Analytics">
        <div className="bg-red-50 border border-red-100 text-red-600 p-5 rounded-2xl text-sm">
          {t("an.loadError")}
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
    date:  fmtDate(d.date, lang),
    views: d.views,
  }));
  const hasChart = chartData.some(d => d.views > 0);

  const referrers = (stats.referrerChart ?? []).filter(r => r.value > 0);
  const maxRef = Math.max(...referrers.map(r => r.value), 1);
  const totalRef = referrers.reduce((s, r) => s + r.value, 0) || 1;

  const topCats = stats.topCategories ?? [];
  // Base = MAIOR atividade real da lista inteira (PRD 10 RF2). Nunca só o líder do
  // array: o sort do endpoint tem fallback por nº de artigos e pode pôr categoria
  // SEM acesso na posição 0 — isso fazia os chips dividirem por 1 e exibirem 300%/1500%.
  const maxCatViews = maxMetric(topCats, (c) => (c.clicks || 0) + (c.views || 0));

  const topArts = stats.topArticles ?? [];

  // Tendências REAIS calculadas pelo servidor (janela selecionada vs janela
  // anterior de mesmo tamanho). null = sem base de comparação → badge não aparece.
  const tr = stats.trends ?? {
    today: null, week: null, month: null,
    uniqueSessions: null, avgReadTime: null, bounceRate: null,
  };

  // Janela aplicada pelo servidor (ecoada) — rótulo localizado no cliente
  // (o servidor devolve `period.label` sempre em pt-BR).
  const windowLabel = stats.period
    ? (stats.period.key === "custom"
        ? stats.period.label
        : t(WIN_TKEYS[stats.period.key as Exclude<PeriodKey, "custom">]))
    : t("an.win30d");
  const visitorsRollout = stats.visitors && stats.period && stats.period.from < stats.visitors.since;

  const kpis = [
    {
      label:   t("an.kpiPageviews"),
      value:   (stats.totals?.window ?? stats.totals?.month ?? 0).toLocaleString(nloc),
      delta:   tr.window ?? tr.month,
      deltaTxt: fmtDelta(tr.window ?? tr.month, "%", nloc),
      goodWhenUp: true,
      sub:     t("an.vsPrevPeriod"),
      tip:     `${t("an.pvTip1")} ${windowLabel.toLowerCase()}. ${t("an.pvTip2")}`,
      icon:    Eye,
      iconBg:  "#EEF4FF",
      iconClr: "#2563EB",
    },
    {
      label:   t("an.kpiUniqueVisitors"),
      value:   (stats.visitors?.unique ?? 0).toLocaleString(nloc),
      delta:   tr.visitors ?? null,
      deltaTxt: fmtDelta(tr.visitors ?? null, "%", nloc),
      goodWhenUp: true,
      sub:     stats.visitors
        ? `${stats.visitors.new.toLocaleString(nloc)} ${t("an.new")} · ${stats.visitors.returning.toLocaleString(nloc)} ${t("an.returning")}${visitorsRollout ? ` · ${t("an.since")} ${fmtDayBr(stats.visitors.since)}` : ""}`
        : t("an.vsPrevPeriod"),
      tip:     `${t("an.visTip1")} ${fmtDayBr(stats.visitors?.since ?? "2026-07-08")}${t("an.visTip2")}`,
      icon:    Users,
      iconBg:  "#F5F3FF",
      iconClr: "#7C3AED",
    },
    {
      label:   t("an.kpiUniqueSessions"),
      value:   (stats.engagement?.uniqueSessions ?? 0).toLocaleString(nloc),
      delta:   tr.uniqueSessions,
      deltaTxt: fmtDelta(tr.uniqueSessions, "%", nloc),
      goodWhenUp: true,
      sub:     t("an.vsPrevPeriod"),
      tip:     t("an.sessTip"),
      icon:    Users,
      iconBg:  "#ECFDF5",
      iconClr: "#16A34A",
    },
    {
      label:   t("an.kpiAvgTime"),
      value:   fmtSecs(stats.engagement?.avgReadTime ?? 0),
      delta:   tr.avgReadTime,
      deltaTxt: fmtDelta(tr.avgReadTime, "%", nloc),
      goodWhenUp: true,
      sub:     t("an.vsPrevPeriod"),
      tip:     t("an.avgTimeTip"),
      icon:    Clock,
      iconBg:  "#FFF7ED",
      iconClr: "#F97316",
    },
    {
      label:   t("an.kpiBounce"),
      value:   `${stats.engagement?.bounceRate ?? 0}%`,
      delta:   tr.bounceRate,
      deltaTxt: fmtDelta(tr.bounceRate, " pp", nloc),
      goodWhenUp: false,
      sub:     t("an.vsPrevPeriod"),
      tip:     t("an.bounceTip"),
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
              {t("an.live")}
            </div>
            {lastUpdated && (
              <span className="text-xs text-slate-400">
                {t("an.updatedAt")} {lastUpdated.toLocaleTimeString(nloc, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de período — a janela aplicada é a que o servidor ecoa */}
            <div className="flex border border-slate-200 rounded-xl overflow-hidden text-xs bg-white">
              {PERIOD_PRESETS.map(({ key, tk }) => (
                <button
                  key={key}
                  onClick={() => setPeriodKey(key)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    periodKey === key ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {t(tk)}
                </button>
              ))}
            </div>
            {periodKey === "custom" && (
              <div className="flex items-center gap-1.5 text-xs">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-600 bg-white"/>
                <span className="text-slate-400">{t("an.rangeTo")}</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-600 bg-white"/>
              </div>
            )}
            <button
              onClick={() => { void fetchStats(true); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""}/>
              {t("an.refresh")}
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#0B2A66] rounded-xl hover:bg-[#0a2255] transition-colors"
            >
              <Download size={12}/>
              {t("an.exportPdf")}
            </button>
          </div>
        </div>

        {/* ── KPI cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          {kpis.map(({ label, value, delta, deltaTxt, goodWhenUp, sub, tip, icon: Icon, iconBg, iconClr }) => (
            <div key={label} className="bg-white rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: CARD_SHADOW }} title={tip}>
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
                  <Icon size={18} style={{ color: iconClr }} />
                </div>
                {deltaTxt !== null && delta !== null && (
                  <span
                    className={`flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      delta === 0
                        ? "bg-slate-50 text-slate-500"
                        : (delta > 0) === goodWhenUp
                          ? "bg-green-50 text-green-600"
                          : "bg-red-50 text-red-500"
                    }`}
                  >
                    {delta >= 0
                      ? <ArrowUpRight size={11} />
                      : <ArrowDownRight size={11} />}
                    {deltaTxt}
                  </span>
                )}
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
              <div className="flex items-center gap-2" title={t("an.trafficTip")}>
                <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.trafficOverTime")}</h2>
                <Info size={13} className="text-slate-400" />
              </div>
              <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                {windowLabel}
              </span>
            </div>
            {!hasChart ? (
              <EmptyState label={t("an.noTrafficYet")} />
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
                    formatter={(v: number) => [v.toLocaleString(nloc), t("an.views")]}
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
              <div className="flex items-center gap-2" title={t("an.sourcesTip")}>
                <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.trafficSources")}</h2>
                <Info size={13} className="text-slate-400" />
              </div>
              <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                {windowLabel}
              </span>
            </div>
            {referrers.length === 0 ? (
              <EmptyState label={t("an.noSourceData")} />
            ) : (
              <div className="space-y-4">
                {referrers.map(({ name, value }) => {
                  const pct = ((value / totalRef) * 100).toFixed(1);
                  const color = REFERRER_COLORS[name] ?? "#64748B";
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-600 font-medium">
                          {REFERRER_TKEYS[name] ? t(REFERRER_TKEYS[name]) : name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-[#0F172A]">{pct}%</span>
                          <span className="text-xs text-slate-400">({value.toLocaleString(nloc)})</span>
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
                {/* Domínios de origem e campanhas UTM (quando existem) */}
                {(stats.topRefHosts ?? []).length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{t("an.topRefHosts")}</p>
                    <div className="space-y-1.5">
                      {(stats.topRefHosts ?? []).slice(0, 5).map(({ name, views }) => (
                        <div key={name} className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 truncate max-w-[170px]">{name}</span>
                          <span className="text-xs font-semibold text-[#0F172A]">{views.toLocaleString(nloc)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(stats.topCampaigns ?? []).length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{t("an.campaigns")}</p>
                    <div className="space-y-1.5">
                      {(stats.topCampaigns ?? []).slice(0, 5).map(({ name, views }) => (
                        <div key={name} className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 truncate max-w-[170px]">{name}</span>
                          <span className="text-xs font-semibold text-[#0F172A]">{views.toLocaleString(nloc)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Devices donut (2/10) */}
          <div className="xl:col-span-2 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-2 mb-5" title={t("an.devicesTip")}>
              <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.devices")}</h2>
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
                    {(stats.totals?.window ?? stats.totals?.month ?? 0).toLocaleString(nloc)}
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
              {/* Navegador / SO (parse do user-agent no servidor) */}
              {(stats.browsers ?? []).length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 w-full">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("an.browsers")}</p>
                  <div className="space-y-1">
                    {(stats.browsers ?? []).slice(0, 4).map(({ name, views }) => (
                      <div key={name} className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 capitalize">{name}</span>
                        <span className="text-xs font-semibold text-[#0F172A]">{views.toLocaleString(nloc)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(stats.osList ?? []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 w-full">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("an.systems")}</p>
                  <div className="space-y-1">
                    {(stats.osList ?? []).slice(0, 4).map(({ name, views }) => (
                      <div key={name} className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 capitalize">{name}</span>
                        <span className="text-xs font-semibold text-[#0F172A]">{views.toLocaleString(nloc)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">

          {/* Top articles table (4/10) */}
          <div className="xl:col-span-4 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.topArticles")}</h2>
                <Info size={13} className="text-slate-400" />
              </div>
            </div>
            {/* Table header — só métricas reais: views e tempo médio de leitura */}
            <div className="grid grid-cols-[1fr_90px_90px] gap-2 pb-2 mb-1 border-b border-slate-100">
              {[t("an.colArticle"), t("an.colViews"), t("an.colAvgTime")].map(h => (
                <p key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{h}</p>
              ))}
            </div>
            {topArts.length === 0 ? (
              <EmptyState label={t("an.noDataYet")} />
            ) : (
              <div className="space-y-1">
                {topArts.slice(0, 5).map((a) => (
                  <div key={a.id} className="grid grid-cols-[1fr_90px_90px] gap-2 items-center py-2.5 border-b border-slate-50 last:border-0">
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
                    <p className="text-xs font-semibold text-[#0F172A]">{a.views.toLocaleString(nloc)}</p>
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full w-fit">
                      {a.avgTime ? fmtSecs(a.avgTime) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <Link href="/admin/artigos" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
                {t("an.seeAllArticles")} <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>

          {/* Category audience (3/10) */}
          <div className="xl:col-span-3 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.topCategories")}</h2>
                <Info size={13} className="text-slate-400" />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_64px_64px_64px_48px] gap-2 pb-2 mb-1 border-b border-slate-100">
              {[t("an.colCategory"), t("an.colViewsShort"), t("an.colClicks"), t("an.colArticles"), "%"].map(h => (
                <p key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{h}</p>
              ))}
            </div>
            {topCats.length === 0 ? (
              <EmptyState label={t("an.noCategoryData")} />
            ) : (
              <div className="space-y-3 mt-2">
                {topCats.slice(0, 6).map((cat, i) => {
                  const color = catColor(cat.name, i);
                  const totalActivity = (cat.clicks || 0) + (cat.views || 0);
                  const pct = pctOfMax(totalActivity, maxCatViews).toFixed(1);
                  const clicks = cat.clicks ?? 0;
                  const articles = cat.articles ?? 0;
                  return (
                    <div key={cat.name}>
                      <div className="grid grid-cols-[1fr_64px_64px_64px_48px] gap-2 items-center mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs text-slate-700 capitalize font-medium truncate">{cat.name}</span>
                        </div>
                        <p className="text-xs font-semibold text-[#0F172A]">{cat.views.toLocaleString(nloc)}</p>
                        <div className="flex items-center gap-1">
                          <ArrowUpRight size={10} className="text-green-500 shrink-0" />
                          <p className="text-xs text-slate-600">{clicks.toLocaleString(nloc)}</p>
                        </div>
                        <p className="text-xs text-slate-500">{articles}</p>
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md w-fit" style={{ backgroundColor: color + "22", color }}>{pct}%</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden ml-4">
                        <div className="h-full rounded-full" style={{ width: `${pctOfMax(totalActivity, maxCatViews)}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Localização: Cidades / Estados (3/10) */}
          <div className="xl:col-span-3 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2" title={t("an.locationTip")}>
                <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.location")}</h2>
                <Info size={13} className="text-slate-400" />
              </div>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
                <button
                  onClick={() => setGeoTab("cidades")}
                  className={`px-3 py-1 font-medium transition-colors ${geoTab === "cidades" ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {t("an.cities")}
                </button>
                <button
                  onClick={() => setGeoTab("estados")}
                  className={`px-3 py-1 font-medium transition-colors ${geoTab === "estados" ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {t("an.states")}
                </button>
              </div>
            </div>

            {geoTab === "cidades" ? (
              (() => {
                const cities = stats.topCities ?? [];
                const maxV = cities[0]?.views || 1;
                return cities.length === 0 ? (
                  <EmptyState label={t("an.waitingLocation")} />
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-[1fr_48px_44px] text-[10px] font-semibold text-slate-400 uppercase tracking-wide pb-1 border-b border-slate-100">
                      <span>{t("an.colCity")}</span><span className="text-right">{t("an.colViewsShort")}</span><span className="text-right">%</span>
                    </div>
                    {cities.map(({ name, views }, i) => {
                      const color = GEO_COLORS[i % GEO_COLORS.length]!;
                      const pct = ((views / maxV) * 100).toFixed(0);
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs text-slate-600 flex-1 truncate">{name}</span>
                          <span className="text-xs font-semibold text-[#0F172A] w-10 text-right">{views.toLocaleString(nloc)}</span>
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
                  <EmptyState label={t("an.waitingLocation")} />
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-[1fr_48px_44px] text-[10px] font-semibold text-slate-400 uppercase tracking-wide pb-1 border-b border-slate-100">
                      <span>{t("an.colState")}</span><span className="text-right">{t("an.colViewsShort")}</span><span className="text-right">%</span>
                    </div>
                    {regions.map(({ name, views }, i) => {
                      const color = GEO_COLORS[i % GEO_COLORS.length]!;
                      const pct = ((views / maxV) * 100).toFixed(0);
                      return (
                        <div key={name}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs text-slate-600 flex-1 truncate">{name}</span>
                            <span className="text-xs font-semibold text-[#0F172A]">{views.toLocaleString(nloc)}</span>
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
              <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.peakByHour")}</h2>
              {stats.peakHour !== undefined && (stats.hourlyChart ?? []).some(h => h.views > 0) && (
                <span className="text-[11px] font-semibold bg-blue-50 text-[#2563EB] px-2 py-0.5 rounded-full">
                  {t("an.peak")} {String(stats.peakHour).padStart(2,"0")}h
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
                  formatter={(v: number) => [v, t("an.views")]}
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
              <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.peakByWeekday")}</h2>
              {stats.peakDay && (stats.dayOfWeekChart ?? []).some(d => d.views > 0) && (() => {
                // PRD 06 elege o pico por média/ocorrência; a barra continua por soma
                // bruta. Quando o dia eleito não é o de maior barra (só quando `avg`
                // já vem do PRD 06), sinalizamos com "*" + tooltip — sem mudar a barra.
                const dowData = stats.dayOfWeekChart ?? [];
                const hasAvg = dowData.some(d => typeof d.avg === "number");
                const maxViewsDay = dowData.reduce(
                  (best, d) => (d.views > (best?.views ?? -1) ? d : best),
                  dowData[0],
                )?.day;
                const divergent = hasAvg && maxViewsDay !== stats.peakDay;
                return (
                  <span
                    className="text-[11px] font-semibold bg-red-50 text-[#E71D36] px-2 py-0.5 rounded-full"
                    title={divergent ? t("an.peakByAvgTip") : undefined}
                  >
                    {t("an.peak")} {dow(stats.peakDay)}{divergent ? " *" : ""}
                  </span>
                );
              })()}
            </div>
            {(stats.dayOfWeekChart ?? []).every(d => d.views === 0) ? (
              <EmptyState label={t("an.waitingData")} />
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={stats.dayOfWeekChart ?? []} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="#F1F5F9" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={dow} />
                  <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #E2E8F0" }}
                    formatter={(v: number, _name, item: { payload?: { occurrences?: number; avg?: number | null } }) => {
                      const occ = item?.payload?.occurrences;
                      const avg = item?.payload?.avg;
                      if (typeof occ === "number" && occ > 0 && typeof avg === "number") {
                        return [`${v} (${t("an.avgPerOcc")}: ${avg})`, t("an.views")];
                      }
                      return [v, t("an.views")];
                    }}
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
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}
            title={t("an.readDepthTip")}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-[#0B2A66]">{t("an.readDepth")}</h2>
              <span className="text-xs text-slate-400">{t("an.readDepthSub")}</span>
            </div>
            {(stats.scrollDepthChart ?? []).every(d => d.count === 0) ? (
              <EmptyState label={t("an.noScrollData")} />
            ) : (
              <div className="space-y-4">
                {(stats.scrollDepthChart ?? []).map(({ depth, count }) => {
                  const colors: Record<number, string> = { 25: "#16A34A", 50: "#2563EB", 75: "#F97316", 100: "#E71D36" };
                  const labels: Record<number, string> = { 25: t("an.depth25"), 50: t("an.depth50"), 75: t("an.depth75"), 100: t("an.depth100") };
                  const maxVal = Math.max(...(stats.scrollDepthChart ?? []).map(d => d.count), 1);
                  return (
                    <div key={depth}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-slate-600">{labels[depth]}</span>
                        <span className="text-xs font-semibold text-[#0F172A]">{count.toLocaleString(nloc)} {t("an.readDepthUnit")}</span>
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

        {/* ══ PROPAGANDAS ═══════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Megaphone size={16} className="text-[#E71D36]" />
            <h2 className="text-sm font-bold text-[#0B2A66] uppercase tracking-wide">{t("an.ads")}</h2>
            <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100"
              title={t("an.adsTip")}>
              {windowLabel}
            </span>
          </div>

          {/* KPIs de anúncios */}
          {stats.adKpis && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
              {[
                {
                  label: t("an.adTotalImpressions"),
                  value: (stats.adKpis.totalImpressions).toLocaleString(nloc),
                  icon: Eye, iconBg: "#EEF4FF", iconClr: "#2563EB",
                },
                {
                  label: t("an.adTotalClicks"),
                  value: (stats.adKpis.totalClicks).toLocaleString(nloc),
                  icon: MousePointerClick, iconBg: "#ECFDF5", iconClr: "#16A34A",
                },
                {
                  label: t("an.adAvgCtr"),
                  value: `${stats.adKpis.avgCtr.toFixed(2)}%`,
                  icon: BarChart2, iconBg: "#FFF7ED", iconClr: "#F97316",
                },
                {
                  label: t("an.adBest"),
                  value: stats.adKpis.bestAdName
                    ? `${stats.adKpis.bestAdCtr.toFixed(2)}% CTR`
                    : "—",
                  sub: stats.adKpis.bestAdName ?? "",
                  icon: ArrowUpRight, iconBg: "#FEF2F2", iconClr: "#E71D36",
                },
              ].map(({ label, value, sub, icon: Icon, iconBg, iconClr }) => (
                <div key={label} className="bg-white rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: CARD_SHADOW }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
                    <Icon size={18} style={{ color: iconClr }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#0F172A] leading-none">{value}</p>
                    {sub && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>}
                    <p className="text-sm text-slate-600 mt-1">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">
            {/* Tabela de anúncios */}
            <div className="xl:col-span-6 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
              <h3 className="text-sm font-semibold text-[#0B2A66] mb-4">{t("an.adPerformance")} <span className="font-normal text-slate-400">{t("an.adPerformanceSub")}</span></h3>
              {!stats.adStats || stats.adStats.length === 0 ? (
                <EmptyState label={t("an.noAdsYet")} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{t("an.colAd")}</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{t("an.colImpressions")}</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{t("an.colClicks")}</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">CTR</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{t("an.colStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.adStats.map((ad) => {
                        const ctrColor = ad.ctr >= 2 ? "#16A34A" : ad.ctr >= 0.5 ? "#F97316" : "#94A3B8";
                        const maxImpr  = Math.max(...(stats.adStats ?? []).map(a => a.impressions), 1);
                        return (
                          <tr key={ad.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 px-3">
                              <div className="font-medium text-slate-800 truncate max-w-[200px]">{ad.name}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{ad.position}</div>
                              <div className="h-1 bg-slate-100 rounded-full mt-1.5 w-full max-w-[180px]">
                                <div
                                  className="h-full rounded-full bg-[#2563EB]/60"
                                  style={{ width: `${(ad.impressions / maxImpr) * 100}%` }}
                                />
                              </div>
                            </td>
                            {ad.hasData === false ? (
                              /* Sem registro diário no período ≠ zero real */
                              <td colSpan={3} className="py-3 px-3 text-right text-[11px] text-slate-400 italic">
                                {t("an.noAdDataPeriod")}
                              </td>
                            ) : (
                              <>
                                <td className="py-3 px-3 text-right font-semibold text-slate-700">
                                  {ad.impressions.toLocaleString(nloc)}
                                </td>
                                <td className="py-3 px-3 text-right font-semibold text-slate-700">
                                  {ad.clicks.toLocaleString(nloc)}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <span className="font-bold text-sm" style={{ color: ctrColor }}>{ad.ctr.toFixed(2)}%</span>
                                </td>
                              </>
                            )}
                            <td className="py-3 px-3 text-right">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                ad.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${ad.active ? "bg-green-500" : "bg-slate-400"}`} />
                                {ad.active ? t("an.adActive") : t("an.adPaused")}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Gráfico de impressões dos top 3 anúncios */}
            <div className="xl:col-span-4 bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
              <h3 className="text-sm font-semibold text-[#0B2A66] mb-1">{t("an.adImprTop3")} ({windowLabel.toLowerCase()})</h3>
              <p className="text-xs text-slate-400 mb-4">{t("an.adImprSub")}</p>
              {/* 3 estados distintos: coleta nunca começou / começou mas nada NESTE período / dados */}
              {stats.adHasAnyData === false ? (
                <EmptyState label={t("an.adAccruing")} />
              ) : !stats.adDailyChart || stats.adDailyChart.every(d => (stats.adTopNames ?? []).every(n => (d[n] as number) === 0)) ? (
                <EmptyState label={t("an.noPeriodData")} />
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={stats.adDailyChart as { date: string; [key: string]: unknown }[]} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="#F1F5F9" strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                      interval={6}
                      tickFormatter={(d) => fmtDate(d, lang)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #E2E8F0" }}
                    />
                    {(stats.adTopNames ?? []).map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={["#2563EB","#E71D36","#F97316"][i] ?? "#64748B"}
                        strokeWidth={2}
                        dot={false}
                        name={name}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
              {(stats.adTopNames ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {(stats.adTopNames ?? []).map((name, i) => (
                    <span key={name} className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: ["#2563EB","#E71D36","#F97316"][i] ?? "#64748B" }} />
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ COMPORTAMENTO ═════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-[#7C3AED]" />
            <h2 className="text-sm font-bold text-[#0B2A66] uppercase tracking-wide">{t("an.behavior")}</h2>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* Termos buscados */}
            <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Search size={14} className="text-[#7C3AED]" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-700">{t("an.topSearchTerms")}</h3>
                  <p className="text-[10px] text-slate-400">{windowLabel}</p>
                </div>
              </div>
              {!stats.behaviorStats?.topSearchTerms.length ? (
                <EmptyState label={t("an.noSearches")} />
              ) : (
                <div className="space-y-2">
                  {stats.behaviorStats.topSearchTerms.slice(0, 8).map(({ term, count }, i) => {
                    const maxC = stats.behaviorStats!.topSearchTerms[0]!.count;
                    return (
                      <div key={term}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-700 font-medium truncate max-w-[160px]">{term}</span>
                          <span className="text-xs font-semibold text-slate-500">{count}×</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(count / maxC) * 100}%`, background: ["#7C3AED","#2563EB","#F97316","#16A34A","#E71D36","#0891b2","#F59E0B","#64748B"][i % 8] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Links externos mais clicados */}
            <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                  <ExternalLink size={14} className="text-[#2563EB]" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-700">{t("an.externalLinks")}</h3>
                  <p className="text-[10px] text-slate-400">{t("an.destinationDomains")}</p>
                </div>
              </div>
              {!stats.behaviorStats?.topLinkDomains.length ? (
                <EmptyState label={t("an.noExternalClicks")} />
              ) : (
                <div className="space-y-2">
                  {stats.behaviorStats.topLinkDomains.slice(0, 8).map(({ domain, count }, i) => {
                    const maxC = stats.behaviorStats!.topLinkDomains[0]!.count;
                    return (
                      <div key={domain}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-700 font-medium truncate max-w-[160px]">{domain}</span>
                          <span className="text-xs font-semibold text-slate-500">{count}×</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(count / maxC) * 100}%`, background: ["#2563EB","#16A34A","#F97316","#E71D36","#7C3AED","#0891b2","#F59E0B","#64748B"][i % 8] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Resumo de comportamento */}
            <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
                  <FileText size={14} className="text-[#F97316]" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-700">{t("an.interactionsSummary")}</h3>
                  <p className="text-[10px] text-slate-400">{windowLabel}</p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  {
                    label: t("an.totalEvents"),
                    value: (stats.behaviorStats?.totalEvents ?? 0).toLocaleString(nloc),
                    icon: BarChart2, color: "#7C3AED", bg: "#F5F3FF",
                  },
                  {
                    label: t("an.searchesMade"),
                    // PRD 10 RF4: total real (PRD 07). Fallback p/ soma truncada quando
                    // a API do blog ainda não tiver o PRD 07 (rollout parcial) — nunca crash.
                    value: (
                      stats.behaviorStats?.searchesTotal ??
                      stats.behaviorStats?.topSearchTerms.reduce((s, term) => s + term.count, 0) ??
                      0
                    ).toLocaleString(nloc),
                    icon: Search, color: "#2563EB", bg: "#EEF4FF",
                  },
                  {
                    label: t("an.externalClicks"),
                    // PRD 10 RF4: idem — total real com fallback tolerante.
                    value: (
                      stats.behaviorStats?.externalClicksTotal ??
                      stats.behaviorStats?.topLinkDomains.reduce((s, d) => s + d.count, 0) ??
                      0
                    ).toLocaleString(nloc),
                    icon: ExternalLink, color: "#16A34A", bg: "#ECFDF5",
                  },
                  {
                    label: t("an.newsletterSignups"),
                    value: (stats.behaviorStats?.newsletterSignups ?? 0).toLocaleString(nloc),
                    icon: Mail, color: "#F97316", bg: "#FFF7ED",
                  },
                  {
                    label: t("an.shares"),
                    value: (stats.shareChart ?? []).reduce((s, p) => s + p.count, 0).toLocaleString(nloc),
                    icon: ArrowUpRight, color: "#E71D36", bg: "#FEF2F2",
                  },
                  {
                    label: t("an.read100"),
                    value: (stats.engagement?.readCompletions ?? 0).toLocaleString(nloc),
                    icon: Eye, color: "#0891b2", bg: "#ECFEFF",
                  },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 truncate">{label}</p>
                    </div>
                    <p className="text-sm font-bold text-[#0F172A]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══ SAÚDE DA COLETA ═══════════════════════════════════ */}
        {health && (
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-slate-400" />
              <h2 className="text-xs font-bold text-[#0B2A66] uppercase tracking-wide">{t("an.collectionHealth")}</h2>
              <span className="text-[10px] text-slate-400">{t("an.collectionHealthSub")}</span>
            </div>
            {/* Alertas automáticos (PRD 08) — no topo do card. Vazio = saudável (não ausência). */}
            {health.alerts && (
              health.alerts.length > 0 ? (
                <div className="flex flex-col gap-1.5 mb-3">
                  {health.alerts.map((a, i) => {
                    const raw = t(`an.alert.${a.id}` as AdminTKey);
                    const msg = raw ? fillParams(raw, a.params) : `${t("an.alertUnknown")} (${a.id})`;
                    const crit = a.severity === "critical";
                    return (
                      <div
                        key={`${a.id}-${i}`}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] ${crit ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        <span>{msg}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-600 mb-3">{t("an.alertNone")}</p>
              )
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-center">
              {[
                { label: t("an.hAccepted"), value: health.received, tip: t("an.hAcceptedTip") },
                { label: t("an.hStored"), value: health.flushedOk, tip: t("an.hStoredTip") },
                { label: t("an.hBots"), value: health.droppedBot, tip: t("an.hBotsTip") },
                { label: t("an.hDuplicates"), value: health.droppedDuplicate, tip: t("an.hDuplicatesTip") },
                { label: t("an.hRateLimit"), value: health.droppedRate, tip: t("an.hRateLimitTip") },
                { label: t("an.hInternal"), value: health.flaggedInternal, tip: t("an.hInternalTip") },
              ].map(({ label, value, tip }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-2 py-2.5" title={tip}>
                  <p className="text-sm font-bold text-[#0F172A]">{value.toLocaleString(nloc)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {/* Contadores por endpoint (PRD 03 → exibição PRD 08). Oculta se a API for antiga. */}
            {health.byEndpoint && (
              <div className="mt-3 overflow-x-auto">
                <p className="text-[10px] font-semibold text-slate-500 mb-1">{t("an.hEndpointTable")}</p>
                <table className="w-full text-[11px] text-right whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left font-medium py-1 pr-2">&nbsp;</th>
                      <th className="font-medium px-2">{t("an.hAccepted")}</th>
                      <th className="font-medium px-2">{t("an.hBots")}</th>
                      <th className="font-medium px-2">{t("an.hRateLimit")}</th>
                      <th className="font-medium px-2">{t("an.hInvalid")}</th>
                      <th className="font-medium px-2">{t("an.hDuplicates")}</th>
                      <th className="font-medium px-2">{t("an.hInternal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["event", "an.hEpEvent"],
                      ["behavior", "an.hEpBehavior"],
                      ["adImpression", "an.hEpAdImp"],
                      ["adClick", "an.hEpAdClick"],
                    ] as const).map(([epKey, labelKey]) => {
                      const ep = health.byEndpoint![epKey];
                      return (
                        <tr key={epKey} className="border-t border-slate-100">
                          <td className="text-left text-slate-500 py-1 pr-2">{t(labelKey)}</td>
                          <td className="px-2 text-slate-700">{ep.received.toLocaleString(nloc)}</td>
                          <td className="px-2 text-slate-500">{ep.droppedBot.toLocaleString(nloc)}</td>
                          <td className="px-2 text-slate-500">{ep.droppedRate.toLocaleString(nloc)}</td>
                          <td className="px-2 text-slate-500">{ep.droppedInvalid.toLocaleString(nloc)}</td>
                          <td className="px-2 text-slate-500">{ep.droppedDuplicate.toLocaleString(nloc)}</td>
                          <td className="px-2 text-slate-500">{ep.flaggedInternal.toLocaleString(nloc)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {health.internalByReason && (
                  <p className="text-[10px] text-slate-400 mt-1.5">{fillParams(t("an.hByReason"), health.internalByReason)}</p>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-slate-400">
              <span>{t("an.hLastEvent")} {health.lastEventAt ? new Date(health.lastEventAt).toLocaleTimeString(nloc) : "—"}</span>
              <span>{t("an.hLastFlush")} {health.lastFlushAt ? new Date(health.lastFlushAt).toLocaleTimeString(nloc) : "—"}</span>
              <span>{t("an.hBuffered")} {health.buffered}</span>
              {health.bootAt && (
                <span>{t("an.hBootAt")} {new Date(health.bootAt).toLocaleString(nloc)}</span>
              )}
              {health.flushFailed > 0 && (
                <span className="text-red-500 font-semibold">{t("an.hFlushFailed")} {health.flushFailed}</span>
              )}
              <span className="font-medium text-slate-500">{t("an.hReliableSince")} {fmtDayBr(health.reliableSince)}</span>
              {health.adsReliableSince !== undefined && (
                <span className="font-medium text-slate-500">
                  {health.adsReliableSince
                    ? `${t("an.hAdsReliableSince")} ${fmtDayBr(health.adsReliableSince)}`
                    : t("an.hAdsRepairPending")}
                </span>
              )}
              {health.alertsSkipped && health.alertsSkipped.length > 0 && (
                <span title={health.alertsSkipped.map((s) => `${s.id}: ${s.reason}`).join("\n")}>
                  {fillParams(t("an.alertSkipped"), { count: health.alertsSkipped.length })}
                </span>
              )}
            </div>
            {/* filters[] — antes buscado e descartado; agora renderizado (PRD 08 RF6). */}
            {health.filters && health.filters.length > 0 && (
              <details className="mt-2 text-[11px] text-slate-400">
                <summary className="cursor-pointer select-none">{t("an.hFiltersTitle")}</summary>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {health.filters.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400 text-center pb-2">
          {t("an.footerNote")} ·
          {" "}{t("an.hReliableSince")} {fmtDayBr(health?.reliableSince ?? "2026-07-08")} ·
          {" "}{t("an.serverTz")} · {t("an.autoRefresh")}
        </p>
      </div>
    </AdminLayout>
  );
}
