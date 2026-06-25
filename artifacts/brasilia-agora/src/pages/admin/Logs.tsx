import React, { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type AuditLog, type SecurityLog, type LogStats } from "../../lib/adminApi";
import { ClipboardList, ShieldAlert, Activity, RefreshCw, Search } from "lucide-react";

type LogTab = "acesso" | "acoes" | "seguranca";

const SEV_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  low:      { bg: "#F1F5F9", color: "#64748B", label: "Baixa" },
  medium:   { bg: "#FEF3C7", color: "#D97706", label: "Média" },
  high:     { bg: "#FEE2E2", color: "#DC2626", label: "Alta" },
  critical: { bg: "#450A0A", color: "#FECACA", label: "Crítico" },
};

function SevBadge({ severity }: { severity: string }) {
  const s = SEV_STYLE[severity] ?? SEV_STYLE.low!;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

function WebhookBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
      style={{ backgroundColor: "#FFF7ED", color: "#C2410C" }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ display: "inline" }}>
        <circle cx="4.5" cy="4.5" r="3.5" stroke="#C2410C" strokeWidth="1.5" />
        <path d="M4.5 2.5v2.2l1.4 1.4" stroke="#C2410C" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      Webhook
    </span>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Logs() {
  const [tab, setTab]               = useState<LogTab>("acoes");
  const [auditLogs, setAuditLogs]   = useState<AuditLog[]>([]);
  const [secLogs, setSecLogs]       = useState<SecurityLog[]>([]);
  const [stats, setStats]           = useState<LogStats | null>(null);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState("");
  const [filterSev, setFilterSev]   = useState("");
  const [filterDate, setFilterDate] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterDate) params.from = filterDate;
      if (filterSev) params.severity = filterSev;
      const [auditRes, secRes, statsRes] = await Promise.all([
        adminApi.getAuditLogs(params),
        adminApi.getSecurityLogs(params),
        adminApi.getLogStats(),
      ]);
      setAuditLogs(auditRes.logs);
      setSecLogs(secRes.logs);
      setStats(statsRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const TABS: { id: LogTab; label: string; icon: React.ElementType; count: number }[] = [
    { id: "acoes",     label: "Logs de Ações",     icon: ClipboardList, count: auditLogs.length },
    { id: "acesso",    label: "Logs de Acesso",    icon: Activity,      count: auditLogs.filter((l) => l.action === "login" || l.action === "logout").length },
    { id: "seguranca", label: "Logs de Segurança", icon: ShieldAlert,   count: secLogs.length },
  ];

  const loginLogs = auditLogs.filter((l) => ["login", "logout", "failed_login"].includes(l.action));
  const actionLogs = auditLogs.filter((l) => !["login", "logout"].includes(l.action));

  return (
    <AdminLayout title="Logs do Sistema">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Logins Falhos (24h)",   value: stats.failedLoginsLast24h,    color: "#DC2626", bg: "#FEE2E2" },
              { label: "Acessos Bloqueados",    value: stats.blockedAccessLast24h,   color: "#D97706", bg: "#FEF3C7" },
              { label: "Eventos Críticos",      value: stats.criticalEventsLast24h,  color: "#7C3AED", bg: "#F3E8FF" },
              { label: "Último Login Admin",    value: stats.lastAdminLogin ? formatDate(stats.lastAdminLogin).split(" ")[0] : "—", color: "#0B2A66", bg: "#EEF2FF" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por e-mail, IP, ação..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0B2A66]" />
          </div>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0B2A66]" />
          <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0B2A66]">
            <option value="">Todas as severidades</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítico</option>
          </select>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white rounded-xl text-sm font-semibold hover:opacity-90">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
          <div className="flex border-b border-slate-100">
            {TABS.map(({ id, label, icon: Icon, count }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${tab === id ? "border-b-2 border-[#0B2A66] text-[#0B2A66]" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon size={15} />
                {label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === id ? "bg-[#EEF2FF] text-[#0B2A66]" : "bg-slate-100 text-slate-500"}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            {tab === "acoes" && (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase">Usuário</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Ação</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Módulo</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Descrição</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">IP</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Data/Hora</th>
                </tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-400">Carregando...</td></tr>
                  ) : actionLogs.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-400">Nenhum log encontrado</td></tr>
                  ) : actionLogs.map((l) => {
                    const meta = parseMetadata(l.metadata);
                    const isWebhook = meta?.source === "webhook_api_key";
                    return (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-[12px] font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          {isWebhook ? <WebhookBadge /> : null}
                          <span>{isWebhook ? "API Key" : (l.userEmail ?? "—")}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded">{l.action}</span></td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">{l.module}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-600 max-w-[260px] truncate">{l.description}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.ipAddress ?? "—"}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-400">{formatDate(l.createdAt)}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            )}

            {tab === "acesso" && (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase">Usuário</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Evento</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">IP</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Navegador</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Data/Hora</th>
                </tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-400">Carregando...</td></tr>
                  ) : loginLogs.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-400">Nenhum log de acesso</td></tr>
                  ) : loginLogs.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-[12px] font-medium text-slate-700">{l.userEmail ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${l.action === "login" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                          {l.action === "login" ? "Login" : l.action === "logout" ? "Logout" : l.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.ipAddress ?? "—"}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-400 max-w-[200px] truncate">{l.userAgent ?? "—"}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-400">{formatDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "seguranca" && (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase">Evento</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Severidade</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Descrição</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Rota</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">IP</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Data/Hora</th>
                </tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-400">Carregando...</td></tr>
                  ) : secLogs.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-400">Nenhum evento de segurança</td></tr>
                  ) : secLogs.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3"><span className="text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded">{l.eventType}</span></td>
                      <td className="px-4 py-3"><SevBadge severity={l.severity} /></td>
                      <td className="px-4 py-3 text-[12px] text-slate-600 max-w-[220px] truncate">{l.description}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.route ?? "—"}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.ipAddress ?? "—"}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-400">{formatDate(l.createdAt)}</td>
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
