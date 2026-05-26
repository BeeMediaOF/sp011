import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type SiteSettings } from "../../lib/adminApi";
import { Save, Monitor, Smartphone, CheckCircle } from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Brasília Hoje",
    tagline: "A notícia da nossa capital, agora.",
    mobileEnabled: true,
    desktopEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.getSettings()
      .then((r) => setSettings(r.settings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError("");
    try {
      const { settings: updated } = await adminApi.updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="Configurações">
      <div className="max-w-xl mx-auto space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400">Carregando...</div>
        ) : (
          <>
            {/* Site info */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Informações do site</h3>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do site</label>
                <input
                  value={settings.siteName}
                  onChange={(e) => setField("siteName", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tagline / Slogan</label>
                <input
                  value={settings.tagline}
                  onChange={(e) => setField("tagline", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                />
              </div>
            </div>

            {/* Device visibility */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visibilidade por dispositivo</h3>
              <p className="text-xs text-gray-400">Controle em quais dispositivos o site está disponível.</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setField("desktopEnabled", !settings.desktopEnabled)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                    ${settings.desktopEnabled
                      ? "border-[#1a2448] bg-[#1a2448]/5 text-[#1a2448]"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"}`}
                >
                  <Monitor size={24} />
                  <span className="text-xs font-semibold">Desktop</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${settings.desktopEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {settings.desktopEnabled ? "Ativo" : "Inativo"}
                  </span>
                </button>

                <button
                  onClick={() => setField("mobileEnabled", !settings.mobileEnabled)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                    ${settings.mobileEnabled
                      ? "border-[#1a2448] bg-[#1a2448]/5 text-[#1a2448]"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"}`}
                >
                  <Smartphone size={24} />
                  <span className="text-xs font-semibold">Mobile</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${settings.mobileEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {settings.mobileEnabled ? "Ativo" : "Inativo"}
                  </span>
                </button>
              </div>
            </div>

            {/* API info */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Endpoint de publicação</h3>
              <p className="text-xs text-gray-500">Use este endpoint para publicar artigos via integração externa.</p>
              <div className="bg-gray-50 border rounded-lg p-3 font-mono text-xs text-gray-700 space-y-1">
                <div><span className="text-blue-500 font-bold">POST</span> /api/admin/publish/:id</div>
                <div><span className="text-green-500 font-bold">POST</span> /api/admin/bulk-publish</div>
                <div className="text-gray-400 pt-1">Header: <span className="text-gray-700">Authorization: Bearer &lt;token&gt;</span></div>
              </div>
              <p className="text-xs text-gray-400">
                Token obtido via <code className="bg-gray-100 px-1 rounded">POST /api/admin/login</code> com usuário e senha.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">{error}</div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60
                ${saved ? "bg-green-500 text-white" : "bg-[#1a2448] text-white hover:bg-[#243060]"}`}
            >
              {saved ? <><CheckCircle size={16} /> Salvo!</> : <><Save size={16} /> {saving ? "Salvando..." : "Salvar Configurações"}</>}
            </button>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
