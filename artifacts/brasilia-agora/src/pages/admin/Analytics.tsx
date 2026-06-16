import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Eye, TrendingUp, Clock, Smartphone, Users, BookOpen,
  Share2, ArrowDownUp, RotateCcw,
} from "lucide-react";

interface Stats {
  totals: { today: number; week: number; month: number; allTime: number };
  engagement?: { uniqueSessions: number; avgReadTime: number; bounceRate: number; readCompletions: number };
  dailyChart: { date: string; views: number }[];
  hourlyChart: { hour: number; views: number }[];
  topArticles: { id: string; title: string; views: number; avgTime?: number }[];
  topCategories: { name: string; views: number; articles: number }[];
  devices: { mobile: number; desktop: number; tablet: number };
  scrollDepthChart?: { depth: number; count: number }[];
  referrerChart?: { name: string; value: number }[];
  shareChart?: { platform: string; count: number }[];
}

const COLORS = ["#c8102e", "#0b3d91", "#16a34a", "#f59e0b", "#6b21a8"];

const REFERRER_COLORS: Record<string, string> = {
  direto:  "#0b3d91",
  busca:   "#16a34a",
  social:  "#c8102e",
  outro:   "#9ca3af",
};

const REFERRER_LABELS: Record<string, string> = {
  direto: "Direto",
  busca:  "Busca (Google…)",
  social: "Redes sociais",
  outro:  "Outros sites",
};

const SHARE_LABELS: Record<string, string> = {
  facebook:  "Facebook",
  twitter:   "Twitter/X",
  whatsapp:  "WhatsApp",
  copy:      "Link copiado",
};

