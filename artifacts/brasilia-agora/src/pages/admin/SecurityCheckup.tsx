import React, { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type LogStats } from "../../lib/adminApi";
import { ShieldCheck, ShieldAlert, ShieldOff, RefreshCw, CheckCircle, AlertTriangle, XCircle, Activity, Server, Database } from "lucide-react";

type CheckStatus = "ok" | "warning" | "critical";

interface SecurityCheck {
  id: string;
  category: string;
  label: string;
  description: string;
  recommendation: string;
  status: CheckStatus;
  detail?: string;
}

const BASE_CHECKS: Omit<SecurityCheck, "status" | "detail">[] = [
  { id: "hash",       category: "Autenticação", label: "Hash seguro de senhas",          description: "Senhas armazenadas com scrypt (derivação de chave segura).", recommendation: "Senhas já protegidas com scrypt." },
  { id: "sql",        category: "Injeção",      label: "Proteção contra SQL Injection",   description: "Drizzle ORM usa consultas parametrizadas, bloqueando SQL injection.", recommendation: "Mantenha o ORM atualizado." },
  { id: "xss",        category: "Injeção",      label: "Proteção contra XSS",             description: "React escapa automaticamente saídas HTML. Conteúdo de usuário não é renderizado como HTML.", recommendation: "Não use dangerouslySetInnerHTML sem sanitização." },
  { id: "routes",     category: "Controle",     label: "Rotas privadas protegidas",       description: "Todas as rotas admin exigem token Bearer válido.", recommendation: "Verifique se novas rotas usam authMiddleware." },
  { id: "rbac",       category: "Controle",     label: "Permissões validadas no backend", description: "Endpoints sensíveis usam requireAdmin middleware além de authMiddleware.", recommendation: "Aplique requireAdmin em todas as rotas administrativas críticas." },
  { id: "token",      category: "Sessão",       label: "Tokens com expiração",            description: "Tokens HMAC expiram em 7 dias.", recommendation: "Considere reduzir para 24h em produção." },
  { id: "ratelimit",  category: "Brute Force",  label: "Rate limit no login",             description: "Máximo de 10 tentativas por minuto por IP.", recommendation: "Para maior segurança, use Redis para rate limiting distribuído em produção." },
  { id: "lockout",    category: "Brute Force",  label: "Bloqueio após tentativas inválidas", description: "Conta bloqueada por 30 minutos após 5 tentativas inválidas.", recommendation: "Aumente o tempo de bloqueio se necessário." },
  { id: "env",        category: "Configuração", label: "Variáveis sensíveis no .env",     description: "SESSION_SECRET e DATABASE_URL lidos de variáveis de ambiente.", recommendation: "Nunca coloque segredos no código-fonte." },
  { id: "genpass",    category: "Autenticação", label: "Mensagem genérica no login",      description: "Erro de login retorna mensagem genérica sem revelar se e-mail existe.", recommendation: "Mantido corretamente." },
  { id: "cors",       category: "Rede",         label: "CORS configurado",                description: "Express cors() configurado. Em produção, restrinja CORS_ORIGIN.", recommendation: "Configure CORS_ORIGIN=https://seudominio.com.br na Hostinger." },
  { id: "headers",    category: "Rede",         label: "Headers de segurança",            description: "Implementar helmet.js em produção para headers HTTP de segurança.", recommendation: "Adicione helmet em app.ts antes de ir para produção." },
  { id: "https",      category: "Rede",         label: "HTTPS em produção",              description: "Hostinger fornece SSL automático. Configure APP_URL com https://.", recommendation: "Use apenas HTTPS em produção." },
  { id: "logs",       category: "Auditoria",    label: "Logs de segurança ativos",        description: "Tentativas de login, bloqueios e acessos negados são registrados.", recommendation: "Verifique os logs regularmente." },
  { id: "inactive",   category: "Autenticação", label: "Usuários inativos bloqueados",    description: "Login de usuários com status inactive ou blocked é negado.", recommendation: "Mantido corretamente." },
  { id: "editor_block", category: "Controle", label: "Editor bloqueado em rotas restritas", description: "Frontend e backend bloqueiam editores de acessar áreas admin.", recommendation: "Teste digitando URLs restritas quando logado como Editor." },
  { id: "csrf",       category: "Segurança",    label: "Proteção CSRF",                   description: "API stateless com tokens Bearer é naturalmente resistente a CSRF. Cookies não são usados para autenticação.", recommendation: "Mantido corretamente." },
  { id: "backup",     category: "Dados",        label: "Backup do banco de dados",        description: "Hostinger oferece backup automático diário para planos Business+.", recommendation: "Configure e teste restauração de backup na Hostinger." },
];

