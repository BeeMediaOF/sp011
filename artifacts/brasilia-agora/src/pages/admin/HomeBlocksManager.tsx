import React, { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import { inferBlockType, defaultFormatForType, parseVideoEmbedUrl, safeEmbedUrl } from "../../lib/homeBlocks";
import FooterEditor from "./FooterEditor";
import {
  GripVertical, Eye, EyeOff, Plus, Trash2, ChevronDown,
  CheckCircle, RefreshCw, Save, LayoutGrid, X,
  Upload, Minus, ImageIcon, Monitor, Tablet, Smartphone, ExternalLink,
  Undo2, Redo2, FileText, Image, GalleryHorizontal, Play, Megaphone,
  List, Radio, Mail, FolderOpen, CircleDollarSign, Share2,
  Code, Frame, Map as MapIcon, Settings, Info, RotateCcw, Copy,
  Newspaper, Users, AlignJustify, Globe, Flame,
  Trophy, Building2, Heart, Cpu, Star, BarChart3,
  Type, Palette, Eye as EyeIcon, FileImage,
  ChevronRight, ChevronUp, Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type BlockType = "content" | "image" | "carousel" | "video" | "advertising" | "list" | "ticker" | "newsletter" | "categories" | "weather" | "quotes" | "social" | "html" | "table" | "counter" | "sep" | "map" | "embed";
type LayoutId = "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico" | "trio" | "compact" | "bigstory" | "timeline";
type SourceType = "automatic_by_category" | "most_read" | "latest" | "manual" | "rss" | "perplexity";
type HeaderStyle = "standard" | "compact" | "centered";
type FooterStyle = "dark" | "light" | "minimal";
type Tab = "blocks" | "header" | "footer" | "settings" | "styles";
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
  { type: "quotes" as BlockType,      name: "Cotações",     desc: "Moedas e índices.",                    Icon: CircleDollarSign,  iconBg: "#F0FDF4", iconColor: "#16A34A" },
  { type: "social" as BlockType,      name: "Redes Sociais",desc: "Links para redes sociais.",            Icon: Share2,            iconBg: "#EFF6FF", iconColor: "#2563EB" },
];
// "Clima", "Tabela" e "Contador" foram removidos do seletor: não têm
// renderizador no site — criavam blocos que não exibiam nada.
const OTHER_MODULES = [
  { type: "sep" as BlockType,     name: "Separador",         desc: "Divisor entre seções.",     Icon: Minus },
  { type: "html" as BlockType,    name: "HTML Personalizado",desc: "Código HTML livre.",        Icon: Code },
  { type: "map" as BlockType,     name: "Mapa",              desc: "Google Maps.",              Icon: MapIcon },
  { type: "embed" as BlockType,   name: "Embed",             desc: "Conteúdo externo.",         Icon: Frame },
];

// ─── Meta visual por TIPO (blocos personalizados na lista) ───────────────────
const TYPE_META: Record<string, { tag: string; tagColor: string; tagBg: string; Icon: React.ElementType; iconBg: string; iconColor: string }> = {
  content:     { tag: "CONTEÚDO",   tagColor: "#1e40af", tagBg: "#DBEAFE", Icon: FileText,          iconBg: "#EFF6FF", iconColor: "#2563EB" },
  image:       { tag: "IMAGEM",     tagColor: "#86198f", tagBg: "#FAE8FF", Icon: Image,             iconBg: "#FDF4FF", iconColor: "#A855F7" },
  carousel:    { tag: "CARROSSEL",  tagColor: "#9a3412", tagBg: "#FFEDD5", Icon: GalleryHorizontal, iconBg: "#FFF7ED", iconColor: "#F97316" },
  video:       { tag: "VÍDEO",      tagColor: "#991b1b", tagBg: "#FEE2E2", Icon: Play,              iconBg: "#FEF2F2", iconColor: "#EF4444" },
  advertising: { tag: "PROPAGANDA", tagColor: "#92400e", tagBg: "#FEF3C7", Icon: Megaphone,         iconBg: "#FFFBEB", iconColor: "#F59E0B" },
  list:        { tag: "LISTA",      tagColor: "#166534", tagBg: "#DCFCE7", Icon: List,              iconBg: "#F0FDF4", iconColor: "#22C55E" },
  ticker:      { tag: "TICKER",     tagColor: "#1e40af", tagBg: "#DBEAFE", Icon: Radio,             iconBg: "#EFF6FF", iconColor: "#3B82F6" },
  newsletter:  { tag: "NEWSLETTER", tagColor: "#115e59", tagBg: "#CCFBF1", Icon: Mail,              iconBg: "#F0FDFA", iconColor: "#14B8A6" },
  categories:  { tag: "CATEGORIAS", tagColor: "#9a3412", tagBg: "#FFEDD5", Icon: FolderOpen,        iconBg: "#FFF7ED", iconColor: "#EA580C" },
  quotes:      { tag: "COTAÇÕES",   tagColor: "#166534", tagBg: "#DCFCE7", Icon: CircleDollarSign,  iconBg: "#F0FDF4", iconColor: "#16A34A" },
  social:      { tag: "REDES",      tagColor: "#1e40af", tagBg: "#DBEAFE", Icon: Share2,            iconBg: "#EFF6FF", iconColor: "#2563EB" },
  html:        { tag: "HTML",       tagColor: "#3f3f46", tagBg: "#F4F4F5", Icon: Code,              iconBg: "#FAFAFA", iconColor: "#52525B" },
  embed:       { tag: "EMBED",      tagColor: "#3f3f46", tagBg: "#F4F4F5", Icon: Frame,             iconBg: "#FAFAFA", iconColor: "#52525B" },
  map:         { tag: "MAPA",       tagColor: "#14532d", tagBg: "#DCFCE7", Icon: MapIcon,           iconBg: "#F0FDF4", iconColor: "#16A34A" },
  sep:         { tag: "SEPARADOR",  tagColor: "#3f3f46", tagBg: "#F4F4F5", Icon: Minus,             iconBg: "#FAFAFA", iconColor: "#52525B" },
};

// ─── Formats per type ─────────────────────────────────────────────────────────
// Só a imagem tem variações visuais reais no site. Os demais tipos definem o
// visual pelo próprio renderizador (e o Conteúdo pelo seletor "Layout visual").
const IMAGE_FORMATS: { value: string; label: string }[] = [
  { value: "full_width_image",  label: "Largura total" },
  { value: "image_card",        label: "Card centrado" },
  { value: "image_with_text",   label: "Imagem + texto" },
  { value: "background_overlay",label: "Texto sobre a imagem" },
];

// ─── Slots de propaganda (AdBanner) ───────────────────────────────────────────
const AD_SLOT_OPTIONS = Array.from({ length: 11 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { value: `slot_${n}`, label: `Slot ${n}` };
});

// ─── Tipos de bloco com artigos (mostram fonte/categoria/quantidade) ─────────
const ARTICLE_TYPES = new Set<BlockType>(["content", "carousel", "list", "ticker"]);

// ─── Estilos do Hero (bloco fixo de destaques) ────────────────────────────────
const HERO_FORMATS: { value: string; label: string }[] = [
  { value: "grid",     label: "3 cards + tira" },
  { value: "featured", label: "1 grande + lista" },
  { value: "mosaico",  label: "Mosaico (1 + 4)" },
  { value: "manchete", label: "Manchete full" },
];

// ─── Sources ──────────────────────────────────────────────────────────────────
// Apenas fontes que o site realmente renderiza (sem opções mortas).
const SOURCES: { value: SourceType; label: string }[] = [
  { value: "automatic_by_category", label: "Automático por categoria" },
  { value: "latest",                label: "Últimas notícias (todas as categorias)" },
];

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "politica",    label: "Política",     color: "#1d4ed8" },
  { value: "cidade",      label: "Cidade / DF",  color: "#0b3d91" },
  { value: "seguranca",   label: "Segurança",    color: "#7c3aed" },
  { value: "saude",       label: "Saúde",        color: "#16a34a" },
  { value: "educacao",    label: "Educação",     color: "#0284c7" },
  { value: "cultura",     label: "Cultura",      color: "#0d9488" },
  { value: "esportes",    label: "Esportes",     color: "#dc2626" },
  { value: "tecnologia",  label: "Tecnologia",   color: "#0284c7" },
  { value: "economia",    label: "Economia",     color: "#b45309" },
  { value: "brasil",      label: "Brasil",       color: "#16a34a" },
  { value: "mundo",       label: "Mundo",        color: "#6b21a8" },
  { value: "colunas",     label: "Colunas",      color: "#7c3aed" },
  { value: "turismo",     label: "Turismo",      color: "#0369a1" },
  { value: "transporte",  label: "Transporte",   color: "#ca8a04" },
  { value: "meio-ambiente", label: "Meio Ambiente", color: "#15803d" },
  { value: "geral",       label: "Geral",        color: "#64748b" },
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
  { id: "trio",     label: "Trio",      desc: "3 cards iguais", mini: <div className="flex gap-0.5 w-full">{[0,1,2].map(i=><div key={i} className="flex-1 h-4 bg-current rounded-sm opacity-40"/>)}</div> },
  { id: "compact",  label: "Compacto",  desc: "6 mini itens",   mini: <div className="grid grid-cols-2 gap-0.5 w-full">{[0,1,2,3,4,5].map(i=><div key={i} className="flex gap-0.5 items-center"><div className="w-2 h-2 bg-current rounded-sm opacity-40 shrink-0"/><div className="flex-1 h-1 bg-current rounded opacity-25"/></div>)}</div> },
  { id: "bigstory", label: "Big Story", desc: "1 hero + lateral", mini: <div className="flex gap-0.5 w-full"><div className="flex-[3] h-4 bg-current rounded-sm opacity-40"/><div className="flex-1 flex flex-col gap-0.5">{[0,1,2].map(i=><div key={i} className="h-1 bg-current rounded opacity-25"/>)}</div></div> },
  { id: "timeline", label: "Timeline",  desc: "Lista com linha", mini: <div className="flex flex-col gap-0.5 w-full pl-1 border-l border-current opacity-60">{[0,1,2,3].map(i=><div key={i} className="flex gap-0.5 items-center"><div className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0"/><div className="flex-1 h-1 bg-current rounded opacity-25"/></div>)}</div> },
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

// ─── Home style presets ───────────────────────────────────────────────────────
interface HomeStylePreset {
  id: string;
  name: string;
  desc: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  accentColor: string;
  headerStyle: HeaderStyle;
  footerStyle: FooterStyle;
  headerBgColor: string;
  footerBgColor: string;
  blocks: HomeBlock[];
  diagram: React.ReactNode;
}

const HOME_STYLE_PRESETS: HomeStylePreset[] = [
  {
    id: "padrao",
    name: "Padrão",
    tag: "CLÁSSICO",
    tagColor: "#1e40af", tagBg: "#DBEAFE",
    accentColor: "#0B2A66",
    desc: "Layout equilibrado com hero, seções em grade e colunistas.",
    headerStyle: "standard", footerStyle: "dark",
    headerBgColor: "#ffffff", footerBgColor: "#000000",
    blocks: [
      { id: "hero",       name: "Hero / Destaques", visible: true,  order: 0 },
      { id: "brasil",     name: "Brasil",           visible: true,  order: 1, layout: "grid",    color: "#16a34a", category: "brasil" },
      { id: "mais-lidas", name: "Mais Lidas",       visible: true,  order: 2 },
      { id: "mundo",      name: "Mundo",            visible: true,  order: 3, layout: "grid",    color: "#6b21a8", category: "mundo" },
      { id: "esporte",    name: "Esporte",          visible: true,  order: 4, layout: "cultura", color: "#dc2626", category: "esportes" },
      { id: "cultura",    name: "Cultura",          visible: true,  order: 5, layout: "cultura", color: "#0d9488", category: "cultura" },
      { id: "df",         name: "DF",               visible: true,  order: 6, layout: "duplo",   color: "#0b3d91", category: "cidade" },
      { id: "saude",      name: "Saúde",            visible: true,  order: 7, layout: "grid",    color: "#16a34a", category: "saude" },
      { id: "tecnologia", name: "Tecnologia",       visible: true,  order: 8, layout: "cultura", color: "#0284c7", category: "tecnologia" },
      { id: "colunistas", name: "Colunistas",       visible: true,  order: 9 },
      { id: "ultimas",    name: "Últimas Notícias", visible: true,  order: 10 },
    ],
    diagram: (
      <div className="flex flex-col gap-0.5 w-full h-full">
        <div className="w-full h-5 bg-current rounded opacity-40" />
        <div className="flex gap-0.5 flex-1">
          {[0,1,2,3].map(i=><div key={i} className="flex-1 bg-current rounded opacity-25"/>)}
        </div>
        <div className="flex gap-0.5 h-3">
          {[0,1,2,3].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
        </div>
      </div>
    ),
  },
  {
    id: "portal",
    name: "Portal",
    tag: "HARD NEWS",
    tagColor: "#9a3412", tagBg: "#FEE2E2",
    accentColor: "#E71D36",
    desc: "Forte no hero manchete, poucos blocos, ticker de últimas.",
    headerStyle: "compact", footerStyle: "dark",
    headerBgColor: "#0B2A66", footerBgColor: "#000000",
    blocks: [
      { id: "hero",       name: "Manchete Principal", visible: true,  order: 0, layout: "manchete" },
      { id: "brasil",     name: "Brasil",             visible: true,  order: 1, layout: "featured", color: "#16a34a", category: "brasil" },
      { id: "mais-lidas", name: "Mais Lidas",         visible: true,  order: 2 },
      { id: "mundo",      name: "Mundo",              visible: true,  order: 3, layout: "grid",     color: "#6b21a8", category: "mundo" },
      { id: "df",         name: "DF",                 visible: true,  order: 4, layout: "duplo",    color: "#0b3d91", category: "cidade" },
      { id: "colunistas", name: "Colunistas",         visible: true,  order: 5 },
      { id: "ultimas",    name: "Últimas Notícias",   visible: true,  order: 6 },
      { id: "esporte",    name: "Esporte",            visible: false, order: 7, layout: "cultura", color: "#dc2626", category: "esportes" },
      { id: "cultura",    name: "Cultura",            visible: false, order: 8, layout: "cultura", color: "#0d9488", category: "cultura" },
      { id: "saude",      name: "Saúde",              visible: false, order: 9, layout: "grid",    color: "#16a34a", category: "saude" },
      { id: "tecnologia", name: "Tecnologia",         visible: false, order: 10, layout: "grid",   color: "#0284c7", category: "tecnologia" },
    ],
    diagram: (
      <div className="flex flex-col gap-0.5 w-full h-full">
        <div className="w-full h-7 bg-current rounded opacity-50" />
        <div className="flex gap-0.5 flex-1">
          <div className="flex-[2] bg-current rounded opacity-35"/>
          <div className="flex-1 flex flex-col gap-0.5">
            {[0,1,2].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
          </div>
        </div>
        <div className="w-full h-2 bg-current rounded opacity-20" />
      </div>
    ),
  },
  {
    id: "magazine",
    name: "Magazine",
    tag: "DENSO",
    tagColor: "#065f46", tagBg: "#D1FAE5",
    accentColor: "#10B981",
    desc: "Muitas editorias visíveis, grade densa, mosaico no hero.",
    headerStyle: "standard", footerStyle: "light",
    headerBgColor: "#ffffff", footerBgColor: "#f8fafc",
    blocks: [
      { id: "hero",       name: "Destaques",    visible: true,  order: 0,  layout: "mosaico" },
      { id: "brasil",     name: "Brasil",       visible: true,  order: 1,  layout: "grid",    color: "#16a34a", category: "brasil" },
      { id: "esporte",    name: "Esporte",      visible: true,  order: 2,  layout: "duplo",   color: "#dc2626", category: "esportes" },
      { id: "mais-lidas", name: "Mais Lidas",   visible: true,  order: 3 },
      { id: "mundo",      name: "Mundo",        visible: true,  order: 4,  layout: "grid",    color: "#6b21a8", category: "mundo" },
      { id: "cultura",    name: "Cultura",      visible: true,  order: 5,  layout: "grid",    color: "#0d9488", category: "cultura" },
      { id: "df",         name: "DF",           visible: true,  order: 6,  layout: "grid",    color: "#0b3d91", category: "cidade" },
      { id: "saude",      name: "Saúde",        visible: true,  order: 7,  layout: "grid",    color: "#16a34a", category: "saude" },
      { id: "tecnologia", name: "Tecnologia",   visible: true,  order: 8,  layout: "grid",    color: "#0284c7", category: "tecnologia" },
      { id: "colunistas", name: "Colunistas",   visible: true,  order: 9 },
      { id: "ultimas",    name: "Últimas",      visible: true,  order: 10 },
    ],
    diagram: (
      <div className="flex flex-col gap-0.5 w-full h-full">
        <div className="flex gap-0.5 h-4">
          <div className="flex-[2] bg-current rounded opacity-45"/>
          <div className="flex-[2] grid grid-cols-2 gap-0.5">
            {[0,1,2,3].map(i=><div key={i} className="bg-current rounded opacity-25"/>)}
          </div>
        </div>
        <div className="flex gap-0.5 flex-1">
          {[0,1,2,3].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
        </div>
        <div className="flex gap-0.5 flex-1">
          {[0,1,2,3].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
        </div>
      </div>
    ),
  },
  {
    id: "editorial",
    name: "Editorial",
    tag: "OPINIÃO",
    tagColor: "#4c1d95", tagBg: "#EDE9FE",
    accentColor: "#7C3AED",
    desc: "Foco em texto e colunistas, header centralizado, rodapé mínimo.",
    headerStyle: "centered", footerStyle: "minimal",
    headerBgColor: "#0f172a", footerBgColor: "#0f172a",
    blocks: [
      { id: "hero",       name: "Destaque Principal", visible: true,  order: 0, layout: "featured" },
      { id: "brasil",     name: "Brasil",             visible: true,  order: 1, layout: "featured",  color: "#16a34a", category: "brasil" },
      { id: "colunistas", name: "Colunistas",         visible: true,  order: 2 },
      { id: "cultura",    name: "Cultura",            visible: true,  order: 3, layout: "cultura",   color: "#0d9488", category: "cultura" },
      { id: "mundo",      name: "Mundo",              visible: true,  order: 4, layout: "featured",  color: "#6b21a8", category: "mundo" },
      { id: "ultimas",    name: "Últimas Notícias",   visible: true,  order: 5 },
      { id: "mais-lidas", name: "Mais Lidas",         visible: false, order: 6 },
      { id: "esporte",    name: "Esporte",            visible: false, order: 7, layout: "grid", color: "#dc2626", category: "esportes" },
      { id: "df",         name: "DF",                 visible: false, order: 8, layout: "duplo", color: "#0b3d91", category: "cidade" },
      { id: "saude",      name: "Saúde",              visible: false, order: 9, layout: "grid", color: "#16a34a", category: "saude" },
      { id: "tecnologia", name: "Tecnologia",         visible: false, order: 10, layout: "grid", color: "#0284c7", category: "tecnologia" },
    ],
    diagram: (
      <div className="flex flex-col gap-0.5 w-full h-full">
        <div className="flex gap-0.5 h-5">
          <div className="flex-[2] bg-current rounded opacity-45"/>
          <div className="flex-1 flex flex-col gap-0.5">
            {[0,1,2].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
          </div>
        </div>
        <div className="flex gap-0.5 flex-1">
          <div className="flex-[2] bg-current rounded opacity-35"/>
          <div className="flex-1 flex flex-col gap-0.5">
            {[0,1,2].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
          </div>
        </div>
        <div className="w-full h-2 bg-current rounded opacity-15" />
      </div>
    ),
  },
  {
    id: "minimalista",
    name: "Minimalista",
    tag: "LIMPO",
    tagColor: "#374151", tagBg: "#F3F4F6",
    accentColor: "#6B7280",
    desc: "Poucos blocos, muito espaço, foco total no conteúdo principal.",
    headerStyle: "compact", footerStyle: "minimal",
    headerBgColor: "#ffffff", footerBgColor: "#18181b",
    blocks: [
      { id: "hero",       name: "Destaques",        visible: true,  order: 0, layout: "duplo" },
      { id: "mais-lidas", name: "Mais Lidas",       visible: true,  order: 1 },
      { id: "brasil",     name: "Brasil",           visible: true,  order: 2, layout: "featured", color: "#16a34a", category: "brasil" },
      { id: "colunistas", name: "Colunistas",       visible: true,  order: 3 },
      { id: "ultimas",    name: "Últimas Notícias", visible: true,  order: 4 },
      { id: "mundo",      name: "Mundo",            visible: false, order: 5, layout: "grid", color: "#6b21a8", category: "mundo" },
      { id: "esporte",    name: "Esporte",          visible: false, order: 6, layout: "cultura", color: "#dc2626", category: "esportes" },
      { id: "cultura",    name: "Cultura",          visible: false, order: 7, layout: "cultura", color: "#0d9488", category: "cultura" },
      { id: "df",         name: "DF",               visible: false, order: 8, layout: "duplo", color: "#0b3d91", category: "cidade" },
      { id: "saude",      name: "Saúde",            visible: false, order: 9, layout: "grid", color: "#16a34a", category: "saude" },
      { id: "tecnologia", name: "Tecnologia",       visible: false, order: 10, layout: "grid", color: "#0284c7", category: "tecnologia" },
    ],
    diagram: (
      <div className="flex flex-col gap-1 w-full h-full justify-center">
        <div className="flex gap-0.5 h-5">
          <div className="flex-1 bg-current rounded opacity-45"/>
          <div className="flex-1 bg-current rounded opacity-45"/>
        </div>
        <div className="flex gap-0.5 h-3">
          {[0,1,2,3].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
        </div>
        <div className="flex gap-0.5 h-5">
          <div className="flex-[2] bg-current rounded opacity-35"/>
          <div className="flex-1 flex flex-col gap-0.5">
            {[0,1,2].map(i=><div key={i} className="flex-1 bg-current rounded opacity-20"/>)}
          </div>
        </div>
      </div>
    ),
  },
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
  reverse: boolean;
  imageUrl: string;
  linkUrl: string;
  caption: string;
  videoUrl: string;
  html: string;
  embedUrl: string;
  adSlot: string;
}

const EMPTY_FORM: BlockForm = {
  name: "", blockType: "content", format: "grid",
  categories: [], category: "politica", layout: "grid",
  source: "automatic_by_category", itemsLimit: 4,
  color: "#1d4ed8", reverse: false,
  imageUrl: "", linkUrl: "", caption: "", videoUrl: "", html: "", embedUrl: "",
  adSlot: "slot_05",
};

function blockToForm(block: HomeBlock): BlockForm {
  const d = BLOCK_DEFAULTS[block.id];
  const type = inferBlockType(block) as BlockType;
  return {
    name:          block.name,
    blockType:     type,
    format:        block.format ?? (type === "content" ? (block.layout ?? d?.layout ?? "grid") : defaultFormatForType(type)),
    categories:    block.category ? [block.category] : [],
    category:      block.category ?? d?.category ?? "geral",
    layout:        (block.layout ?? d?.layout ?? "grid") as LayoutId,
    source:        (block.source as SourceType) ?? "automatic_by_category",
    itemsLimit:    block.itemsLimit ?? 4,
    color:         block.color ?? d?.color ?? "#6b7280",
    reverse:       block.reverse ?? false,
    imageUrl:      block.imageUrl ?? "",
    linkUrl:       block.linkUrl ?? "",
    caption:       block.caption ?? "",
    videoUrl:      block.videoUrl ?? "",
    html:          block.html ?? "",
    embedUrl:      block.embedUrl ?? "",
    adSlot:        block.adSlot ?? "slot_05",
  };
}

/**
 * Único ponto que converte o formulário → campos persistidos do bloco.
 * Usado pelo auto-save, pelo "Fechar painel" e pela prévia instantânea —
 * garante que TUDO que o formulário mostra é de fato salvo e renderizado.
 */
function formToBlockPatch(f: BlockForm): Partial<HomeBlock> {
  const isContent = f.blockType === "content";
  return {
    name:       f.name,
    blockType:  f.blockType,
    format:     f.format,
    category:   f.categories[0] ?? f.category,
    layout:     (isContent ? f.layout : undefined) as HomeBlock["layout"],
    color:      f.color,
    reverse:    f.reverse,
    source:     f.source,
    itemsLimit: f.itemsLimit,
    imageUrl:   f.imageUrl.trim() || undefined,
    linkUrl:    f.linkUrl.trim() || undefined,
    caption:    f.caption.trim() || undefined,
    videoUrl:   f.videoUrl.trim() || undefined,
    html:       f.html.trim() || undefined,
    embedUrl:   f.embedUrl.trim() || undefined,
    adSlot:     f.blockType === "advertising" ? f.adSlot : undefined,
  };
}

// ─── Custom category input ────────────────────────────────────────────────────
function CustomCategoryInput({ onAdd }: { onAdd: (val: string) => void }) {
  const [val, setVal] = useState("");
  function commit() {
    const v = val.trim().toLowerCase().replace(/\s+/g, "-");
    if (!v) return;
    onAdd(v);
    setVal("");
  }
  return (
    <div className="flex gap-1 mt-1.5">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        placeholder="Outra categoria…"
        className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-[#0B2A66] bg-white placeholder:text-slate-400"
      />
      <button type="button" onClick={commit}
        className="px-2.5 py-1 rounded-lg bg-[#0B2A66] text-white text-[11px] font-semibold hover:bg-[#0a2255] transition-colors">
        +
      </button>
    </div>
  );
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
  const isHero = block.id === "hero";
  const isArticleType = ARTICLE_TYPES.has(form.blockType);
  const INPUT = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors";

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr]  = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  async function uploadBlockImage(file: File) {
    setUploading(true); setUploadErr(false);
    try {
      const r = await adminApi.uploadImage(file, block.name);
      onChange("imageUrl", r.url);
    } catch { setUploadErr(true); } finally { setUploading(false); }
  }

  // Seleção única: o site usa UMA categoria por bloco — chips agem como rádio.
  function toggleCategory(val: string) {
    onChange("categories", form.categories[0] === val ? [] : [val]);
    onChange("category", val);
  }

  return (
    <div className="px-4 pb-4 pt-3 space-y-4 border-t border-slate-100 bg-slate-50/30 rounded-b-2xl">

      {/* Nome */}
      <PanelSection label="Nome do bloco" icon={Type}>
        <input value={form.name} onChange={(e) => onChange("name", e.target.value)}
          className={INPUT} placeholder="Nome exibido na home" />
      </PanelSection>

      {/* Hero: estilo dedicado (bloco fixo de destaques) */}
      {isHero ? (
        <PanelSection label="Estilo do Hero" icon={Layers}>
          <select value={form.format} onChange={(e) => { onChange("format", e.target.value); onChange("layout", e.target.value as LayoutId); }}
            className={INPUT}>
            {HERO_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">Define como as notícias de capa são organizadas no topo da home.</p>
        </PanelSection>
      ) : !isSpecial ? (
        /* Tipo (+ formato quando o tipo tem variações reais) */
        <div className={form.blockType === "image" ? "grid grid-cols-2 gap-2" : ""}>
          <PanelSection label="Tipo">
            <select value={form.blockType}
              onChange={(e) => {
                const t = e.target.value as BlockType;
                onChange("blockType", t);
                onChange("format", defaultFormatForType(t));
              }}
              className={INPUT}>
              <option value="content">Conteúdo (artigos)</option>
              <option value="image">Imagem</option>
              <option value="carousel">Carrossel</option>
              <option value="video">Vídeo</option>
              <option value="advertising">Propaganda</option>
              <option value="list">Lista</option>
              <option value="ticker">Ticker</option>
              <option value="newsletter">Newsletter</option>
              <option value="categories">Categorias</option>
              <option value="quotes">Cotações</option>
              <option value="social">Redes Sociais</option>
              <option value="html">HTML Livre</option>
              <option value="embed">Embed</option>
              <option value="map">Mapa</option>
              <option value="sep">Separador</option>
            </select>
          </PanelSection>
          {form.blockType === "image" && (
            <PanelSection label="Formato">
              <select value={form.format} onChange={(e) => onChange("format", e.target.value)} className={INPUT}>
                {IMAGE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </PanelSection>
          )}
        </div>
      ) : null}

      {/* ── Imagem: upload/URL + link + legenda ── */}
      {!isSpecial && form.blockType === "image" && (
        <PanelSection label="Imagem" icon={FileImage}>
          {form.imageUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 mb-2 group/img">
              <img src={form.imageUrl} alt="Imagem do bloco" className="w-full h-28 object-cover" />
              <button type="button" title="Remover imagem" onClick={() => onChange("imageUrl", "")}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                <X size={12} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => imgInputRef.current?.click()} disabled={uploading}
              className="w-full border-2 border-dashed border-slate-200 rounded-xl py-5 flex flex-col items-center gap-1.5 hover:border-[#0B2A66] hover:bg-slate-50 transition-colors mb-2 disabled:opacity-60">
              {uploading
                ? <><RefreshCw size={16} className="animate-spin text-[#0B2A66]" /><span className="text-[11px] text-slate-500">Enviando…</span></>
                : <><Upload size={16} className="text-slate-400" /><span className="text-[11px] text-slate-500">Clique para enviar (JPG, PNG, WEBP)</span></>}
            </button>
          )}
          <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBlockImage(f); e.target.value = ""; }} />
          {uploadErr && <p className="text-[11px] text-red-600 mb-2">Falha no upload — tente novamente.</p>}
          <div className="space-y-1.5">
            <input value={form.imageUrl} onChange={(e) => onChange("imageUrl", e.target.value)}
              className={INPUT} placeholder="…ou cole a URL da imagem" />
            <input value={form.linkUrl} onChange={(e) => onChange("linkUrl", e.target.value)}
              className={INPUT} placeholder="Link ao clicar (opcional)" />
            <input value={form.caption} onChange={(e) => onChange("caption", e.target.value)}
              className={INPUT} placeholder="Legenda / texto (opcional)" />
          </div>
        </PanelSection>
      )}

      {/* ── Vídeo: URL YouTube/Vimeo/arquivo ── */}
      {!isSpecial && form.blockType === "video" && (
        <PanelSection label="Vídeo" icon={Play}>
          <input value={form.videoUrl} onChange={(e) => onChange("videoUrl", e.target.value)}
            className={INPUT} placeholder="URL do YouTube, Vimeo ou .mp4" />
          {form.videoUrl.trim() !== "" && !parseVideoEmbedUrl(form.videoUrl) && (
            <p className="text-[11px] text-amber-600 mt-1.5">URL não reconhecida — use um link do YouTube, Vimeo ou arquivo .mp4/.webm.</p>
          )}
        </PanelSection>
      )}

      {/* ── Propaganda: slot + gerenciar ── */}
      {!isSpecial && form.blockType === "advertising" && (
        <>
          <PanelSection label="Slot do anúncio" icon={Megaphone}>
            <select value={form.adSlot} onChange={(e) => onChange("adSlot", e.target.value)} className={INPUT}>
              {AD_SLOT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </PanelSection>
          <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3 flex items-start gap-2.5">
            <Megaphone size={14} className="text-[#D97706] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#92400E]/80 leading-relaxed mb-2">
                A arte exibida neste espaço é a do slot escolhido, cadastrada em Propagandas.
              </p>
              <a href="/admin/propagandas" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg transition-colors">
                <Upload size={11} /> Gerenciar propagandas
              </a>
            </div>
          </div>
        </>
      )}

      {/* ── HTML livre ── */}
      {!isSpecial && form.blockType === "html" && (
        <PanelSection label="Código HTML" icon={Code}>
          <textarea value={form.html} onChange={(e) => onChange("html", e.target.value)}
            rows={6} spellCheck={false}
            className={`${INPUT} font-mono text-xs resize-y`} placeholder="<div>…</div>" />
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">Scripts e eventos inline são removidos por segurança ao exibir.</p>
        </PanelSection>
      )}

      {/* ── Embed / Mapa ── */}
      {!isSpecial && (form.blockType === "embed" || form.blockType === "map") && (
        <PanelSection label={form.blockType === "map" ? "URL do mapa" : "URL do conteúdo"} icon={Frame}>
          <input value={form.embedUrl} onChange={(e) => onChange("embedUrl", e.target.value)}
            className={INPUT} placeholder={form.blockType === "map" ? "https://www.google.com/maps/embed?…" : "https://…"} />
          {form.embedUrl.trim() !== "" && !safeEmbedUrl(form.embedUrl) && (
            <p className="text-[11px] text-amber-600 mt-1.5">Use uma URL https completa.</p>
          )}
          {form.blockType === "map" && (
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">No Google Maps: Compartilhar → Incorporar um mapa → copie a URL do iframe.</p>
          )}
        </PanelSection>
      )}

      {/* ── Newsletter: chamada ── */}
      {!isSpecial && form.blockType === "newsletter" && (
        <PanelSection label="Chamada" icon={Mail}>
          <input value={form.caption} onChange={(e) => onChange("caption", e.target.value)}
            className={INPUT} placeholder="Receba as principais notícias no seu e-mail." />
        </PanelSection>
      )}

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
      {!isSpecial && form.blockType === "content" && form.layout === "cultura" && (
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

      {/* Categorias chips (fonte automática por categoria) */}
      {!isSpecial && isArticleType && form.source === "automatic_by_category" && (
        <PanelSection label="Categoria" icon={FolderOpen}>
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
            {/* Chips for custom categories not in the list */}
            {form.categories.filter(v => !CATEGORIES.find(c => c.value === v)).map((v) => (
              <button key={v} type="button" onClick={() => toggleCategory(v)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all"
                style={{ borderColor: "#0369a1", backgroundColor: "#0369a120", color: "#0369a1" }}>
                <CheckCircle size={8} />
                {v}
              </button>
            ))}
          </div>
          {/* Custom category input */}
          <CustomCategoryInput
            onAdd={(val) => {
              if (!form.categories.includes(val)) toggleCategory(val);
            }}
          />
        </PanelSection>
      )}

      {/* Fonte */}
      {!isSpecial && isArticleType && (
        <PanelSection label="Fonte dos artigos">
          <select value={form.source} onChange={(e) => onChange("source", e.target.value as SourceType)} className={INPUT}>
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </PanelSection>
      )}

      {/* Quantidade (layouts de Conteúdo definem as próprias contagens) */}
      {!isSpecial && isArticleType && form.blockType !== "content" && (
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

      {/* Cor do bloco (barra de título, chapéus e acentos) */}
      {form.blockType !== "sep" ? (
        <PanelSection label="Cor do bloco" icon={Palette}>
          <div className="flex items-center gap-2">
            <input type="color" value={form.color} onChange={(e) => onChange("color", e.target.value)}
              className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
            <input type="text" value={form.color} onChange={(e) => onChange("color", e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#0B2A66]" />
          </div>
        </PanelSection>
      ) : (
        <PanelSection label="Cor da linha" icon={Palette}>
          <div className="flex items-center gap-2">
            <input type="color" value={form.color} onChange={(e) => onChange("color", e.target.value)}
              className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
            <input type="text" value={form.color} onChange={(e) => onChange("color", e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#0B2A66]" />
          </div>
        </PanelSection>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-1">
        {/* Auto-save indicator */}
        <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-slate-400">
          {saving
            ? <><RefreshCw size={10} className="animate-spin text-[#0B2A66]" /><span className="text-[#0B2A66] font-medium">Salvando…</span></>
            : <><CheckCircle size={10} className="text-emerald-500" /><span>Alterações salvas automaticamente</span></>}
        </div>
        <button type="button" onClick={onApply}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B2A66] text-white text-sm font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">
          <CheckCircle size={13} /> Fechar painel
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
  const [saveError, setSaveError]       = useState(false);
  const [dragIdx, setDragIdx]           = useState<number | null>(null);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editForm, setEditForm]         = useState<BlockForm>(EMPTY_FORM);
  const [showAdd, setShowAdd]           = useState(false);
  const [insertAtIdx, setInsertAtIdx]   = useState<number | null>(null);
  const [previewKey, setPreviewKey]     = useState(0);
  const [tab, setTab]                   = useState<Tab>("blocks");
  const [filterTab, setFilterTab]       = useState<FilterTab>("all");
  const [responsive, setResponsive]     = useState<ResponsiveMode>("desktop");
  const [headerStyle, setHeaderStyle]   = useState<HeaderStyle>("standard");
  const [footerStyle, setFooterStyle]   = useState<FooterStyle>("dark");
  const [headerBgColor, setHeaderBgColor] = useState("#ffffff");
  const [footerBgColor, setFooterBgColor] = useState("#000000");
  const [menuTextColor, setMenuTextColor]     = useState("#6b7280");
  const [menuActiveColor, setMenuActiveColor] = useState("#c8102e");
  const [menuFontSize, setMenuFontSize]       = useState(13);
  const [menuFontWeight, setMenuFontWeight]   = useState(700);
  const [headerPaddingX, setHeaderPaddingX]   = useState(16);
  const [headerMarginTop, setHeaderMarginTop] = useState(0);
  const [showTickerBar, setShowTickerBar]     = useState(true);
  const [showHeroStrip, setShowHeroStrip]     = useState(true);
  const [logoBase64, setLogoBase64]     = useState<string | null>(null);
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);
  const [logoSize, setLogoSize]         = useState(48);
  const [logoSaving, setLogoSaving]     = useState(false);
  const [logoStatus, setLogoStatus]     = useState<"idle" | "ok" | "err">("idle");
  const [history, setHistory]           = useState<HomeBlock[][]>([]);
  const [historyIdx, setHistoryIdx]     = useState(-1);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [appliedPreset, setAppliedPreset]   = useState<string | null>(null);

  type PreviewBackup = { blocks: HomeBlock[]; headerStyle: HeaderStyle; footerStyle: FooterStyle; headerBgColor: string; footerBgColor: string };
  const [previewingPreset, setPreviewingPreset] = useState<HomeStylePreset | null>(null);
  const [previewBackup, setPreviewBackup]       = useState<PreviewBackup | null>(null);
  const [previewApplying, setPreviewApplying]   = useState(false);

  const logoInputRef  = useRef<HTMLInputElement>(null);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockRefs     = useRef<Record<string, HTMLDivElement | null>>({});
  const iframeRef     = useRef<HTMLIFrameElement>(null);
  const blocksRef     = useRef<HomeBlock[]>([]);
  const editingIdRef  = useRef<string | null>(null);
  const editFormRef   = useRef<BlockForm>(EMPTY_FORM);

  // ── Keep refs in sync with state (fixes stale-closure bugs) ────────────────
  useEffect(() => { blocksRef.current    = blocks;    }, [blocks]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { editFormRef.current  = editForm;  }, [editForm]);

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
        setMenuTextColor(r.settings.menuTextColor ?? "#6b7280");
        setMenuActiveColor(r.settings.menuActiveColor ?? "#c8102e");
        setMenuFontSize(r.settings.menuFontSize ?? 13);
        setMenuFontWeight(r.settings.menuFontWeight ?? 700);
        setHeaderPaddingX(r.settings.headerPaddingX ?? 16);
        setHeaderMarginTop(r.settings.headerMarginTop ?? 0);
        setShowTickerBar(r.settings.showTickerBar ?? true);
        setShowHeroStrip(r.settings.showHeroStrip ?? true);
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
      // Preview (iframe) montou/remontou e está pronto: reenvia o estado ATUAL dos
      // blocos ao vivo, para o preview não ficar "um passo atrás" mostrando o servidor.
      if (type === "preview:ready") {
        if (blocksRef.current.length) postAllBlocks(blocksRef.current);
        return;
      }
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
        const prev = blocksRef.current;
        const map = new Map(prev.map((b) => [b.id, b]));
        const reordered = blockIds.map((id, i) => map.has(id) ? { ...map.get(id)!, order: i } : null).filter(Boolean) as HomeBlock[];
        const rest = prev.filter((b) => !blockIds.includes(b.id));
        const next = [...reordered, ...rest];
        setBlocks(next);
        debounceSave(next);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [blocks]);

  // ── Instant preview helpers ─────────────────────────────────────────────────
  function postAllBlocks(bl: HomeBlock[]) {
    const sorted = [...bl].sort((a, b) => a.order - b.order).filter((b) => b.visible);
    iframeRef.current?.contentWindow?.postMessage({ type: "blocks:update", blocks: sorted }, "*");
  }

  function postStylePreview(hBg: string, fBg: string) {
    iframeRef.current?.contentWindow?.postMessage({ type: "style:preview", headerBgColor: hBg, footerBgColor: fBg }, "*");
  }

  // Mantém a prévia ao vivo em TODA mutação de blocos (excluir, duplicar, mover,
  // adicionar, reordenar, restaurar) sem refetch/remontagem do iframe.
  useEffect(() => {
    postAllBlocks(blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // ── History (max 20 states) ──────────────────────────────────────────────────
  function pushHistory(next: HomeBlock[]) {
    setHistory((h) => {
      const base = h.slice(0, historyIdx + 1);
      return [...base, next].slice(-20);
    });
    setHistoryIdx((i) => Math.min(i + 1, 19));
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
  const debounceSave = useCallback((newBlocks: HomeBlock[], delay = 400) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await adminApi.updateSettings({ homeBlocks: newBlocks.map((b, i) => ({ ...b, order: i })) });
        invalidateSiteCache();
        setSaved(true);
        setSaveError(false);
        // Preview já foi atualizado ao vivo via blocks:update — sem refetch (evita "recarregar" o preview)
        setTimeout(() => setSaved(false), 2000);
      } catch {
        setSaveError(true);
        setTimeout(() => setSaveError(false), 4000);
      } finally { setSaving(false); }
    }, delay);
  }, []);

  async function applyPreset(preset: HomeStylePreset) {
    setApplyingPreset(preset.id);
    try {
      const ordered = preset.blocks.map((b, i) => ({ ...b, order: i }));
      await adminApi.updateSettings({
        homeBlocks:    ordered,
        headerStyle:   preset.headerStyle,
        footerStyle:   preset.footerStyle,
        headerBgColor: preset.headerBgColor,
        footerBgColor: preset.footerBgColor,
      });
      setBlocks(ordered);
      setHeaderStyle(preset.headerStyle);
      setFooterStyle(preset.footerStyle);
      setHeaderBgColor(preset.headerBgColor);
      setFooterBgColor(preset.footerBgColor);
      pushHistory(ordered);
      invalidateSiteCache();
      // Preset altera layout de header/footer (não coberto por style:preview) —
      // remonta o iframe uma vez (ação deliberada e rara).
      setPreviewKey((k) => k + 1);
      setAppliedPreset(preset.id);
      setSaved(true);
      setTimeout(() => { setSaved(false); setAppliedPreset(null); }, 2500);
      setTab("blocks");
    } catch { } finally { setApplyingPreset(null); }
  }

  async function startPreviewPreset(preset: HomeStylePreset) {
    if (previewingPreset?.id === preset.id) return;
    setPreviewApplying(true);
    try {
      // Salva backup só na primeira vez (ao trocar de preset ainda em preview, mantém o backup original)
      const backup: PreviewBackup = previewBackup ?? { blocks, headerStyle, footerStyle, headerBgColor, footerBgColor };
      if (!previewBackup) setPreviewBackup(backup);

      const ordered = preset.blocks.map((b, i) => ({ ...b, order: i }));
      await adminApi.updateSettings({
        homeBlocks: ordered, headerStyle: preset.headerStyle,
        footerStyle: preset.footerStyle, headerBgColor: preset.headerBgColor,
        footerBgColor: preset.footerBgColor,
      });
      setBlocks(ordered);
      setHeaderStyle(preset.headerStyle);
      setFooterStyle(preset.footerStyle);
      setHeaderBgColor(preset.headerBgColor);
      setFooterBgColor(preset.footerBgColor);
      setPreviewingPreset(preset);
      invalidateSiteCache();
      setPreviewKey((k) => k + 1);
    } catch { } finally { setPreviewApplying(false); }
  }

  async function confirmPreviewPreset() {
    if (!previewingPreset) return;
    pushHistory(blocks);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setPreviewBackup(null);
    setPreviewingPreset(null);
    setTab("blocks");
  }

  async function cancelPreviewPreset() {
    if (!previewBackup) { setPreviewingPreset(null); return; }
    setPreviewApplying(true);
    try {
      await adminApi.updateSettings({
        homeBlocks: previewBackup.blocks, headerStyle: previewBackup.headerStyle,
        footerStyle: previewBackup.footerStyle, headerBgColor: previewBackup.headerBgColor,
        footerBgColor: previewBackup.footerBgColor,
      });
      setBlocks(previewBackup.blocks);
      setHeaderStyle(previewBackup.headerStyle);
      setFooterStyle(previewBackup.footerStyle);
      setHeaderBgColor(previewBackup.headerBgColor);
      setFooterBgColor(previewBackup.footerBgColor);
      invalidateSiteCache();
      setPreviewKey((k) => k + 1);
      setPreviewBackup(null);
      setPreviewingPreset(null);
    } catch { } finally { setPreviewApplying(false); }
  }

  async function saveAll() {
    setSaving(true);
    const ordered = blocks.map((b, i) => ({ ...b, order: i }));
    try {
      await adminApi.updateSettings({ homeBlocks: ordered });
      invalidateSiteCache();
      postAllBlocks(ordered);
      setSaved(true);
      setSaveError(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
    } finally { setSaving(false); }
  }

  // Salva um pedaço arbitrário das settings (estilo de menu, toggles) e pede ao
  // preview (iframe) para rebuscar /api/site — o Header/Hero remontam in-place,
  // sem recarregar o iframe inteiro.
  async function saveSettingsPatch(patch: Parameters<typeof adminApi.updateSettings>[0]) {
    setSaving(true);
    try {
      await adminApi.updateSettings(patch);
      invalidateSiteCache();
      iframeRef.current?.contentWindow?.postMessage({ type: "settings:refresh" }, "*");
      setSaved(true); setSaveError(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
    } finally { setSaving(false); }
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
    pushHistory(next); setBlocks(next);
    postAllBlocks(next);
    debounceSave(next);
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
    setEditingId(clone.id);
    setEditForm(blockToForm(clone));
  }

  function moveBlockUp(idx: number) {
    if (idx <= 0) return;
    const next = [...blocks];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    const ordered = next.map((b, i) => ({ ...b, order: i }));
    pushHistory(ordered); setBlocks(ordered); debounceSave(ordered);
  }

  function moveBlockDown(idx: number) {
    if (idx >= blocks.length - 1) return;
    const next = [...blocks];
    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
    const ordered = next.map((b, i) => ({ ...b, order: i }));
    pushHistory(ordered); setBlocks(ordered); debounceSave(ordered);
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
  function handleDragEnd() {
    setDragIdx(null);
    postAllBlocks(blocksRef.current);
    debounceSave(blocksRef.current);
    pushHistory(blocksRef.current);
  }

  // ── Edit block ──────────────────────────────────────────────────────────────
  function openEdit(block: HomeBlock) {
    if (editingId === block.id) { setEditingId(null); return; }
    setEditingId(block.id);
    setEditForm(blockToForm(block));
    // Notify iframe to highlight + scroll to this block
    iframeRef.current?.contentWindow?.postMessage({ type: "block:select", blockId: block.id }, "*");
  }

  // Live debounced form change (uses refs to avoid stale-closure bugs)
  function handleFormChange<K extends keyof BlockForm>(key: K, val: BlockForm[K]) {
    const nextForm = { ...editFormRef.current, [key]: val };
    // Mantém o ref em sincronia AGORA (não só no useEffect) para que chamadas
    // sequenciais no mesmo evento — ex.: onChange("format") + onChange("layout")
    // do seletor de formato — não leiam um estado antigo e se sobrescrevam.
    editFormRef.current = nextForm;
    setEditForm(nextForm);
    // ── Instant preview: push block state to iframe immediately (no debounce) ──
    const previewId = editingIdRef.current;
    if (previewId) {
      const base = blocksRef.current.find((b) => b.id === previewId);
      iframeRef.current?.contentWindow?.postMessage({
        type: "block:preview",
        block: { ...(base ?? { id: previewId, visible: true, order: 0 }), ...formToBlockPatch(nextForm), id: previewId },
      }, "*");
    }
    // Optimistic update name in block list immediately
    if (key === "name") {
      const id = editingIdRef.current;
      if (id) setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, name: val as string } : b));
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const id = editingIdRef.current;
      if (!id) return;
      const patch = formToBlockPatch(editFormRef.current);
      const updated = blocksRef.current.map((b) => b.id === id ? { ...b, ...patch } : b) as HomeBlock[];
      // Update state so the list reflects latest changes immediately
      setBlocks(updated);
      debounceSave(updated);
    }, 200);
  }

  function applyAndSave(id: string) {
    // Changes are already auto-saved via handleFormChange debounce.
    // Just flush any pending debounce, update history and close the panel.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const patch = formToBlockPatch(editFormRef.current);
    const next = blocksRef.current.map((b) => b.id === id ? { ...b, ...patch } : b) as HomeBlock[];
    setBlocks(next);
    pushHistory(next);
    setEditingId(null);
    debounceSave(next, 0);
  }

  // ── Add block ───────────────────────────────────────────────────────────────
  function addBlockFromType(type: string, name: string) {
    // O tipo é PERSISTIDO no bloco (blockType) — o site renderiza imagem como
    // imagem, carrossel como carrossel etc. (antes só existia o prefixo do id).
    const newBlock: HomeBlock = {
      id: `${type}-${Date.now()}`, name, visible: true, order: blocks.length, custom: true,
      blockType: type,
      format: defaultFormatForType(type),
      ...(type === "content"     ? { layout: "grid" as const, category: "politica", source: "automatic_by_category", itemsLimit: 4 } : {}),
      ...(type === "carousel" || type === "ticker" ? { source: "latest", itemsLimit: 8 } : {}),
      ...(type === "list"        ? { source: "latest", itemsLimit: 6 } : {}),
      ...(type === "advertising" ? { adSlot: "slot_05" } : {}),
    };
    let next: HomeBlock[];
    if (insertAtIdx !== null) {
      next = [...blocks.slice(0, insertAtIdx + 1), newBlock, ...blocks.slice(insertAtIdx + 1)].map((b, i) => ({ ...b, order: i }));
    } else {
      next = [...blocks, newBlock];
    }
    setBlocks(next); pushHistory(next); setShowAdd(false); setInsertAtIdx(null); debounceSave(next);
    setEditingId(newBlock.id);
    setEditForm(blockToForm(newBlock));
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
      <div className="flex flex-col h-full overflow-hidden bg-[#F8FAFC]">

        {/* ══ Top action bar ═══════════════════════════════════════════════════ */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3 bg-white border-b border-[#E2E8F0]">
          <div className="min-w-0">
            <h1 className="text-[15px] font-black text-[#0F172A]">Blocos da Home</h1>
            <p className="hidden md:block text-[12px] text-[#64748B] mt-0.5">Gerencie, ordene e edite os blocos que aparecem na página inicial.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                <CheckCircle size={13} /> Salvo
              </span>
            )}
            {saveError && (
              <span className="flex items-center gap-1.5 text-xs text-red-600 font-semibold bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
                Erro ao salvar — tente novamente
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
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>

        {/* ══ Tabs ════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 flex overflow-x-auto border-b border-[#E2E8F0] bg-white px-4 md:px-6">
          {(["styles","blocks","header","footer","settings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setShowAdd(false); }}
              className={`px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px ${
                tab === t ? "text-[#0B2A66] border-[#0B2A66]" : "text-[#64748B] border-transparent hover:text-[#0F172A]"
              }`}>
              {t === "styles" ? "Estilos" : t === "blocks" ? "Blocos" : t === "header" ? "Cabeçalho" : t === "footer" ? "Rodapé" : "Configurações"}
            </button>
          ))}
        </div>

        {/* ══ Main ════════════════════════════════════════════════════════════ */}
        {/* Em telas < lg o painel e a prévia empilham (painel em cima, prévia embaixo) */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

          {/* ── Left panel ──────────────────────────────────────────────────── */}
          <div className="w-full lg:w-[320px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white overflow-hidden max-h-[48vh] lg:max-h-none">

            {/* ── STYLES tab ── */}
            {tab === "styles" && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* ── Preview mode banner ── */}
                {previewingPreset ? (
                  <div className="shrink-0 px-4 py-3 border-b border-[#0B2A66]/20" style={{ backgroundColor: previewingPreset.accentColor }}>
                    <div className="flex items-center gap-2 mb-2">
                      <EyeIcon size={13} className="text-white/80 shrink-0" />
                      <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Visualizando</span>
                    </div>
                    <p className="text-[14px] font-black text-white mb-3">{previewingPreset.name}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelPreviewPreset} disabled={previewApplying}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors disabled:opacity-50">
                        {previewApplying ? <RefreshCw size={11} className="animate-spin" /> : <Undo2 size={11} />}
                        Desfazer
                      </button>
                      <button
                        onClick={confirmPreviewPreset} disabled={previewApplying}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold bg-white hover:bg-white/90 rounded-xl transition-colors disabled:opacity-50"
                        style={{ color: previewingPreset.accentColor }}>
                        <CheckCircle size={11} /> Aplicar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#E2E8F0]">
                    <span className="text-[13px] font-bold text-[#0F172A]">Estilos da Home</span>
                    <p className="text-[11px] text-[#64748B] mt-0.5">Escolha um dos 5 estilos prontos. Clique em <strong>Visualizar</strong> para ver no preview ao lado.</p>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  <div className="px-3 py-3 space-y-2">
                    {HOME_STYLE_PRESETS.map((preset) => {
                      const isApplying = applyingPreset === preset.id;
                      const wasApplied = appliedPreset === preset.id;
                      const isPreviewing = previewingPreset?.id === preset.id;
                      return (
                        <div key={preset.id}
                          className="rounded-2xl border-2 bg-white overflow-hidden transition-all"
                          style={{
                            borderColor: isPreviewing ? preset.accentColor : "#E2E8F0",
                            boxShadow: isPreviewing ? `0 0 0 3px ${preset.accentColor}22` : "0 2px 8px rgba(15,23,42,0.04)",
                          }}>
                          {isPreviewing && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ backgroundColor: preset.accentColor + "12" }}>
                              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: preset.accentColor }} />
                              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: preset.accentColor }}>
                                Visualizando agora
                              </span>
                            </div>
                          )}
                          {/* min-h (não h fixo): altura cresce com o conteúdo — botões nunca cortados */}
                          <div className="flex gap-0 min-h-[108px]">
                            {/* Color accent + diagram */}
                            <div className="w-[72px] shrink-0 flex items-center justify-center p-2.5 rounded-l-2xl self-stretch" style={{ backgroundColor: preset.accentColor + "18", color: preset.accentColor }}>
                              <div className="w-full h-full max-h-[96px]">
                                {preset.diagram}
                              </div>
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[13px] font-bold text-[#0F172A]">{preset.name}</span>
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                                    style={{ backgroundColor: preset.tagBg, color: preset.tagColor }}>
                                    {preset.tag}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#64748B] leading-snug">{preset.desc}</p>
                                <div className="flex gap-1 mt-1.5">
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-md">
                                    {preset.headerStyle === "standard" ? "⊞ Padrão" : preset.headerStyle === "compact" ? "— Compacto" : "⊟ Centralizado"}
                                  </span>
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-md">
                                    {preset.footerStyle === "dark" ? "🌑 Escuro" : preset.footerStyle === "light" ? "☀ Claro" : "— Minimal"}
                                  </span>
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-md">
                                    {preset.blocks.filter(b => b.visible).length} blocos
                                  </span>
                                </div>
                              </div>

                              {isPreviewing ? (
                                <div className="flex gap-1.5 mt-1.5">
                                  <button
                                    onClick={cancelPreviewPreset} disabled={previewApplying}
                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
                                    <Undo2 size={10} /> Desfazer
                                  </button>
                                  <button
                                    onClick={confirmPreviewPreset} disabled={previewApplying}
                                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold text-white rounded-xl transition-colors disabled:opacity-50"
                                    style={{ backgroundColor: preset.accentColor }}>
                                    <CheckCircle size={10} /> Aplicar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startPreviewPreset(preset)}
                                  disabled={previewApplying || !!isApplying}
                                  className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-bold rounded-xl border transition-colors disabled:opacity-50"
                                  style={{
                                    borderColor: wasApplied ? "#16a34a" : preset.accentColor + "50",
                                    color:       wasApplied ? "#16a34a" : preset.accentColor,
                                    backgroundColor: wasApplied ? "#f0fdf4" : preset.accentColor + "08",
                                  }}>
                                  {isApplying ? (
                                    <><RefreshCw size={11} className="animate-spin" /> Aplicando…</>
                                  ) : wasApplied ? (
                                    <><CheckCircle size={11} /> Aplicado!</>
                                  ) : previewApplying ? (
                                    <><RefreshCw size={11} className="animate-spin" /> Carregando…</>
                                  ) : (
                                    <><EyeIcon size={11} /> Visualizar</>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!previewingPreset && (
                    <div className="px-4 pb-4">
                      <div className="flex items-start gap-2.5 p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl">
                        <Palette size={13} className="text-[#D97706] mt-0.5 shrink-0" />
                        <p className="text-[11px] text-[#92400E] leading-relaxed">
                          Visualize antes de aplicar. Ao aplicar, os blocos, cabeçalho e rodapé serão substituídos. Use <strong>Desfazer</strong> para voltar.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

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

                <div className="flex-1 overflow-y-auto px-3 py-3">
                  {loading ? (
                    <div className="text-center py-16 text-[#64748B] text-sm">Carregando…</div>
                  ) : filteredBlocks.length === 0 ? (
                    <div className="text-center py-16 text-[#64748B] text-sm">Nenhum bloco {filterTab === "visible" ? "visível" : "oculto"}</div>
                  ) : filteredBlocks.map((block, bIdx) => {
                    const realIdx  = blocks.findIndex((b) => b.id === block.id);
                    const isEditing  = editingId === block.id;
                    const isDragging = dragIdx === realIdx;
                    const meta = BLOCK_META[block.id] ?? TYPE_META[inferBlockType(block)] ?? DEFAULT_META;

                    return (
                      <React.Fragment key={block.id}>
                        {/* ── Insert-here separator (between blocks) ── */}
                        {bIdx > 0 && (
                          <div className="group/ins flex items-center gap-1 my-0.5 px-1 h-5">
                            <div className="flex-1 h-px bg-[#E2E8F0] group-hover/ins:bg-[#0B2A66]/20 transition-colors" />
                            <button
                              title="Inserir bloco aqui"
                              onClick={(e) => { e.stopPropagation(); setInsertAtIdx(realIdx - 1); setShowAdd(true); }}
                              className="opacity-0 group-hover/ins:opacity-100 transition-opacity flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-[#0B2A66] bg-[#EFF6FF] border border-[#0B2A66]/20 hover:bg-[#0B2A66] hover:text-white hover:border-[#0B2A66] whitespace-nowrap">
                              <Plus size={9} /> Inserir
                            </button>
                            <div className="flex-1 h-px bg-[#E2E8F0] group-hover/ins:bg-[#0B2A66]/20 transition-colors" />
                          </div>
                        )}

                        <div
                          ref={(el) => { blockRefs.current[block.id] = el; }}
                          draggable={!isEditing}
                          onDragStart={() => handleDragStart(realIdx)}
                          onDragOver={(e) => handleDragOver(e, realIdx)}
                          onDragEnd={handleDragEnd}
                          className={`group/block rounded-2xl border bg-white transition-all select-none mb-1.5
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

                            {/* ── Inline quick-actions (visible on hover) ── */}
                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/block:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <button
                                title="Mover para cima"
                                disabled={realIdx === 0}
                                onClick={() => moveBlockUp(realIdx)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0B2A66] hover:bg-[#EFF6FF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                <ChevronUp size={13} />
                              </button>
                              <button
                                title="Mover para baixo"
                                disabled={realIdx === blocks.length - 1}
                                onClick={() => moveBlockDown(realIdx)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#0B2A66] hover:bg-[#EFF6FF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                <ChevronDown size={13} />
                              </button>
                              <button
                                title="Duplicar bloco"
                                onClick={() => duplicateBlock(block.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#7C3AED] hover:bg-[#EDE9FE] transition-colors">
                                <Copy size={12} />
                              </button>
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
                      </React.Fragment>
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
                    <input type="color" value={headerBgColor}
                      onInput={(e) => { const c = (e.target as HTMLInputElement).value; setHeaderBgColor(c); postStylePreview(c, footerBgColor); }}
                      onChange={(e) => setHeaderBgColor(e.target.value)}
                      className="w-10 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                    <input type="text" value={headerBgColor} onChange={(e) => { setHeaderBgColor(e.target.value); postStylePreview(e.target.value, footerBgColor); }}
                      className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                    <button onClick={() => saveHeaderFooter(headerStyle, footerStyle, headerBgColor)}
                      className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">OK</button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {["#ffffff","#f8fafc","#f1f5f9","#0B2A66","#E71D36","#18181b"].map((c) => (
                      <button key={c} type="button" onClick={() => { setHeaderBgColor(c); postStylePreview(c, footerBgColor); }}
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

                {/* ── Estilo do menu ── */}
                <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"><Type size={12} /> Estilo do menu</p>
                  <p className="text-[11px] text-[#94A3B8] -mt-1">Tamanho, peso e cor do item ativo valem para todos os estilos de cabeçalho. A <b>cor do texto</b> aplica-se aos estilos de fundo claro (Padrão e Compacto); no Centralizado o texto fica branco sobre a barra escura.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-medium text-[#64748B] mb-1.5">Cor do texto</p>
                      <div className="flex gap-2">
                        <input type="color" value={menuTextColor} onChange={(e) => setMenuTextColor(e.target.value)}
                          className="w-9 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                        <input type="text" value={menuTextColor} onChange={(e) => setMenuTextColor(e.target.value)}
                          className="flex-1 min-w-0 border border-[#E2E8F0] rounded-xl px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[#64748B] mb-1.5">Cor do item ativo</p>
                      <div className="flex gap-2">
                        <input type="color" value={menuActiveColor} onChange={(e) => setMenuActiveColor(e.target.value)}
                          className="w-9 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                        <input type="text" value={menuActiveColor} onChange={(e) => setMenuActiveColor(e.target.value)}
                          className="flex-1 min-w-0 border border-[#E2E8F0] rounded-xl px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-[#64748B]">Tamanho da fonte</p>
                      <span className="text-xs font-bold text-[#0B2A66]">{menuFontSize}px</span>
                    </div>
                    <input type="range" min={11} max={18} step={1} value={menuFontSize}
                      onChange={(e) => setMenuFontSize(Number(e.target.value))} className="w-full accent-[#0B2A66]" />
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-[#64748B] mb-1.5">Peso da fonte</p>
                    <select value={menuFontWeight} onChange={(e) => setMenuFontWeight(Number(e.target.value))}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20">
                      <option value={400}>Normal</option>
                      <option value={500}>Médio</option>
                      <option value={600}>Seminegrito</option>
                      <option value={700}>Negrito</option>
                      <option value={800}>Extra-negrito</option>
                    </select>
                  </div>

                  {/* Mini prévia */}
                  <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ backgroundColor: headerBgColor }}>
                    <span style={{ color: menuActiveColor, fontSize: menuFontSize, fontWeight: menuFontWeight }}>HOME</span>
                    <span style={{ color: menuTextColor, fontSize: menuFontSize, fontWeight: menuFontWeight }}>POLÍTICA</span>
                    <span style={{ color: menuTextColor, fontSize: menuFontSize, fontWeight: menuFontWeight }}>ECONOMIA</span>
                  </div>

                  <button onClick={() => saveSettingsPatch({ menuTextColor, menuActiveColor, menuFontSize, menuFontWeight })} disabled={saving}
                    className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                    <Save size={13} /> Salvar estilo do menu
                  </button>
                </div>

                {/* ── Margem do cabeçalho ── */}
                <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"><Type size={12} /> Margem do cabeçalho</p>
                  <p className="text-[11px] text-[#94A3B8] -mt-1">Afasta o conteúdo das bordas para ele não ficar colado nos limites do site.</p>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-[#64748B]">Margem lateral (esq./dir.)</p>
                      <span className="text-xs font-bold text-[#0B2A66]">{headerPaddingX}px</span>
                    </div>
                    <input type="range" min={8} max={64} step={2} value={headerPaddingX}
                      onChange={(e) => setHeaderPaddingX(Number(e.target.value))}
                      onMouseUp={() => saveSettingsPatch({ headerPaddingX })}
                      onTouchEnd={() => saveSettingsPatch({ headerPaddingX })}
                      className="w-full accent-[#0B2A66]" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-[#64748B]">Margem superior (topo)</p>
                      <span className="text-xs font-bold text-[#0B2A66]">{headerMarginTop}px</span>
                    </div>
                    <input type="range" min={0} max={48} step={2} value={headerMarginTop}
                      onChange={(e) => setHeaderMarginTop(Number(e.target.value))}
                      onMouseUp={() => saveSettingsPatch({ headerMarginTop })}
                      onTouchEnd={() => saveSettingsPatch({ headerMarginTop })}
                      className="w-full accent-[#0B2A66]" />
                  </div>
                  <button onClick={() => saveSettingsPatch({ headerPaddingX, headerMarginTop })} disabled={saving}
                    className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                    <Save size={13} /> Salvar margem
                  </button>
                </div>

                {/* ── Barra de cotação e strip de destaques ── */}
                <div className="border-t border-[#E2E8F0] pt-4 space-y-2.5">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"><CircleDollarSign size={12} /> Barra abaixo do cabeçalho</p>
                  <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0]">
                    <div>
                      <p className="text-[13px] font-semibold text-[#0F172A]">Barra de cotações</p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">Faixa rolante de moedas e cripto (USD · EUR · BTC…)</p>
                    </div>
                    <Toggle checked={showTickerBar} onChange={() => { const v = !showTickerBar; setShowTickerBar(v); saveSettingsPatch({ showTickerBar: v }); }} />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0]">
                    <div>
                      <p className="text-[13px] font-semibold text-[#0F172A]">Strip de destaques</p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">Tira de 4 notícias secundárias abaixo do Hero</p>
                    </div>
                    <Toggle checked={showHeroStrip} onChange={() => { const v = !showHeroStrip; setShowHeroStrip(v); saveSettingsPatch({ showHeroStrip: v }); }} />
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
                    <input type="color" value={footerBgColor}
                      onInput={(e) => { const c = (e.target as HTMLInputElement).value; setFooterBgColor(c); postStylePreview(headerBgColor, c); }}
                      onChange={(e) => setFooterBgColor(e.target.value)}
                      className="w-10 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                    <input type="text" value={footerBgColor} onChange={(e) => { setFooterBgColor(e.target.value); postStylePreview(headerBgColor, e.target.value); }}
                      className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                    <button onClick={() => saveHeaderFooter(headerStyle, footerStyle, undefined, footerBgColor)}
                      className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">OK</button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {["#000000","#18181b","#0f172a","#1e293b","#ffffff","#f8fafc"].map((c) => (
                      <button key={c} type="button" onClick={() => { setFooterBgColor(c); postStylePreview(headerBgColor, c); }}
                        className={`w-6 h-6 rounded-lg border-2 transition-all ${footerBgColor === c ? "border-[#0B2A66] scale-110" : "border-[#E2E8F0] hover:border-[#94A3B8]"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>

                {/* ── Conteúdo do rodapé (textos, links, redes, contato…) ── */}
                <div className="border-t border-[#E2E8F0] pt-4">
                  <FooterEditor saving={saving}
                    onSave={(cfg) => saveSettingsPatch({ footerConfig: cfg })} />
                </div>
              </div>
            )}

            {/* ── SETTINGS tab ── */}
            {tab === "settings" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3 flex items-start gap-2.5">
                  <Info size={14} className="text-[#2563EB] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#1e40af] leading-relaxed">
                    Aparência da home: abas <b>Estilos</b>, <b>Cabeçalho</b> e <b>Rodapé</b>.
                    A barra de cotações e o strip de destaques ficam na aba <b>Cabeçalho</b>.
                    Os atalhos abaixo levam às telas onde cada ajuste é salvo.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Atalhos</p>
                  <div className="space-y-2">
                    {[
                      { href: "/admin/configuracoes", Icon: Settings,      label: "SEO, analytics & integrações", desc: "Descrição, GA4, Pixel, GTM, favicon" },
                      { href: "/admin/menu",          Icon: AlignJustify,  label: "Menu & navegação",             desc: "Itens, ordem e visibilidade do menu" },
                      { href: "/admin/analytics",     Icon: BarChart3,     label: "Estatísticas de acesso",       desc: "Visitas, páginas e dispositivos" },
                    ].map(({ href, Icon: ItemIcon, label, desc }) => (
                      <a key={href} href={href} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#0B2A66] transition-colors group">
                        <span className="w-8 h-8 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0"><ItemIcon size={15} className="text-[#64748B]" /></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#0F172A] group-hover:text-[#0B2A66]">{label}</p>
                          <p className="text-[10px] text-[#94A3B8] truncate">{desc}</p>
                        </div>
                        <ChevronRight size={14} className="text-[#CBD5E1] group-hover:text-[#0B2A66] shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ações</p>
                  <button onClick={() => { if (!confirm("Restaurar blocos padrão? Isso removerá blocos personalizados.")) return; setBlocks(DEFAULT_BLOCKS); pushHistory(DEFAULT_BLOCKS); debounceSave(DEFAULT_BLOCKS); setTab("blocks"); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium text-[#64748B] border border-[#E2E8F0] rounded-xl hover:text-[#0B2A66] hover:bg-[#F8FAFC] transition-colors">
                    <RotateCcw size={13} /> Restaurar blocos padrão
                  </button>
                  <a href="/" target="_blank" rel="noopener noreferrer"
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium text-[#64748B] border border-[#E2E8F0] rounded-xl hover:text-[#0B2A66] hover:bg-[#F8FAFC] transition-colors">
                    <ExternalLink size={13} /> Abrir site
                  </a>
                </div>
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
                <div className="px-4 md:px-6 py-5 space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
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
