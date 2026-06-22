import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { adminApi } from "../../lib/adminApi";
import { Lock, Mail, Eye, EyeOff, ShieldCheck } from "lucide-react";
import logoFallback from "../../assets/images/logo_final.png";

function generateCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  return { a, b, answer: a + b };
}

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [logoSrc, setLogoSrc]   = useState(logoFallback);
  const [sidebarColor, setSidebarColor] = useState("#0B2A66");

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [captcha, setCaptcha]               = useState(generateCaptcha());
  const [captchaInput, setCaptchaInput]     = useState("");

  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [tempToken, setTempToken]                 = useState("");
  const [twoFaCode, setTwoFaCode]                 = useState("");

  useEffect(() => {
    fetch("/api/site")
      .then((r) => r.json())
      .then((data: { loginLogoBase64?: string; adminLogoBase64?: string; logoBase64?: string; adminSidebarColor?: string }) => {
        const logo = data.loginLogoBase64 || data.adminLogoBase64 || data.logoBase64;
        if (logo) setLogoSrc(logo);
        if (data.adminSidebarColor) setSidebarColor(data.adminSidebarColor);
      })
      .catch(() => {});
  }, []);

  const showCaptcha = failedAttempts >= 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (showCaptcha && parseInt(captchaInput, 10) !== captcha.answer) {
      setError("Resposta incorreta. Tente novamente.");
      setCaptcha(generateCaptcha());
      setCaptchaInput("");
      return;
    }

    setLoading(true);
    try {
      const res = await adminApi.login(email, password) as {
        token?: string; email?: string; role?: string; name?: string; avatarBase64?: string | null;
        requiresTwoFactor?: boolean; tempToken?: string;
      };

      if (res.requiresTwoFactor && res.tempToken) {
        setTempToken(res.tempToken);
        setRequiresTwoFactor(true);
        return;
      }

      if (res.token) {
        localStorage.setItem("admin_token", res.token);
        localStorage.setItem("admin_role", res.role ?? "editor");
        localStorage.setItem("admin_user", JSON.stringify({
          email: res.email ?? email,
          name: res.name ?? "Usuário",
          role: res.role ?? "editor",
          avatarBase64: res.avatarBase64 ?? undefined,
        }));
        navigate("/admin");
      }
    } catch (err: unknown) {
      const newFailed = failedAttempts + 1;
      setFailedAttempts(newFailed);
      if (newFailed >= 3) {
        setCaptcha(generateCaptcha());
        setCaptchaInput("");
      }
      setError(err instanceof Error ? err.message : "E-mail ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  }

  async function handle2faSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminApi.twoFaLogin(tempToken, twoFaCode);
      localStorage.setItem("admin_token", res.token);
      localStorage.setItem("admin_role", res.role ?? "editor");
      localStorage.setItem("admin_user", JSON.stringify({
        email: res.email,
        name: res.name,
        role: res.role ?? "editor",
        avatarBase64: res.avatarBase64 ?? undefined,
      }));
      navigate("/admin");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Código inválido.");
      setTwoFaCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: sidebarColor }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src={logoSrc} alt="Logo" className="h-20 w-auto object-contain" />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {requiresTwoFactor ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={22} style={{ color: sidebarColor }} />
                <h2 className="text-xl font-bold text-gray-800">Verificação em 2 etapas</h2>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Digite o código de 6 dígitos do seu aplicativo autenticador (Google Authenticator, Authy etc.).
              </p>
              <form onSubmit={handle2faSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Código de verificação</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full px-3 py-3 border border-gray-200 rounded-lg text-2xl text-center tracking-[0.4em] font-mono focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": sidebarColor } as React.CSSProperties}
                    placeholder="000000"
                    autoFocus
                    autoComplete="one-time-code"
                  />
                </div>
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || twoFaCode.length !== 6}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: sidebarColor }}
                >
                  {loading ? "Verificando…" : "Verificar código"}
                </button>
                <button
                  type="button"
                  onClick={() => { setRequiresTwoFactor(false); setTwoFaCode(""); setError(""); }}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Voltar ao login
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-800 mb-1">Painel Administrativo</h2>
              <p className="text-sm text-gray-500 mb-6">Faça login para continuar</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": sidebarColor } as React.CSSProperties}
                      placeholder="seu@email.com.br"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {showCaptcha && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <p className="text-xs font-medium text-amber-800">Verificação de segurança</p>
                    <label className="block text-sm text-amber-900 font-semibold">
                      Quanto é {captcha.a} + {captcha.b}?
                    </label>
                    <input
                      type="number"
                      value={captchaInput}
                      onChange={(e) => setCaptchaInput(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      placeholder="Sua resposta"
                      required={showCaptcha}
                    />
                  </div>
                )}

                {error && <p className="text-red-500 text-xs">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: sidebarColor }}
                >
                  {loading ? "Entrando…" : "Entrar"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
