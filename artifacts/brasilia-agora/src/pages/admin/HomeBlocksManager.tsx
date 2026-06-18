import React, { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import {
  GripVertical, Eye, EyeOff, Plus, Trash2, ChevronDown,
  CheckCircle, RefreshCw, Save, LayoutGrid, X, AlignLeft,
  Upload, Minus, ImageIcon, Monitor, Tablet, Smartphone, ExternalLink,
  Undo2, Redo2, FileText, Image, GalleryHorizontal, Play, Megaphone,
  List, Radio, Mail, FolderOpen, CloudSun, CircleDollarSign, Share2,
  Code, Frame, Map as MapIcon, Settings, Info, RotateCcw, Pencil, Copy,
  Newspaper, Users, Hash, AlignJustify, Globe, Flame,
  Trophy, Tv2, Building2, Heart, Cpu, Star, Zap, BarChart3,
  Type, Palette, Eye as EyeIcon, Calendar, User, FileImage,
  ChevronRight, Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type BlockType = "content" | "image" | "carousel" | "video" | "advertising" | "list" | "ticker" | "newsletter" | "categories" | "weather" | "quotes" | "social" | "html" | "table" | "counter" | "sep" | "map" | "embed";
type LayoutId = "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico";
type SourceType = "automatic_by_category" | "most_read" | "latest" | "manual" | "rss" | "perplexity";
type HeaderStyle = "standard" | "compact" | "centered";
type FooterStyle = "dark" | "light" | "minimal";
type Tab = "blocks" | "header" | "footer" | "settings";
type FilterTab = "all" | "visible" | "hidden";
type ResponsiveMode = "desktop" | "tablet" | "mobile";

// ─── Block type meta ──────────────────────────────────────────────────────────
const BLOCK_META: Record<string, { tag: string; tagColor: string; tagBg: string; Icon: React.ElementType; iconBg: string; iconColor: string }> = {
  hero:        { tag: "DESTAQUE",  tagColor: "#92400E", tagBg: "#FEF3C7", Icon: Trophy,    iconBg: "#FEF3C7", iconColor: "#D97706" },
  brasil:      { tag: "NOTÍCIAS",  tagColor: "#1e40af", tagBg: "#DBEAFE", Icon: Globe,     iconBg: "#DBEAFE", iconColor: "#2563EB" },
  "mais-lidas":{ tag: "CARROSSEL", tagColor: "#9a3412", tagBg: "#FEE2E2", Icon: Flame,     iconBg: "#FEE2E2", iconColor: "#EF4444" },
  mundo:       { tag: "NOTÍCIAS",  tagColor: "#065f46", tagBg: "#D1FAE5", Icon: Globe,     iconBg: "#D1FAE5", iconColor: "#10B981" },
  esporte:     { tag: "NOTÍCIAS",  tagColor: "#991b1b", tagBg: "#FEE2E2", Icon: Star,      iconBg: "#FEE2E2", iconColor: "#DC2626" },
  cultura:     { tag: "NOTÍCIAS",  tagColor: "#134e4a", tagBg: "#CCFBF1", Icon: Star,      iconBg: "#CCFBF1", iconColor: "#0D9488" },
  df:          { tag: "NOTÍCIAS",  tagColor: "#1e3a5f", tagBg: "#DBEAFE", Icon: Building2, iconBg: "#EFF6FF", iconColor: "#0B2A66" },
  saude:       { tag: "NOTÍCIAS",  tagColor: "#14532d", tagBg: "#DCFCE7", Icon: Heart,     iconBg: "#DCFCE7", iconColor: "#16A34A" },
  tecnologia:  { tag: "NOTÍCIAS",  tagColor: "#1e40af", tagBg: "#DBEAFE", Icon: Cpu,       iconBg: "#EFF6FF", iconColor: "#0284C7" },
  colunistas:  { tag: "CONTEÚDO",  tagColor: "#4c1d95", tagBg: "#EDE9FE", Icon: Users,     iconBg: "#EDE9FE", iconColor: "#7C3AED" },
  ultimas:     { tag: "LISTA",     tagColor: "#064e3b", tagBg: "#D1FAE5", Icon: Newspaper, iconBg: "#D1FAE5", iconColor: "#059669" },
};
const DEFAULT_META = { tag: "BLOCO", tagColor: "#374151", tagBg: "#F3F4F6", Icon: LayoutGrid, iconBg: "#F3F4F6", iconColor: "#6B7280" };

// ─── Block types for "Adicionar bloco" ───────────────────────────────────────
const MAIN_MODULES = [
  { type: "content" as BlockType,     name: "Conteúdo",     desc: "Artigos em grade, destaque ou lista.", Icon: FileText,          iconBg: "#EFF6FF", iconColor: "#2563EB" },
  { type: "image" as BlockType,       name: "Imagem",       desc: "Banners ou imagens editoriais.",       Icon: Image,             iconBg: "#FDF4FF", iconColor: "#A855F7" },
  { type: "carousel" as BlockType,    name: "Carrossel",    desc: "Itens roláveis em destaque.",          Icon: GalleryHorizontal, iconBg: "#FFF7ED", iconColor: "#F97316" },
  { type: "video" as BlockType,       name: "Vídeo",        desc: "YouTube, Vimeo ou upload.",            Icon: Play,              iconBg: "#FEF2F2", iconColor: "#EF4444" },
  { type: "advertising" as BlockType, name: "Propaganda",   desc: "Anúncios em diferentes formatos.",     Icon: Megaphone,         iconBg: "#FFFBEB", iconColor: "#F59E0B" },
  { type: "list" as BlockType,        name: "Lista",        desc: "Lista compacta de artigos.",           Icon: List,              iconBg: "#F0FDF4", iconColor: "#22C55E" },
  { type: "ticker" as BlockType,      name: "Ticker",       desc: "Faixa de notícias rolando.",           Icon: Radio,             iconBg: "#EFF6FF", iconColor: "#3B82F6" },
  { type: "newsletter" as BlockType,  name: "Newsletter",   desc: "Captura de e-mails.",                  Icon: Mail,              iconBg: "#F0FDFA", iconColor: "#14B8A6" },
  { type: "categories" as BlockType,  name: "Categorias",   desc: "Navegação por categorias.",            Icon: FolderOpen,        iconBg: "#FFF7ED", iconColor: "#EA580C" },
  { type: "weather" as BlockType,     name: "Clima",        desc: "Widget de clima.",                     Icon: CloudSun,          iconBg: "#F0F9FF", iconColor: "#0EA5E9" },
  { type: "quotes" as BlockType,      name: "Cotações",     desc: "Moedas e índices.",                    Icon: CircleDollarSign,  iconBg: "#F0FDF4", iconColor: "#16A34A" },
  { type: "social" as BlockType,      name: "Redes Sociais",desc: "Links para redes sociais.",            Icon: Share2,            iconBg: "#EFF6FF", iconColor: "#2563EB" },
];
const OTHER_MODULES = [
  { type: "table" as BlockType,   name: "Tabela",            desc: "Dados em tabela.",          Icon: AlignJustify },
  { type: "counter" as BlockType, name: "Contador",          desc: "Estatísticas em números.",  Icon: Hash },
  { type: "sep" as BlockType,     name: "Separador",         desc: "Divisor entre seções.",     Icon: Minus },
  { type: "html" as BlockType,    name: "HTML Personalizado",desc: "Código HTML livre.",        Icon: Code },
  { type: "map" as BlockType,     name: "Mapa",              desc: "Google Maps.",              Icon: MapIcon },
  { type: "embed" as BlockType,   name: "Embed",             desc: "Conteúdo externo.",         Icon: Frame },
];

// ─── Formats per type ─────────────────────────────────────────────────────────
const FORMATS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  content:     [{ value: "grid", label: "Grade 4" }, { value: "featured", label: "Destaque" }, { value: "duplo", label: "Duplo" }, { value: "cultura", label: "Foto+Lista" }, { value: "lista", label: "Lista" }, { value: "manchete", label: "Manchete" }, { value: "mosaico", label: "Mosaico" }],
  advertising: [{ value: "banner_970x90", label: "Banner 970×90" }, { value: "banner_728x90", label: "Banner 728×90" }, { value: "sidebar_300x250", label: "Sidebar 300×250" }, { value: "full_width", label: "Full Width" }],
  image:       [{ value: "full_width_image", label: "Full Width" }, { value: "image_card", label: "Card" }, { value: "image_with_text", label: "Imagem + Texto" }, { value: "background_overlay", label: "Overlay" }],
  carousel:    [{ value: "carousel_news", label: "Notícias" }, { value: "carousel_images", label: "Imagens" }, { value: "carousel_columnists", label: "Colunistas" }, { value: "carousel_ads", label: "Anúncios" }],
  video:       [{ value: "video_featured", label: "Destaque" }, { value: "video_grid", label: "Grade" }, { value: "youtube_embed", label: "YouTube Embed" }],
  list:        [{ value: "list_compact", label: "Compacta" }, { value: "ranking_horizontal", label: "Ranking" }],
};

// ─── Sources ──────────────────────────────────────────────────────────────────
const SOURCES: { value: SourceType; label: string }[] = [
  { value: "automatic_by_category", label: "Automático por categoria" },
  { value: "most_read",             label: "Mais lidas" },
  { value: "latest",                label: "Últimas notícias" },
  { value: "manual",                label: "Selecionar manualmente" },
  { value: "rss",                   label: "Fonte RSS" },
  { value: "perplexity",            label: "Perplexity" },
];

// ─── Categories ───────────────────────────────────────────────────────────────
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
];

