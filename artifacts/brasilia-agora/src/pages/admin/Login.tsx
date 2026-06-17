import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { adminApi } from "../../lib/adminApi";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";
import logoFallback from "../../assets/images/logo_final.png";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoSrc, setLogoSrc] = useState(logoFallback);
  const [sidebarColor, setSidebarColor] = useState("#0B2A66");

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminApi.login(email, password);
      localStorage.setItem("admin_token", res.token);
      localStorage.setItem("admin_role", res.role ?? "editor");
      localStorage.setItem("admin_user", JSON.stringify({
        email: res.email ?? email,
        name: res.name ?? "Usuário",
        role: res.role ?? "editor",
      }));
      navigate("/admin");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "E-mail ou senha inválidos.");
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

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
              style={{ backgroundColor: sidebarColor }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