function fmtSecs(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}min` : `${m}min ${rem}s`;
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

  const deviceTotal = stats
    ? (stats.devices.mobile + stats.devices.desktop + stats.devices.tablet) || 1
    : 1;

  const deviceData = stats
    ? [
        { name: "Desktop", value: stats.devices.desktop, pct: Math.round(stats.devices.desktop / deviceTotal * 100) },
        { name: "Mobile",  value: stats.devices.mobile,  pct: Math.round(stats.devices.mobile  / deviceTotal * 100) },
        { name: "Tablet",  value: stats.devices.tablet,  pct: Math.round(stats.devices.tablet  / deviceTotal * 100) },
      ]
    : [];

  const fmtHour = (h: number) => `${String(h).padStart(2, "0")}h`;
  const fmtDate = (d: string) => { const [, m, day] = d.split("-"); return `${day}/${m}`; };

  const maxScroll = stats ? Math.max(...(stats.scrollDepthChart ?? []).map(d => d.count), 1) : 1;
  const maxRef    = stats ? Math.max(...(stats.referrerChart ?? []).map(d => d.value), 1) : 1;

  return (
    <AdminLayout title="Analytics">
      {loading && (
        <div className="flex items-center justify-center h-64 text-gray-400">
          Carregando dados…
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg text-sm">
          Erro ao carregar analytics. Verifique se o servidor está rodando.
        </div>
      )}

      {stats && (
        <div className="space-y-6">

          {/* ── Pageviews ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Hoje",        value: stats.totals.today,   icon: Eye,       color: "bg-[#c8102e]" },
              { label: "Esta semana", value: stats.totals.week,    icon: TrendingUp, color: "bg-[#0b3d91]" },
              { label: "Este mês",    value: stats.totals.month,   icon: Clock,      color: "bg-green-600" },
              { label: "Total geral", value: stats.totals.allTime, icon: Smartphone, color: "bg-amber-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
                <div className={`${color} text-white p-3 rounded-lg shrink-0`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{value.toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Engajamento ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Sessões únicas",    value: stats.engagement.uniqueSessions.toLocaleString("pt-BR"),   icon: Users,      color: "bg-violet-600",  sub: "visitantes distintos"   },
              { label: "Tempo médio leitura", value: fmtSecs(stats.engagement.avgReadTime), icon: BookOpen, color: "bg-sky-600",    sub: "por sessão de leitura"  },
              { label: "Taxa de rejeição",  value: `${stats.engagement.bounceRate}%`,       icon: RotateCcw,  color: "bg-orange-500", sub: "sessões com 1 só página" },
              { label: "Leituras completas", value: stats.engagement.readCompletions.toLocaleString("pt-BR"), icon: ArrowDownUp, color: "bg-teal-600",   sub: "artigos lidos 100%"    },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
                <div className={`${color} text-white p-3 rounded-lg shrink-0`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-gray-800 truncate">{value}</p>
                  <p className="text-xs text-gray-500 leading-tight">{label}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Pageviews 30 dias ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Pageviews — últimos 30 dias
            </h2>
            {stats.dailyChart.every(d => d.views === 0) ? (
              <p className="text-gray-400 text-sm text-center py-8">
                Nenhum dado ainda. Acesse o site para gerar eventos.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={stats.dailyChart}>
                  <defs>
                    <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#c8102e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#c8102e" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} width={30} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString("pt-BR"), "Views"]} labelFormatter={fmtDate} />
                  <Area type="monotone" dataKey="views" stroke="#c8102e" fill="url(#pvGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Pico por hora ── */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Pico de acessos por hora
              </h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.hourlyChart}>
                  <XAxis dataKey="hour" tickFormatter={fmtHour} tick={{ fontSize: 9 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} width={28} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, "Views"]} labelFormatter={fmtHour} />
                  <Bar dataKey="views" fill="#0b3d91" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Dispositivos ── */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Dispositivos
              </h2>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={deviceData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {deviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "Views"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {deviceData.map(({ name, pct }, i) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-sm text-gray-600 flex-1">{name}</span>
                      <span className="text-sm font-bold text-gray-800">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Origens do tráfego ── */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Origens do tráfego
              </h2>
              {stats.referrerChart.every(r => r.value === 0) ? (
                <p className="text-gray-400 text-sm text-center py-6">Sem dados ainda</p>
              ) : (
                <div className="space-y-3">
                  {stats.referrerChart.map(({ name, value }) => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500 w-28 shrink-0">
                        {REFERRER_LABELS[name] ?? name}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${(value / maxRef) * 100}%`,
                            backgroundColor: REFERRER_COLORS[name] ?? "#6b21a8",
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-10 text-right">
                        {value.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Compartilhamentos */}
              {stats.shareChart.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-5 mb-2 flex items-center gap-1.5">
                    <Share2 size={11}/> Compartilhamentos
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {stats.shareChart.map(({ platform, count }) => (
                      <span key={platform} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
                        {SHARE_LABELS[platform] ?? platform}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Profundidade de rolagem ── */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Profundidade de leitura
              </h2>
              {stats.scrollDepthChart.every(d => d.count === 0) ? (
                <p className="text-gray-400 text-sm text-center py-6">
                  Sem dados ainda. Os dados aparecem quando leitores rolam os artigos.
                </p>
              ) : (
                <div className="space-y-4">
                  {stats.scrollDepthChart.map(({ depth, count }) => {
                    const colors: Record<number, string> = {
                      25:  "#16a34a",
                      50:  "#0b3d91",
                      75:  "#f59e0b",
                      100: "#c8102e",
                    };
                    const labels: Record<number, string> = {
                      25:  "Início (25%)",
                      50:  "Metade (50%)",
                      75:  "Quase fim (75%)",
                      100: "Leu tudo (100%)",
                    };
                    return (
                      <div key={depth} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-600">{labels[depth]}</span>
                          <span className="text-gray-500">{count.toLocaleString("pt-BR")} leitores</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-3 rounded-full transition-all"
                            style={{
                              width: `${(count / maxScroll) * 100}%`,
                              backgroundColor: colors[depth],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {maxScroll > 0 && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      {Math.round((stats.scrollDepthChart.find(d => d.depth === 100)?.count ?? 0) / (stats.scrollDepthChart.find(d => d.depth === 25)?.count || 1) * 100)}% dos leitores que começaram terminaram o artigo.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Top categorias ── */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Categorias mais acessadas
              </h2>
              {stats.topCategories.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sem dados ainda</p>
              ) : (
                <div className="space-y-2">
                  {stats.topCategories.map(({ name, views }, i) => {
                    const max = stats.topCategories[0]?.views ?? 1;
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-semibold text-gray-700 capitalize">{name}</span>
                            <span className="text-xs text-gray-500">{views.toLocaleString("pt-BR")}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${(views / Math.max(max, 1)) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Top artigos ── */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Notícias mais lidas
              </h2>
              {stats.topArticles.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sem dados ainda</p>
              ) : (
                <ol className="space-y-3">
                  {stats.topArticles.map(({ title, views, avgTime }, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-[22px] font-black leading-none text-[#c8102e] w-6 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2">{title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-gray-400">{views.toLocaleString("pt-BR")} views</span>
                          {avgTime !== undefined && avgTime > 0 && (
                            <span className="text-[11px] text-sky-600 flex items-center gap-0.5">
                              <Clock size={9}/> {fmtSecs(avgTime)} lidos
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center pb-2">
            Dados coletados apenas de visitantes que aceitaram cookies · Armazenamento em memória (reinicia com o servidor)
          </p>
        </div>
      )}
    </AdminLayout>
  );
}
