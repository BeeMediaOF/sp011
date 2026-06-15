import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type SiteSettings } from "../../lib/adminApi";
import { Save, Monitor, Smartphone, CheckCircle, Globe, Tag, Image, FileSearch } from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Brasília Hoje",
    tagline: "A notícia da nossa capital, agora.",
    mobileEnabled: true,
    desktopEnabled: true,
    seoDescription: "",
    seoKeywords: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const ogRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi.getSettings()
      .then((r) => setSettings(r.settings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleImageFile(key: "ogImageBase64" | "faviconBase64", file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setField(key, e.target?.result as string);
    reader.readAsDataURL(file);
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
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-[#1a2448]" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Informações do site</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do site</label>
                <input
                  value={settings.siteName}
                  onChange={(e) => setField("siteName", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  placeholder="Ex: SBC Agora"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tagline / Slogan</label>
                <input
                  value={settings.tagline}
                  onChange={(e) => setField("tagline", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  placeholder="Ex: Notícia. Agora. Sempre."
                />
              </div>
            </div>

            {/* SEO */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <FileSearch size={16} className="text-[#1a2448]" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SEO</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Meta descrição</label>
                <textarea
                  value={settings.seoDescription ?? ""}
                  onChange={(e) => setField("seoDescription", e.target.value)}
                  rows={3}
                  maxLength={160}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] resize-none"
                  placeholder="Descrição exibida nos resultados do Google (máx. 160 caracteres)"
                />
                <p className="text-[11px] text-gray-400 mt-1 text-right">{(settings.seoDescription ?? "").length}/160</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Palavras-chave</label>
                <input
                  value={settings.seoKeywords ?? ""}
                  onChange={(e) => setField("seoKeywords", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  placeholder="brasília, notícias, df, política (separadas por vírgula)"
                />
              </div>
            </div>

            {/* OG Image + Favicon */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Image size={16} className="text-[#1a2448]" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Imagens do site</h3>
              </div>

              {/* OG Image */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">OG Image (compartilhamento social)</label>
                <p className="text-[11px] text-gray-400 mb-2">Exibida ao compartilhar o site no WhatsApp, Facebook etc. Recomendado: 1200×630px</p>
                <input
                  ref={ogRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile("ogImageBase64", f); }}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => ogRef.current?.click()}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Selecionar imagem
                  </button>
                  {settings.ogImageBase64 && (
                    <div className="relative">
                      <img src={settings.ogImageBase64} alt="OG" className="h-12 w-20 object-cover rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => setField("ogImageBase64", undefined)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                      >&times;</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Favicon */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Favicon (ícone da aba do navegador)</label>
                <p className="text-[11px] text-gray-400 mb-2">Quadrado, idealmente 512×512px. PNG ou SVG com fundo transparente.</p>
                <input
                  ref={faviconRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile("faviconBase64", f); }}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => faviconRef.current?.click()}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Selecionar favicon
                  </button>
                  {settings.faviconBase64 && (
                    <div className="relative">
                      <img src={settings.faviconBase64} alt="Favicon" className="h-10 w-10 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                      <button
                        type="button"
                        onClick={() => setField("faviconBase64", undefined)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                      >&times;</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Device visibility */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-[#1a2448]" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visibilidade por dispositivo</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setField("desktopEnabled", !settings.desktopEnabled)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                    ${settings.desktopEnabled ? "border-[#1a2448] bg-[#1a2448]/5 text-[#1a2448]" : "border-gray-200 text-gray-400 hover:border-gray-300"}`}
                >
                  <Monitor size={24} />
                  <span className="text-xs font-semibold">Desktop</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${settings.desktopEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {settings.desktopEnabled ? "Ativo" : "Inativo"}
                  </span>
                </button>
                <button
                  onClick={() => setField("mobileEnabled", !settings.mobileEnabled)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                    ${settings.mobileEnabled ? "border-[#1a2448] bg-[#1a2448]/5 text-[#1a2448]" : "border-gray-200 text-gray-400 hover:border-gray-300"}`}
                >
                  <Smartphone size={24} />
                  <span className="text-xs font-semibold">Mobile</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${settings.mobileEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {settings.mobileEnabled ? "Ativo" : "Inativo"}
                  </span>
                </button>
              </div>
            </div>

            {/* API info */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Endpoint de publicação</h3>
              <div className="bg-gray-50 border rounded-lg p-3 font-mono text-xs text-gray-700 space-y-1">
                <div><span className="text-blue-500 font-bold">POST</span> /api/admin/publish/:id</div>
                <div><span className="text-green-500 font-bold">POST</span> /api/admin/bulk-publish</div>
                <div className="text-gray-400 pt-1">Header: <span className="text-gray-700">Authorization: Bearer &lt;token&gt;</span></div>
              </div>
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
