import React, { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import {
  GripVertical, Eye, EyeOff, Plus, Trash2, ChevronDown, ChevronUp,
  CheckCircle, RefreshCw, Save, LayoutGrid, X, Layout, AlignLeft,
  Upload, Minus, ImageIcon, Monitor, Tablet, Smartphone, ExternalLink,
  Undo2, Redo2, FileText, Image, GalleryHorizontal, Play, Megaphone,
  List, Radio, Mail, FolderOpen, CloudSun, CircleDollarSign, Share2,
  Code, Frame, Map, Settings, Info, RotateCcw, Pencil, Copy,
  Newspaper, Users, Hash, BarChart3, AlignJustify, Globe, Flame,
  Trophy, Tv2, Building2, Heart, Cpu, Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type LayoutId = "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico";
type HeaderStyle = "standard" | "compact" | "centered";
type FooterStyle = "dark" | "light" | "minimal";
type Tab = "blocks" | "header" | "footer" | "settings";
type FilterTab = "all" | "visible" | "hidden";
type ResponsiveMode = "desktop" | "tablet" | "mobile";

// ─── Block tag map ─────────────────────────────────────────────────────────────
const BLOCK_META: Record<string, { tag: string; tagColor: string; tagBg: string; Icon: React.ElementType; iconBg: string; iconColor: string }> = {
  hero:       { tag: "DESTAQUE",  tagColor: "#92400E", tagBg: "#FEF3C7", Icon: Trophy,    iconBg: "#FEF3C7", iconColor: "#D97706" },
  brasil:     { tag: "NOTÍCIAS",  tagColor: "#1e40af", tagBg: "#DBEAFE", Icon: Globe,     iconBg: "#DBEAFE", iconColor: "#2563EB" },
  "mais-lidas":{ tag: "CARROSSEL", tagColor: "#9a3412", tagBg: "#FEE2E2", Icon: Flame,    iconBg: "#FEE2E2", iconColor: "#EF4444" },
  mundo:      { tag: "NOTÍCIAS",  tagColor: "#065f46", tagBg: "#D1FAE5", Icon: Globe,     iconBg: "#D1FAE5", iconColor: "#10B981" },
  esporte:    { tag: "NOTÍCIAS",  tagColor: "#991b1b", tagBg: "#FEE2E2", Icon: Star,      iconBg: "#FEE2E2", iconColor: "#DC2626" },
  cultura:    { tag: "NOTÍCIAS",  tagColor: "#134e4a", tagBg: "#CCFBF1", Icon: Star,      iconBg: "#CCFBF1", iconColor: "#0D9488" },
  df:         { tag: "NOTÍCIAS",  tagColor: "#1e3a5f", tagBg: "#DBEAFE", Icon: Building2, iconBg: "#EFF6FF", iconColor: "#0B2A66" },
  saude:      { tag: "NOTÍCIAS",  tagColor: "#14532d", tagBg: "#DCFCE7", Icon: Heart,     iconBg: "#DCFCE7", iconColor: "#16A34A" },
  tecnologia: { tag: "NOTÍCIAS",  tagColor: "#1e40af", tagBg: "#DBEAFE", Icon: Cpu,       iconBg: "#EFF6FF", iconColor: "#0284C7" },
  colunistas: { tag: "CONTEÚDO",  tagColor: "#4c1d95", tagBg: "#EDE9FE", Icon: Users,     iconBg: "#EDE9FE", iconColor: "#7C3AED" },
  ultimas:    { tag: "LISTA",     tagColor: "#064e3b", tagBg: "#D1FAE5", Icon: Newspaper, iconBg: "#D1FAE5", iconColor: "#059669" },
};
const DEFAULT_META = { tag: "BLOCO", tagColor: "#374151", tagBg: "#F3F4F6", Icon: LayoutGrid, iconBg: "#F3F4F6", iconColor: "#6B7280" };

// ─── Block type modules (for "Adicionar bloco" picker) ───────────────────────
const MAIN_MODULES = [
  { type: "content",     name: "Conteúdo",    desc: "Exibe artigos em diferentes formatos e layouts.",    Icon: FileText,          iconBg: "#EFF6FF", iconColor: "#2563EB" },
  { type: "image",       name: "Imagem",      desc: "Banners, imagens promocionais ou editoriais.",       Icon: Image,             iconBg: "#FDF4FF", iconColor: "#A855F7" },
  { type: "carousel",    name: "Carrossel",   desc: "Vários itens roláveis em destaque.",                 Icon: GalleryHorizontal, iconBg: "#FFF7ED", iconColor: "#F97316" },
  { type: "video",       name: "Vídeo",       desc: "Destaque para vídeos do YouTube ou Vimeo.",          Icon: Play,              iconBg: "#FEF2F2", iconColor: "#EF4444" },
  { type: "advertising", name: "Propaganda",  desc: "Exiba anúncios em diferentes formatos.",             Icon: Megaphone,         iconBg: "#FFFBEB", iconColor: "#F59E0B" },
  { type: "list",        name: "Lista",       desc: "Lista simplificada de artigos.",                     Icon: List,              iconBg: "#F0FDF4", iconColor: "#22C55E" },
  { type: "ticker",      name: "Ticker",      desc: "Faixa de notícias rolando (ticker).",                Icon: Radio,             iconBg: "#EFF6FF", iconColor: "#3B82F6" },
  { type: "newsletter",  name: "Newsletter",  desc: "Formulário para captura de e-mails.",                Icon: Mail,              iconBg: "#F0FDFA", iconColor: "#14B8A6" },
  { type: "categories",  name: "Categorias",  desc: "Navegação rápida por categorias.",                   Icon: FolderOpen,        iconBg: "#FFF7ED", iconColor: "#EA580C" },
  { type: "weather",     name: "Clima",       desc: "Widget de clima da cidade.",                         Icon: CloudSun,          iconBg: "#F0F9FF", iconColor: "#0EA5E9" },
  { type: "quotes",      name: "Cotações",    desc: "Moedas, criptomoedas ou índices.",                   Icon: CircleDollarSign,  iconBg: "#F0FDF4", iconColor: "#16A34A" },
  { type: "social",      name: "Redes Sociais",desc: "Links para suas redes sociais.",                    Icon: Share2,            iconBg: "#EFF6FF", iconColor: "#2563EB" },
];
const OTHER_MODULES = [
  { type: "table",  name: "Tabela",           desc: "Dados organizados em tabela.",   Icon: AlignJustify },
  { type: "counter",name: "Contador",         desc: "Estatísticas em números.",       Icon: Hash },
  { type: "sep",    name: "Separador",        desc: "Divisor entre seções.",          Icon: Minus },
  { type: "html",   name: "HTML Personalizado",desc: "Código HTML personalizado.",    Icon: Code },
  { type: "map",    name: "Mapa",             desc: "Mapa do Google Maps.",           Icon: Map },
  { type: "embed",  name: "Embed",            desc: "Conteúdo incorporado externo.",  Icon: Frame },
];

// ─── Other constants ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "politica",   label: "Política",    color: "#1d4ed8" },
  { value: "cidade",     label: "Cidade / DF", color: "#0b3d91" },
  { value: "seguranca",  label: "Segurança",   color: "#7c3aed" },
  { value: "saude",      label: "Saúde",       color: "#16a34a" },
  { value: "educacao",   label: "Educação",    color: "#0284c7" },
  { value: "cultura",    label: "Cultura",     color: "#0d9488" },
  { value: "esportes",   label: "Esportes",    color: "#dc2626" },
  { value: "tecnologia", label: "Tecnologia",  color: "#0284c7" },
  { value: "economia",   label: "Economia",    color: "#b45309" },
  { value: "brasil",     label: "Brasil",      color: "#16a34a" },
  { value: "mundo",      label: "Mundo",       color: "#6b21a8" },
  { value: "colunas",    label: "Colunas",     color: "#7c3aed" },
  { value: "geral",      label: "Geral",       color: "#6b7280" },
];

const LAYOUTS: { id: LayoutId; label: string; desc: string; mini: React.ReactNode }[] = [
  { id: "grid",     label: "Grade",     desc: "4 cards em linha", mini: <div className="flex gap-0.5 w-full">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-5 bg-current rounded-sm opacity-40"/>)}</div> },
  { id: "featured", label: "Destaque",  desc: "1 grande + lista", mini: <div className="flex gap-0.5 w-full"><div className="flex-[2] h-5 bg-current rounded-sm opacity-40"/><div className="flex-1 flex flex-col gap-0.5">{[0,1,2,3].map(i=><div key={i} className="h-1 bg-current rounded opacity-25"/>)}</div></div> },
  { id: "duplo",    label: "Duplo",     desc: "2 grandes + tira", mini: <div className="flex flex-col gap-0.5 w-full"><div className="flex gap-0.5"><div className="flex-1 h-3 bg-current rounded-sm opacity-40"/><div className="flex-1 h-3 bg-current rounded-sm opacity-40"/></div><div className="flex gap-0.5">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-1.5 bg-current rounded opacity-25"/>)}</div></div> },
  { id: "cultura",  label: "Foto+Lista",desc: "Foto + lista ao lado", mini: <div className="flex gap-0.5 w-full"><div className="flex-[3] h-5 bg-current rounded-sm opacity-40"/><div className="flex-[2] flex flex-col gap-0.5 justify-center">{[0,1,2,3].map(i=><div key={i} className="h-1 bg-current rounded opacity-25"/>)}</div></div> },
  { id: "lista",    label: "Lista",     desc: "Numerada com miniaturas", mini: <div className="flex flex-col gap-0.5 w-full">{[0,1,2,3].map(i=><div key={i} className="flex gap-0.5 items-center"><div className="w-1.5 h-1.5 bg-current rounded-full opacity-50 shrink-0"/><div className="flex-1 h-1 bg-current rounded opacity-25"/></div>)}</div> },
  { id: "manchete", label: "Manchete",  desc: "Hero full-width + 3", mini: <div className="flex flex-col gap-0.5 w-full"><div className="w-full h-4 bg-current rounded-sm opacity-40"/><div className="flex gap-0.5">{[0,1,2].map(i=><div key={i} className="flex-1 h-2 bg-current rounded-sm opacity-25"/>)}</div></div> },
  { id: "mosaico",  label: "Mosaico",   desc: "1 grande + 4 pequenos", mini: <div className="flex gap-0.5 w-full"><div className="flex-[2] h-5 bg-current rounded-sm opacity-40"/><div className="flex-[2] grid grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><div key={i} className="h-2 bg-current rounded-sm opacity-25"/>)}</div></div> },
];

const BLOCK_DEFAULTS: Record<string, { category: string; layout: LayoutId; color: string }> = {
  brasil:     { category: "brasil",     layout: "grid",    color: "#16a34a" },
  mundo:      { category: "mundo",      layout: "grid",    color: "#6b21a8" },
  esporte:    { category: "esportes",   layout: "cultura", color: "#dc2626" },
  cultura:    { category: "cultura",    layout: "cultura", color: "#0d9488" },
  df:         { category: "cidade",     layout: "duplo",   color: "#0b3d91" },
  saude:      { category: "saude",      layout: "grid",    color: "#16a34a" },
  tecnologia: { category: "tecnologia", layout: "cultura", color: "#0284c7" },
};

const DEFAULT_BLOCKS: HomeBlock[] = [
  { id: "hero",       name: "Hero / Destaques",  visible: true,  order: 0 },
  { id: "brasil",     name: "Brasil",             visible: true,  order: 1 },
  { id: "mais-lidas", name: "Mais Lidas",         visible: true,  order: 2 },
  { id: "mundo",      name: "Mundo",              visible: true,  order: 3 },
  { id: "esporte",    name: "Esporte",            visible: true,  order: 4 },
  { id: "cultura",    name: "Cultura",            visible: true,  order: 5 },
  { id: "df",         name: "DF",                 visible: true,  order: 6 },
  { id: "saude",      name: "Saúde",              visible: true,  order: 7 },
  { id: "tecnologia", name: "Tecnologia",         visible: true,  order: 8 },
  { id: "colunistas", name: "Colunistas",         visible: true,  order: 9 },
  { id: "ultimas",    name: "Últimas Notícias",   visible: true,  order: 10 },
];

interface BlockForm {
  name: string;
  category: string;
  layout: LayoutId;
  color: string;
}

function blockToForm(block: HomeBlock): BlockForm {
  const d = BLOCK_DEFAULTS[block.id];
  return {
    name:     block.name,
    category: block.category ?? d?.category ?? "geral",
    layout:   (block.layout ?? d?.layout ?? "grid") as LayoutId,
    color:    block.color ?? d?.color ?? "#6b7280",
  };
}

const EMPTY_FORM: BlockForm = { name: "", category: "politica", layout: "grid", color: "#1d4ed8" };

// ─── Header/Footer presets ────────────────────────────────────────────────────
const HEADER_PRESETS: { id: HeaderStyle; label: string; desc: string }[] = [
  { id: "standard",  label: "Padrão",       desc: "Logo à esquerda, nav à direita, ticker abaixo" },
  { id: "compact",   label: "Compacto",     desc: "Header fino, sem ticker, mais espaço para conteúdo" },
  { id: "centered",  label: "Centralizado", desc: "Logo no centro, nav em barra escura abaixo" },
];

const FOOTER_PRESETS: { id: FooterStyle; label: string; desc: string }[] = [
  { id: "dark",    label: "Escuro",   desc: "Fundo preto, colunas com links, newsletter" },
  { id: "light",   label: "Claro",    desc: "Fundo branco, colunas com links, borda vermelha" },
  { id: "minimal", label: "Minimal",  desc: "Apenas uma linha com copyright e links" },
];

// ─── Toggle switch component ──────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors focus:outline-none ${checked ? "bg-[#0B2A66]" : "bg-slate-200"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

// ─── Block settings panel ─────────────────────────────────────────────────────
function SettingsPanel({ block, form, saving, onChange, onApply, onCancel }: {
  block: HomeBlock; form: BlockForm; saving: boolean;
  onChange: <K extends keyof BlockForm>(key: K, val: BlockForm[K]) => void;
  onApply: () => void; onCancel: () => void;
}) {
  const isSpecial = new Set(["hero", "mais-lidas", "colunistas", "ultimas"]).has(block.id);
  return (
    <div className="px-4 pb-4 pt-3 space-y-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nome do bloco</label>
        <input value={form.name} onChange={(e) => onChange("name", e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
          placeholder="Nome exibido na home" />
      </div>
      {!isSpecial && (
        <>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Categoria</label>
            <div className="grid grid-cols-3 gap-1">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button"
                  onClick={() => { onChange("category", c.value); onChange("color", c.color); }}
                  className="px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition-all text-left flex items-center gap-1"
                  style={form.category === c.value
                    ? { borderColor: c.color, backgroundColor: c.color + "15", color: c.color }
                    : { borderColor: "#e2e8f0", color: "#64748b" }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />{c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Layout visual</label>
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" onClick={() => onChange("layout", l.id)}
                  className="flex flex-col gap-1.5 p-2 rounded-xl border text-left transition-all"
                  style={form.layout === l.id
                    ? { borderColor: form.color, backgroundColor: form.color + "10", color: form.color }
                    : { borderColor: "#e2e8f0", color: "#94a3b8" }}>
                  <div className="w-full">{l.mini}</div>
                  <span className="text-[10px] font-bold uppercase tracking-wide block">{l.label}</span>
                  <span className="text-[9px] opacity-60">{l.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={onApply} disabled={saving || !form.name.trim()}
          className="flex-[2] flex items-center justify-center gap-2 px-4 py-2 bg-[#0B2A66] text-white text-sm font-semibold rounded-xl hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
          {saving ? <><RefreshCw size={13} className="animate-spin" /> Salvando…</> : <><CheckCircle size={13} /> Aplicar e Salvar</>}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomeBlocksManager() {
  const [blocks, setBlocks]           = useState<HomeBlock[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [dragIdx, setDragIdx]         = useState<number | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<BlockForm>(EMPTY_FORM);
  const [showAdd, setShowAdd]         = useState(false);
  const [addForm]                     = useState<BlockForm>(EMPTY_FORM);
  const [previewKey, setPreviewKey]   = useState(0);
  const [tab, setTab]                 = useState<Tab>("blocks");
  const [filterTab, setFilterTab]     = useState<FilterTab>("all");
  const [responsive, setResponsive]   = useState<ResponsiveMode>("desktop");
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>("standard");
  const [footerStyle, setFooterStyle] = useState<FooterStyle>("dark");
  const [headerBgColor, setHeaderBgColor] = useState("#ffffff");
  const [footerBgColor, setFooterBgColor] = useState("#000000");
  const [logoBase64, setLogoBase64]   = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoSize, setLogoSize]       = useState(48);
  const [logoSaving, setLogoSaving]   = useState(false);
  const [logoStatus, setLogoStatus]   = useState<"idle" | "ok" | "err">("idle");

  // Undo/redo history
  const [history, setHistory]         = useState<HomeBlock[][]>([]);
  const [historyIdx, setHistoryIdx]   = useState(-1);

  const logoInputRef  = useRef<HTMLInputElement>(null);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockRefs     = useRef<Record<string, HTMLDivElement | null>>({});
  const iframeRef     = useRef<HTMLIFrameElement>(null);

  // ── Load settings ──────────────────────────────────────────────────────────
  useEffect(() => {
    adminApi.getSettings()
      .then((r) => {
        const bl = r.settings.homeBlocks;
        const loaded = bl && bl.length > 0 ? bl : DEFAULT_BLOCKS;
        setBlocks(loaded);
        setHistory([loaded]);
        setHistoryIdx(0);
        setHeaderStyle(r.settings.headerStyle ?? "standard");
        setFooterStyle(r.settings.footerStyle ?? "dark");
        setHeaderBgColor(r.settings.headerBgColor ?? "#ffffff");
        setFooterBgColor(r.settings.footerBgColor ?? "#000000");
        if (r.settings.logoBase64) setLogoBase64(r.settings.logoBase64);
        if (r.settings.logoSize)   setLogoSize(r.settings.logoSize);
      })
      .catch(() => { setBlocks(DEFAULT_BLOCKS); setHistory([DEFAULT_BLOCKS]); setHistoryIdx(0); })
      .finally(() => setLoading(false));
  }, []);

  // ── postMessage listener ───────────────────────────────────────────────────
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      const { type, blockId, blockIds } = e.data as { type: string; blockId?: string; blockIds?: string[] };
      if (type === "block:edit" && blockId) {
        setTab("blocks");
        const block = blocks.find((b) => b.id === blockId);
        if (block) {
          setEditingId(blockId);
          setEditForm(blockToForm(block));
          setTimeout(() => blockRefs.current[blockId]?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
        }
      }
      if (type === "block:reorder" && blockIds) {
        setBlocks((prev) => {
          const map = new Map(prev.map((b) => [b.id, b]));
          const reordered = blockIds.map((id, i) => map.has(id) ? { ...map.get(id)!, order: i } : null).filter(Boolean) as HomeBlock[];
          const rest = prev.filter((b) => !blockIds.includes(b.id));
          return [...reordered, ...rest];
        });
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          setSaving(true);
          try {
            const latest = await adminApi.getSettings();
            const map = new Map((latest.settings.homeBlocks ?? DEFAULT_BLOCKS).map((b) => [b.id, b]));
            const ordered = (blockIds ?? []).map((id, i) => map.has(id) ? { ...map.get(id)!, order: i } : null).filter(Boolean) as HomeBlock[];
            await adminApi.updateSettings({ homeBlocks: ordered });
            invalidateSiteCache();
          } catch { } finally { setSaving(false); }
        }, 800);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [blocks]);

  // ── History helpers ────────────────────────────────────────────────────────
  function pushHistory(newBlocks: HomeBlock[]) {
    setHistory((h) => {
      const trimmed = h.slice(0, historyIdx + 1);
      return [...trimmed, newBlocks];
    });
    setHistoryIdx((i) => i + 1);
  }

  function undo() {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    if (!prev) return;
    setHistoryIdx((i) => i - 1);
    setBlocks(prev);
  }

  function redo() {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    if (!next) return;
    setHistoryIdx((i) => i + 1);
    setBlocks(next);
  }

  // ── Auto-save helper ───────────────────────────────────────────────────────
  const autoSave = useCallback(async (newBlocks: HomeBlock[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const ordered = newBlocks.map((b, i) => ({ ...b, order: i }));
      try {
        await adminApi.updateSettings({ homeBlocks: ordered });
        invalidateSiteCache();
        setSaved(true);
        setPreviewKey((k) => k + 1);
        setTimeout(() => setSaved(false), 2000);
      } catch { } finally { setSaving(false); }
    }, 500);
  }, []);

  async function saveAll() {
    setSaving(true);
    const ordered = blocks.map((b, i) => ({ ...b, order: i }));
    try {
      await adminApi.updateSettings({ homeBlocks: ordered });
      invalidateSiteCache();
      setSaved(true);
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2000);
    } catch { } finally { setSaving(false); }
  }

  async function saveHeaderFooter(hs: HeaderStyle, fs: FooterStyle, hBg?: string, fBg?: string) {
    setSaving(true);
    try {
      await adminApi.updateSettings({
        headerStyle: hs, footerStyle: fs,
        ...(hBg !== undefined ? { headerBgColor: hBg } : {}),
        ...(fBg !== undefined ? { footerBgColor: fBg } : {}),
      });
      invalidateSiteCache();
      setSaved(true);
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2000);
    } catch { } finally { setSaving(false); }
  }

  async function saveLogo() {
    setLogoSaving(true); setLogoStatus("idle");
    try {
      if (logoPreview) { await adminApi.uploadLogo(logoPreview); setLogoBase64(logoPreview); setLogoPreview(null); }
      await adminApi.updateSettings({ logoSize });
      invalidateSiteCache();
      setLogoStatus("ok");
      setPreviewKey((k) => k + 1);
      setTimeout(() => setLogoStatus("idle"), 2500);
    } catch { setLogoStatus("err"); } finally { setLogoSaving(false); }
  }

  // ── Block actions ──────────────────────────────────────────────────────────
  function toggleVisible(idx: number) {
    const next = blocks.map((b, i) => i === idx ? { ...b, visible: !b.visible } : b);
    pushHistory(next);
    setBlocks(next);
    autoSave(next);
  }

  function deleteBlock(id: string) {
    if (!confirm("Remover este bloco da home?")) return;
    const next = blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }));
    pushHistory(next);
    setBlocks(next);
    autoSave(next);
  }

  function duplicateBlock(id: string) {
    const src = blocks.find((b) => b.id === id);
    if (!src) return;
    const clone: HomeBlock = { ...src, id: `${src.id}-copy-${Date.now()}`, name: `${src.name} (cópia)`, custom: true };
    const idx = blocks.findIndex((b) => b.id === id);
    const next = [...blocks.slice(0, idx + 1), clone, ...blocks.slice(idx + 1)].map((b, i) => ({ ...b, order: i }));
    pushHistory(next);
    setBlocks(next);
    autoSave(next);
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  function handleDragStart(idx: number) { if (editingId) return; setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved!);
      return next.map((b, i) => ({ ...b, order: i }));
    });
    setDragIdx(idx);
  }
  function handleDragEnd() { setDragIdx(null); autoSave(blocks); pushHistory(blocks); }

  // ── Edit block ─────────────────────────────────────────────────────────────
  function openEdit(block: HomeBlock) {
    if (editingId === block.id) { setEditingId(null); return; }
    setEditingId(block.id);
    setEditForm(blockToForm(block));
  }

  async function applyAndSave(id: string) {
    const next = blocks.map((b) => b.id === id ? { ...b, name: editForm.name, category: editForm.category, layout: editForm.layout, color: editForm.color } : b);
    setBlocks(next);
    setEditingId(null);
    pushHistory(next);
    setSaving(true);
    try {
      await adminApi.updateSettings({ homeBlocks: next.map((b, i) => ({ ...b, order: i })) });
      invalidateSiteCache();
      setSaved(true);
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2000);
    } catch { } finally { setSaving(false); }
  }

  // ── Add block from type picker ─────────────────────────────────────────────
  function addBlockFromType(type: string, name: string) {
    const newBlock: HomeBlock = {
      id: `${type}-${Date.now()}`,
      name,
      visible: true,
      order: blocks.length,
      custom: true,
    };
    const next = [...blocks, newBlock];
    setBlocks(next);
    pushHistory(next);
    setShowAdd(false);
    autoSave(next);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const visibleCount  = blocks.filter((b) => b.visible).length;
  const filteredBlocks = blocks.filter((b) => {
    if (filterTab === "visible") return b.visible;
    if (filterTab === "hidden")  return !b.visible;
    return true;
  });
  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const previewWidth = responsive === "desktop" ? "100%" : responsive === "tablet" ? "768px" : "375px";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Blocos da Home" noPadding>
      <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden bg-[#F8FAFC]">

        {/* ══ Top action bar ══════════════════════════════════════════════════ */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-[#E2E8F0]">
          <div>
            <h1 className="text-[15px] font-black text-[#0F172A]">Blocos da Home</h1>
            <p className="text-[12px] text-[#64748B] mt-0.5">Gerencie, ordene e edite os blocos que aparecem na página inicial do portal.</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-lg"><CheckCircle size={13} /> Alterações salvas</span>}
            <button onClick={undo} disabled={!canUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[#0F172A] border border-[#E2E8F0] bg-white rounded-xl hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Undo2 size={14} /> Desfazer
            </button>
            <button onClick={redo} disabled={!canRedo}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[#0F172A] border border-[#E2E8F0] bg-white rounded-xl hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Redo2 size={14} /> Refazer
            </button>
            <button onClick={saveAll} disabled={saving || loading}
              className="flex items-center gap-2 px-4 py-1.5 text-[13px] font-semibold text-white bg-[#E71D36] rounded-xl hover:bg-[#c0112a] disabled:opacity-50 shadow-sm transition-colors">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar alterações
            </button>
          </div>
        </div>

        {/* ══ Tabs row ════════════════════════════════════════════════════════ */}
        <div className="shrink-0 flex border-b border-[#E2E8F0] bg-white px-6">
          {([
            { id: "blocks"   as Tab, label: "Blocos"       },
            { id: "header"   as Tab, label: "Cabeçalho"    },
            { id: "footer"   as Tab, label: "Rodapé"       },
            { id: "settings" as Tab, label: "Configurações" },
          ]).map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setShowAdd(false); }}
              className={`px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px ${
                tab === t.id ? "text-[#0B2A66] border-[#0B2A66]" : "text-[#64748B] border-transparent hover:text-[#0F172A]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ Main content ════════════════════════════════════════════════════ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left panel ──────────────────────────────────────────────────── */}
          <div className="w-[320px] shrink-0 flex flex-col border-r border-[#E2E8F0] bg-white overflow-hidden">

            {/* ── Tab: Blocks ── */}
            {tab === "blocks" && (
              <>
                {/* Panel header */}
                <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-bold text-[#0F172A]">Blocos da Home</span>
                    {saving && <RefreshCw size={13} className="text-[#64748B] animate-spin" />}
                  </div>
                  <p className="text-[11px] text-[#64748B]">
                    {loading ? "Carregando…" : `${visibleCount} visível${visibleCount !== 1 ? "s" : ""} · ${blocks.length} total`}
                  </p>
                  {/* Filter tabs */}
                  <div className="flex gap-1 mt-3">
                    {([
                      { id: "all" as FilterTab, label: "Todos" },
                      { id: "visible" as FilterTab, label: "Visíveis" },
                      { id: "hidden" as FilterTab, label: "Ocultos" },
                    ]).map((f) => (
                      <button key={f.id} onClick={() => setFilterTab(f.id)}
                        className={`px-3 py-1 text-[12px] font-semibold rounded-lg transition-colors ${
                          filterTab === f.id
                            ? "bg-[#0B2A66] text-white"
                            : "text-[#64748B] hover:bg-[#F8FAFC]"
                        }`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Block list */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                  {loading ? (
                    <div className="text-center py-16 text-[#64748B] text-sm">Carregando…</div>
                  ) : filteredBlocks.length === 0 ? (
                    <div className="text-center py-16 text-[#64748B] text-sm">Nenhum bloco {filterTab === "visible" ? "visível" : "oculto"}</div>
                  ) : (
                    filteredBlocks.map((block) => {
                      const realIdx = blocks.findIndex((b) => b.id === block.id);
                      const isEditing  = editingId === block.id;
                      const isDragging = dragIdx === realIdx;
                      const meta       = BLOCK_META[block.id] ?? DEFAULT_META;
                      const { Icon, iconBg, iconColor, tag, tagColor, tagBg } = meta;

                      return (
                        <div
                          key={block.id}
                          ref={(el) => { blockRefs.current[block.id] = el; }}
                          draggable={!isEditing}
                          onDragStart={() => handleDragStart(realIdx)}
                          onDragOver={(e) => handleDragOver(e, realIdx)}
                          onDragEnd={handleDragEnd}
                          className={`rounded-2xl border bg-white transition-all select-none
                            ${isDragging ? "border-[#F59E0B] shadow-lg scale-[1.02] rotate-0.5 opacity-90" : "border-[#E2E8F0]"}
                            ${!block.visible ? "opacity-50" : ""}
                            ${isEditing ? "ring-2 ring-[#0B2A66]/20 border-[#0B2A66]/30" : "hover:border-[#CBD5E1]"}
                          `}
                          style={{ boxShadow: isDragging ? "0 8px 24px rgba(15,23,42,0.10)" : undefined }}
                        >
                          <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => openEdit(block)}>
                            {/* Drag handle */}
                            <span className="text-[#CBD5E1] hover:text-[#94A3B8] cursor-grab shrink-0" onClick={(e) => e.stopPropagation()}>
                              <GripVertical size={15} />
                            </span>

                            {/* Icon */}
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: iconBg }}>
                              <Icon size={14} style={{ color: iconColor }} />
                            </span>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-[#0F172A] truncate leading-tight">{block.name}</p>
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                                style={{ backgroundColor: tagBg, color: tagColor }}>
                                {tag}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Toggle checked={block.visible} onChange={() => toggleVisible(realIdx)} />
                              <button onClick={() => duplicateBlock(block.id)} title="Duplicar"
                                className="p-1.5 text-[#94A3B8] hover:text-[#0B2A66] hover:bg-[#EFF6FF] rounded-lg transition-colors">
                                <Copy size={12} />
                              </button>
                              {block.custom && (
                                <button onClick={() => deleteBlock(block.id)} title="Remover"
                                  className="p-1.5 text-[#94A3B8] hover:text-[#E71D36] hover:bg-[#FEF2F2] rounded-lg transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>

                            <span className={`text-[#CBD5E1] transition-transform ml-0.5 ${isEditing ? "rotate-180" : ""}`}>
                              <ChevronDown size={14} />
                            </span>
                          </div>

                          {isEditing && (
                            <SettingsPanel
                              block={block} form={editForm} saving={saving}
                              onChange={(k, v) => setEditForm((p) => ({ ...p, [k]: v }))}
                              onApply={() => applyAndSave(block.id)}
                              onCancel={() => setEditingId(null)}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Panel footer */}
                <div className="shrink-0 px-3 py-3 border-t border-[#E2E8F0] space-y-2">
                  <button onClick={() => setShowAdd(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#E71D36] text-white text-[13px] font-semibold rounded-xl hover:bg-[#c0112a] transition-colors shadow-sm">
                    <Plus size={15} /> Adicionar bloco
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Restaurar os blocos padrão? Isso removerá blocos personalizados.")) return;
                      const next = DEFAULT_BLOCKS;
                      setBlocks(next);
                      pushHistory(next);
                      autoSave(next);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium text-[#64748B] hover:text-[#0B2A66] hover:bg-[#F8FAFC] rounded-xl transition-colors">
                    <RotateCcw size={12} /> Restaurar padrões
                  </button>
                </div>
              </>
            )}

            {/* ── Tab: Header ── */}
            {tab === "header" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <p className="text-[12px] text-[#64748B]">Escolha um formato para o cabeçalho do portal.</p>
                <div className="space-y-2">
                  {HEADER_PRESETS.map((p) => (
                    <button key={p.id} type="button"
                      onClick={async () => { setHeaderStyle(p.id); await saveHeaderFooter(p.id, footerStyle, headerBgColor); }}
                      className={`w-full text-left rounded-2xl border-2 p-3 transition-all ${
                        headerStyle === p.id ? "border-[#0B2A66] bg-[#EFF6FF]" : "border-[#E2E8F0] hover:border-[#CBD5E1] bg-white"
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-bold text-[#0F172A]">{p.label}</p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">{p.desc}</p>
                        </div>
                        {headerStyle === p.id && <CheckCircle size={16} className="text-[#0B2A66]" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Cor de fundo</p>
                  <div className="flex gap-2">
                    <input type="color" value={headerBgColor} onChange={(e) => setHeaderBgColor(e.target.value)}
                      className="w-10 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                    <input type="text" value={headerBgColor} onChange={(e) => setHeaderBgColor(e.target.value)}
                      className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                    <button onClick={() => saveHeaderFooter(headerStyle, footerStyle, headerBgColor)}
                      className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">
                      OK
                    </button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {["#ffffff","#f8fafc","#f1f5f9","#0B2A66","#E71D36","#18181b"].map((c) => (
                      <button key={c} type="button" onClick={() => setHeaderBgColor(c)}
                        className={`w-6 h-6 rounded-lg border-2 transition-all ${headerBgColor === c ? "border-[#0B2A66] scale-110" : "border-[#E2E8F0] hover:border-[#94A3B8]"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                    <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"><ImageIcon size={12} /> Logo do cabeçalho</p>
                    {(logoPreview ?? logoBase64) && (
                      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-center" style={{ backgroundColor: headerBgColor || "#fff" }}>
                        <img src={logoPreview ?? logoBase64!} alt="logo" style={{ height: logoSize }} className="w-auto object-contain" />
                      </div>
                    )}
                    <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); } }}
                      onDragOver={(e) => e.preventDefault()} onClick={() => logoInputRef.current?.click()}
                      className="border-2 border-dashed border-[#E2E8F0] rounded-xl py-4 flex flex-col items-center gap-2 cursor-pointer hover:border-[#0B2A66] hover:bg-[#F8FAFC] transition-colors">
                      <Upload size={20} className="text-[#94A3B8]" />
                      <p className="text-xs text-[#64748B] text-center">Clique ou arraste a logo aqui<br /><span className="text-[10px] text-[#94A3B8]">PNG, SVG, WEBP</span></p>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); } }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setLogoSize((s) => Math.max(32, s - 8))} className="w-7 h-7 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] bg-white"><Minus size={11} /></button>
                      <input type="range" min={32} max={160} step={4} value={logoSize} onChange={(e) => setLogoSize(Number(e.target.value))} className="flex-1 accent-[#0B2A66]" />
                      <button onClick={() => setLogoSize((s) => Math.min(160, s + 8))} className="w-7 h-7 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] bg-white"><Plus size={11} /></button>
                      <span className="text-sm font-bold text-[#0B2A66] w-10 text-right">{logoSize}px</span>
                    </div>
                    {logoStatus === "ok"  && <div className="flex items-center gap-1.5 text-green-700 text-xs bg-green-50 border border-green-200 rounded-xl px-3 py-2"><CheckCircle size={12} /> Logo atualizada!</div>}
                    {logoStatus === "err" && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">Erro ao salvar logo</div>}
                    <button onClick={saveLogo} disabled={logoSaving}
                      className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                      {logoSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                      {logoSaving ? "Salvando…" : "Salvar logo"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: Footer ── */}
            {tab === "footer" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <p className="text-[12px] text-[#64748B]">Escolha um formato para o rodapé do portal.</p>
                <div className="space-y-2">
                  {FOOTER_PRESETS.map((p) => (
                    <button key={p.id} type="button"
                      onClick={async () => { setFooterStyle(p.id); await saveHeaderFooter(headerStyle, p.id, undefined, footerBgColor); }}
                      className={`w-full text-left rounded-2xl border-2 p-3 transition-all ${
                        footerStyle === p.id ? "border-[#0B2A66] bg-[#EFF6FF]" : "border-[#E2E8F0] hover:border-[#CBD5E1] bg-white"
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-bold text-[#0F172A]">{p.label}</p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">{p.desc}</p>
                        </div>
                        {footerStyle === p.id && <CheckCircle size={16} className="text-[#0B2A66]" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Cor de fundo</p>
                  <div className="flex gap-2">
                    <input type="color" value={footerBgColor} onChange={(e) => setFooterBgColor(e.target.value)}
                      className="w-10 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                    <input type="text" value={footerBgColor} onChange={(e) => setFooterBgColor(e.target.value)}
                      className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                    <button onClick={() => saveHeaderFooter(headerStyle, footerStyle, undefined, footerBgColor)}
                      className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">
                      OK
                    </button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {["#000000","#18181b","#0f172a","#1e293b","#ffffff","#f8fafc"].map((c) => (
                      <button key={c} type="button" onClick={() => setFooterBgColor(c)}
                        className={`w-6 h-6 rounded-lg border-2 transition-all ${footerBgColor === c ? "border-[#0B2A66] scale-110" : "border-[#E2E8F0] hover:border-[#94A3B8]"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: Settings ── */}
            {tab === "settings" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <p className="text-[12px] text-[#64748B]">Configurações gerais da página inicial.</p>
                {[
                  { label: "Cache automático", desc: "Limpar cache da home a cada 5 minutos", enabled: true },
                  { label: "Atualização em tempo real", desc: "Blocos recarregam quando há novos artigos", enabled: false },
                  { label: "SEO da home", desc: "Usar título e descrição personalizados", enabled: true },
                  { label: "Modo manutenção", desc: "Exibir página de manutenção temporariamente", enabled: false },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0]">
                    <div>
                      <p className="text-[13px] font-semibold text-[#0F172A]">{item.label}</p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">{item.desc}</p>
                    </div>
                    <Toggle checked={item.enabled} onChange={() => {}} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right panel ─────────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* ══ Add block picker ══ */}
            {showAdd && (
              <div className="flex-1 overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-[#E2E8F0]">
                  <div>
                    <h2 className="text-[15px] font-black text-[#0F172A]">Adicionar novo bloco</h2>
                    <p className="text-[12px] text-[#64748B] mt-0.5">Selecione o tipo de conteúdo que deseja adicionar à home.</p>
                  </div>
                  <button onClick={() => setShowAdd(false)} className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-xl transition-colors"><X size={18} /></button>
                </div>

                <div className="px-6 py-5 space-y-6">
                  {/* Main modules grid */}
                  <div className="grid grid-cols-4 gap-3">
                    {MAIN_MODULES.map((m) => (
                      <button key={m.type} type="button"
                        onClick={() => addBlockFromType(m.type, m.name)}
                        className="flex flex-col p-4 bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#0B2A66] hover:shadow-md text-left transition-all group"
                        style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}>
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: m.iconBg }}>
                          <m.Icon size={20} style={{ color: m.iconColor }} />
                        </span>
                        <p className="text-[13px] font-bold text-[#0F172A] group-hover:text-[#0B2A66] mb-1">{m.name}</p>
                        <p className="text-[11px] text-[#64748B] leading-relaxed">{m.desc}</p>
                        {/* Mini preview bar */}
                        <div className="mt-3 w-full h-12 bg-[#F8FAFC] rounded-lg flex items-center justify-center">
                          <m.Icon size={18} style={{ color: m.iconColor }} className="opacity-30" />
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Other modules */}
                  <div>
                    <h3 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider mb-3">Outros módulos disponíveis</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {OTHER_MODULES.map((m) => (
                        <button key={m.type} type="button"
                          onClick={() => addBlockFromType(m.type, m.name)}
                          className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#0B2A66] text-left transition-all group"
                          style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}>
                          <span className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0">
                            <m.Icon size={15} className="text-[#64748B]" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[#0F172A] group-hover:text-[#0B2A66]">{m.name}</p>
                            <p className="text-[10px] text-[#94A3B8] truncate">{m.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tip */}
                  <div className="flex items-start gap-3 p-4 bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl">
                    <Info size={15} className="text-[#2563EB] mt-0.5 shrink-0" />
                    <p className="text-[12px] text-[#1e40af] leading-relaxed">
                      Arraste os blocos para reordenar. Clique no ícone de olho para mostrar ou ocultar um bloco na home.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ══ Live preview ══ */}
            {!showAdd && (
              <>
                {/* Preview header */}
                <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0F172A]">Prévia ao vivo</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-[#DCFCE7] text-green-700 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Ao vivo
                    </span>
                    <span className="text-[11px] text-[#94A3B8] hidden lg:block">As alterações são aplicadas em tempo real.</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Responsive toggles */}
                    {([
                      { id: "desktop" as ResponsiveMode, Icon: Monitor    },
                      { id: "tablet"  as ResponsiveMode, Icon: Tablet     },
                      { id: "mobile"  as ResponsiveMode, Icon: Smartphone },
                    ]).map(({ id, Icon: Ic }) => (
                      <button key={id} onClick={() => setResponsive(id)}
                        className={`p-1.5 rounded-lg transition-colors ${responsive === id ? "bg-[#0B2A66] text-white" : "text-[#94A3B8] hover:bg-[#F8FAFC]"}`}>
                        <Ic size={15} />
                      </button>
                    ))}
                    <div className="w-px h-4 bg-[#E2E8F0] mx-1" />
                    <button onClick={() => setPreviewKey((k) => k + 1)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#64748B] border border-[#E2E8F0] rounded-xl hover:bg-[#F8FAFC] transition-colors">
                      <RefreshCw size={12} /> Atualizar
                    </button>
                    <a href="/" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#64748B] border border-[#E2E8F0] rounded-xl hover:bg-[#F8FAFC] transition-colors">
                      <ExternalLink size={12} /> Abrir site
                    </a>
                  </div>
                </div>

                {/* iframe container */}
                <div className="flex-1 overflow-auto bg-[#F1F5F9] p-4">
                  <div className="mx-auto transition-all duration-300 h-full" style={{ maxWidth: previewWidth, minHeight: "100%" }}>
                    <div className="w-full h-full rounded-2xl overflow-hidden shadow-lg bg-white" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}>
                      <iframe
                        key={previewKey}
                        ref={iframeRef}
                        src="/"
                        title="Prévia da Home"
                        className="w-full h-full border-0"
                        style={{ minHeight: "600px" }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
