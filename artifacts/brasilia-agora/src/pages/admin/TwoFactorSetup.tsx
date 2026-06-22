import React, { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi } from "../../lib/adminApi";
import { ShieldCheck, ShieldOff, QrCode, CheckCircle, AlertCircle, Copy } from "lucide-react";

type Step = "status" | "setup" | "verify" | "done" | "disable";

export default function TwoFactorSetup() {
  const [step, setStep]               = useState<Step>("status");
  const [enabled, setEnabled]         = useState(false);
  const [qrDataUrl, setQrDataUrl]     = useState("");
  const [secret, setSecret]           = useState("");
  const [code, setCode]               = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [copied, setCopied]           = useState(false);

  useEffect(() => {
    adminApi.twoFaStatus()
      .then((r) => { setEnabled(r.twoFactorEnabled); })
      .catch(() => {});
  }, []);

  async function startSetup() {
    setError("");
    setLoading(true);
    try {
      const r = await adminApi.twoFaSetup();
      setQrDataUrl(r.qrDataUrl);
      setSecret(r.secret);
      setStep("setup");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar configuração");
    } finally {
      setLoading(false);
    }
  }

  async function verifySetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminApi.twoFaVerify(code);
      setEnabled(true);
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Código inválido");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function disableTwoFa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminApi.twoFaDisable(code);
      setEnabled(false);
      setStep("status");
      setCode("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Código inválido");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AdminLayout title="Autenticação 2FA">
      <div className="max-w-xl mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0B2A66]">Autenticação em 2 Fatores (2FA)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Proteja sua conta com um código TOTP gerado pelo Google Authenticator, Authy ou similar.
          </p>
        </div>

        {/* Status card */}
        {step === "status" && (
          <div className="bg-white rounded-2xl shadow-md p-6 space-y-4" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
            <div className="flex items-center gap-3">
              {enabled ? (
                <>
                  <ShieldCheck size={28} className="text-green-500" />
                  <div>
                    <p className="font-semibold text-green-700">2FA está ativado</p>
                    <p className="text-xs text-gray-500">Sua conta está protegida com autenticação em 2 etapas.</p>
                  </div>
                </>
              ) : (
                <>
                  <ShieldOff size={28} className="text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-700">2FA está desativado</p>
                    <p className="text-xs text-gray-500">Recomendamos ativar para maior segurança.</p>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {enabled ? (
              <button
                onClick={() => { setStep("disable"); setCode(""); setError(""); }}
                className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Desativar 2FA
              </button>
            ) : (
              <button
                onClick={startSetup}
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#0B2A66" }}
              >
                {loading ? "Aguarde…" : "Ativar 2FA"}
              </button>
            )}
          </div>
        )}

        {/* Setup: show QR code */}
        {step === "setup" && (
          <div className="bg-white rounded-2xl shadow-md p-6 space-y-5" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
            <div className="flex items-center gap-2 mb-1">
              <QrCode size={22} className="text-[#0B2A66]" />
              <h2 className="font-bold text-[#0B2A66]">Escaneie o QR Code</h2>
            </div>
            <p className="text-sm text-gray-600">
              Abra seu aplicativo autenticador e escaneie o QR code abaixo. Depois digite o código gerado.
            </p>
            {qrDataUrl && (
              <div className="flex justify-center py-2">
                <img src={qrDataUrl} alt="QR Code 2FA" className="w-44 h-44 border rounded-xl" />
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Ou insira a chave manualmente:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs text-[#0B2A66] break-all">{secret}</code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                  title="Copiar"
                >
                  {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} className="text-gray-400" />}
                </button>
              </div>
            </div>
            <form onSubmit={verifySetup} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Código de verificação</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-3 py-3 border border-gray-200 rounded-lg text-2xl text-center tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20"
                  placeholder="000000"
                  autoFocus
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-colors"
                style={{ backgroundColor: "#0B2A66" }}
              >
                {loading ? "Verificando…" : "Confirmar e ativar 2FA"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("status"); setError(""); }}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600"
              >
                Cancelar
              </button>
            </form>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center space-y-4" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
            <CheckCircle size={48} className="text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-green-700">2FA Ativado!</h2>
            <p className="text-sm text-gray-500">
              Sua conta agora requer um código TOTP em cada login.
            </p>
            <button
              onClick={() => setStep("status")}
              className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors"
              style={{ backgroundColor: "#0B2A66" }}
            >
              Concluído
            </button>
          </div>
        )}

        {/* Disable */}
        {step === "disable" && (
          <div className="bg-white rounded-2xl shadow-md p-6 space-y-5" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
            <div className="flex items-center gap-2">
              <ShieldOff size={22} className="text-red-500" />
              <h2 className="font-bold text-red-600">Desativar 2FA</h2>
            </div>
            <p className="text-sm text-gray-600">
              Para confirmar, insira um código válido do seu aplicativo autenticador.
            </p>
            <form onSubmit={disableTwoFa} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-3 py-3 border border-gray-200 rounded-lg text-2xl text-center tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-red-300"
                placeholder="000000"
                autoFocus
              />
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-2.5 text-sm font-semibold text-white rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {loading ? "Desativando…" : "Confirmar desativação"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("status"); setCode(""); setError(""); }}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600"
              >
                Cancelar
              </button>
            </form>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
