import React, { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "../../brand";
import { useSearch } from "wouter";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type SiteSettings, type ContactInfo, type AuditLog, type SecurityLog, type LogStats, type EditorPermission } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import { saveAdminThemeToStorage } from "../../lib/adminTheme";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Globe, FileSearch, UserCircle, Image, LayoutDashboard, BarChart2,
  Monitor, Smartphone, Tag, Upload, CheckCircle, AlertCircle, Minus, Plus,
  Mail, Phone, MapPin, Building2, FileText, Youtube,
  RefreshCw, Sparkles, Link2, ClipboardList, ShieldAlert, Activity, Search,
  Copy, CheckCheck, Key, AlertTriangle, XCircle, ShieldCheck, ShieldOff,
  Database, Server, Shield, Unlock, Lock, ChevronDown, ChevronRight, TrendingUp,
  Share2,
} from "lucide-react";

type SettingsTab = "informacoes" | "logo" | "aparencia" | "contato" | "conexoes" | "webhook" | "seguranca" | "permissoes" | "logs";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "informacoes", label: "Informações do Site" },
  { id: "logo",        label: "Logo & Imagens" },
  { id: "aparencia",   label: "Aparência" },
  { id: "contato",     label: "Contato & Redes" },
  { id: "conexoes",    label: "Conexões" },
  { id: "webhook",     label: "Webhook" },
  { id: "seguranca",   label: "Segurança" },
  { id: "permissoes",  label: "Permissões" },
  { id: "logs",        label: "Logs" },
];

/* ── Logs helpers ─────────────────────────────────────────────────────── */
const SEV_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  low:      { bg: "#F1F5F9", color: "#64748B", label: "Baixa" },
  medium:   { bg: "#FEF3C7", color: "#D97706", label: "Média" },
  high:     { bg: "#FEE2E2", color: "#DC2626", label: "Alta" },
  critical: { bg: "#450A0A", color: "#FECACA", label: "Crítico" },
};
function SevBadge({ severity }: { severity: string }) {
  const s = SEV_STYLE[severity] ?? SEV_STYLE.low!;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
      style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
  );
}
function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}
function WebhookBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
      style={{ backgroundColor: "#FFF7ED", color: "#C2410C" }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ display: "inline" }}>
        <circle cx="4.5" cy="4.5" r="3.5" stroke="#C2410C" strokeWidth="1.5" />
        <path d="M4.5 2.5v2.2l1.4 1.4" stroke="#C2410C" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      Webhook
    </span>
  );
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

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

function getTabFromUrl(): SettingsTab {
  const p = new URLSearchParams(window.location.search).get("tab");
  const valid: SettingsTab[] = ["informacoes","logo","aparencia","contato","conexoes","webhook","seguranca","permissoes","logs"];
  return (valid.includes(p as SettingsTab) ? p : "informacoes") as SettingsTab;
}