// ─── Layout visual presets ────────────────────────────────────────────────────
const LAYOUTS: { id: LayoutId; label: string; desc: string; mini: React.ReactNode }[] = [
  { id: "grid",     label: "Grade",     desc: "4 cards em linha", mini: <div className="flex gap-0.5 w-full">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-4 bg-current rounded-sm opacity-40"/>)}</div> },
  { id: "featured", label: "Destaque",  desc: "1 grande + lista", mini: <div className="flex gap-0.5 w-full"><div className="flex-[2] h-4 bg-current rounded-sm opacity-40"/><div className="flex-1 flex flex-col gap-0.5">{[0,1,2].map(i=><div key={i} className="h-1 bg-current rounded opacity-25"/>)}</div></div> },
  { id: "duplo",    label: "Duplo",     desc: "2 grandes + tira", mini: <div className="flex flex-col gap-0.5 w-full"><div className="flex gap-0.5"><div className="flex-1 h-2.5 bg-current rounded-sm opacity-40"/><div className="flex-1 h-2.5 bg-current rounded-sm opacity-40"/></div><div className="flex gap-0.5">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-1 bg-current rounded opacity-25"/>)}</div></div> },
  { id: "cultura",  label: "Foto+Lista",desc: "Foto + lista lateral", mini: <div className="flex gap-0.5 w-full"><div className="flex-[3] h-4 bg-current rounded-sm opacity-40"/><div className="flex-[2] flex flex-col gap-0.5 justify-center">{[0,1,2].map(i=><div key={i} className="h-1 bg-current rounded opacity-25"/>)}</div></div> },
  { id: "lista",    label: "Lista",     desc: "Numerada", mini: <div className="flex flex-col gap-0.5 w-full">{[0,1,2,3].map(i=><div key={i} className="flex gap-0.5 items-center"><div className="w-1.5 h-1.5 bg-current rounded-full opacity-50 shrink-0"/><div className="flex-1 h-1 bg-current rounded opacity-25"/></div>)}</div> },
  { id: "manchete", label: "Manchete",  desc: "Hero + 3", mini: <div className="flex flex-col gap-0.5 w-full"><div className="w-full h-3 bg-current rounded-sm opacity-40"/><div className="flex gap-0.5">{[0,1,2].map(i=><div key={i} className="flex-1 h-2 bg-current rounded-sm opacity-25"/>)}</div></div> },
  { id: "mosaico",  label: "Mosaico",   desc: "1 grande + 4", mini: <div className="flex gap-0.5 w-full"><div className="flex-[2] h-4 bg-current rounded-sm opacity-40"/><div className="flex-[2] grid grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><div key={i} className="h-2 bg-current rounded-sm opacity-25"/>)}</div></div> },
];

// ─── Block defaults ───────────────────────────────────────────────────────────
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
  { id: "hero",       name: "Hero / Destaques", visible: true,  order: 0 },
  { id: "brasil",     name: "Brasil",           visible: true,  order: 1 },
  { id: "mais-lidas", name: "Mais Lidas",       visible: true,  order: 2 },
  { id: "mundo",      name: "Mundo",            visible: true,  order: 3 },
  { id: "esporte",    name: "Esporte",          visible: true,  order: 4 },
  { id: "cultura",    name: "Cultura",          visible: true,  order: 5 },
  { id: "df",         name: "DF",               visible: true,  order: 6 },
  { id: "saude",      name: "Saúde",            visible: true,  order: 7 },
  { id: "tecnologia", name: "Tecnologia",       visible: true,  order: 8 },
  { id: "colunistas", name: "Colunistas",       visible: true,  order: 9 },
  { id: "ultimas",    name: "Últimas Notícias", visible: true,  order: 10 },
];

// ─── Header/Footer presets ────────────────────────────────────────────────────
const HEADER_PRESETS: { id: HeaderStyle; label: string; desc: string }[] = [
  { id: "standard",  label: "Padrão",       desc: "Logo à esquerda, nav à direita, ticker abaixo" },
  { id: "compact",   label: "Compacto",     desc: "Header fino, sem ticker, mais conteúdo" },
  { id: "centered",  label: "Centralizado", desc: "Logo no centro, nav em barra escura abaixo" },
];
const FOOTER_PRESETS: { id: FooterStyle; label: string; desc: string }[] = [
  { id: "dark",    label: "Escuro",  desc: "Fundo preto, colunas com links, newsletter" },
  { id: "light",   label: "Claro",   desc: "Fundo branco, colunas com links, borda vermelha" },
  { id: "minimal", label: "Minimal", desc: "Apenas uma linha com copyright e links" },
];

// ─── Extended block form ──────────────────────────────────────────────────────
interface BlockForm {
  name: string;
  blockType: BlockType;
  format: string;
  categories: string[];
  category: string;
  layout: LayoutId;
  source: SourceType;
  itemsLimit: number;
  color: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  showTitle: boolean;
  showCategory: boolean;
  showImage: boolean;
  showAuthorDate: boolean;
  showSummary: boolean;
  reverse: boolean;
}

const EMPTY_FORM: BlockForm = {
  name: "", blockType: "content", format: "grid",
  categories: [], category: "politica", layout: "grid",
  source: "automatic_by_category", itemsLimit: 4,
  color: "#1d4ed8", primaryColor: "#0B2A66", accentColor: "#E71D36", textColor: "#FFFFFF",
  showTitle: true, showCategory: true, showImage: true, showAuthorDate: true, showSummary: false,
  reverse: false,
};

function blockToForm(block: HomeBlock): BlockForm {
  const d = BLOCK_DEFAULTS[block.id];
  return {
    name:          block.name,
    blockType:     "content" as BlockType,
    format:        (block.layout ?? d?.layout ?? "grid"),
    categories:    block.category ? [block.category] : [],
    category:      block.category ?? d?.category ?? "geral",
    layout:        (block.layout ?? d?.layout ?? "grid") as LayoutId,
    source:        "automatic_by_category",
    itemsLimit:    4,
    color:         block.color ?? d?.color ?? "#6b7280",
    primaryColor:  "#0B2A66",
    accentColor:   "#E71D36",
    textColor:     "#FFFFFF",
    showTitle:     true,
    showCategory:  true,
    showImage:     true,
    showAuthorDate: true,
    showSummary:   false,
    reverse:       block.reverse ?? false,
  };
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, accent }: { checked: boolean; onChange: () => void; accent?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onChange(); }}
      className="relative inline-flex w-9 h-5 rounded-full transition-colors focus:outline-none shrink-0"
      style={{ backgroundColor: checked ? (accent ?? "#0B2A66") : "#CBD5E1" }}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

// ─── Section heading inside panel ─────────────────────────────────────────────
function PanelSection({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon size={11} className="text-slate-400" />}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      </div>
      {children}
    </div>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel({ block, form, saving, onChange, onApply, onDuplicate, onDelete, onCancel }: {
  block: HomeBlock; form: BlockForm; saving: boolean;
  onChange: <K extends keyof BlockForm>(key: K, val: BlockForm[K]) => void;
  onApply: () => void; onDuplicate: () => void; onDelete: () => void; onCancel: () => void;
}) {
  const isSpecial = new Set(["hero", "mais-lidas", "colunistas", "ultimas"]).has(block.id);
  const formats = FORMATS_BY_TYPE[form.blockType] ?? FORMATS_BY_TYPE.content!;
  const INPUT = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors";

  function toggleCategory(val: string) {
    const cur = form.categories;
    onChange("categories", cur.includes(val) ? cur.filter((c) => c !== val) : [...cur, val]);
    if (!cur.includes(val)) { onChange("category", val); }
  }

  return (
    <div className="px-4 pb-4 pt-3 space-y-4 border-t border-slate-100 bg-slate-50/30 rounded-b-2xl">

      {/* Nome */}
      <PanelSection label="Nome do bloco" icon={Type}>
        <input value={form.name} onChange={(e) => onChange("name", e.target.value)}
          className={INPUT} placeholder="Nome exibido na home" />
      </PanelSection>

      {/* Tipo + Formato */}
      <div className="grid grid-cols-2 gap-2">
        <PanelSection label="Tipo">
          <select value={form.blockType} onChange={(e) => { onChange("blockType", e.target.value as BlockType); onChange("format", FORMATS_BY_TYPE[e.target.value]?.[0]?.value ?? "grid"); }}
            className={INPUT}>
            <option value="content">Conteúdo</option>
            <option value="advertising">Propaganda</option>
            <option value="image">Imagem</option>
            <option value="carousel">Carrossel</option>
            <option value="list">Lista</option>
            <option value="video">Vídeo</option>
            <option value="newsletter">Newsletter</option>
            <option value="html">HTML Livre</option>
          </select>
        </PanelSection>
        <PanelSection label="Formato">
          <select value={form.format} onChange={(e) => { onChange("format", e.target.value); onChange("layout", e.target.value as LayoutId); }}
            className={INPUT}>
            {formats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </PanelSection>
      </div>

      {/* Layout visual (content only) */}
      {!isSpecial && form.blockType === "content" && (
        <PanelSection label="Layout visual" icon={Layers}>
          <div className="grid grid-cols-3 gap-1">
            {LAYOUTS.map((l) => (
              <button key={l.id} type="button" onClick={() => { onChange("layout", l.id); onChange("format", l.id); }}
                className="flex flex-col gap-1 p-2 rounded-xl border text-left transition-all"
                style={form.layout === l.id
                  ? { borderColor: form.color, backgroundColor: form.color + "15", color: form.color }
                  : { borderColor: "#e2e8f0", color: "#94a3b8" }}>
                <div className="w-full">{l.mini}</div>
                <span className="text-[9px] font-bold uppercase tracking-wide">{l.label}</span>
              </button>
            ))}
          </div>
        </PanelSection>
      )}

      {/* Inverter layout (só para Foto+Lista) */}
      {!isSpecial && form.layout === "cultura" && (
        <PanelSection label="Layout da imagem" icon={Layers}>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-white border border-slate-100">
            <div className="flex items-center gap-2">
              <Layers size={12} className="text-slate-400" />
              <span className="text-[12px] font-medium text-slate-700">Imagem à direita, lista à esquerda</span>
            </div>
            <Toggle checked={form.reverse} onChange={() => onChange("reverse", !form.reverse)} accent={form.color} />
          </div>
        </PanelSection>
      )}

      {/* Categorias chips */}
      {!isSpecial && (
        <PanelSection label="Categorias" icon={FolderOpen}>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => {
              const active = form.categories.includes(c.value);
              return (
                <button key={c.value} type="button" onClick={() => toggleCategory(c.value)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all"
                  style={active
                    ? { borderColor: c.color, backgroundColor: c.color + "20", color: c.color }
                    : { borderColor: "#e2e8f0", color: "#64748b" }}>
                  {active && <CheckCircle size={8} />}
                  {c.label}
                </button>
              );
            })}
          </div>
        </PanelSection>
      )}

      {/* Fonte */}
      {!isSpecial && (
        <PanelSection label="Fonte dos artigos">
          <select value={form.source} onChange={(e) => onChange("source", e.target.value as SourceType)} className={INPUT}>
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </PanelSection>
      )}

      {/* Quantidade */}
      {!isSpecial && (
        <PanelSection label="Quantidade de itens">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onChange("itemsLimit", Math.max(1, form.itemsLimit - 1))}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors bg-white">
              <Minus size={13} />
            </button>
            <div className="flex-1 bg-white border border-slate-200 rounded-xl text-center py-1.5 text-sm font-bold text-[#0B2A66]">
              {form.itemsLimit}
            </div>
            <button type="button" onClick={() => onChange("itemsLimit", Math.min(12, form.itemsLimit + 1))}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors bg-white">
              <Plus size={13} />
            </button>
          </div>
        </PanelSection>
      )}

      {/* Cores */}
      <PanelSection label="Cores" icon={Palette}>
        <div className="space-y-2">
          {([
            { key: "primaryColor" as keyof BlockForm, label: "Cor principal", value: form.primaryColor as string },
            { key: "accentColor"  as keyof BlockForm, label: "Cor destaque",  value: form.accentColor  as string },
            { key: "color"        as keyof BlockForm, label: "Cor categoria", value: form.color        as string },
          ] as { key: keyof BlockForm; label: string; value: string }[]).map(({ key, label, value }) => (
            <div key={String(key)} className="flex items-center gap-2">
              <input type="color" value={value} onChange={(e) => onChange(key, e.target.value)}
                className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
              <input type="text" value={value} onChange={(e) => onChange(key, e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#0B2A66]" />
              <span className="text-[10px] text-slate-400 w-20 shrink-0">{label}</span>
            </div>
          ))}
        </div>
      </PanelSection>

      {/* Display toggles */}
      <PanelSection label="Exibir elementos" icon={EyeIcon}>
        <div className="space-y-2">
          {([
            { key: "showTitle"      as keyof BlockForm, label: "Título",        icon: Type       },
            { key: "showCategory"   as keyof BlockForm, label: "Categoria",     icon: FolderOpen },
            { key: "showImage"      as keyof BlockForm, label: "Imagem",        icon: FileImage  },
            { key: "showAuthorDate" as keyof BlockForm, label: "Autor e data",  icon: User       },
            { key: "showSummary"    as keyof BlockForm, label: "Resumo",        icon: AlignLeft  },
          ] as { key: keyof BlockForm; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <div key={String(key)} className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-white border border-slate-100">
              <div className="flex items-center gap-2">
                <Icon size={12} className="text-slate-400" />
                <span className="text-[12px] font-medium text-slate-700">{label}</span>
              </div>
              <Toggle checked={form[key] as boolean} onChange={() => onChange(key, !form[key] as boolean)} />
            </div>
          ))}
        </div>
      </PanelSection>

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button type="button" onClick={onApply} disabled={saving || !form.name.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B2A66] text-white text-sm font-semibold rounded-xl hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
          {saving ? <><RefreshCw size={13} className="animate-spin" /> Salvando…</> : <><CheckCircle size={13} /> Aplicar alterações</>}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onDuplicate}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors">
            <Copy size={12} /> Duplicar
          </button>
          <button type="button" onClick={onDelete}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
            <Trash2 size={12} /> Remover
          </button>
        </div>
        <button type="button" onClick={onCancel}
          className="w-full py-1.5 text-[12px] text-slate-400 hover:text-slate-600 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomeBlocksManager() {
  const [blocks, setBlocks]             = useState<HomeBlock[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [dragIdx, setDragIdx]           = useState<number | null>(null);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editForm, setEditForm]         = useState<BlockForm>(EMPTY_FORM);
  const [showAdd, setShowAdd]           = useState(false);
  const [previewKey, setPreviewKey]     = useState(0);
  const [tab, setTab]                   = useState<Tab>("blocks");
  const [filterTab, setFilterTab]       = useState<FilterTab>("all");
  const [responsive, setResponsive]     = useState<ResponsiveMode>("desktop");
  const [headerStyle, setHeaderStyle]   = useState<HeaderStyle>("standard");
  const [footerStyle, setFooterStyle]   = useState<FooterStyle>("dark");
  const [headerBgColor, setHeaderBgColor] = useState("#ffffff");
  const [footerBgColor, setFooterBgColor] = useState("#000000");
  const [logoBase64, setLogoBase64]     = useState<string | null>(null);
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);
  const [logoSize, setLogoSize]         = useState(48);
  const [logoSaving, setLogoSaving]     = useState(false);
  const [logoStatus, setLogoStatus]     = useState<"idle" | "ok" | "err">("idle");
  const [history, setHistory]           = useState<HomeBlock[][]>([]);
  const [historyIdx, setHistoryIdx]     = useState(-1);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockRefs    = useRef<Record<string, HTMLDivElement | null>>({});
  const iframeRef    = useRef<HTMLIFrameElement>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
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

  // ── postMessage from iframe ─────────────────────────────────────────────────
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
        debounceSave(blocks);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [blocks]);

  // ── History ─────────────────────────────────────────────────────────────────
  function pushHistory(next: HomeBlock[]) {
    setHistory((h) => [...h.slice(0, historyIdx + 1), next]);
    setHistoryIdx((i) => i + 1);
  }
  function undo() {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1]; if (!prev) return;
    setHistoryIdx((i) => i - 1); setBlocks(prev);
  }
  function redo() {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1]; if (!next) return;
    setHistoryIdx((i) => i + 1); setBlocks(next);
  }

  // ── Auto-save (debounced) ───────────────────────────────────────────────────
  const debounceSave = useCallback((newBlocks: HomeBlock[], delay = 500) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await adminApi.updateSettings({ homeBlocks: newBlocks.map((b, i) => ({ ...b, order: i })) });
        invalidateSiteCache();
        setSaved(true);
        setPreviewKey((k) => k + 1);
        setTimeout(() => setSaved(false), 2000);
      } catch { } finally { setSaving(false); }
    }, delay);
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
      setSaved(true); setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2000);
    } catch { } finally { setSaving(false); }
  }

  async function saveLogo() {
    setLogoSaving(true); setLogoStatus("idle");
    try {
      if (logoPreview) { await adminApi.uploadLogo(logoPreview); setLogoBase64(logoPreview); setLogoPreview(null); }
      await adminApi.updateSettings({ logoSize });
      invalidateSiteCache();
      setLogoStatus("ok"); setPreviewKey((k) => k + 1);
      setTimeout(() => setLogoStatus("idle"), 2500);
    } catch { setLogoStatus("err"); } finally { setLogoSaving(false); }
  }

  // ── Block actions ───────────────────────────────────────────────────────────
  function toggleVisible(idx: number) {
    const next = blocks.map((b, i) => i === idx ? { ...b, visible: !b.visible } : b);
    pushHistory(next); setBlocks(next); debounceSave(next);
  }

  function deleteBlock(id: string) {
    if (!confirm("Remover este bloco da home?")) return;
    const next = blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }));
    pushHistory(next); setBlocks(next); debounceSave(next);
    if (editingId === id) setEditingId(null);
  }

  function duplicateBlock(id: string) {
    const src = blocks.find((b) => b.id === id); if (!src) return;
    const clone: HomeBlock = { ...src, id: `${src.id}-copy-${Date.now()}`, name: `${src.name} (cópia)`, custom: true };
    const idx = blocks.findIndex((b) => b.id === id);
    const next = [...blocks.slice(0, idx + 1), clone, ...blocks.slice(idx + 1)].map((b, i) => ({ ...b, order: i }));
    pushHistory(next); setBlocks(next); debounceSave(next);
    // Open editor on clone
    setEditingId(clone.id);
    setEditForm(blockToForm(clone));
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
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
  function handleDragEnd() { setDragIdx(null); debounceSave(blocks); pushHistory(blocks); }

  // ── Edit block ──────────────────────────────────────────────────────────────
  function openEdit(block: HomeBlock) {
    if (editingId === block.id) { setEditingId(null); return; }
    setEditingId(block.id);
    setEditForm(blockToForm(block));
    // Notify iframe to highlight + scroll to this block
    iframeRef.current?.contentWindow?.postMessage({ type: "block:select", blockId: block.id }, "*");
  }

  // Live debounced form change
  function handleFormChange<K extends keyof BlockForm>(key: K, val: BlockForm[K]) {
    const nextForm = { ...editForm, [key]: val };
    setEditForm(nextForm);
    // Optimistic update name in block list immediately
    if (key === "name" && editingId) {
      setBlocks((prev) => prev.map((b) => b.id === editingId ? { ...b, name: val as string } : b));
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!editingId) return;
      const updated = blocks.map((b) => b.id === editingId ? {
        ...b,
        name: nextForm.name,
        category: nextForm.categories[0] ?? nextForm.category,
        layout: nextForm.layout,
        color: nextForm.color,
        reverse: nextForm.reverse,
      } : b);
      debounceSave(updated, 800);
    }, 300);
  }

  async function applyAndSave(id: string) {
    const next = blocks.map((b) => b.id === id ? {
      ...b,
      name: editForm.name,
      category: editForm.categories[0] ?? editForm.category,
      layout: editForm.layout,
      color: editForm.color,
      reverse: editForm.reverse,
    } : b);
    setBlocks(next); setEditingId(null);
    pushHistory(next);
    setSaving(true);
    try {
      await adminApi.updateSettings({ homeBlocks: next.map((b, i) => ({ ...b, order: i })) });
      invalidateSiteCache();
      setSaved(true); setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2000);
    } catch { } finally { setSaving(false); }
  }

  // ── Add block ───────────────────────────────────────────────────────────────
  function addBlockFromType(type: string, name: string) {
    const newBlock: HomeBlock = { id: `${type}-${Date.now()}`, name, visible: true, order: blocks.length, custom: true };
    const next = [...blocks, newBlock];
    setBlocks(next); pushHistory(next); setShowAdd(false); debounceSave(next);
    setEditingId(newBlock.id);
    setEditForm({ ...EMPTY_FORM, name, blockType: type as BlockType });
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const visibleCount   = blocks.filter((b) => b.visible).length;
  const filteredBlocks = blocks.filter((b) => {
    if (filterTab === "visible") return b.visible;
    if (filterTab === "hidden")  return !b.visible;
    return true;
  });
  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;
  const previewWidth = responsive === "desktop" ? "100%" : responsive === "tablet" ? "768px" : "375px";

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Blocos da Home" noPadding>
      <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden bg-[#F8FAFC]">

        {/* ══ Top action bar ═══════════════════════════════════════════════════ */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-[#E2E8F0]">
          <div>
            <h1 className="text-[15px] font-black text-[#0F172A]">Blocos da Home</h1>
            <p className="text-[12px] text-[#64748B] mt-0.5">Gerencie, ordene e edite os blocos que aparecem na página inicial.</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                <CheckCircle size={13} /> Salvo
              </span>
            )}
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

        {/* ══ Tabs ════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 flex border-b border-[#E2E8F0] bg-white px-6">
          {(["blocks","header","footer","settings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setShowAdd(false); }}
              className={`px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px ${
                tab === t ? "text-[#0B2A66] border-[#0B2A66]" : "text-[#64748B] border-transparent hover:text-[#0F172A]"
              }`}>
              {t === "blocks" ? "Blocos" : t === "header" ? "Cabeçalho" : t === "footer" ? "Rodapé" : "Configurações"}
            </button>
          ))}
        </div>

        {/* ══ Main ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left panel ──────────────────────────────────────────────────── */}
          <div className="w-[320px] shrink-0 flex flex-col border-r border-[#E2E8F0] bg-white overflow-hidden">

            {/* ── BLOCKS tab ── */}
            {tab === "blocks" && (
              <>
                <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-bold text-[#0F172A]">Blocos da Home</span>
                    {saving && <RefreshCw size={13} className="text-[#64748B] animate-spin" />}
                  </div>
                  <p className="text-[11px] text-[#64748B]">
                    {loading ? "Carregando…" : `${visibleCount} visível${visibleCount !== 1 ? "s" : ""} · ${blocks.length} total`}
                  </p>
                  <div className="flex gap-1 mt-2">
                    {(["all","visible","hidden"] as FilterTab[]).map((f) => (
                      <button key={f} onClick={() => setFilterTab(f)}
                        className={`px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                          filterTab === f ? "bg-[#0B2A66] text-white" : "text-[#64748B] hover:bg-[#F8FAFC]"
                        }`}>
                        {f === "all" ? "Todos" : f === "visible" ? "Visíveis" : "Ocultos"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                  {loading ? (
                    <div className="text-center py-16 text-[#64748B] text-sm">Carregando…</div>
                  ) : filteredBlocks.length === 0 ? (
                    <div className="text-center py-16 text-[#64748B] text-sm">Nenhum bloco {filterTab === "visible" ? "visível" : "oculto"}</div>
                  ) : filteredBlocks.map((block) => {
                    const realIdx  = blocks.findIndex((b) => b.id === block.id);
                    const isEditing  = editingId === block.id;
                    const isDragging = dragIdx === realIdx;
                    const meta = BLOCK_META[block.id] ?? DEFAULT_META;

                    return (
                      <div key={block.id}
                        ref={(el) => { blockRefs.current[block.id] = el; }}
                        draggable={!isEditing}
                        onDragStart={() => handleDragStart(realIdx)}
                        onDragOver={(e) => handleDragOver(e, realIdx)}
                        onDragEnd={handleDragEnd}
                        className={`rounded-2xl border bg-white transition-all select-none
                          ${isDragging ? "border-[#F59E0B] shadow-lg scale-[1.02] opacity-90" : "border-[#E2E8F0]"}
                          ${!block.visible ? "opacity-50" : ""}
                          ${isEditing ? "ring-2 ring-[#0B2A66]/20 border-[#0B2A66]/40 shadow-sm" : "hover:border-[#CBD5E1]"}
                        `}
                        style={{ boxShadow: isDragging ? "0 8px 24px rgba(15,23,42,0.10)" : isEditing ? "0 0 0 2px rgba(11,42,102,0.12)" : undefined }}
                      >
                        <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => openEdit(block)}>
                          <span className="text-[#CBD5E1] hover:text-[#94A3B8] cursor-grab shrink-0" onClick={(e) => e.stopPropagation()}>
                            <GripVertical size={15} />
                          </span>
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: meta.iconBg }}>
                            <meta.Icon size={14} style={{ color: meta.iconColor }} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[#0F172A] truncate leading-tight">{block.name}</p>
                            <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                              style={{ backgroundColor: meta.tagBg, color: meta.tagColor }}>
                              {meta.tag}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Toggle checked={block.visible} onChange={() => toggleVisible(realIdx)} />
                          </div>
                          <span className={`text-[#CBD5E1] transition-transform ${isEditing ? "rotate-180" : ""}`}>
                            <ChevronDown size={14} />
                          </span>
                        </div>

                        {isEditing && (
                          <SettingsPanel
                            block={block} form={editForm} saving={saving}
                            onChange={handleFormChange}
                            onApply={() => applyAndSave(block.id)}
                            onDuplicate={() => duplicateBlock(block.id)}
                            onDelete={() => deleteBlock(block.id)}
                            onCancel={() => setEditingId(null)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="shrink-0 px-3 py-3 border-t border-[#E2E8F0] space-y-2">
                  <button onClick={() => setShowAdd(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#E71D36] text-white text-[13px] font-semibold rounded-xl hover:bg-[#c0112a] transition-colors shadow-sm">
                    <Plus size={15} /> Adicionar bloco
                  </button>
                  <button onClick={() => {
                    if (!confirm("Restaurar blocos padrão? Isso removerá blocos personalizados.")) return;
                    setBlocks(DEFAULT_BLOCKS); pushHistory(DEFAULT_BLOCKS); debounceSave(DEFAULT_BLOCKS);
                  }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium text-[#64748B] hover:text-[#0B2A66] hover:bg-[#F8FAFC] rounded-xl transition-colors">
                    <RotateCcw size={12} /> Restaurar padrões
                  </button>
                </div>
              </>
            )}

            {/* ── HEADER tab ── */}
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
                      className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">OK</button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {["#ffffff","#f8fafc","#f1f5f9","#0B2A66","#E71D36","#18181b"].map((c) => (
                      <button key={c} type="button" onClick={() => setHeaderBgColor(c)}
                        className={`w-6 h-6 rounded-lg border-2 transition-all ${headerBgColor === c ? "border-[#0B2A66] scale-110" : "border-[#E2E8F0] hover:border-[#94A3B8]"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  {/* Logo upload */}
                  <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                    <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"><ImageIcon size={12} /> Logo</p>
                    {(logoPreview ?? logoBase64) && (
                      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-center" style={{ backgroundColor: headerBgColor }}>
                        <img src={logoPreview ?? logoBase64!} alt="logo" style={{ height: logoSize }} className="w-auto object-contain" />
                      </div>
                    )}
                    <div
                      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); } }}
                      onDragOver={(e) => e.preventDefault()} onClick={() => logoInputRef.current?.click()}
                      className="border-2 border-dashed border-[#E2E8F0] rounded-xl py-4 flex flex-col items-center gap-2 cursor-pointer hover:border-[#0B2A66] hover:bg-[#F8FAFC] transition-colors">
                      <Upload size={20} className="text-[#94A3B8]" />
                      <p className="text-xs text-[#64748B] text-center">Clique ou arraste a logo<br/><span className="text-[10px] text-[#94A3B8]">PNG, SVG, WEBP</span></p>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); } }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setLogoSize((s) => Math.max(32, s - 8))} className="w-7 h-7 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] bg-white"><Minus size={11}/></button>
                      <input type="range" min={32} max={160} step={4} value={logoSize} onChange={(e) => setLogoSize(Number(e.target.value))} className="flex-1 accent-[#0B2A66]" />
                      <button onClick={() => setLogoSize((s) => Math.min(160, s + 8))} className="w-7 h-7 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] bg-white"><Plus size={11}/></button>
                      <span className="text-sm font-bold text-[#0B2A66] w-10 text-right">{logoSize}px</span>
                    </div>
                    {logoStatus === "ok"  && <div className="flex items-center gap-1.5 text-green-700 text-xs bg-green-50 border border-green-200 rounded-xl px-3 py-2"><CheckCircle size={12}/> Logo atualizada!</div>}
                    {logoStatus === "err" && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">Erro ao salvar logo</div>}
                    <button onClick={saveLogo} disabled={logoSaving}
                      className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                      {logoSaving ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>}
                      {logoSaving ? "Salvando…" : "Salvar logo"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── FOOTER tab ── */}
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
                      className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">OK</button>
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

            {/* ── SETTINGS tab ── */}
            {tab === "settings" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                <p className="text-[12px] text-[#64748B]">Configurações gerais da página inicial.</p>
                {[
                  { label: "Cache automático",        desc: "Limpar cache a cada 5 minutos",           enabled: true  },
                  { label: "Atualização em tempo real",desc: "Blocos recarregam com novos artigos",     enabled: false },
                  { label: "SEO personalizado",        desc: "Título e descrição customizados",         enabled: true  },
                  { label: "Modo manutenção",          desc: "Exibir página de manutenção",             enabled: false },
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

            {/* Add block picker */}
            {showAdd && (
              <div className="flex-1 overflow-y-auto">
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-[#E2E8F0]">
                  <div>
                    <h2 className="text-[15px] font-black text-[#0F172A]">Adicionar novo bloco</h2>
                    <p className="text-[12px] text-[#64748B] mt-0.5">Selecione o tipo de conteúdo para a home.</p>
                  </div>
                  <button onClick={() => setShowAdd(false)} className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-xl transition-colors"><X size={18}/></button>
                </div>
                <div className="px-6 py-5 space-y-6">
                  <div className="grid grid-cols-4 gap-3">
                    {MAIN_MODULES.map((m) => (
                      <button key={m.type} type="button" onClick={() => addBlockFromType(m.type, m.name)}
                        className="flex flex-col p-4 bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#0B2A66] hover:shadow-md text-left transition-all group"
                        style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.04)" }}>
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: m.iconBg }}>
                          <m.Icon size={20} style={{ color: m.iconColor }} />
                        </span>
                        <p className="text-[13px] font-bold text-[#0F172A] group-hover:text-[#0B2A66] mb-1">{m.name}</p>
                        <p className="text-[11px] text-[#64748B] leading-relaxed">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div>
                    <h3 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider mb-3">Outros módulos</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {OTHER_MODULES.map((m) => (
                        <button key={m.type} type="button" onClick={() => addBlockFromType(m.type, m.name)}
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
                  <div className="flex items-start gap-3 p-4 bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl">
                    <Info size={15} className="text-[#2563EB] mt-0.5 shrink-0" />
                    <p className="text-[12px] text-[#1e40af] leading-relaxed">Arraste os blocos para reordenar. Clique no toggle para mostrar ou ocultar. Clique no bloco para editar.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Live preview */}
            {!showAdd && (
              <>
                <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0F172A]">Prévia ao vivo</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-[#DCFCE7] text-green-700 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Ao vivo
                    </span>
                    {editingId && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#EEF2FF] text-[#0B2A66] rounded-full">
                        Editando: {blocks.find((b) => b.id === editingId)?.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
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
                <div className="flex-1 overflow-auto bg-[#F1F5F9] p-4">
                  <div className="mx-auto transition-all duration-300 h-full" style={{ maxWidth: previewWidth, minHeight: "100%" }}>
                    <div className="w-full h-full rounded-2xl overflow-hidden shadow-lg bg-white" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}>
                      <iframe key={previewKey} ref={iframeRef} src="/?adminPreview=1" title="Prévia da Home"
                        className="w-full h-full border-0" style={{ minHeight: "600px" }} />
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
