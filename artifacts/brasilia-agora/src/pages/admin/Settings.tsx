import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type SiteSettings } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import { Save, Monitor, Smartphone, CheckCircle, Globe, Tag, Image, FileSearch, Palette, LayoutDashboard, UserCircle, BarChart2 } from "lucide-react";
import { saveAdminThemeToStorage } from "../../components/admin/AdminLayout";

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
  const adminLogoRef = useRef<HTMLInputElement>(null);
  const bylineLogoRef = useRef<HTMLInputElement>(null);

  function handleBylineLogoFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setField("bylineLogoBase64", e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleAdminLogoFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setField("adminLogoBase64", e.target?.result as string);
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    // Pre-fill color fields from localStorage while API fetch is in progress (no ghost flash)
    try {
      const sidebar = localStorage.getItem("admin_sidebar_color");
      const accent  = localStorage.getItem("admin_accent_color");
      if (sidebar) setSettings((prev) => ({ ...prev, adminSidebarColor: sidebar }));
      if (accent)  setSettings((prev) => ({ ...prev, adminAccentColor:  accent  }));
    } catch {}

    adminApi.getSettings()
      .then((r) => {
        setSettings(r.settings);
        // Keep localStorage in sync with server values
        saveAdminThemeToStorage(
          r.settings.adminSidebarColor ?? "#1a2448",
          r.settings.adminAccentColor  ?? "#c8102e",
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      // Persist admin panel colors to localStorage immediately — no flash on reload
      if (key === "adminSidebarColor" || key === "adminAccentColor") {
        saveAdminThemeToStorage(
          key === "adminSidebarColor" ? String(value) : (next.adminSidebarColor ?? "#1a2448"),
          key === "adminAccentColor"  ? String(value) : (next.adminAccentColor  ?? "#c8102e"),
        );
      }
      return next;
    });
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
      invalidateSiteCache();
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

            {/* Byline dos artigos */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <UserCircle size={16} className="text-[#1a2448]" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assinatura dos artigos ("Por…")</h3>
              </div>
              <p className="text-[11px] text-gray-400">Foto e nome que aparecem no cabeçalho de cada artigo publicado.</p>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome da assinatura</label>
                <input
                  value={settings.bylineName ?? ""}
                  onChange={(e) => setField("bylineName", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  placeholder={`Padrão: ${settings.siteName || "nome do portal"}`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Foto da assinatura</label>
                <input
                  ref={bylineLogoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBylineLogoFile(f); }}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => bylineLogoRef.current?.click()}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Selecionar foto
                  </button>
                  {settings.bylineLogoBase64 ? (
                    <div className="relative">
                      <img src={settings.bylineLogoBase64} alt="Byline" className="h-10 w-10 object-cover rounded-full border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => setField("bylineLogoBase64", undefined)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                      >&times;</button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 italic">Usando logo do portal</p>
                  )}
                </div>
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

            {/* Admin panel appearance */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2">
                <LayoutDashboard size={16} className="text-[#1a2448]" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aparência do Painel Administrativo</h3>
              </div>

              {/* Admin Logo */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Logo do painel (sidebar)</label>
                <p className="text-[11px] text-gray-400 mb-2">Substitui o logo exibido na sidebar e na tela de login do admin. Recomendado: PNG transparente, 300×80px.</p>
                <input
                  ref={adminLogoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAdminLogoFile(f); }}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => adminLogoRef.current?.click()}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Selecionar logo
                  </button>
                  {settings.adminLogoBase64 && (
                    <div className="relative bg-[#1a2448] rounded-lg p-2">
                      <img src={settings.adminLogoBase64} alt="Admin logo" className="h-8 max-w-[120px] object-contain" />
                      <button
                        type="button"
                        onClick={() => setField("adminLogoBase64", undefined)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                      >&times;</button>
                    </div>
                  )}
                  {!settings.adminLogoBase64 && (
                    <p className="text-[11px] text-gray-400 italic">Usando logo padrão do site</p>
                  )}
                </div>
              </div>

              {/* Sidebar color */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Cor da sidebar</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.adminSidebarColor ?? "#1a2448"}
                      onChange={(e) => setField("adminSidebarColor", e.target.value)}
                      className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.adminSidebarColor ?? "#1a2448"}
                      onChange={(e) => setField("adminSidebarColor", e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] font-mono"
                      placeholder="#1a2448"
                    />
                  </div>
                  <div className="mt-2 rounded-lg overflow-hidden h-8 flex items-center px-3 text-white text-xs font-semibold"
                    style={{ backgroundColor: settings.adminSidebarColor ?? "#1a2448" }}>
                    Pré-visualização
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Cor de destaque (links ativos)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.adminAccentColor ?? "#c8102e"}
                      onChange={(e) => setField("adminAccentColor", e.target.value)}
                      className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.adminAccentColor ?? "#c8102e"}
                      onChange={(e) => setField("adminAccentColor", e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] font-mono"
                      placeholder="#c8102e"
                    />
                  </div>
                  <div className="mt-2 rounded-lg overflow-hidden h-8 flex items-center px-3 text-white text-xs font-semibold"
                    style={{ backgroundColor: settings.adminAccentColor ?? "#c8102e" }}>
                    Pré-visualização
                  </div>
                </div>
              </div>

              {/* Presets */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Temas prontos</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "SBC Agora (padrão)", sidebar: "#1a2448", accent: "#c8102e" },
                    { label: "Oceano", sidebar: "#0b3d91", accent: "#e8a020" },
                    { label: "Floresta", sidebar: "#1a3a2a", accent: "#22c55e" },
                    { label: "Grafite", sidebar: "#18181b", accent: "#f59e0b" },
                    { label: "Roxo", sidebar: "#3b1f6e", accent: "#a855f7" },
                  ].map((t) => (
                    <button
                      key={t.label} type="button"
                      onClick={() => { setField("adminSidebarColor", t.sidebar); setField("adminAccentColor", t.accent); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors text-xs text-gray-700"
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.sidebar }}/>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.accent }}/>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Portal colors */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={14} className="text-[#1a2448]" />
                  <label className="text-xs font-semibold text-gray-600">Cores do portal público</label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Fundo do cabeçalho</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.headerBgColor ?? "#ffffff"}
                        onChange={(e) => setField("headerBgColor", e.target.value)}
                        className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={settings.headerBgColor ?? "#ffffff"}
                        onChange={(e) => setField("headerBgColor", e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] font-mono"
                        placeholder="#ffffff"
                      />
                    </div>
                    <div className="mt-2 rounded-lg h-8 flex items-center px-3 text-xs font-semibold border border-gray-200"
                      style={{ backgroundColor: settings.headerBgColor ?? "#ffffff", color: settings.headerBgColor ? "#000" : "#6b7280" }}>
                      Cabeçalho
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Fundo do rodapé</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.footerBgColor ?? "#000000"}
                        onChange={(e) => setField("footerBgColor", e.target.value)}
                        className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={settings.footerBgColor ?? "#000000"}
                        onChange={(e) => setField("footerBgColor", e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] font-mono"
                        placeholder="#000000"
                      />
                    </div>
                    <div className="mt-2 rounded-lg h-8 flex items-center px-3 text-xs font-semibold text-white"
                      style={{ backgroundColor: settings.footerBgColor ?? "#000000" }}>
                      Rodapé
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tracking */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-[#1a2448]" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rastreamento &amp; Analytics</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Google Analytics 4 — Measurement ID
                </label>
                <input
                  value={settings.ga4MeasurementId ?? ""}
                  onChange={(e) => setField("ga4MeasurementId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  placeholder="G-XXXXXXXXXX"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Encontre em GA4 → Admin → Data Streams → Web → Measurement ID
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Facebook Pixel ID
                </label>
                <input
                  value={settings.facebookPixelId ?? ""}
                  onChange={(e) => setField("facebookPixelId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  placeholder="123456789012345"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Encontre em Meta Business Suite → Events Manager → Pixels
                </p>
              </div>

              {(settings.ga4MeasurementId || settings.facebookPixelId) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {settings.ga4MeasurementId && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                      GA4 ativo — {settings.ga4MeasurementId}
                    </span>
                  )}
                  {settings.facebookPixelId && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      Pixel ativo — {settings.facebookPixelId}
                    </span>
                  )}
                </div>
              )}
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
