import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Database,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserRound,
  CheckCircle2,
  XCircle,
} from "lucide-react";

/**
 * Assistente de instalação (/admin/setup) — instância nova sem banco
 * configurado. Fala só com /api/setup/* (status público; test/apply exigem o
 * setup token impresso no log do container no boot). Após aplicar, o servidor
 * reinicia sozinho e a página aguarda até o painel ficar disponível.
 */

interface SetupStatus {
  setupRequired: boolean;
  reason?: "not_configured" | "recovery";
  error?: string | null;
  encryptionAvailable?: boolean;
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

const NAVY = "#0B2A66";

async function getStatus(): Promise<SetupStatus | null> {
  try {
    const r = await fetch("/api/setup");
    if (!r.ok) return null;
    return (await r.json()) as SetupStatus;
  } catch {
    return null;
  }
}

export default function Setup() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [token, setToken] = useState("");
  const [connMode, setConnMode] = useState<"string" | "fields">("string");
  const [connectionString, setConnectionString] = useState("");
  const [fields, setFields] = useState({
    host: "",
    port: "5432",
    database: "postgres",
    user: "",
    password: "",
    ssl: "no-verify",
  });

  const [showStorage, setShowStorage] = useState(false);
  const [storage, setStorage] = useState({ supabaseUrl: "", serviceRoleKey: "", bucket: "" });