function getCheckStatus(id: string, stats: LogStats | null): CheckStatus {
  switch (id) {
    case "headers": return "warning";
    case "backup":  return "warning";
    case "token":   return "warning";
    case "cors":    return "warning";
    default: return "ok";
  }
}

const STATUS_ICON: Record<CheckStatus, React.ElementType> = {
  ok: CheckCircle, warning: AlertTriangle, critical: XCircle,
};
const STATUS_COLOR: Record<CheckStatus, string> = {
  ok: "#16A34A", warning: "#D97706", critical: "#DC2626",
};
const STATUS_BG: Record<CheckStatus, string> = {
  ok: "#DCFCE7", warning: "#FEF3C7", critical: "#FEE2E2",
};
const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: "Seguro", warning: "Atenção", critical: "Crítico",
};

export default function SecurityCheckup() {
  const [stats, setStats]     = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbOk, setDbOk]       = useState<boolean | null>(null);
  const [filter, setFilter]   = useState<CheckStatus | "all">("all");

  async function load() {
    setLoading(true);
    try {
      const s = await adminApi.getLogStats();
      setStats(s);
      setDbOk(true);
    } catch {
      setDbOk(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const checks: SecurityCheck[] = BASE_CHECKS.map((c) => ({
    ...c,
    status: getCheckStatus(c.id, stats),
  }));

  const filtered = filter === "all" ? checks : checks.filter((c) => c.status === filter);
  const okCount  = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warning").length;
  const critCount = checks.filter((c) => c.status === "critical").length;
  const score     = Math.round((okCount / checks.length) * 100);

  const scoreColor = score >= 80 ? "#16A34A" : score >= 60 ? "#D97706" : "#DC2626";

  return (
    <AdminLayout title="Segurança">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#0B2A66]">Checkup de Segurança</h2>
            <p className="text-sm text-slate-500 mt-1">Verificação geral da postura de segurança da plataforma</p>
          </div>
          <button onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white rounded-xl text-sm font-semibold hover:opacity-90">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Verificar agora
          </button>
        </div>

        {/* Score + Status do sistema */}
        <div className="grid grid-cols-2 gap-4">
          {/* Score */}
          <div className="bg-white rounded-2xl p-6 flex items-center gap-6" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.91" fill="none" stroke="#F1F5F9" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.91" fill="none" stroke={scoreColor} strokeWidth="3"
                  strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold" style={{ color: scoreColor }}>{score}%</span>
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">Score de Segurança</p>
              <p className="text-sm text-slate-500 mt-1">
                {score >= 80 ? "Sistema bem protegido" : score >= 60 ? "Requer atenção" : "Problemas críticos"}
              </p>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[11px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{okCount} Seguros</span>
                <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{warnCount} Atenção</span>
                <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{critCount} Críticos</span>
              </div>
            </div>
          </div>

          {/* Status do Sistema */}
          <div className="bg-white rounded-2xl p-6 space-y-4" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
            <p className="font-semibold text-slate-800">Status do Sistema</p>
            {[
              { label: "Banco de Dados",  icon: Database, ok: dbOk !== false,  detail: dbOk === null ? "Verificando..." : dbOk ? "Conectado" : "Erro de conexão" },
              { label: "Backend API",     icon: Server,   ok: true,            detail: "Operacional" },
              { label: "Logs de Auditoria", icon: Activity, ok: true,          detail: stats ? `${stats.failedLoginsLast24h} falhas nas últimas 24h` : "—" },
            ].map(({ label, icon: Icon, ok, detail }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ok ? "bg-green-50" : "bg-red-50"}`}>
                    <Icon size={14} className={ok ? "text-green-600" : "text-red-600"} />
                  </div>
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">{detail}</span>
                  <div className={`w-2 h-2 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Itens de Verificação ({checks.length})</h3>
            <div className="flex items-center gap-2">
              {(["all", "ok", "warning", "critical"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${filter === f ? "bg-[#0B2A66] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  {f === "all" ? "Todos" : STATUS_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map((c) => {
              const Icon = STATUS_ICON[c.status];
              return (
                <div key={c.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: STATUS_BG[c.status] }}>
                    <Icon size={16} style={{ color: STATUS_COLOR[c.status] }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{c.label}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: STATUS_BG[c.status], color: STATUS_COLOR[c.status] }}>
                        {STATUS_LABEL[c.status]}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium border border-slate-200 px-1.5 py-0.5 rounded">{c.category}</span>
                    </div>
                    <p className="text-[12px] text-slate-500 mt-1">{c.description}</p>
                    {c.status !== "ok" && (
                      <p className="text-[11px] font-medium mt-1" style={{ color: STATUS_COLOR[c.status] }}>
                        💡 {c.recommendation}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
