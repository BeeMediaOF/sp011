import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type SiteSettings, type ContactInfo } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import { saveAdminThemeToStorage } from "../../lib/adminTheme";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Globe, FileSearch, UserCircle, Image, LayoutDashboard, BarChart2,
  Monitor, Smartphone, Tag, Upload, CheckCircle, AlertCircle, Minus, Plus,
  Mail, Phone, MapPin, Building2, FileText, Youtube,
  RefreshCw,
} from "lucide-react";

type SettingsTab = "informacoes" | "logo" | "aparencia" | "contato";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "informacoes", label: "Informações do Site" },
  { id: "logo",        label: "Logo & Imagens" },
  { id: "aparencia",   label: "Aparência" },
  { id: "contato",     label: "Contato & Redes" },
];

const CARD = "bg-white rounded-2xl overflow-hidden";
const CARD_SHADOW = { boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const INPUT = "w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] bg-white placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors";

const CONTACT_GROUPS: {
  title: string; icon: React.ElementType; color: string;
  fields: { key: keyof ContactInfo; label: string; placeholder: string; multiline?: boolean }[];
}[] = [
  {
    title: "Contato", icon: Mail, color: "#0B2A66",
    fields: [
      { key: "supportEmail", label: "E-mail de Suporte (Redação)", placeholder: "suporte@portal.com.br" },
      { key: "displayEmail", label: "E-mail de Exibição",          placeholder: "redacao@portal.com.br" },
      { key: "phone",        label: "Telefone",                    placeholder: "(61) 99888-0000" },
      { key: "whatsapp",     label: "WhatsApp",                    placeholder: "(61) 99888-0000" },
    ],
  },
  {
    title: "Redes Sociais", icon: Globe, color: "#7c3aed",
    fields: [
      { key: "facebook",  label: "Facebook URL",    placeholder: "https://facebook.com/..." },
      { key: "instagram", label: "Instagram URL",   placeholder: "https://instagram.com/..." },
      { key: "x",         label: "X / Twitter URL", placeholder: "https://x.com/..." },
      { key: "youtube",   label: "YouTube URL",     placeholder: "https://youtube.com/..." },
      { key: "tiktok",    label: "TikTok URL",      placeholder: "https://tiktok.com/@..." },
    ],
  },
  {
    title: "Dados Legais", icon: Building2, color: "#0d9488",
    fields: [
      { key: "address", label: "Endereço", placeholder: "Brasília, Distrito Federal" },
      { key: "cnpj",    label: "CNPJ",     placeholder: "00.000.000/0000-00" },
    ],
  },
  {
    title: "Textos Legais", icon: FileText, color: "#ea580c",
    fields: [
      { key: "legalInfo",     label: "Informações Legais",      placeholder: "Editor responsável, dados legais...", multiline: true },
      { key: "privacyPolicy", label: "Política de Privacidade", placeholder: "Conteúdo da política...",            multiline: true },
      { key: "termsOfUse",    label: "Termos de Uso",           placeholder: "Conteúdo dos termos...",             multiline: true },
    ],
  },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("informacoes");
  const { toast } = useToast();

  /* ── settings state ── */
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Brasília Hoje",
    tagline: "A notícia da nossa capital, agora.",
    mobileEnabled: true,
    desktopEnabled: true,
    seoDescription: "",
    seoKeywords: "",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  /* ── logo state ── */
  const logoInputRef   = useRef<HTMLInputElement>(null);
  const ogRef          = useRef<HTMLInputElement>(null);
  const faviconRef     = useRef<HTMLInputElement>(null);
  const adminLogoRef   = useRef<HTMLInputElement>(null);
  const bylineLogoRef  = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview]     = useState<string | null>(null);
  const [logoSize, setLogoSize]           = useState(101);
  const [logoStatus, setLogoStatus]       = useState<"idle" | "success" | "error">("idle");
  const [savingLogo, setSavingLogo]       = useState(false);

  /* ── contact state ── */
  const [contact, setContact]         = useState<ContactInfo | null>(null);
  const [loadingContact, setLoadingContact] = useState(true);
  const [savingContact, setSavingContact]   = useState(false);

  /* ── load data ── */
  useEffect(() => {
    try {
      const sidebar = localStorage.getItem("admin_sidebar_color");
      const accent  = localStorage.getItem("admin_accent_color");
      if (sidebar) setSettings(p => ({ ...p, adminSidebarColor: sidebar }));
      if (accent)  setSettings(p => ({ ...p, adminAccentColor: accent }));
    } catch {}

    adminApi.getSettings()
      .then(r => {
        setSettings(r.settings);
        if (r.settings.logoSize) setLogoSize(r.settings.logoSize);
        saveAdminThemeToStorage(
          r.settings.adminSidebarColor ?? "#0B2A66",
          r.settings.adminAccentColor  ?? "#E71D36",
        );
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));

    adminApi.getContactInfo()
      .then(d => setContact(d.contactInfo))
      .catch(() => {})
      .finally(() => setLoadingContact(false));
  }, []);

  function setField<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      if (key === "adminSidebarColor" || key === "adminAccentColor") {
        saveAdminThemeToStorage(
          key === "adminSidebarColor" ? String(value) : (next.adminSidebarColor ?? "#0B2A66"),
          key === "adminAccentColor"  ? String(value) : (next.adminAccentColor  ?? "#E71D36"),
        );
      }
      return next;
    });
  }

  function updateContact<K extends keyof ContactInfo>(field: K, value: ContactInfo[K]) {
    setContact(p => p ? { ...p, [field]: value } : p);
  }

  /* ── save handlers ── */
  async function saveSettings() {
    setSavingSettings(true);
    try {
      const { settings: updated } = await adminApi.updateSettings(settings);
      setSettings(updated);
      invalidateSiteCache();
      toast({ title: "Configurações salvas!", duration: 2000 });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveLogo() {
    setSavingLogo(true); setLogoStatus("idle");
    try {
      if (logoPreview) {
        await adminApi.uploadLogo(logoPreview);
        setField("logoBase64", logoPreview);
        setLogoPreview(null);
      }
      await adminApi.updateSettings({ logoSize });
      invalidateSiteCache();
      setLogoStatus("success");
      toast({ title: "Logo salvo!", duration: 2000 });
    } catch {
      setLogoStatus("error");
      toast({ title: "Erro ao salvar logo", variant: "destructive" });
    } finally {
      setSavingLogo(false);
    }
  }

  async function saveContact() {
    if (!contact) return;
    setSavingContact(true);
    try {
      await adminApi.updateContactInfo(contact);
      toast({ title: "Contato salvo!", duration: 2000 });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  }

  function handleLogoFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => { setLogoPreview(e.target?.result as string); setLogoStatus("idle"); };
    reader.readAsDataURL(file);
  }

  function handleImageFile(key: "ogImageBase64" | "faviconBase64", file: File) {
    const reader = new FileReader();
    reader.onload = e => setField(key, e.target?.result as string);
    reader.readAsDataURL(file);
  }

  const displayLogo = logoPreview ?? settings.logoBase64 ?? null;

  /* ── render ── */
  return (
    <AdminLayout title="Configurações">
      <div className="space-y-5">

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-white rounded-2xl w-fit" style={CARD_SHADOW}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === t.id
                  ? "bg-[#0B2A66] text-white shadow-sm"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── INFORMAÇÕES ─────────────────────────────────────── */}
        {activeTab === "informacoes" && (
          <div className="max-w-2xl space-y-5">
            {loadingSettings ? (
              <div className={`${CARD} p-8 text-center text-[#94A3B8]`} style={CARD_SHADOW}>Carregando…</div>
            ) : (
              <>
                {/* Site info */}
                <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
                  <SectionHeader icon={<Globe size={15}/>} label="Informações do Site"/>
                  <Field label="Nome do site">
                    <input value={settings.siteName} onChange={e => setField("siteName", e.target.value)}
                      className={INPUT} placeholder="Ex: SBC Agora"/>
                  </Field>
                  <Field label="Tagline / Slogan">
                    <input value={settings.tagline} onChange={e => setField("tagline", e.target.value)}
                      className={INPUT} placeholder="Ex: Notícia. Agora. Sempre."/>
                  </Field>
                </div>

                {/* SEO */}
                <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
                  <SectionHeader icon={<FileSearch size={15}/>} label="SEO"/>
                  <Field label="Meta descrição" hint={`${(settings.seoDescription ?? "").length}/160`}>
                    <textarea value={settings.seoDescription ?? ""} onChange={e => setField("seoDescription", e.target.value)}
                      rows={3} maxLength={160} className={INPUT + " resize-none"}
                      placeholder="Descrição exibida nos resultados do Google (máx. 160 caracteres)"/>
                  </Field>
                  <Field label="Palavras-chave">
                    <input value={settings.seoKeywords ?? ""} onChange={e => setField("seoKeywords", e.target.value)}
                      className={INPUT} placeholder="brasília, notícias, df, política"/>
                  </Field>
                </div>

                {/* Byline */}
                <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
                  <SectionHeader icon={<UserCircle size={15}/>} label="Assinatura dos artigos"/>
                  <p className="text-xs text-[#94A3B8]">Nome e foto que aparecem no cabeçalho de cada artigo publicado.</p>
                  <Field label="Nome da assinatura">
                    <input value={settings.bylineName ?? ""} onChange={e => setField("bylineName", e.target.value)}
                      className={INPUT} placeholder={`Padrão: ${settings.siteName || "nome do portal"}`}/>
                  </Field>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-2">Foto da assinatura</label>
                    <input ref={bylineLogoRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setField("bylineLogoBase64", ev.target?.result as string); r.readAsDataURL(f); }}}/>
                    <div className="flex items-center gap-3">
                      <button onClick={() => bylineLogoRef.current?.click()}
                        className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:bg-[#F8FAFC] transition-colors">
                        Selecionar foto
                      </button>
                      {settings.bylineLogoBase64 ? (
                        <div className="relative">
                          <img src={settings.bylineLogoBase64} alt="Byline" className="h-10 w-10 object-cover rounded-full border border-[#E2E8F0]"/>
                          <button onClick={() => setField("bylineLogoBase64", undefined)}
                            className="absolute -top-1 -right-1 bg-[#E71D36] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">&times;</button>
                        </div>
                      ) : <p className="text-xs text-[#94A3B8] italic">Usando logo do portal</p>}
                    </div>
                  </div>
                </div>

                {/* Tracking */}
                <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
                  <SectionHeader icon={<BarChart2 size={15}/>} label="Rastreamento &amp; Analytics"/>
                  <Field label="Google Analytics 4 — Measurement ID" hint={undefined}>
                    <input value={settings.ga4MeasurementId ?? ""} onChange={e => setField("ga4MeasurementId", e.target.value)}
                      className={INPUT + " font-mono"} placeholder="G-XXXXXXXXXX"/>
                    <p className="text-[11px] text-[#94A3B8] mt-1">GA4 → Admin → Data Streams → Web → Measurement ID</p>
                  </Field>
                  <Field label="Facebook Pixel ID">
                    <input value={settings.facebookPixelId ?? ""} onChange={e => setField("facebookPixelId", e.target.value)}
                      className={INPUT + " font-mono"} placeholder="123456789012345"/>
                    <p className="text-[11px] text-[#94A3B8] mt-1">Meta Business Suite → Events Manager → Pixels</p>
                  </Field>
                  {(settings.ga4MeasurementId || settings.facebookPixelId) && (
                    <div className="flex flex-wrap gap-2">
                      {settings.ga4MeasurementId && <Badge color="orange">GA4 ativo — {settings.ga4MeasurementId}</Badge>}
                      {settings.facebookPixelId  && <Badge color="blue">Pixel ativo — {settings.facebookPixelId}</Badge>}
                    </div>
                  )}
                </div>

                {/* Device visibility */}
                <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
                  <SectionHeader icon={<Tag size={15}/>} label="Visibilidade por dispositivo"/>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "desktopEnabled" as const, icon: <Monitor size={22}/>, label: "Desktop" },
                      { key: "mobileEnabled"  as const, icon: <Smartphone size={22}/>, label: "Mobile" },
                    ].map(({ key, icon, label }) => (
                      <button key={key} onClick={() => setField(key, !settings[key])}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          settings[key]
                            ? "border-[#0B2A66] bg-[#0B2A66]/5 text-[#0B2A66]"
                            : "border-[#E2E8F0] text-[#94A3B8] hover:border-[#CBD5E1]"
                        }`}>
                        {icon}
                        <span className="text-xs font-semibold">{label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${settings[key] ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                          {settings[key] ? "Ativo" : "Inativo"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <SaveBar saving={savingSettings} onSave={saveSettings}/>
              </>
            )}
          </div>
        )}

        {/* ── LOGO & IMAGENS ──────────────────────────────────── */}
        {activeTab === "logo" && (
          <div className="max-w-2xl space-y-5">
            {/* Logo do portal */}
            <div className={`${CARD} p-6 space-y-5`} style={CARD_SHADOW}>
              <SectionHeader icon={<Image size={15}/>} label="Logo do Portal"/>
              <p className="text-xs text-[#94A3B8]">Arquivo PNG ou SVG com fundo transparente — exibido no cabeçalho do site.</p>

              {settings.logoBase64 && !logoPreview && (
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-2">Logo atual</p>
                  <div className="border border-[#F1F5F9] rounded-2xl p-6 flex items-center justify-center bg-[#F8FAFC]">
                    <img src={settings.logoBase64} alt="Logo atual" style={{ height: logoSize }} className="w-auto object-contain"/>
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleLogoFile(f); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => logoInputRef.current?.click()}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#0B2A66"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#E2E8F0"}
                className="border-2 border-dashed border-[#E2E8F0] rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#F7F9FC]">
                  <Upload size={22} className="text-[#94A3B8]"/>
                </div>
                <p className="text-sm text-[#64748B] text-center leading-relaxed">
                  Clique ou arraste um arquivo aqui<br/>
                  <span className="text-xs text-[#94A3B8]">PNG, SVG, WEBP — fundo transparente recomendado</span>
                </p>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }}/>
              </div>

              {logoPreview && (
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-2">Pré-visualização</p>
                  <div className="border border-[#F1F5F9] rounded-2xl p-6 flex items-center justify-center bg-[#F8FAFC]">
                    <img src={logoPreview} alt="Logo preview" style={{ height: logoSize }} className="w-auto object-contain"/>
                  </div>
                </div>
              )}

              {/* Size control */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-[#64748B]">Tamanho da logo</p>
                  <span className="text-sm font-bold text-[#0B2A66]">{logoSize}px</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setLogoSize(s => Math.max(40, s - 8))}
                    className="w-9 h-9 rounded-xl border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] transition-colors">
                    <Minus size={14}/>
                  </button>
                  <input type="range" min={40} max={200} step={4} value={logoSize}
                    onChange={e => setLogoSize(Number(e.target.value))}
                    className="flex-1 accent-[#0B2A66]"/>
                  <button onClick={() => setLogoSize(s => Math.min(200, s + 8))}
                    className="w-9 h-9 rounded-xl border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] transition-colors">
                    <Plus size={14}/>
                  </button>
                </div>
                {displayLogo && (
                  <div className="mt-3 border border-[#F1F5F9] rounded-2xl p-4 flex items-center justify-center bg-[#F8FAFC]">
                    <img src={displayLogo} alt="size preview" style={{ height: logoSize, transition: "height 0.15s" }} className="w-auto object-contain"/>
                  </div>
                )}
              </div>

              {logoStatus === "success" && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                  <CheckCircle size={16}/> Logo e tamanho atualizados com sucesso!
                </div>
              )}
              {logoStatus === "error" && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-[#E71D36] rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={16}/> Erro ao salvar
                </div>
              )}

              <button onClick={saveLogo} disabled={savingLogo}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-[#0B2A66] hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                {savingLogo ? <RefreshCw size={15} className="animate-spin"/> : <Upload size={15}/>}
                {savingLogo ? "Salvando…" : "Salvar Logo"}
              </button>
            </div>

            {/* OG Image */}
            <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
              <SectionHeader icon={<Image size={15}/>} label="OG Image (compartilhamento social)"/>
              <p className="text-xs text-[#94A3B8]">Exibida ao compartilhar o site no WhatsApp, Facebook etc. Recomendado: 1200×630px.</p>
              <input ref={ogRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile("ogImageBase64", f); }}/>
              <div className="flex items-center gap-3">
                <button onClick={() => ogRef.current?.click()}
                  className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:bg-[#F8FAFC] transition-colors">
                  Selecionar imagem
                </button>
                {settings.ogImageBase64 && (
                  <div className="relative">
                    <img src={settings.ogImageBase64} alt="OG" className="h-12 w-20 object-cover rounded-xl border border-[#E2E8F0]"/>
                    <button onClick={() => setField("ogImageBase64", undefined)}
                      className="absolute -top-1 -right-1 bg-[#E71D36] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">&times;</button>
                  </div>
                )}
              </div>
            </div>

            {/* Favicon */}
            <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
              <SectionHeader icon={<Image size={15}/>} label="Favicon (ícone da aba do navegador)"/>
              <p className="text-xs text-[#94A3B8]">Quadrado, idealmente 512×512px. PNG ou SVG com fundo transparente.</p>
              <input ref={faviconRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile("faviconBase64", f); }}/>
              <div className="flex items-center gap-3">
                <button onClick={() => faviconRef.current?.click()}
                  className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:bg-[#F8FAFC] transition-colors">
                  Selecionar favicon
                </button>
                {settings.faviconBase64 && (
                  <div className="relative">
                    <img src={settings.faviconBase64} alt="Favicon" className="h-10 w-10 object-contain rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]"/>
                    <button onClick={() => setField("faviconBase64", undefined)}
                      className="absolute -top-1 -right-1 bg-[#E71D36] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">&times;</button>
                  </div>
                )}
              </div>
            </div>

            {/* Login screen logo */}
            <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
              <SectionHeader icon={<LayoutDashboard size={15}/>} label="Logo da Tela de Login"/>
              <p className="text-xs text-[#94A3B8]">Exibido na tela de login do painel. Se não definido, usa o logo do portal. Recomendado: PNG transparente, fundo escuro.</p>
              <input
                ref={adminLogoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { const r = new FileReader(); r.onload = ev => setField("loginLogoBase64", ev.target?.result as string); r.readAsDataURL(f); }
                }}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => adminLogoRef.current?.click()}
                  className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                >
                  Selecionar logo
                </button>
                {settings.loginLogoBase64 ? (
                  <div className="relative bg-[#0B2A66] rounded-xl p-2">
                    <img src={settings.loginLogoBase64} alt="Login logo" className="h-8 max-w-[140px] object-contain"/>
                    <button
                      onClick={() => setField("loginLogoBase64", undefined)}
                      className="absolute -top-1 -right-1 bg-[#E71D36] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                    >&times;</button>
                  </div>
                ) : <p className="text-xs text-[#94A3B8] italic">Usando logo padrão do portal</p>}
              </div>
            </div>

            {/* Admin sidebar logo */}
            <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
              <SectionHeader icon={<LayoutDashboard size={15}/>} label="Logo do Painel Admin (sidebar)"/>
              <p className="text-xs text-[#94A3B8]">Exibido na barra lateral do painel. Se não definido, usa o logo do portal. Recomendado: PNG transparente, 300×80px.</p>
              <input
                ref={bylineLogoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { const r = new FileReader(); r.onload = ev => setField("adminLogoBase64", ev.target?.result as string); r.readAsDataURL(f); }
                }}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => bylineLogoRef.current?.click()}
                  className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                >
                  Selecionar logo
                </button>
                {settings.adminLogoBase64 ? (
                  <div className="relative bg-[#0B2A66] rounded-xl p-2">
                    <img src={settings.adminLogoBase64} alt="Sidebar logo" className="h-8 max-w-[140px] object-contain"/>
                    <button
                      onClick={() => setField("adminLogoBase64", undefined)}
                      className="absolute -top-1 -right-1 bg-[#E71D36] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                    >&times;</button>
                  </div>
                ) : <p className="text-xs text-[#94A3B8] italic">Usando logo padrão do portal</p>}
              </div>
            </div>

            <SaveBar saving={savingSettings} onSave={saveSettings} label="Salvar imagens"/>
          </div>
        )}

        {/* ── APARÊNCIA ───────────────────────────────────────── */}
        {activeTab === "aparencia" && (
          <div className="max-w-2xl space-y-5">
            {/* Admin panel colors */}
            <div className={`${CARD} p-6 space-y-5`} style={CARD_SHADOW}>
              <SectionHeader icon={<LayoutDashboard size={15}/>} label="Painel Administrativo"/>

              {/* Presets */}
              <div>
                <p className="text-xs font-medium text-[#64748B] mb-2">Temas prontos</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "SBC Agora (padrão)", sidebar: "#0B2A66", accent: "#E71D36" },
                    { label: "Oceano",   sidebar: "#0b3d91", accent: "#e8a020" },
                    { label: "Floresta", sidebar: "#1a3a2a", accent: "#22c55e" },
                    { label: "Grafite",  sidebar: "#18181b", accent: "#f59e0b" },
                    { label: "Roxo",     sidebar: "#3b1f6e", accent: "#a855f7" },
                  ].map(t => (
                    <button key={t.label} onClick={() => { setField("adminSidebarColor", t.sidebar); setField("adminAccentColor", t.accent); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E2E8F0] hover:border-[#CBD5E1] transition-colors text-xs text-[#0F172A]">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.sidebar }}/>
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.accent }}/>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ColorField label="Cor da sidebar"
                  value={settings.adminSidebarColor ?? "#0B2A66"}
                  onChange={v => setField("adminSidebarColor", v)}
                  preview="Sidebar"/>
                <ColorField label="Cor de destaque (links ativos)"
                  value={settings.adminAccentColor ?? "#E71D36"}
                  onChange={v => setField("adminAccentColor", v)}
                  preview="Destaque"/>
              </div>
            </div>

            {/* Portal public colors */}
            <div className={`${CARD} p-6 space-y-5`} style={CARD_SHADOW}>
              <SectionHeader icon={<Globe size={15}/>} label="Cores do Portal Público"/>
              <div className="grid grid-cols-2 gap-4">
                <ColorField label="Fundo do cabeçalho"
                  value={settings.headerBgColor ?? "#ffffff"}
                  onChange={v => setField("headerBgColor", v)}
                  preview="Cabeçalho" light/>
                <ColorField label="Fundo do rodapé"
                  value={settings.footerBgColor ?? "#000000"}
                  onChange={v => setField("footerBgColor", v)}
                  preview="Rodapé"/>
              </div>
            </div>

            <SaveBar saving={savingSettings} onSave={saveSettings}/>
          </div>
        )}

        {/* ── CONTATO ─────────────────────────────────────────── */}
        {activeTab === "contato" && (
          <div className="max-w-2xl space-y-5">
            {loadingContact ? (
              <div className={`${CARD} p-8 text-center text-[#94A3B8]`} style={CARD_SHADOW}>Carregando…</div>
            ) : contact ? (
              <>
                {CONTACT_GROUPS.map(({ title, icon: Icon, color, fields }) => (
                  <div key={title} className={`${CARD} p-6`} style={CARD_SHADOW}>
                    <div className="flex items-center gap-2 mb-5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "18" }}>
                        <Icon size={14} style={{ color }}/>
                      </div>
                      <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wide">{title}</h3>
                    </div>
                    <div className="space-y-4">
                      {fields.map(({ key, label, placeholder, multiline }) => (
                        <div key={key}>
                          <label className="block text-sm font-medium text-[#0F172A] mb-1.5">{label}</label>
                          {multiline ? (
                            <textarea value={(contact[key] as string) ?? ""} rows={4}
                              onChange={e => updateContact(key, e.target.value as ContactInfo[typeof key])}
                              className={INPUT + " resize-none"} placeholder={placeholder}/>
                          ) : (
                            <input type="text" value={(contact[key] as string) ?? ""}
                              onChange={e => updateContact(key, e.target.value as ContactInfo[typeof key])}
                              className={INPUT} placeholder={placeholder}/>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <SaveBar saving={savingContact} onSave={saveContact}/>
              </>
            ) : (
              <div className={`${CARD} p-8 text-center text-[#E71D36]`} style={CARD_SHADOW}>Erro ao carregar dados de contato.</div>
            )}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}

/* ── Helpers ── */

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-1 border-b border-[#F1F5F9]">
      <span className="text-[#0B2A66]">{icon}</span>
      <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide"
        dangerouslySetInnerHTML={{ __html: label }}/>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-[#0F172A]">{label}</label>
        {hint && <span className="text-[11px] text-[#94A3B8]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange, preview, light }: {
  label: string; value: string; onChange: (v: string) => void; preview: string; light?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#64748B] mb-1.5">{label}</label>
      <div className="flex items-center gap-2 border border-[#E2E8F0] rounded-xl px-3 py-2 bg-white">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"/>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 text-xs font-mono text-[#0F172A] bg-transparent focus:outline-none"/>
      </div>
      <div className="mt-2 rounded-xl h-8 flex items-center px-3 text-xs font-semibold"
        style={{ backgroundColor: value, color: light ? "#374151" : "#ffffff" }}>
        {preview}
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: "orange" | "blue"; children: React.ReactNode }) {
  const cls = color === "orange"
    ? "bg-orange-50 border-orange-200 text-orange-700"
    : "bg-blue-50 border-blue-200 text-blue-700";
  const dot = color === "orange" ? "bg-orange-400" : "bg-blue-500";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}/>
      {children}
    </span>
  );
}

function SaveBar({ saving, onSave, label = "Salvar configurações" }: {
  saving: boolean; onSave: () => void; label?: string;
}) {
  return (
    <div className="flex justify-end pt-1 pb-4">
      <button onClick={onSave} disabled={saving}
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#0B2A66] text-white rounded-xl text-sm font-semibold hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
        {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
        {saving ? "Salvando…" : label}
      </button>
    </div>
  );
}