  const [admin, setAdmin] = useState({ name: "", email: "", password: "" });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  // Banco candidato já pertence a outra instalação → exige confirmação explícita.
  const [adoptExisting, setAdoptExisting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [waitingRestart, setWaitingRestart] = useState(false);
  const [error, setError] = useState("");

  /** Qualquer edição na conexão invalida o teste e a confirmação anterior. */
  function resetProbe() {
    setTestResult(null);
    setAdoptExisting(false);
  }

  function updateField(patch: Partial<typeof fields>) {
    setFields((f) => ({ ...f, ...patch }));
    resetProbe();
  }

  useEffect(() => {
    getStatus().then((s) => {
      setStatus(s);
      setLoadingStatus(false);
      if (s && !s.setupRequired) navigate("/admin/login");
    });
  }, [navigate]);

  function connectionBody(): Record<string, unknown> {
    return connMode === "string"
      ? { connectionString: connectionString.trim() }
      : { fields: { ...fields, port: Number(fields.port) || 5432 } };
  }

  async function handleTest() {
    setError("");
    setTestResult(null);
    setTesting(true);
    try {
      const r = await fetch("/api/setup/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Setup-Token": token.trim() },
        body: JSON.stringify(connectionBody()),
      });
      const data = (await r.json()) as TestResult & { error?: string };
      if (!r.ok) {
        setError(data.error ?? `Erro ${r.status}`);
        return;
      }
      setTestResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar a conexão.");
    } finally {
      setTesting(false);
    }
  }

  async function waitForInstalledAndGo() {
    setWaitingRestart(true);
    // O servidor sai para reiniciar; o Docker religa em segundos. Erros de rede
    // durante a janela do restart são esperados — só seguimos quando o status
    // responder "instalado".
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const s = await getStatus();
      if (s && !s.setupRequired) {
        navigate("/admin/login");
        return;
      }
    }
    setWaitingRestart(false);
    setError(
      "O servidor não voltou em 2 minutos. Verifique o log do container (docker compose logs api) e recarregue esta página.",
    );
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setApplying(true);
    try {
      const body: Record<string, unknown> = {
        ...connectionBody(),
        admin,
        ...(adoptExisting ? { adoptExistingInstall: true } : {}),
      };
      if (storage.supabaseUrl.trim() && storage.serviceRoleKey.trim()) {
        body["storage"] = {
          supabaseUrl: storage.supabaseUrl.trim(),
          serviceRoleKey: storage.serviceRoleKey.trim(),
          ...(storage.bucket.trim() ? { bucket: storage.bucket.trim() } : {}),
        };
      }
      const r = await fetch("/api/setup/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Setup-Token": token.trim() },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as {
        ok: boolean;
        error?: string;
        restarting?: boolean;
        code?: string;
        existingSiteName?: string | null;
        existingUsers?: number;
        existingArticles?: number;
      };
      if (!data.ok) {
        // Banco pertence a outra instalação: mostra o aviso + checkbox de
        // confirmação (mesmo quando o usuário aplicou sem testar antes).
        if (data.code === "existing_install") {
          setTestResult({
            ok: true,
            hasExistingInstall: true,
            existingSiteName: data.existingSiteName ?? null,
            existingUsers: data.existingUsers ?? 0,
            existingArticles: data.existingArticles ?? 0,
          });
        }
        setError(data.error ?? `Erro ${r.status}`);
        return;
      }
      await waitForInstalledAndGo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na instalação.");
    } finally {
      setApplying(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: NAVY }}>
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (waitingRestart) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: NAVY }}>
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center space-y-4">
          <Loader2 className="animate-spin mx-auto" size={36} style={{ color: NAVY }} />
          <h2 className="text-xl font-bold text-gray-800">Instalação concluída</h2>
          <p className="text-sm text-gray-500">
            O servidor está reiniciando para conectar ao banco configurado. Você será levado ao login
            automaticamente…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: NAVY }}>
      <div className="w-full max-w-2xl my-8">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-1">
            <Database size={22} style={{ color: NAVY }} />
            <h1 className="text-xl font-bold text-gray-800">Assistente de instalação</h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Esta instância ainda não tem banco de dados configurado. Conecte um PostgreSQL (Supabase ou
            genérico), crie o primeiro administrador e o painel fica pronto para uso.
          </p>

          {status?.reason === "recovery" && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <ShieldAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="text-xs text-red-700">
                <p className="font-semibold mb-1">Modo recuperação — a conexão salva falhou:</p>
                <p>{status.error ?? "erro desconhecido"}</p>
                <p className="mt-1">
                  O arquivo anterior foi preservado; informe uma conexão válida para substituí-lo.
                </p>
              </div>
            </div>
          )}

          {status && status.encryptionAvailable === false && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <strong>SETTINGS_ENCRYPTION_KEY não definida no ambiente.</strong> A instalação não grava
              credenciais em texto puro — defina a variável no .env do container e reinicie antes de
              continuar.
            </div>
          )}

          <form onSubmit={handleApply} className="space-y-6">
            {/* Token */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={16} style={{ color: NAVY }} />
                <h2 className="text-sm font-bold text-gray-800">Setup token</h2>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Impresso no log do container no boot (<code>docker compose logs api | grep token</code>).
                Protege o assistente de acessos indevidos.
              </p>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder="token do log"
                required
              />
            </section>

            {/* Banco */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Database size={16} style={{ color: NAVY }} />
                <h2 className="text-sm font-bold text-gray-800">Banco de dados (PostgreSQL 14+)</h2>
              </div>
              <div className="flex gap-4 mb-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={connMode === "string"}
                    onChange={() => {
                      setConnMode("string");
                      resetProbe();
                    }}
                  />
                  Connection string
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={connMode === "fields"}
                    onChange={() => {
                      setConnMode("fields");
                      resetProbe();
                    }}
                  />
                  Campos separados
                </label>
              </div>

              {connMode === "string" ? (
                <div>
                  <input
                    type="password"
                    value={connectionString}
                    onChange={(e) => {
                      setConnectionString(e.target.value);
                      resetProbe();
                    }}
                    className={`${inputCls} font-mono`}
                    placeholder="postgresql://usuario:senha@host:5432/postgres"
                    required={connMode === "string"}
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Supabase: use o <strong>Session Pooler</strong> (Connect → Session mode). Caracteres
                    especiais na senha (@, #) precisam estar codificados (%40, %23) — ou use "Campos
                    separados", que codifica sozinho.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Host</label>
                    <input
                      type="text"
                      value={fields.host}
                      onChange={(e) => updateField({ host: e.target.value })}
                      className={inputCls}
                      placeholder="aws-0-sa-east-1.pooler.supabase.com"
                      required={connMode === "fields"}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Porta</label>
                    <input
                      type="number"
                      value={fields.port}
                      onChange={(e) => updateField({ port: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Banco</label>
                    <input
                      type="text"
                      value={fields.database}
                      onChange={(e) => updateField({ database: e.target.value })}
                      className={inputCls}
                      required={connMode === "fields"}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Usuário</label>
                    <input
                      type="text"
                      value={fields.user}
                      onChange={(e) => updateField({ user: e.target.value })}
                      className={inputCls}
                      placeholder="postgres.abcdefghij"
                      required={connMode === "fields"}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Senha</label>
                    <input
                      type="password"
                      value={fields.password}
                      onChange={(e) => updateField({ password: e.target.value })}
                      className={inputCls}
                      required={connMode === "fields"}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>SSL</label>
                    <select
                      value={fields.ssl}
                      onChange={(e) => updateField({ ssl: e.target.value })}
                      className={inputCls}
                    >
                      <option value="no-verify">SSL sem verificação de certificado (Supabase/pooler)</option>
                      <option value="require">SSL com verificação</option>
                      <option value="disable">Sem SSL</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !token.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: NAVY }}
                >
                  {testing ? "Testando…" : "Testar conexão"}
                </button>
                {testResult?.ok && !testResult.hasExistingInstall && (
                  <span className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 size={14} /> PostgreSQL {testResult.version} · CREATE{" "}
                    {testResult.canCreate ? "ok" : "NEGADO"} ·{" "}
                    {`${testResult.tableCount ?? 0} tabelas no schema public`}
                  </span>
                )}
                {testResult && !testResult.ok && (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <XCircle size={14} /> {testResult.error}
                  </span>
                )}
              </div>

              {/* Anti-mistura: banco que já pertence a outra instalação viva */}
              {testResult?.ok && testResult.hasExistingInstall && (
                <div className="mt-3 p-3 bg-red-50 border-2 border-red-300 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <ShieldAlert size={18} className="text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-700 space-y-1">
                      <p className="font-bold">
                        Este banco JÁ pertence a uma instalação em uso
                        {testResult.existingSiteName ? ` — site "${testResult.existingSiteName}"` : ""}.
                      </p>
                      <p>
                        Encontrados {testResult.existingUsers ?? 0} usuário(s) e{" "}
                        {testResult.existingArticles ?? 0} artigo(s). Se você está instalando um blog{" "}
                        <strong>novo</strong>, esta connection string é do banco de <strong>outro site</strong> —
                        cada blog precisa do próprio banco. Conectar aqui faria as duas instâncias editarem o{" "}
                        <strong>mesmo</strong> conteúdo.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs font-semibold text-red-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adoptExisting}
                      onChange={(e) => setAdoptExisting(e.target.checked)}
                      className="mt-0.5"
                    />
                    Esta instância é a dona legítima deste banco (ex.: reinstalação da própria instância) —
                    quero conectá-la mesmo assim.
                  </label>
                </div>
              )}
            </section>

            {/* Storage (opcional) */}
            <section>
              <button
                type="button"
                onClick={() => setShowStorage((s) => !s)}
                className="flex items-center gap-2 text-sm font-bold text-gray-800"
              >
                <HardDrive size={16} style={{ color: NAVY }} />
                Armazenamento de mídia (opcional) {showStorage ? "▾" : "▸"}
              </button>
              <p className="text-xs text-gray-500 mt-1">
                Os uploads de imagens/vídeos são gravados no disco do servidor (volume persistente).
                Supabase Storage é opcional: usado apenas para ler arquivos legados.
              </p>
              {showStorage && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Supabase URL</label>
                    <input
                      type="text"
                      value={storage.supabaseUrl}
                      onChange={(e) => setStorage({ ...storage, supabaseUrl: e.target.value })}
                      className={inputCls}
                      placeholder="https://abcdefghij.supabase.co"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>service_role key</label>
                    <input
                      type="password"
                      value={storage.serviceRoleKey}
                      onChange={(e) => setStorage({ ...storage, serviceRoleKey: e.target.value })}
                      className={inputCls}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Bucket (default: uploads)</label>
                    <input
                      type="text"
                      value={storage.bucket}
                      onChange={(e) => setStorage({ ...storage, bucket: e.target.value })}
                      className={inputCls}
                      placeholder="uploads"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Admin */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <UserRound size={16} style={{ color: NAVY }} />
                <h2 className="text-sm font-bold text-gray-800">Primeiro administrador</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nome</label>
                  <input
                    type="text"
                    value={admin.name}
                    onChange={(e) => setAdmin({ ...admin, name: e.target.value })}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input
                    type="email"
                    value={admin.email}
                    onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
                    className={inputCls}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Senha (8+ caracteres)</label>
                  <input
                    type="password"
                    value={admin.password}
                    onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                    className={inputCls}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Se o banco já tiver uma instalação com usuários, os logins existentes são mantidos e este
                cadastro é ignorado.
              </p>
            </section>

            {error && (
              <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={
                applying ||
                !token.trim() ||
                status?.encryptionAvailable === false ||
                (testResult?.hasExistingInstall === true && !adoptExisting)
              }
              className="w-full py-3 text-sm font-semibold text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: NAVY }}
            >
              {applying ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Instalando…
                </>
              ) : (
                <>
                  <RefreshCw size={16} /> Instalar e reiniciar
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
