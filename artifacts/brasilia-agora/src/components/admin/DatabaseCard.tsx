import { useEffect, useState } from "react";
import { Database, ShieldAlert, CheckCircle2, XCircle, Loader2 } from "lucide-react";

/**
 * Configurações → Conexões → Banco de Dados: mostra a conexão ativa (sem
 * credenciais) e, quando a instância foi instalada pelo assistente (origem
 * "file"), permite trocar de banco com reautenticação + teste + restart
 * controlado. Origem "env" é somente-leitura — a env vence o arquivo no boot.
 */

const CARD = "bg-white rounded-2xl overflow-hidden";
const CARD_SHADOW = { boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const INPUT =
  "w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] bg-white placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors";

interface DbStatus {
  source: "env" | "file" | "none" | "file-error";
  provider?: "supabase" | "postgres";
  host?: string;
  database?: string;
  ssl?: boolean;
  canManage: boolean;
  encryptionAvailable: boolean;
  error?: string | null;
}

interface TestResult {
  ok: boolean;
  error?: string;
  version?: string;
  canCreate?: boolean;
  tableCount?: number;
  hasExistingInstall?: boolean;
  existingSiteName?: string | null;
  existingUsers?: number;
  existingArticles?: number;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("admin_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function DatabaseCard() {
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [connectionString, setConnectionString] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  // Banco de destino já pertence a outra instalação → exige confirmação explícita.
  const [adoptExisting, setAdoptExisting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/db-config", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: DbStatus | null) => setStatus(s))
      .catch(() => {});
  }, []);

  async function handleTest() {
    setError("");
    setTestResult(null);
    setAdoptExisting(false);
    setTesting(true);
    try {
      const r = await fetch("/api/admin/db-config/test", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ connectionString: connectionString.trim() }),
      });
      const data = (await r.json()) as TestResult;
      if (!r.ok) {
        setError((data as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      setTestResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar.");
    } finally {
      setTesting(false);
    }
  }

  async function handleApply() {
    if (!testResult?.ok) {
      setError("Teste a conexão antes de aplicar.");
      return;
    }
    const warning = testResult.hasExistingInstall
      ? `O banco de destino JÁ PERTENCE a uma instalação em uso${testResult.existingSiteName ? ` (site "${testResult.existingSiteName}")` : ""} — o painel passará a usar os dados dele. Continuar?`
      : "O banco de destino está VAZIO — o site ficará sem artigos/usuários atuais até você restaurar um backup nele. O admin logado será copiado para não perder o acesso. Continuar mesmo assim?";
    if (!window.confirm(`${warning}\n\nO servidor será reiniciado ao aplicar.`)) return;

    setError("");
    setApplying(true);
    try {
      const r = await fetch("/api/admin/db-config/apply", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          connectionString: connectionString.trim(),
          currentPassword,
          ...(adoptExisting ? { adoptExistingInstall: true } : {}),
        }),
      });
      const data = (await r.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? `Erro ${r.status}`);
        return;
      }
      // Servidor reinicia — aguarda voltar e recarrega o painel.
      setWaiting(true);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 2500));
        try {
          const s = await fetch("/api/setup");
          if (s.ok) {
            const j = (await s.json()) as { setupRequired?: boolean };
            if (j.setupRequired === false) {
              window.location.reload();
              return;
            }
          }
        } catch {
          // reiniciando — segue tentando
        }
      }
      setWaiting(false);
      setError("O servidor não voltou em 2 minutos — verifique o log do container.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aplicar.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
      <div className="flex items-center gap-2 pb-1 border-b border-[#F1F5F9]">
        <span className="text-[#0B2A66]">
          <Database size={15} />
        </span>
        <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Banco de Dados</h3>
      </div>

      {!status ? (
        <p className="text-xs text-[#94A3B8]">Carregando…</p>
      ) : (
        <>
          <div className="text-sm text-[#0F172A] space-y-1">
            <p>
              <span className="text-[#64748B]">Origem:</span>{" "}
              {status.source === "env" ? "variável de ambiente (.env)" : "assistente de instalação (arquivo criptografado)"}
            </p>
            {status.host && (
              <p>
                <span className="text-[#64748B]">Servidor:</span>{" "}
                <span className="font-mono text-xs">{status.host}</span>{" "}
                <span className="text-[#94A3B8] text-xs">
                  ({status.provider === "supabase" ? "Supabase" : "PostgreSQL"} · banco {status.database})
                </span>
              </p>
            )}
          </div>

          {status.source === "env" && (
            <p className="text-xs text-[#94A3B8]">
              A conexão é definida por SUPABASE_DATABASE_URL/DATABASE_URL no ambiente. Para gerenciar o
              banco por aqui, remova a variável e instale pelo assistente.
            </p>
          )}

          {status.canManage && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs font-semibold text-[#0B2A66] hover:underline"
            >
              Trocar banco de dados…
            </button>
          )}

          {status.canManage && expanded && (
            <div className="space-y-3 border-t border-[#F1F5F9] pt-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
                <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Ação de alto impacto: o painel passa a usar OUTRO banco após um reinício automático. A
                  migração de dados não é feita por aqui — para levar o conteúdo atual, faça dump/restore
                  antes. O arquivo anterior fica preservado como backup (.bak).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Nova connection string
                </label>
                <input
                  type="password"
                  value={connectionString}
                  onChange={(e) => {
                    setConnectionString(e.target.value);
                    setTestResult(null);
                  }}
                  className={INPUT + " font-mono"}
                  placeholder="postgresql://usuario:senha@host:5432/postgres"
                  autoComplete="off"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTest}
                  disabled={testing || !connectionString.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B2A66] rounded-xl hover:bg-[#0a2255] disabled:opacity-50"
                >
                  {testing ? "Testando…" : "Testar conexão"}
                </button>
                {testResult?.ok && !testResult.hasExistingInstall && (
                  <span className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 size={14} /> PostgreSQL {testResult.version} · banco VAZIO
                  </span>
                )}
                {testResult && !testResult.ok && (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <XCircle size={14} /> {testResult.error}
                  </span>
                )}
              </div>

              {/* Anti-mistura: banco de destino já pertence a outra instalação */}
              {testResult?.ok && testResult.hasExistingInstall && (
                <div className="p-3 bg-red-50 border-2 border-red-300 rounded-xl space-y-2">
                  <div className="flex gap-2">
                    <ShieldAlert size={16} className="text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      <strong>
                        Este banco JÁ pertence a uma instalação em uso
                        {testResult.existingSiteName ? ` — site "${testResult.existingSiteName}"` : ""}
                      </strong>{" "}
                      ({testResult.existingUsers ?? 0} usuário(s), {testResult.existingArticles ?? 0}{" "}
                      artigo(s)). Trocar para ele fará ESTA instância editar o mesmo conteúdo daquele site.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-xs font-semibold text-red-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adoptExisting}
                      onChange={(e) => setAdoptExisting(e.target.checked)}
                      className="mt-0.5"
                    />
                    Entendo e é isso mesmo que eu quero (ex.: restaurei um dump deste site neste banco).
                  </label>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Sua senha atual (reautenticação)
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={INPUT}
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleApply}
                  disabled={
                    applying ||
                    waiting ||
                    !testResult?.ok ||
                    !currentPassword ||
                    (testResult.hasExistingInstall === true && !adoptExisting)
                  }
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {waiting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Reiniciando…
                    </>
                  ) : applying ? (
                    "Aplicando…"
                  ) : (
                    "Aplicar e reiniciar"
                  )}
                </button>
                <button
                  onClick={() => {
                    setExpanded(false);
                    setError("");
                    setTestResult(null);
                  }}
                  className="text-xs text-[#64748B] hover:text-[#0F172A]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