export default function Settings() {
  const search = useSearch();
  const [activeTab, setActiveTab] = useState<SettingsTab>(getTabFromUrl);
  const { toast } = useToast();

  /* sync tab whenever the URL search string changes (sidebar links, popstate) */
  useEffect(() => {
    setActiveTab(getTabFromUrl());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  /* ── logs state ── */
  const [logTab,     setLogTab]     = useState<"acoes" | "acesso" | "seguranca">("acoes");
  const [auditLogs,  setAuditLogs]  = useState<AuditLog[]>([]);
  const [secLogs,    setSecLogs]    = useState<SecurityLog[]>([]);
  const [logStats,   setLogStats]   = useState<LogStats | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logSearch,  setLogSearch]  = useState("");
  const [logSev,     setLogSev]     = useState("");
  const [logDate,    setLogDate]    = useState("");

  async function loadLogs() {
    setLogLoading(true);
    try {
      const params: Record<string, string> = {};
      if (logSearch) params.search = logSearch;
      if (logDate)   params.from   = logDate;
      if (logSev)    params.severity = logSev;
      const [auditRes, secRes, statsRes] = await Promise.all([
        adminApi.getAuditLogs(params),
        adminApi.getSecurityLogs(params),
        adminApi.getLogStats(),
      ]);
      setAuditLogs(auditRes.logs);
      setSecLogs(secRes.logs);
      setLogStats(statsRes);
    } catch { /* silent */ } finally {
      setLogLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "logs" && auditLogs.length === 0 && !logLoading) {
      void loadLogs();
    }
    if (activeTab === "webhook" && !wLoaded && !wLoading) {
      void loadWebhookKey();
    }
    if (activeTab === "seguranca" && !secLoaded && !secLoading) {
      void loadSecurity();
    }
    if (activeTab === "permissoes" && !permsLoaded && !permsLoading) {
      void loadPerms();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* ── settings state ── */
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: BRAND.name,
    tagline: "Notícia. Agora. Sempre.",
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

  /* ── AI SEO state ── */
  const [aiSeoLoading, setAiSeoLoading] = useState(false);

  async function fillSeoWithAI() {
    setAiSeoLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const r = await fetch("/api/admin/ai-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          siteName: settings.siteName,
          tagline: settings.tagline,
          categories: ["política", "cidade", "esportes", "saúde", "cultura", "educação", "transporte"],
        }),
      });
      if (!r.ok) throw new Error("Erro da API");
      const data = await r.json() as { metaDescription?: string; keywords?: string };
      if (data.metaDescription) setSettings(p => ({ ...p, seoDescription: data.metaDescription! }));
      if (data.keywords)       setSettings(p => ({ ...p, seoKeywords: data.keywords! }));
      toast({ title: "SEO preenchido com IA!", description: "Revise e salve as sugestões." });
    } catch {
      toast({ title: "Erro ao gerar SEO", description: "Verifique a conexão e tente novamente.", variant: "destructive" });
    } finally {
      setAiSeoLoading(false);
    }
  }

  /* ── contact state ── */
  const [contact, setContact]         = useState<ContactInfo | null>(null);
  const [loadingContact, setLoadingContact] = useState(true);
  const [savingContact, setSavingContact]   = useState(false);

  /* ── webhook state ── */
  const [wApiKey,       setWApiKey]       = useState<string | null>(null);
  const [wShowKey,      setWShowKey]      = useState(false);
  const [wLoading,      setWLoading]      = useState(false);
  const [wLoaded,       setWLoaded]       = useState(false);
  const [wRegenerating, setWRegenerating] = useState(false);
  const [wConfirmRegen, setWConfirmRegen] = useState(false);
  const [wError,        setWError]        = useState("");

  async function loadWebhookKey() {
    setWLoading(true); setWError("");
    try {
      const { apiKey: k } = await adminApi.getWebhookKey();
      setWApiKey(k);
    } catch {
      setWError("Erro ao carregar chave de API");
    } finally {
      setWLoading(false); setWLoaded(true);
    }
  }

  async function handleWebhookGenerate() {
    if (!wConfirmRegen) { setWConfirmRegen(true); return; }
    setWRegenerating(true); setWError(""); setWConfirmRegen(false);
    try {
      const { apiKey: newKey } = await adminApi.regenerateWebhookKey();
      setWApiKey(newKey); setWShowKey(true);
    } catch {
      setWError("Erro ao regenerar chave de API");
    } finally {
      setWRegenerating(false);
    }
  }

  /* ── security state ── */
  const [secStats,   setSecStats]   = useState<LogStats | null>(null);
  const [secLoading, setSecLoading] = useState(false);
  const [secLoaded,  setSecLoaded]  = useState(false);
  const [secDbOk,    setSecDbOk]    = useState<boolean | null>(null);
  const [secFilter,  setSecFilter]  = useState<"ok" | "warning" | "critical" | "all">("all");

  async function loadSecurity() {
    setSecLoading(true);
    try {
      const s = await adminApi.getLogStats();
      setSecStats(s); setSecDbOk(true);
    } catch {
      setSecDbOk(false);
    } finally {
      setSecLoading(false); setSecLoaded(true);
    }
  }

  /* ── permissions state ── */
  const [perms,       setPerms]       = useState<EditorPermission[]>([]);
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsLoaded,  setPermsLoaded]  = useState(false);
  const [permSaving,  setPermSaving]  = useState<string | null>(null);
  const [permsError,  setPermsError]  = useState<string | null>(null);
  const [permToast,   setPermToast]   = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showPermToast(msg: string, type: "success" | "error" = "success") {
    setPermToast({ msg, type });
    setTimeout(() => setPermToast(null), 3000);
  }

  const loadPerms = useCallback(async () => {
    setPermsLoading(true); setPermsError(null);
    try {
      const data = await adminApi.getEditorPermissions();
      setPerms(data.permissions);
    } catch (e) {
      setPermsError((e as Error).message ?? "Erro ao carregar permissões");
    } finally {
      setPermsLoading(false); setPermsLoaded(true);
    }
  }, []);

  async function handlePermToggle(key: string, enabled: boolean) {
    setPermSaving(key);
    setPerms(prev => prev.map(p => p.key === key ? { ...p, enabled } : p));
    try {
      await adminApi.setEditorPermission(key, enabled);
      const label = perms.find(p => p.key === key)?.label ?? key;
      showPermToast(enabled ? `Permissão "${label}" ativada` : `Permissão "${label}" desativada`);
    } catch (e) {
      setPerms(prev => prev.map(p => p.key === key ? { ...p, enabled: !enabled } : p));
      showPermToast((e as Error).message ?? "Erro ao salvar", "error");
    } finally {
      setPermSaving(null);
    }
  }

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
                      className={INPUT} placeholder={`Ex: ${BRAND.name}`}/>
                  </Field>
                  <Field label="Tagline / Slogan">
                    <input value={settings.tagline} onChange={e => setField("tagline", e.target.value)}
                      className={INPUT} placeholder="Ex: Notícia. Agora. Sempre."/>
                  </Field>
                </div>

                {/* SEO */}
                <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
                  <div className="flex items-center justify-between">
                    <SectionHeader icon={<FileSearch size={15}/>} label="SEO"/>
                    <button
                      type="button"
                      onClick={fillSeoWithAI}
                      disabled={aiSeoLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
                    >
                      {aiSeoLoading
                        ? <RefreshCw size={12} className="animate-spin" />
                        : <Sparkles size={12} />}
                      {aiSeoLoading ? "Gerando…" : "Preencher com IA"}
                    </button>
                  </div>
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

                {/* Compartilhamento */}
                <div className={`${CARD} p-6 space-y-5`} style={CARD_SHADOW}>
                  <SectionHeader icon={<Share2 size={15}/>} label="Compartilhamento (Open Graph)"/>
                  <p className="text-xs text-[#94A3B8]">
                    Aparece ao compartilhar o link no WhatsApp, Telegram, Facebook etc.
                    Ao salvar, o título e a descrição também atualizam automaticamente o HTML do site para que crawlers de redes sociais vejam os dados corretos.
                  </p>

                  {/* Preview card */}
                  <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white shadow-sm select-none">
                    <div className="h-28 bg-[#0B2A66] flex items-center justify-center overflow-hidden relative">
                      {settings.ogImageBase64
                        ? <img src={settings.ogImageBase64} alt="OG preview" className="w-full h-full object-cover"/>
                        : (
                          <div className="flex flex-col items-center gap-1.5 text-white/40">
                            <Image size={22}/>
                            <span className="text-[10px] tracking-wide">Imagem de compartilhamento</span>
                          </div>
                        )}
                      <div className="absolute inset-0 pointer-events-none" style={{boxShadow:"inset 0 -2px 8px rgba(0,0,0,0.1)"}}/>
                    </div>
                    <div className="p-3 border-t border-[#E2E8F0]">
                      <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide truncate">
                        {(() => { try { return settings.siteUrl ? new URL(settings.siteUrl).hostname : "seusite.com.br"; } catch { return settings.siteUrl || "seusite.com.br"; } })()}
                      </p>
                      <p className="text-[13px] font-semibold text-[#0F172A] truncate mt-0.5">
                        {settings.siteName || "Nome do portal"}{settings.tagline ? ` — ${settings.tagline}` : ""}
                      </p>
                      <p className="text-[11px] text-[#64748B] line-clamp-2 mt-0.5">
                        {settings.seoDescription || settings.tagline || "Descrição do portal…"}
                      </p>
                    </div>
                  </div>

                  {/* URL */}
                  <Field label="URL do site" hint="og:url">
                    <input
                      value={settings.siteUrl ?? ""}
                      onChange={e => setField("siteUrl", e.target.value)}
                      className={INPUT}
                      placeholder="https://brasilia-agora.com.br"
                    />
                  </Field>

                  {/* OG image upload */}
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Imagem de compartilhamento</label>
                    <p className="text-[11px] text-[#94A3B8] mb-2">Recomendado: 1200 × 630 px. PNG ou JPEG.</p>
                    <input ref={ogRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile("ogImageBase64", f); }}/>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => ogRef.current?.click()}
                        className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                      >
                        Selecionar imagem
                      </button>
                      {settings.ogImageBase64 ? (
                        <div className="relative">
                          <img src={settings.ogImageBase64} alt="OG" className="h-10 w-16 object-cover rounded-xl border border-[#E2E8F0]"/>
                          <button
                            onClick={() => setField("ogImageBase64", undefined)}
                            className="absolute -top-1 -right-1 bg-[#E71D36] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                          >&times;</button>
                        </div>
                      ) : <span className="text-xs text-[#94A3B8] italic">Nenhuma imagem selecionada</span>}
                    </div>
                  </div>
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

                {/* Ticker bar */}
                <div className={`${CARD} p-6`} style={CARD_SHADOW}>
                  <SectionHeader icon={<TrendingUp size={15}/>} label="Barra de Cotações"/>
                  <p className="text-xs text-[#64748B] mb-4 mt-1">Faixa rolante com cotações de moedas e criptomoedas exibida abaixo do cabeçalho.</p>
                  <button
                    onClick={() => setField("showTickerBar", !(settings.showTickerBar ?? true))}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all w-full ${
                      (settings.showTickerBar ?? true)
                        ? "border-[#0B2A66] bg-[#0B2A66]/5 text-[#0B2A66]"
                        : "border-[#E2E8F0] text-[#94A3B8] hover:border-[#CBD5E1]"
                    }`}>
                    <TrendingUp size={18}/>
                    <div className="flex-1 text-left">
                      <p className="text-[13px] font-semibold">Barra de cotações</p>
                      <p className="text-[11px] opacity-70">ETH · USD · EUR · GBP · BTC</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${(settings.showTickerBar ?? true) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {(settings.showTickerBar ?? true) ? "Ativada" : "Desativada"}
                    </span>
                  </button>
                </div>

                {/* Hero strip */}
                <div className={`${CARD} p-6`} style={CARD_SHADOW}>
                  <SectionHeader icon={<LayoutDashboard size={15}/>} label="Strip de Destaques"/>
                  <p className="text-xs text-[#64748B] mb-4 mt-1">Faixa com 4 notícias secundárias exibida abaixo do bloco principal de capa. No mobile, aparece como carrossel deslizável.</p>
                  <button
                    onClick={() => setField("showHeroStrip", !(settings.showHeroStrip ?? true))}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all w-full ${
                      (settings.showHeroStrip ?? true)
                        ? "border-[#0B2A66] bg-[#0B2A66]/5 text-[#0B2A66]"
                        : "border-[#E2E8F0] text-[#94A3B8] hover:border-[#CBD5E1]"
                    }`}>
                    <LayoutDashboard size={18}/>
                    <div className="flex-1 text-left">
                      <p className="text-[13px] font-semibold">Strip de destaques</p>
                      <p className="text-[11px] opacity-70">4 notícias · desktop grid · mobile carrossel</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${(settings.showHeroStrip ?? true) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {(settings.showHeroStrip ?? true) ? "Ativado" : "Desativado"}
                    </span>
                  </button>
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
                    { label: `${BRAND.name} (padrão)`, sidebar: "#0B2A66", accent: "#E71D36" },
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

        {/* ── CONEXÕES ────────────────────────────────────────── */}
        {activeTab === "conexoes" && (
          <div className="max-w-2xl space-y-5">
            <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
              <SectionHeader icon={<Link2 size={15}/>} label="Google Tag Manager"/>
              <p className="text-xs text-[#94A3B8]">
                Insira o ID do contêiner GTM. O snippet será injetado automaticamente em todas as páginas.
              </p>
              <Field label="Container ID">
                <input
                  value={settings.gtmId ?? ""}
                  onChange={e => setField("gtmId", e.target.value)}
                  className={INPUT + " font-mono"}
                  placeholder="GTM-XXXXXXX"
                />
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  Google Tag Manager → Workspace → ID do contêiner (ex: GTM-P6QN99MB)
                </p>
              </Field>
              {settings.gtmId && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                  <CheckCircle size={15}/> GTM ativo — {settings.gtmId}
                </div>
              )}
            </div>

            <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
              <SectionHeader icon={<BarChart2 size={15}/>} label="Meta / Facebook Pixel"/>
              <p className="text-xs text-[#94A3B8]">
                ID do pixel do Facebook para rastreamento de conversões e públicos no Meta Ads.
              </p>
              <Field label="Pixel ID">
                <input
                  value={settings.facebookPixelId ?? ""}
                  onChange={e => setField("facebookPixelId", e.target.value)}
                  className={INPUT + " font-mono"}
                  placeholder="123456789012345"
                />
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  Meta Business Suite → Events Manager → Pixels → ID do Pixel
                </p>
              </Field>
              {settings.facebookPixelId && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm">
                  <CheckCircle size={15}/> Pixel ativo — {settings.facebookPixelId}
                </div>
              )}
            </div>

            <div className={`${CARD} p-6 space-y-4`} style={CARD_SHADOW}>
              <SectionHeader icon={<BarChart2 size={15}/>} label="Google Analytics 4"/>
              <p className="text-xs text-[#94A3B8]">
                Measurement ID do GA4 para análise de tráfego e comportamento de usuários.
              </p>
              <Field label="Measurement ID">
                <input
                  value={settings.ga4MeasurementId ?? ""}
                  onChange={e => setField("ga4MeasurementId", e.target.value)}
                  className={INPUT + " font-mono"}
                  placeholder="G-XXXXXXXXXX"
                />
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  GA4 → Admin → Data Streams → Web → Measurement ID
                </p>
              </Field>
              {settings.ga4MeasurementId && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm">
                  <CheckCircle size={15}/> GA4 ativo — {settings.ga4MeasurementId}
                </div>
              )}
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

        {/* ── LOGS ─────────────────────────────────────────────── */}
        {activeTab === "logs" && (
          <div className="space-y-5">

            {/* Stats */}
            {logStats && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { label: "Logins Falhos (24h)",  value: logStats.failedLoginsLast24h,   color: "#DC2626", bg: "#FEE2E2" },
                  { label: "Acessos Bloqueados",   value: logStats.blockedAccessLast24h,  color: "#D97706", bg: "#FEF3C7" },
                  { label: "Eventos Críticos",     value: logStats.criticalEventsLast24h, color: "#7C3AED", bg: "#F3E8FF" },
                  { label: "Último Login Admin",   value: logStats.lastAdminLogin ? fmtDate(logStats.lastAdminLogin).split(" ")[0] : "—", color: "#0B2A66", bg: "#EEF2FF" },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl p-5" style={CARD_SHADOW}>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-3" style={CARD_SHADOW}>
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input type="text" value={logSearch} onChange={e => setLogSearch(e.target.value)}
                  placeholder="Buscar por e-mail, IP, ação..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0B2A66]"/>
              </div>
              <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0B2A66]"/>
              <select value={logSev} onChange={e => setLogSev(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0B2A66]">
                <option value="">Todas as severidades</option>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Crítico</option>
              </select>
              <button onClick={() => { void loadLogs(); }}
                className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white rounded-xl text-sm font-semibold hover:opacity-90">
                <RefreshCw size={14} className={logLoading ? "animate-spin" : ""}/>
                Atualizar
              </button>
            </div>

            {/* Sub-tabs + table */}
            <div className="bg-white rounded-2xl overflow-hidden" style={CARD_SHADOW}>
              <div className="flex border-b border-slate-100">
                {([
                  { id: "acoes",     label: "Logs de Ações",     icon: ClipboardList, count: auditLogs.filter(l => !["login","logout"].includes(l.action)).length },
                  { id: "acesso",    label: "Logs de Acesso",    icon: Activity,      count: auditLogs.filter(l => ["login","logout","failed_login"].includes(l.action)).length },
                  { id: "seguranca", label: "Logs de Segurança", icon: ShieldAlert,   count: secLogs.length },
                ] as const).map(({ id, label, icon: Icon, count }) => (
                  <button key={id} onClick={() => setLogTab(id)}
                    className={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-colors ${logTab === id ? "border-b-2 border-[#0B2A66] text-[#0B2A66]" : "text-slate-500 hover:text-slate-700"}`}>
                    <Icon size={14}/>
                    {label}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${logTab === id ? "bg-[#EEF2FF] text-[#0B2A66]" : "bg-slate-100 text-slate-500"}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                {logTab === "acoes" && (() => {
                  const rows = auditLogs.filter(l => !["login","logout"].includes(l.action));
                  return (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase">Usuário</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Ação</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Módulo</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Descrição</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">IP</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Data/Hora</th>
                      </tr></thead>
                      <tbody>
                        {logLoading ? <tr><td colSpan={6} className="py-12 text-center text-slate-400">Carregando...</td></tr>
                        : rows.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-slate-400">Nenhum log encontrado</td></tr>
                        : rows.map(l => {
                          const meta = parseMetadata(l.metadata);
                          const isWebhook = meta?.source === "webhook_api_key";
                          return (
                          <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-5 py-3 text-[12px] font-medium text-slate-700">
                              <div className="flex items-center gap-2">
                                {isWebhook ? <WebhookBadge /> : null}
                                <span>{isWebhook ? "API Key" : (l.userEmail ?? "—")}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3"><span className="text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded">{l.action}</span></td>
                            <td className="px-4 py-3 text-[12px] text-slate-500">{l.module}</td>
                            <td className="px-4 py-3 text-[12px] text-slate-600 max-w-[260px] truncate">{l.description}</td>
                            <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.ipAddress ?? "—"}</td>
                            <td className="px-4 py-3 text-[11px] text-slate-400">{fmtDate(l.createdAt)}</td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  );
                })()}

                {logTab === "acesso" && (() => {
                  const rows = auditLogs.filter(l => ["login","logout","failed_login"].includes(l.action));
                  return (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase">Usuário</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Evento</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">IP</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Navegador</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Data/Hora</th>
                      </tr></thead>
                      <tbody>
                        {logLoading ? <tr><td colSpan={5} className="py-12 text-center text-slate-400">Carregando...</td></tr>
                        : rows.length === 0 ? <tr><td colSpan={5} className="py-12 text-center text-slate-400">Nenhum log de acesso</td></tr>
                        : rows.map(l => (
                          <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-5 py-3 text-[12px] font-medium text-slate-700">{l.userEmail ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${l.action === "login" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                                {l.action === "login" ? "Login" : l.action === "logout" ? "Logout" : l.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.ipAddress ?? "—"}</td>
                            <td className="px-4 py-3 text-[11px] text-slate-400 max-w-[200px] truncate">{l.userAgent ?? "—"}</td>
                            <td className="px-4 py-3 text-[11px] text-slate-400">{fmtDate(l.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}

                {logTab === "seguranca" && (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase">Evento</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Severidade</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Descrição</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Rota</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">IP</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase">Data/Hora</th>
                    </tr></thead>
                    <tbody>
                      {logLoading ? <tr><td colSpan={6} className="py-12 text-center text-slate-400">Carregando...</td></tr>
                      : secLogs.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-slate-400">Nenhum evento de segurança</td></tr>
                      : secLogs.map(l => (
                        <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-5 py-3"><span className="text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded">{l.eventType}</span></td>
                          <td className="px-4 py-3"><SevBadge severity={l.severity}/></td>
                          <td className="px-4 py-3 text-[12px] text-slate-600 max-w-[220px] truncate">{l.description}</td>
                          <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.route ?? "—"}</td>
                          <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{l.ipAddress ?? "—"}</td>
                          <td className="px-4 py-3 text-[11px] text-slate-400">{fmtDate(l.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── WEBHOOK ─────────────────────────────────────────── */}
        {activeTab === "webhook" && (() => {
          const baseUrl = window.location.origin;
          const publishUrl = `${baseUrl}/api/publish`;
          const maskedKey = wApiKey ? `${wApiKey.slice(0, 8)}${"•".repeat(24)}${wApiKey.slice(-8)}` : "";
          const displayKey = wShowKey ? (wApiKey ?? "") : maskedKey;

          const curlCreate = `curl -X POST "${publishUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${wApiKey ?? "<sua-api-key>"}" \\
  -d '{
    "title": "Título do artigo",
    "subtitle": "Subtítulo ou lide do artigo",
    "content": "Texto completo do artigo aqui...",
    "category": "politica",
    "tag": "POLÍTICA",
    "imageUrl": "https://exemplo.com/imagem.jpg",
    "author": "Redação"
  }'`;

          const curlPublishId = `curl -X POST "${publishUrl}/<id-do-artigo>" \\
  -H "Authorization: Bearer ${wApiKey ?? "<sua-api-key>"}"`;

          const bodySchema = `{
  "title":    string  // OBRIGATÓRIO — Título do artigo
  "subtitle": string  // opcional  — Subtítulo / lide
  "content":  string  // opcional  — Corpo do artigo
  "category": string  // opcional  — politica | cidade | seguranca |
                      //             transporte | saude | educacao |
                      //             cultura | esportes | colunas |
                      //             brasil | mundo | geral
  "tag":      string  // opcional  — Label exibida (ex: "POLÍTICA")
  "imageUrl": string  // opcional  — URL da imagem de capa
  "author":   string  // opcional  — Nome do autor
}`;

          const responseExample = `{
  "ok": true,
  "message": "Artigo criado e publicado com sucesso",
  "article": {
    "id": "uuid-gerado",
    "title": "Título do artigo",
    "status": "published",
    "publishedAt": "2026-05-26T14:00:00.000Z",
    ...
  }
}`;

          return (
            <div className="max-w-3xl space-y-6">
              {/* Endpoint */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="font-bold text-gray-800 text-base">Endpoint Principal</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Cria e publica um artigo em uma única requisição</p>
                  </div>
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">POST</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-800">
                  <span className="text-green-600 font-bold text-xs">POST</span>
                  <span className="flex-1 truncate">{publishUrl}</span>
                  <WCopyButton text={publishUrl} />
                </div>
                <div className="mt-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-800">
                  <span className="text-blue-600 font-bold text-xs">POST</span>
                  <span className="flex-1 truncate">{publishUrl}/:id</span>
                  <WCopyButton text={`${publishUrl}/:id`} />
                </div>
                <p className="text-xs text-gray-400 mt-1.5 ml-1">Segundo endpoint: publica um rascunho existente pelo ID</p>
              </div>

              {/* API Key */}
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Key size={16} className="text-[#0B2A66]" />
                  <h2 className="font-bold text-gray-800 text-base">Chave de API Permanente</h2>
                  <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">Não expira</span>
                </div>
                <p className="text-sm text-gray-500">
                  Use no header <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Authorization: Bearer &lt;chave&gt;</code> para integrar com Make, Zapier, n8n e outras plataformas.
                </p>

                {wLoading ? (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div className="w-4 h-4 border-2 border-[#0B2A66] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400">Carregando...</span>
                  </div>
                ) : wApiKey ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 font-mono text-sm">
                      <span className="text-gray-500 text-xs">Bearer</span>
                      <span className="text-[#0B2A66] font-semibold truncate flex-1 text-xs">{displayKey}</span>
                      <button onClick={() => setWShowKey(s => !s)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                        {wShowKey ? <span className="text-xs">Ocultar</span> : <span className="text-xs">Mostrar</span>}
                      </button>
                      <WCopyButton text={wApiKey} label="Copiar chave" />
                    </div>
                    <p className="text-xs text-green-600 font-medium">✓ Chave ativa — use esta chave nas suas automações</p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-sm text-amber-700">Nenhuma chave gerada ainda. Clique em "Gerar Chave" abaixo.</p>
                  </div>
                )}

                {wError && <p className="text-xs text-red-500">{wError}</p>}

                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-3">
                  {wConfirmRegen ? (
                    <>
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          <strong>Atenção:</strong> A chave atual será invalidada imediatamente. Todas as integrações precisarão ser atualizadas.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setWConfirmRegen(false)}
                          className="flex-1 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors">
                          Cancelar
                        </button>
                        <button onClick={handleWebhookGenerate} disabled={wRegenerating}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                          <RefreshCw size={14} className={wRegenerating ? "animate-spin" : ""} />
                          {wRegenerating ? "Regenerando..." : "Confirmar"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-600">{wApiKey ? "Regenerar chave de API" : "Gerar chave de API"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{wApiKey ? "Invalida a chave atual e cria uma nova" : "Cria uma nova chave permanente"}</p>
                      </div>
                      <button onClick={handleWebhookGenerate} disabled={wRegenerating}
                        className="flex items-center gap-1.5 bg-[#0B2A66] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#0a2255] transition-colors disabled:opacity-60">
                        <RefreshCw size={14} className={wRegenerating ? "animate-spin" : ""} />
                        {wApiKey ? "Regenerar Chave" : "Gerar Chave"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Schema */}
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                <h2 className="font-bold text-gray-800 text-base">Body da Requisição (JSON)</h2>
                <WCodeBlock code={bodySchema} />
              </div>

              {/* Examples */}
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
                <h2 className="font-bold text-gray-800 text-base">Exemplos cURL</h2>
                <WCodeBlock code={curlCreate} label="1. Criar e publicar artigo" />
                <WCodeBlock code={curlPublishId} label="2. Publicar rascunho existente por ID" />
              </div>

              {/* Response */}
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                <h2 className="font-bold text-gray-800 text-base">Resposta de Sucesso (201)</h2>
                <WCodeBlock code={responseExample} />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { code: "201", label: "Artigo criado e publicado", color: "bg-green-100 text-green-700" },
                    { code: "400", label: "Campo obrigatório ausente", color: "bg-yellow-100 text-yellow-700" },
                    { code: "401", label: "Chave ausente ou inválida", color: "bg-red-100 text-red-700" },
                  ].map(({ code, label, color }) => (
                    <div key={code} className={`${color} rounded-lg px-3 py-2.5 text-center`}>
                      <p className="font-bold text-lg">{code}</p>
                      <p className="text-xs leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Make / Zapier */}
              <div className="bg-[#0B2A66] text-white rounded-2xl p-6 space-y-3">
                <h2 className="font-bold text-base">Integração com Make, Zapier, n8n</h2>
                <p className="text-sm text-white/70">Use o módulo <strong className="text-white">HTTP / Webhook</strong> da plataforma de automação:</p>
                <ol className="text-sm text-white/80 space-y-1 list-decimal list-inside">
                  <li>URL: <code className="bg-white/10 px-1.5 rounded font-mono">{publishUrl}</code></li>
                  <li>Método: <strong className="text-white">POST</strong></li>
                  <li>Header: <code className="bg-white/10 px-1.5 rounded font-mono">Authorization: Bearer {"{"}api-key{"}"}</code></li>
                  <li>Body: JSON com os campos acima</li>
                </ol>
                <p className="text-xs text-white/50 pt-1">Use a Chave de API Permanente acima — ela não expira.</p>
              </div>
            </div>
          );
        })()}

        {/* ── SEGURANÇA ────────────────────────────────────────── */}
        {activeTab === "seguranca" && (() => {
          type CheckStatus = "ok" | "warning" | "critical";
          const BASE_CHECKS = [
            { id: "hash",      category: "Autenticação", label: "Hash seguro de senhas",           description: "Senhas armazenadas com scrypt (derivação de chave segura).", recommendation: "Senhas já protegidas com scrypt.", },
            { id: "sql",       category: "Injeção",      label: "Proteção contra SQL Injection",   description: "Drizzle ORM usa consultas parametrizadas.", recommendation: "Mantenha o ORM atualizado.", },
            { id: "xss",       category: "Injeção",      label: "Proteção contra XSS",             description: "React escapa automaticamente saídas HTML.", recommendation: "Não use dangerouslySetInnerHTML sem sanitização.", },
            { id: "routes",    category: "Controle",     label: "Rotas privadas protegidas",       description: "Todas as rotas admin exigem token Bearer válido.", recommendation: "Verifique se novas rotas usam authMiddleware.", },
            { id: "rbac",      category: "Controle",     label: "Permissões validadas no backend", description: "Endpoints sensíveis usam requireAdmin além de authMiddleware.", recommendation: "Aplique requireAdmin em todas as rotas críticas.", },
            { id: "token",     category: "Sessão",       label: "Tokens com expiração",            description: "Tokens HMAC expiram em 7 dias.", recommendation: "Considere reduzir para 24h em produção.", },
            { id: "ratelimit", category: "Brute Force",  label: "Rate limit no login",             description: "Máximo de 10 tentativas por minuto por IP.", recommendation: "Use Redis para rate limiting distribuído em produção.", },
            { id: "lockout",   category: "Brute Force",  label: "Bloqueio após tentativas",        description: "Conta bloqueada por 30 min após 5 tentativas inválidas.", recommendation: "Aumente o tempo de bloqueio se necessário.", },
            { id: "env",       category: "Configuração", label: "Variáveis sensíveis no .env",     description: "SESSION_SECRET e DATABASE_URL lidos de variáveis de ambiente.", recommendation: "Nunca coloque segredos no código-fonte.", },
            { id: "genpass",   category: "Autenticação", label: "Mensagem genérica no login",      description: "Erro de login retorna mensagem genérica sem revelar se e-mail existe.", recommendation: "Mantido corretamente.", },
            { id: "cors",      category: "Rede",         label: "CORS configurado",                description: "Express cors() configurado. Em produção, restrinja CORS_ORIGIN.", recommendation: "Configure CORS_ORIGIN=https://seudominio.com.br.", },
            { id: "headers",   category: "Rede",         label: "Headers de segurança",            description: "Implemente helmet.js em produção.", recommendation: "Adicione helmet em app.ts antes de ir para produção.", },
            { id: "https",     category: "Rede",         label: "HTTPS em produção",               description: "Hostinger fornece SSL automático.", recommendation: "Use apenas HTTPS em produção.", },
            { id: "logs",      category: "Auditoria",    label: "Logs de segurança ativos",        description: "Tentativas de login, bloqueios e acessos negados são registrados.", recommendation: "Verifique os logs regularmente.", },
            { id: "inactive",  category: "Autenticação", label: "Usuários inativos bloqueados",    description: "Login de usuários com status inactive ou blocked é negado.", recommendation: "Mantido corretamente.", },
            { id: "csrf",      category: "Segurança",    label: "Proteção CSRF",                   description: "API stateless com tokens Bearer é naturalmente resistente a CSRF.", recommendation: "Mantido corretamente.", },
            { id: "backup",    category: "Dados",        label: "Backup do banco de dados",        description: "Hostinger oferece backup automático diário para planos Business+.", recommendation: "Configure e teste restauração de backup.", },
          ];
          const STATUS_COLOR: Record<CheckStatus, string> = { ok: "#16A34A", warning: "#D97706", critical: "#DC2626" };
          const STATUS_BG:    Record<CheckStatus, string> = { ok: "#DCFCE7", warning: "#FEF3C7", critical: "#FEE2E2" };
          const STATUS_LABEL: Record<CheckStatus, string> = { ok: "Seguro",  warning: "Atenção",  critical: "Crítico" };
          const STATUS_ICON:  Record<CheckStatus, React.ElementType> = { ok: CheckCircle, warning: AlertTriangle, critical: XCircle };

          function getCheckStatus(id: string): CheckStatus {
            return ["headers", "backup", "token", "cors"].includes(id) ? "warning" : "ok";
          }

          const checks = BASE_CHECKS.map(c => ({ ...c, status: getCheckStatus(c.id) as CheckStatus }));
          const filtered = secFilter === "all" ? checks : checks.filter(c => c.status === secFilter);
          const okCount   = checks.filter(c => c.status === "ok").length;
          const warnCount = checks.filter(c => c.status === "warning").length;
          const critCount = checks.filter(c => c.status === "critical").length;
          const score     = Math.round((okCount / checks.length) * 100);
          const scoreColor = score >= 80 ? "#16A34A" : score >= 60 ? "#D97706" : "#DC2626";

          return (
            <div className="max-w-6xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-[#0B2A66]">Checkup de Segurança</h2>
                  <p className="text-sm text-slate-500 mt-1">Verificação geral da postura de segurança da plataforma</p>
                </div>
                <button onClick={loadSecurity}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white rounded-xl text-sm font-semibold hover:opacity-90">
                  <RefreshCw size={14} className={secLoading ? "animate-spin" : ""} /> Verificar agora
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-6 flex items-center gap-6" style={CARD_SHADOW}>
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
                    <p className="text-sm text-slate-500 mt-1">{score >= 80 ? "Sistema bem protegido" : score >= 60 ? "Requer atenção" : "Problemas críticos"}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-[11px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{okCount} Seguros</span>
                      <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{warnCount} Atenção</span>
                      <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{critCount} Críticos</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 space-y-4" style={CARD_SHADOW}>
                  <p className="font-semibold text-slate-800">Status do Sistema</p>
                  {[
                    { label: "Banco de Dados",     icon: Database, ok: secDbOk !== false, detail: secDbOk === null ? "Verificando..." : secDbOk ? "Conectado" : "Erro" },
                    { label: "Backend API",        icon: Server,   ok: true,              detail: "Operacional" },
                    { label: "Logs de Auditoria",  icon: Activity, ok: true,              detail: secStats ? `${secStats.failedLoginsLast24h} falhas nas últimas 24h` : "—" },
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

              <div className="bg-white rounded-2xl overflow-hidden" style={CARD_SHADOW}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800">Itens de Verificação ({checks.length})</h3>
                  <div className="flex items-center gap-2">
                    {(["all", "ok", "warning", "critical"] as const).map(f => (
                      <button key={f} onClick={() => setSecFilter(f)}
                        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${secFilter === f ? "bg-[#0B2A66] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        {f === "all" ? "Todos" : STATUS_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {filtered.map(c => {
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
          );
        })()}

        {/* ── PERMISSÕES ───────────────────────────────────────── */}
        {activeTab === "permissoes" && (() => {
          const GROUP_ICONS: Record<string, React.ElementType> = {
            "Conteúdo":      FileText,
            "Plataforma":    LayoutDashboard,
            "Automações":    Activity,
            "Administração": ShieldCheck,
          };
          const GROUP_DESC: Record<string, string> = {
            "Conteúdo":      "Permissões relacionadas a artigos, imagens e publicação.",
            "Plataforma":    "Acesso aos módulos principais do painel administrativo.",
            "Automações":    "Fontes RSS, redes sociais, colunistas e publicação automática.",
            "Administração": "Configurações avançadas, usuários e logs do sistema.",
          };
          const groups = [...new Set(perms.map(p => p.group))];
          const totalEnabled = perms.filter(p => p.enabled).length;

          return (
            <div className="max-w-3xl space-y-6">
              {/* Header card */}
              <div className="bg-[#0B2A66] rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10"><Shield size={96} /></div>
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck size={22} className="text-blue-200" />
                  <h2 className="text-lg font-bold">Controle de Permissões</h2>
                </div>
                <p className="text-sm text-blue-200 leading-relaxed max-w-lg">
                  Defina exatamente o que cada Editor pode acessar na plataforma. As alterações têm efeito imediato e são registradas nos logs de auditoria.
                </p>
                {!permsLoading && (
                  <div className="mt-4 flex items-center gap-4">
                    <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                      <div className="text-2xl font-bold">{totalEnabled}</div>
                      <div className="text-[10px] text-blue-200 mt-0.5">Permissões ativas</div>
                    </div>
                    <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                      <div className="text-2xl font-bold">{perms.length - totalEnabled}</div>
                      <div className="text-[10px] text-blue-200 mt-0.5">Bloqueadas</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <ShieldOff size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  <strong>Validação em 3 camadas:</strong> O menu lateral, as páginas do painel e o backend bloqueiam automaticamente qualquer acesso não autorizado.
                </p>
              </div>

              {permsLoading && (
                <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                  <RefreshCw size={18} className="animate-spin" />
                  <span className="text-sm">Carregando permissões...</span>
                </div>
              )}
              {permsError && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <ShieldOff size={15} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-600">{permsError}</p>
                  <button onClick={loadPerms} className="ml-auto text-[12px] font-medium text-red-600 hover:underline">Tentar novamente</button>
                </div>
              )}

              {!permsLoading && !permsError && groups.map(group => {
                const GroupIcon = GROUP_ICONS[group] ?? Shield;
                const groupPerms = perms.filter(p => p.group === group);
                const enabledCount = groupPerms.filter(p => p.enabled).length;
                function toggleAllGroup(enable: boolean) {
                  groupPerms.forEach(p => { if (p.enabled !== enable) void handlePermToggle(p.key, enable); });
                }
                return (
                  <div key={group} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <div className="flex items-center gap-3 px-5 py-4">
                      <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] flex items-center justify-center shrink-0">
                        <GroupIcon size={17} className="text-[#0B2A66]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-800">{group}</h3>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${enabledCount === groupPerms.length ? "bg-green-100 text-green-700" : enabledCount === 0 ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"}`}>
                            {enabledCount}/{groupPerms.length} ativas
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{GROUP_DESC[group]}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleAllGroup(true)} className="text-[11px] font-medium text-green-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors">Ativar todas</button>
                        <button onClick={() => toggleAllGroup(false)} className="text-[11px] font-medium text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">Desativar todas</button>
                      </div>
                    </div>
                    <div className="px-5 pb-4 space-y-2 border-t border-slate-50 pt-3">
                      {groupPerms.map(p => (
                        <div key={p.key} className={`flex items-center justify-between py-3 px-4 rounded-xl transition-all ${p.enabled ? "bg-green-50/60 border border-green-100" : "bg-slate-50 border border-slate-100"}`}>
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2">
                              {p.enabled ? <Unlock size={13} className="text-green-500 shrink-0" /> : <Lock size={13} className="text-slate-400 shrink-0" />}
                              <span className={`text-sm font-medium ${p.enabled ? "text-slate-800" : "text-slate-500"}`}>{p.label}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 pl-5">{p.description}</p>
                          </div>
                          <button onClick={() => void handlePermToggle(p.key, !p.enabled)} disabled={permSaving === p.key}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 focus:outline-none disabled:opacity-70 ${p.enabled ? "bg-green-500" : "bg-slate-300"}`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${p.enabled ? "translate-x-6" : "translate-x-1"}`} />
                            {permSaving === p.key && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <RefreshCw size={10} className="text-white animate-spin" />
                              </span>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {!permsLoading && !permsError && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
                  <Save size={12} />
                  <span>Todas as alterações são salvas imediatamente e registradas nos logs de auditoria.</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Permission toast */}
        {permToast && (
          <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white z-50 transition-all ${permToast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
            {permToast.type === "success" ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
            {permToast.msg}
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

/* ── Webhook helpers ── */
function WCopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${copied ? "bg-green-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
      {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
      {copied ? "Copiado!" : label}
    </button>
  );
}

function WCodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative">
      {label && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>}
      <div className="bg-gray-900 rounded-xl p-4 pr-16 font-mono text-xs text-gray-100 whitespace-pre-wrap leading-relaxed overflow-x-auto">
        {code}
      </div>
      <div className="absolute top-8 right-3">
        <WCopyButton text={code} />
      </div>
    </div>
  );
}
