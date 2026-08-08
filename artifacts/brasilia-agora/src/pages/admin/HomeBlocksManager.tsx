import React, { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock, type HomeTemplate, type MenuItem } from "../../lib/adminApi";
import { articlesUrl } from "../../lib/articlesQuery";
import { useCan } from "../../lib/permissionsCache";
import { invalidateSiteCache } from "../../hooks/useSite";
import { inferBlockType, defaultFormatForType, parseVideoEmbedUrl, safeEmbedUrl, categoriesBlockSource, type TemplateMenuItem, type CategoryBlockItem } from "../../lib/homeBlocks";
import { categoryIcon, hasCategoryIcon } from "../../lib/categoryIcons";
import { FONT_OPTIONS, FONT_GROUP_LABELS, fontCss, ensureFontLoaded, type FontOption } from "../../lib/fonts";
import type { FooterConfig } from "../../lib/footerConfig";
import FooterEditor from "./FooterEditor";
import {
  GripVertical, Eye, EyeOff, Plus, Trash2, ChevronDown,
  CheckCircle, RefreshCw, Save, LayoutGrid, X,
  Upload, Minus, ImageIcon, Monitor, Tablet, Smartphone, ExternalLink,
  Undo2, Redo2, FileText, Image, GalleryHorizontal, Play, Megaphone,
  List, Radio, Mail, FolderOpen, CircleDollarSign, Share2,
  Code, Frame, Map as MapIcon, Settings, Info, RotateCcw, Copy, Search,
  Newspaper, Users, AlignJustify, Globe, Flame,
  Trophy, Building2, Heart, Cpu, Star, BarChart3,
  Type, Palette, Eye as EyeIcon, FileImage,
  ChevronRight, ChevronUp, Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type BlockType = "content" | "image" | "carousel" | "video" | "advertising" | "list" | "ticker" | "newsletter" | "categories" | "weather" | "quotes" | "social" | "html" | "table" | "counter" | "sep" | "map" | "embed" | "search";
type LayoutId = "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico" | "trio" | "compact" | "bigstory" | "timeline" | "portal" | "overlay" | "magazine" | "mini" | "hero";
/** "menu"/"html" só valem no bloco Categorias (origem da navegação). */
type SourceType = "automatic_by_category" | "most_read" | "latest" | "manual" | "rss" | "perplexity" | "menu" | "html";
type HeaderStyle = "standard" | "compact" | "centered";
type FooterStyle = "dark" | "light" | "minimal";
type Tab = "blocks" | "templates" | "header" | "footer" | "settings" | "article";

// ── Página de notícia: lateral padrão + classe de input do editor ────────────
const DEFAULT_ARTICLE_SIDEBAR_BLOCKS: HomeBlock[] = [
  { id: "mostread",           name: "Mais Lidas",        visible: true, order: 0, blockType: "mostread" },
  { id: "advertising-artigo", name: "Propaganda (slot)", visible: true, order: 1, custom: true, blockType: "advertising", adSlot: "slot_07" },
];
const AINPUT = "w-full border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 bg-white";

// Propagandas cadastradas (aba Propagandas) para seleção direta nos blocos de
// anúncio — cache de módulo: 1 fetch por sessão do painel.
let _adsListCache: { id: string; name: string }[] | null = null;
function useAdsList(enabled: boolean): { id: string; name: string }[] {
  const [list, setList] = useState<{ id: string; name: string }[]>(_adsListCache ?? []);
  useEffect(() => {
    if (!enabled || _adsListCache) return;
    adminApi.getAds()
      .then((r) => {
        _adsListCache = r.ads.map((a) => ({ id: a.id, name: a.name }));
        setList(_adsListCache);
      })
      .catch(() => {});
  }, [enabled]);
  return list;
}
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
  { type: "search" as BlockType,      name: "Busca",        desc: "Campo de busca funcional do site.",    Icon: Search,            iconBg: "#EFF6FF", iconColor: "#0EA5E9" },
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
  search:      { tag: "BUSCA",      tagColor: "#075985", tagBg: "#E0F2FE", Icon: Search,            iconBg: "#EFF6FF", iconColor: "#0EA5E9" },
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

// ─── Redes dos botões de compartilhar da página de notícia ────────────────────
const SHARE_NETWORK_OPTIONS: { value: string; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "twitter",  label: "X (Twitter)" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "copy",     label: "Copiar link" },
];

// ─── Tipos de bloco com artigos (mostram fonte/categoria/quantidade) ─────────
const ARTICLE_TYPES = new Set<BlockType>(["content", "carousel", "list", "ticker"]);

// ─── Estilos do Hero (bloco fixo de destaques) ────────────────────────────────
const HERO_FORMATS: { value: string; label: string }[] = [
  { value: "grid",     label: "3 cards + tira" },
  { value: "featured", label: "1 grande + lista" },
  { value: "mosaico",  label: "Mosaico (1 + 4)" },
  { value: "portal",   label: "Portal (1 grande + 3 laterais)" },
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
  { id: "overlay",  label: "Overlay",   desc: "Título sobre a foto", mini: <div className="flex gap-0.5 w-full">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-4 bg-current rounded-sm opacity-40 flex flex-col justify-end p-0.5"><div className="h-1 bg-current rounded-sm opacity-60"/></div>)}</div> },
  { id: "magazine", label: "Magazine",  desc: "1 capa + 4 cards", mini: <div className="flex flex-col gap-0.5 w-full"><div className="w-full h-2.5 bg-current rounded-sm opacity-40"/><div className="flex gap-0.5">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-1.5 bg-current rounded-sm opacity-25"/>)}</div></div> },
  { id: "mini",     label: "Cards Revista", desc: "Fileira de mini cards", mini: <div className="flex gap-0.5 w-full">{[0,1,2,3,4].map(i=><div key={i} className="flex-1 flex flex-col gap-0.5"><div className="h-2 bg-current rounded-sm opacity-40"/><div className="h-1 w-2/3 bg-current rounded-full opacity-50"/><div className="h-1 bg-current rounded opacity-25"/></div>)}</div> },
  { id: "hero",     label: "Hero Revista",  desc: "Boas-vindas + busca + destaques", mini: <div className="flex gap-0.5 w-full"><div className="flex-1 flex flex-col gap-0.5 justify-center"><div className="h-1 w-2/3 bg-current rounded opacity-40"/><div className="h-1 bg-current rounded opacity-25"/><div className="h-1.5 bg-current rounded-full opacity-40"/></div><div className="flex-[2] h-4 bg-current rounded-sm opacity-40"/><div className="flex-1 flex flex-col gap-0.5">{[0,1].map(i=><div key={i} className="flex-1 bg-current rounded-sm opacity-25"/>)}</div></div> },
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

// ─── Templates prontos (aba Templates) ────────────────────────────────────────
// Modelos embutidos no painel: aparecem sempre na aba Templates e não podem ser
// excluídos. O "KSports" segue o mockup do portal esportivo EN + o brandbook do
// KBET (parceiro dos banners): dark blue #0e0d2a como base (top bar/hero/footer),
// K-Pink #ff2b74 como acento (menu ativo, badges, TRENDING, botões) e gradientes
// rosa→roxo→azul nos banners (CSS puro — troque pela arte real quando tiver).
// Arranjo: top bar escura (data + trending + redes) → banner KBET → zona hero
// (portal | Most Read + Latest News + partner card) → ticker TRENDING NOW →
// banner de bônus → Recent News em grade → pares Football|NFL e Formula 1|
// e-Sports em meia largura → rodapé dark blue com Navigation/Institutional +
// newsletter. Aplicar instala menu/rodapé E configura o site em EN/UTC
// (Desfazer restaura tudo, inclusive o idioma).
const KSPORTS_DARK   = "#0e0d2a"; // Dark blue (base do brandbook)
const KSPORTS_PINK   = "#ff2b74"; // K-Pink (acento principal)
const KSPORTS_PURPLE = "#6600b8"; // K-Purple (badges secundárias/gradiente)
const KSPORTS_BLUE2  = "#060062"; // Blue Secondary (gradientes)

// Marca do parceiro (KBET) em texto puro — o PNG branco oficial pode substituir
// depois (upload no Storage e editar o HTML do bloco).
const KSPORTS_AD_BRAND = `<span style="font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;">K<span style="color:${KSPORTS_PINK};">BET</span></span>`;
const KSPORTS_AD_BG = `border:1px solid #232145;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(255,43,116,.42), transparent 42%), radial-gradient(circle at 10% 60%, rgba(102,0,184,.55), transparent 46%), linear-gradient(135deg, ${KSPORTS_DARK}, ${KSPORTS_BLUE2} 60%, ${KSPORTS_DARK});`;

// Banner de bônus (largura total, entre o ticker e o Recent News).
// flex-wrap + justify center: no celular as três peças empilham em vez de
// espremer o texto central (que estouraria a largura da tela).
const KSPORTS_AD_BONUS = `<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;${KSPORTS_AD_BG}">
  ${KSPORTS_AD_BRAND}
  <span style="flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;"><span style="font-size:20px;font-weight:900;font-style:italic;letter-spacing:.02em;">EXCLUSIVE <span style="color:${KSPORTS_PINK};">BONUSES</span></span><br/><span style="font-size:13px;font-weight:600;color:#c9c7e8;">FOR THE KSPORTS COMMUNITY</span></span>
  <span style="background:${KSPORTS_PINK};color:#ffffff;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;">GET STARTED</span>
</div>`;

// Banner compacto do parceiro ao lado da logo no cabeçalho (linha de ~64px,
// como no mockup). Só aparece em telas lg+ (o Header esconde no mobile).
const KSPORTS_AD_HEADER = `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;${KSPORTS_AD_BG}">
  <span style="font-style:italic;font-weight:900;font-size:19px;letter-spacing:.04em;color:#ffffff;">K<span style="color:${KSPORTS_PINK};">BET</span></span>
  <span style="flex:1;text-align:center;color:#ffffff;line-height:1.15;"><span style="font-size:15px;font-weight:900;font-style:italic;letter-spacing:.02em;">BET. WIN. <span style="color:${KSPORTS_PINK};">REPEAT.</span></span><br/><span style="font-size:10px;font-weight:600;color:#c9c7e8;">THE OFFICIAL PARTNER OF KSPORTS</span></span>
  <span style="background:${KSPORTS_PINK};color:#ffffff;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;">BET NOW</span>
</div>`;

// Card lateral do parceiro (ao lado do grid "Recent News", como no mockup).
const KSPORTS_AD_BOX = `<div style="max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;${KSPORTS_AD_BG}">
  <div style="color:#c9c7e8;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;">OFFICIAL PARTNER</div>
  <div style="margin-bottom:12px;">${KSPORTS_AD_BRAND}</div>
  <div style="color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;">THE BEST ODDS<br/>ON ALL SPORTS</div>
  <div style="display:inline-block;background:${KSPORTS_PINK};color:#ffffff;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;">BET NOW</div>
</div>`;

// Menu do KSports (decidido com o usuário) — os paths são os slugs de categoria
// usados também no targetCategory das regras do painel central (F4/F5).
const KSPORTS_MENU: TemplateMenuItem[] = [
  { id: "ks-menu-home",       label: "HOME",       path: "/",           order: 0, visible: true },
  { id: "ks-menu-worldcup",   label: "WORLD CUP",  path: "/world-cup",  order: 1, visible: true },
  { id: "ks-menu-football",   label: "FOOTBALL",   path: "/football",   order: 2, visible: true },
  { id: "ks-menu-volleyball", label: "VOLLEYBALL", path: "/volleyball", order: 3, visible: true },
  { id: "ks-menu-tennis",     label: "TENNIS",     path: "/tennis",     order: 4, visible: true },
  { id: "ks-menu-f1",         label: "FORMULA 1",  path: "/formula-1",  order: 5, visible: true },
  { id: "ks-menu-nfl",        label: "NFL",        path: "/nfl",        order: 6, visible: true },
  { id: "ks-menu-esports",    label: "E-SPORTS",   path: "/esports",    order: 7, visible: true },
  { id: "ks-menu-others",     label: "OTHERS",     path: "/others",     order: 8, visible: true },
];

// Rodapé dark blue do mockup: tagline + Navigation/Institutional + newsletter.
const KSPORTS_FOOTER: FooterConfig = {
  description: "News. Analysis. Passion for Sports.",
  showSocial: true,
  columns: [
    { id: "ks-nav", title: "Navigation", links: [
      { id: "ks-nav-home",       label: "Home",       href: "/" },
      { id: "ks-nav-worldcup",   label: "World Cup",  href: "/world-cup" },
      { id: "ks-nav-football",   label: "Football",   href: "/football" },
      { id: "ks-nav-volleyball", label: "Volleyball", href: "/volleyball" },
      { id: "ks-nav-tennis",     label: "Tennis",     href: "/tennis" },
      { id: "ks-nav-f1",         label: "Formula 1",  href: "/formula-1" },
      { id: "ks-nav-nfl",        label: "NFL",        href: "/nfl" },
      { id: "ks-nav-esports",    label: "e-Sports",   href: "/esports" },
    ] },
    { id: "ks-inst", title: "Institutional", links: [
      { id: "ks-i-about",     label: "About us",       href: "/contato" },
      { id: "ks-i-advertise", label: "Advertise",      href: "/contato" },
      { id: "ks-i-privacy",   label: "Privacy Policy", href: "/privacidade" },
      { id: "ks-i-terms",     label: "Terms of Use",   href: "/termos" },
      { id: "ks-i-contact",   label: "Contact",        href: "/contato" },
    ] },
  ],
  showContact: false,
  showNewsletter: true,
  newsletterTitle: "Get the top sports stories in your inbox",
  copyright: "© {year} {site}. All rights reserved.",
  legalLinks: [
    { id: "ks-l-privacy", label: "Privacy Policy", href: "/privacidade" },
    { id: "ks-l-terms",   label: "Terms of Use",   href: "/termos" },
    { id: "ks-l-contact", label: "Contact",        href: "/contato" },
  ],
};

// ─── Esporte Agora (portal esportivo pt-BR) ──────────────────────────────────
// Mesmo arranjo do starter KSports, com a identidade visual das logos do
// Esporte Agora: roxo #5b2d8e (letras), verde-limão #4bce10 (setas/acentos) e
// roxo bem escuro #241243 (fundo da versão dark). Menu/rodapé/blocos em
// português; os paths do menu são os slugs usados no targetCategory das
// regras do painel central (deploy/esporteagora/sources_pt.sql) — não mude
// um sem o outro. Sem parceiro fechado, os banners nascem como "Anuncie
// aqui" (troque o HTML quando houver patrocinador).
const EA_DARK   = "#241243"; // roxo escuro (fundo da logo dark)
const EA_PURPLE = "#5b2d8e"; // roxo das letras
const EA_GREEN  = "#4bce10"; // verde-limão das setas
const EA_MID    = "#3a1c6e"; // roxo médio (gradientes)

// Marca em texto puro no estilo da logo (Esporte branco + Agora verde);
// substituível pela PNG branca via upload no Storage + edição do bloco.
const EA_AD_BRAND = `<span style="font-style:italic;font-weight:900;font-size:26px;letter-spacing:.04em;color:#ffffff;">Esporte<span style="color:${EA_GREEN};">Agora</span></span>`;
const EA_AD_BG = `border:1px solid #3b2a63;border-radius:8px;background:radial-gradient(circle at 88% 45%, rgba(75,206,16,.32), transparent 42%), radial-gradient(circle at 10% 60%, rgba(91,45,142,.6), transparent 46%), linear-gradient(135deg, ${EA_DARK}, ${EA_MID} 60%, ${EA_DARK});`;

const EA_AD_BONUS = `<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px 20px;padding:18px 26px;${EA_AD_BG}">
  ${EA_AD_BRAND}
  <span style="flex:1;min-width:220px;text-align:center;color:#ffffff;line-height:1.1;"><span style="font-size:20px;font-weight:900;font-style:italic;letter-spacing:.02em;">ANUNCIE <span style="color:${EA_GREEN};">AQUI</span></span><br/><span style="font-size:13px;font-weight:600;color:#cdc3e8;">SUA MARCA NA TORCIDA DO ESPORTE AGORA</span></span>
  <span style="background:${EA_GREEN};color:#0c2601;padding:10px 18px;border-radius:6px;font-weight:800;font-size:13px;white-space:nowrap;">FALE CONOSCO</span>
</div>`;

const EA_AD_HEADER = `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;max-width:720px;padding:11px 20px;${EA_AD_BG}">
  <span style="font-style:italic;font-weight:900;font-size:19px;letter-spacing:.04em;color:#ffffff;">Esporte<span style="color:${EA_GREEN};">Agora</span></span>
  <span style="flex:1;text-align:center;color:#ffffff;line-height:1.15;"><span style="font-size:15px;font-weight:900;font-style:italic;letter-spacing:.02em;">SUA MARCA <span style="color:${EA_GREEN};">AQUI.</span></span><br/><span style="font-size:10px;font-weight:600;color:#cdc3e8;">SEJA O PARCEIRO OFICIAL DO ESPORTE AGORA</span></span>
  <span style="background:${EA_GREEN};color:#0c2601;padding:8px 14px;border-radius:6px;font-weight:800;font-size:11px;white-space:nowrap;">ANUNCIE</span>
</div>`;

const EA_AD_BOX = `<div style="max-width:460px;margin:0 auto;text-align:center;padding:34px 24px;${EA_AD_BG}">
  <div style="color:#cdc3e8;font-size:11px;font-weight:800;letter-spacing:.14em;margin-bottom:10px;">PARCEIRO OFICIAL</div>
  <div style="margin-bottom:12px;">${EA_AD_BRAND}</div>
  <div style="color:#ffffff;font-size:26px;font-weight:900;line-height:1.1;">SUA MARCA<br/>NESTE ESPAÇO</div>
  <div style="display:inline-block;background:${EA_GREEN};color:#0c2601;padding:10px 22px;border-radius:6px;font-weight:800;font-size:13px;margin-top:16px;">ANUNCIE AQUI</div>
</div>`;

// Menu do Esporte Agora — paths = slugs das regras da central (PROPOSITALMENTE
// diferentes dos slugs EN do KSports; ver sources_pt.sql).
const EA_MENU: TemplateMenuItem[] = [
  { id: "ea-menu-home",     label: "HOME",           path: "/",                  order: 0, visible: true },
  { id: "ea-menu-copa",     label: "COPA DO MUNDO",  path: "/copa-do-mundo",     order: 1, visible: true },
  { id: "ea-menu-futebol",  label: "FUTEBOL",        path: "/futebol",           order: 2, visible: true },
  { id: "ea-menu-volei",    label: "VÔLEI",          path: "/volei",             order: 3, visible: true },
  { id: "ea-menu-tenis",    label: "TÊNIS",          path: "/tenis",             order: 4, visible: true },
  { id: "ea-menu-f1",       label: "FÓRMULA 1",      path: "/f1",                order: 5, visible: true },
  { id: "ea-menu-futam",    label: "FUT. AMERICANO", path: "/futebol-americano", order: 6, visible: true },
  { id: "ea-menu-esports",  label: "E-SPORTS",       path: "/e-sports",          order: 7, visible: true },
  { id: "ea-menu-outros",   label: "OUTROS",         path: "/outros",            order: 8, visible: true },
];

const EA_FOOTER: FooterConfig = {
  description: "Notícias. Análises. Paixão pelo esporte.",
  showSocial: true,
  columns: [
    { id: "ea-nav", title: "Navegação", links: [
      { id: "ea-nav-home",    label: "Home",           href: "/" },
      { id: "ea-nav-copa",    label: "Copa do Mundo",  href: "/copa-do-mundo" },
      { id: "ea-nav-futebol", label: "Futebol",        href: "/futebol" },
      { id: "ea-nav-volei",   label: "Vôlei",          href: "/volei" },
      { id: "ea-nav-tenis",   label: "Tênis",          href: "/tenis" },
      { id: "ea-nav-f1",      label: "Fórmula 1",      href: "/f1" },
      { id: "ea-nav-futam",   label: "Fut. Americano", href: "/futebol-americano" },
      { id: "ea-nav-esports", label: "e-Sports",       href: "/e-sports" },
    ] },
    { id: "ea-inst", title: "Institucional", links: [
      { id: "ea-i-about",     label: "Sobre nós",                href: "/contato" },
      { id: "ea-i-advertise", label: "Anuncie",                  href: "/contato" },
      { id: "ea-i-privacy",   label: "Política de Privacidade",  href: "/privacidade" },
      { id: "ea-i-terms",     label: "Termos de Uso",            href: "/termos" },
      { id: "ea-i-contact",   label: "Contato",                  href: "/contato" },
    ] },
  ],
  showContact: false,
  showNewsletter: true,
  newsletterTitle: "Receba as principais notícias do esporte no seu e-mail",
  copyright: "© {year} {site}. Todos os direitos reservados.",
  legalLinks: [
    { id: "ea-l-privacy", label: "Política de Privacidade", href: "/privacidade" },
    { id: "ea-l-terms",   label: "Termos de Uso",           href: "/termos" },
    { id: "ea-l-contact", label: "Contato",                 href: "/contato" },
  ],
};

const STARTER_TEMPLATES: HomeTemplate[] = [
  {
    id: "starter-ksports",
    name: "KSports — Portal Esportivo",
    createdAt: "2026-07-03T00:00:00.000Z",
    accentColor: KSPORTS_PINK,
    builtin: true,
    headerStyle: "standard", footerStyle: "dark",
    headerBgColor: "#ffffff", footerBgColor: KSPORTS_DARK,
    menuTextColor: "#101418", menuActiveColor: KSPORTS_PINK,
    menuFontSize: 13, menuFontWeight: 800,
    showTickerBar: false, showHeroStrip: true,
    // Estilo portal: barra do topo dark blue, menu em faixa dark blue (item
    // ativo destaca em K-Pink via menuActiveColor na top bar/mobile).
    showTopBar: true, topBarBgColor: KSPORTS_DARK,
    menuBarStyle: "bar", menuBarBgColor: KSPORTS_DARK,
    footerAccentColor: KSPORTS_PINK,
    // Site público em inglês, datas em UTC (aplicado junto com o template).
    siteLanguage: "en", siteTimezone: "UTC",
    // Banner do parceiro AO LADO da logo (linha do cabeçalho, como no mockup).
    headerBannerHtml: KSPORTS_AD_HEADER,
    menuItems: KSPORTS_MENU,
    footerConfig: KSPORTS_FOOTER,
    blocks: [
      // ── Zona 2 colunas: hero portal + Most Read na lateral (SÓ ele: a altura
      //    do Most Read ≈ hero; qualquer bloco a mais deixa um buraco em branco
      //    na coluna principal, porque a zona estica até o fim da lateral) ──
      { id: "hero",                    name: "Top Stories",               visible: true, order: 0, layout: "portal", area: "main" },
      { id: "mais-lidas",              name: "Most Read",                 visible: true, order: 1, color: KSPORTS_PINK, area: "sidebar" },
      // ── Faixa TRENDING NOW + banner de bônus ──
      { id: "ticker-ksports",          name: "Trending Now",              visible: true, order: 2, custom: true, blockType: "ticker", format: "grid", source: "latest", itemsLimit: 8, color: KSPORTS_PINK },
      { id: "html-ksports-ad-bonus",   name: "KBET — Exclusive Bonuses",  visible: true, order: 3, custom: true, blockType: "html", format: "grid", html: KSPORTS_AD_BONUS, color: KSPORTS_PURPLE, isAd: true },
      // ── Zona 2 colunas: Recent News em grade + lateral Latest/box do parceiro
      //    (a grade de 8 é mais alta que os dois juntos — sem buraco no main) ──
      { id: "content-ksports-recent",  name: "Recent News",               visible: true, order: 4, custom: true, blockType: "content", format: "grid", layout: "grid", source: "latest", itemsLimit: 8, color: KSPORTS_PINK, area: "main" },
      { id: "list-ksports-latest",     name: "Latest News",               visible: true, order: 5, custom: true, blockType: "list", format: "list_compact", source: "latest", itemsLimit: 5, color: KSPORTS_PINK, area: "sidebar" },
      { id: "html-ksports-ad-box",     name: "KBET — Official Partner",   visible: true, order: 6, custom: true, blockType: "html", format: "grid", html: KSPORTS_AD_BOX, color: KSPORTS_PINK, area: "sidebar", isAd: true },
      // ── Seções por modalidade em fileira de 4 (imagem + lista, como no mockup) ──
      { id: "content-ksports-football", name: "Football",  visible: true, order: 7,  custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "football",  color: KSPORTS_PINK, width: "quarter", linkLabel: "VIEW ALL →" },
      { id: "content-ksports-nfl",      name: "NFL",       visible: true, order: 8,  custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "nfl",       color: KSPORTS_PURPLE, width: "quarter", linkLabel: "VIEW ALL →" },
      { id: "content-ksports-f1",       name: "Formula 1", visible: true, order: 9,  custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "formula-1", color: KSPORTS_PINK, width: "quarter", linkLabel: "VIEW ALL →" },
      { id: "content-ksports-esports",  name: "e-Sports",  visible: true, order: 10, custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "esports",   color: KSPORTS_PURPLE, width: "quarter", linkLabel: "VIEW ALL →" },
      // Blocos padrão do portal ficam ocultos (reative na aba Blocos se quiser)
      { id: "brasil",     name: "Brasil",           visible: false, order: 11, layout: "grid",    color: "#16a34a", category: "brasil" },
      { id: "mundo",      name: "Mundo",            visible: false, order: 12, layout: "grid",    color: "#6b21a8", category: "mundo" },
      { id: "esporte",    name: "Esporte",          visible: false, order: 13, layout: "cultura", color: "#dc2626", category: "esportes" },
      { id: "cultura",    name: "Cultura",          visible: false, order: 14, layout: "cultura", color: "#0d9488", category: "cultura" },
      { id: "df",         name: "DF",               visible: false, order: 15, layout: "duplo",   color: "#0b3d91", category: "cidade" },
      { id: "saude",      name: "Saúde",            visible: false, order: 16, layout: "grid",    color: "#16a34a", category: "saude" },
      { id: "tecnologia", name: "Tecnologia",       visible: false, order: 17, layout: "grid",    color: "#0284c7", category: "tecnologia" },
      { id: "colunistas", name: "Colunistas",       visible: false, order: 18 },
      { id: "ultimas",    name: "Últimas Notícias", visible: false, order: 19 },
    ],
  },
  {
    id: "starter-esporteagora",
    name: "Esporte Agora — Portal Esportivo (PT)",
    createdAt: "2026-07-10T00:00:00.000Z",
    accentColor: EA_PURPLE,
    builtin: true,
    headerStyle: "standard", footerStyle: "dark",
    headerBgColor: "#ffffff", footerBgColor: EA_DARK,
    menuTextColor: "#101418", menuActiveColor: EA_GREEN,
    menuFontSize: 13, menuFontWeight: 800,
    showTickerBar: false, showHeroStrip: true,
    showTopBar: true, topBarBgColor: EA_DARK,
    menuBarStyle: "bar", menuBarBgColor: EA_DARK,
    footerAccentColor: EA_GREEN,
    // pt-BR/São Paulo já são o padrão da plataforma, mas o starter grava
    // explicitamente: aplicar por cima de um site EN (ex.: teste com o
    // starter KSports) volta idioma e fuso junto com o layout.
    siteLanguage: "pt-BR", siteTimezone: "America/Sao_Paulo",
    headerBannerHtml: EA_AD_HEADER,
    menuItems: EA_MENU,
    footerConfig: EA_FOOTER,
    blocks: [
      // ── Zona 2 colunas: hero portal + Mais Lidas na lateral (mesma regra do
      //    KSports: só ele na sidebar para não abrir buraco na coluna main) ──
      { id: "hero",                name: "Principais Notícias", visible: true, order: 0, layout: "portal", area: "main" },
      { id: "mais-lidas",          name: "Mais Lidas",          visible: true, order: 1, color: EA_PURPLE, area: "sidebar" },
      // ── Faixa EM ALTA + banner "Anuncie aqui" ──
      { id: "ticker-ea",           name: "Em Alta",             visible: true, order: 2, custom: true, blockType: "ticker", format: "grid", source: "latest", itemsLimit: 8, color: EA_GREEN },
      { id: "html-ea-ad-bonus",    name: "Anuncie — Faixa",     visible: true, order: 3, custom: true, blockType: "html", format: "grid", html: EA_AD_BONUS, color: EA_PURPLE, isAd: true },
      // ── Zona 2 colunas: Notícias Recentes em grade + lateral Últimas/banner ──
      { id: "content-ea-recentes", name: "Notícias Recentes",   visible: true, order: 4, custom: true, blockType: "content", format: "grid", layout: "grid", source: "latest", itemsLimit: 8, color: EA_PURPLE, area: "main" },
      { id: "list-ea-ultimas",     name: "Últimas Notícias",    visible: true, order: 5, custom: true, blockType: "list", format: "list_compact", source: "latest", itemsLimit: 5, color: EA_PURPLE, area: "sidebar" },
      { id: "html-ea-ad-box",      name: "Anuncie — Lateral",   visible: true, order: 6, custom: true, blockType: "html", format: "grid", html: EA_AD_BOX, color: EA_GREEN, area: "sidebar", isAd: true },
      // ── Seções por modalidade em fileira de 4 (slugs das regras da central) ──
      { id: "content-ea-futebol",  name: "Futebol",        visible: true, order: 7,  custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "futebol",           color: EA_PURPLE, width: "quarter", linkLabel: "VER TODAS →" },
      { id: "content-ea-futam",    name: "Fut. Americano", visible: true, order: 8,  custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "futebol-americano", color: EA_GREEN,  width: "quarter", linkLabel: "VER TODAS →" },
      { id: "content-ea-f1",       name: "Fórmula 1",      visible: true, order: 9,  custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "f1",                color: EA_PURPLE, width: "quarter", linkLabel: "VER TODAS →" },
      { id: "content-ea-esports",  name: "e-Sports",       visible: true, order: 10, custom: true, blockType: "content", format: "featured", layout: "featured", source: "automatic_by_category", category: "e-sports",          color: EA_GREEN,  width: "quarter", linkLabel: "VER TODAS →" },
      // Blocos padrão do portal ficam ocultos (reative na aba Blocos se quiser)
      { id: "brasil",     name: "Brasil",           visible: false, order: 11, layout: "grid",    color: "#16a34a", category: "brasil" },
      { id: "mundo",      name: "Mundo",            visible: false, order: 12, layout: "grid",    color: "#6b21a8", category: "mundo" },
      { id: "esporte",    name: "Esporte",          visible: false, order: 13, layout: "cultura", color: "#dc2626", category: "esportes" },
      { id: "cultura",    name: "Cultura",          visible: false, order: 14, layout: "cultura", color: "#0d9488", category: "cultura" },
      { id: "df",         name: "DF",               visible: false, order: 15, layout: "duplo",   color: "#0b3d91", category: "cidade" },
      { id: "saude",      name: "Saúde",            visible: false, order: 16, layout: "grid",    color: "#16a34a", category: "saude" },
      { id: "tecnologia", name: "Tecnologia",       visible: false, order: 17, layout: "grid",    color: "#0284c7", category: "tecnologia" },
      { id: "colunistas", name: "Colunistas",       visible: false, order: 18 },
      { id: "ultimas",    name: "Últimas Notícias", visible: false, order: 19 },
    ],
  },
];

const HEADER_STYLE_LABEL: Record<HeaderStyle, string> = { standard: "Padrão", compact: "Compacto", centered: "Centralizado" };
const FOOTER_STYLE_LABEL: Record<FooterStyle, string> = { dark: "Escuro", light: "Claro", minimal: "Minimal" };

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
  adId: string;
  area: "" | "main" | "sidebar";
  width: "" | "full" | "half" | "quarter";
  linkLabel: string;
  buttonLabel: string;
  sectionStyle: "" | "revista";
  isAd: boolean;
  fontFamily: string;
  /** Bloco "Categorias": imagem/rótulo/ocultar por editoria. */
  categoryItems: CategoryBlockItem[];
  /** Telas em que o bloco aparece. */
  devices: "all" | "mobile" | "desktop";
}

const EMPTY_FORM: BlockForm = {
  name: "", blockType: "content", format: "grid",
  categories: [], category: "politica", layout: "grid",
  source: "automatic_by_category", itemsLimit: 4,
  color: "#1d4ed8", reverse: false,
  imageUrl: "", linkUrl: "", caption: "", videoUrl: "", html: "", embedUrl: "",
  adSlot: "slot_05", adId: "",
  area: "", width: "", linkLabel: "",
  buttonLabel: "",
  sectionStyle: "",
  isAd: false,
  fontFamily: "",
  categoryItems: [],
  devices: "all",
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
    adId:          block.adId ?? "",
    area:          block.area ?? "",
    width:         block.width ?? "",
    linkLabel:     block.linkLabel ?? "",
    buttonLabel:   block.buttonLabel ?? "",
    sectionStyle:  block.sectionStyle ?? "",
    isAd:          block.isAd ?? false,
    fontFamily:    block.fontFamily ?? "",
    categoryItems: block.categoryItems ?? [],
    devices:       block.devices ?? "all",
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
    adId:       f.blockType === "advertising" ? (f.adId || undefined) : undefined,
    area:       f.area || undefined,
    width:      f.width || undefined,
    linkLabel:  f.linkLabel.trim() || undefined,
    buttonLabel: f.blockType === "newsletter" ? (f.buttonLabel.trim() || undefined) : undefined,
    sectionStyle: isContent && f.sectionStyle ? "revista" : undefined,
    isAd:       (f.blockType === "html" || f.blockType === "image") && f.isAd ? true : undefined,
    fontFamily: f.fontFamily || undefined,
    categoryItems: f.blockType === "categories" && f.categoryItems.length > 0 ? f.categoryItems : undefined,
    devices:    f.devices !== "all" ? f.devices : undefined,
  };
}

// ─── Font picker (fonte do texto do bloco) ────────────────────────────────────
const FONT_GROUPS: [string, FontOption[]][] = (["site", "system", "sans", "serif", "display"] as const)
  .map((g) => [FONT_GROUP_LABELS[g], FONT_OPTIONS.filter((f) => f.group === g)]);

function FontPicker({ value, onChange, inputClass }: {
  value: string; onChange: (v: string) => void; inputClass: string;
}) {
  // Carrega a fonte escolhida no próprio painel para a amostra abaixo do select.
  useEffect(() => { ensureFontLoaded(value); }, [value]);
  const css = fontCss(value);
  return (
    <>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Padrão do site (Inter + Merriweather)</option>
        {FONT_GROUPS.map(([label, opts]) => (
          <optgroup key={label} label={label}>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
      {css && (
        <div className="mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2" style={{ fontFamily: css }}>
          <p className="text-[15px] font-black leading-snug text-slate-800">Título de exemplo da notícia</p>
          <p className="text-[11px] text-slate-500 leading-snug">Linha de apoio com a fonte escolhida — AaBbCc 0123</p>
        </div>
      )}
    </>
  );
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

// ─── Card de template (aba Templates) ─────────────────────────────────────────
function TemplateCard({ tpl, isPreviewing, busy, onPreview, onConfirm, onCancel, onDelete }: {
  tpl: HomeTemplate; isPreviewing: boolean; busy: boolean;
  onPreview: () => void; onConfirm: () => void; onCancel: () => void;
  onDelete?: () => void;
}) {
  const { can } = useCan();
  const canManage = can("home_blocks.manage");
  const accent = tpl.accentColor ?? "#0B2A66";
  const visibleBlocks = tpl.blocks.filter((b) => b.visible);
  return (
    <div className="rounded-2xl border-2 bg-white overflow-hidden transition-all"
      style={{
        borderColor: isPreviewing ? accent : "#E2E8F0",
        boxShadow: isPreviewing ? `0 0 0 3px ${accent}22` : "0 2px 8px rgba(15,23,42,0.04)",
      }}>
      {isPreviewing && (
        <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ backgroundColor: accent + "12" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
            Visualizando agora
          </span>
        </div>
      )}
      <div className="flex gap-0 min-h-[96px]">
        {/* Diagrama: uma barra por bloco visível, na cor do próprio bloco */}
        <div className="w-[72px] shrink-0 flex items-center justify-center p-2.5 self-stretch" style={{ backgroundColor: accent + "18", color: accent }}>
          <div className="w-full flex flex-col gap-0.5 justify-center">
            {visibleBlocks.slice(0, 8).map((b, i) => (
              <div key={b.id} className="w-full rounded-sm"
                style={{ height: i === 0 ? 14 : 5, backgroundColor: b.color ?? "currentColor", opacity: i === 0 ? 0.55 : 0.35 }} />
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className="text-[13px] font-bold text-[#0F172A]">{tpl.name}</span>
              {tpl.builtin ? (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: accent + "18", color: accent }}>
                  Modelo
                </span>
              ) : (
                <span className="text-[10px] text-[#94A3B8]">{new Date(tpl.createdAt).toLocaleDateString("pt-BR")}</span>
              )}
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-md">{visibleBlocks.length} blocos</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-md">Cabeçalho {HEADER_STYLE_LABEL[tpl.headerStyle ?? "standard"]}</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-md">Rodapé {FOOTER_STYLE_LABEL[tpl.footerStyle ?? "dark"]}</span>
            </div>
          </div>
          {!canManage ? null : isPreviewing ? (
            <div className="flex gap-1.5 mt-2">
              <button onClick={onCancel} disabled={busy}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
                <Undo2 size={10} /> Desfazer
              </button>
              <button onClick={onConfirm} disabled={busy}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold text-white rounded-xl transition-colors disabled:opacity-50"
                style={{ backgroundColor: accent }}>
                <CheckCircle size={10} /> Aplicar
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5 mt-2">
              <button onClick={onPreview} disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-bold rounded-xl border transition-colors disabled:opacity-50"
                style={{ borderColor: accent + "50", color: accent, backgroundColor: accent + "08" }}>
                {busy ? <><RefreshCw size={11} className="animate-spin" /> Carregando…</> : <><EyeIcon size={11} /> Visualizar</>}
              </button>
              {onDelete && (
                <button title="Excluir template" onClick={onDelete}
                  className="w-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bloco Categorias: imagem/rótulo por editoria ─────────────────────────────
/**
 * Lista as editorias que o bloco vai exibir e deixa trocar o ícone padrão por
 * uma imagem enviada. Grava só o que foi personalizado (`categoryItems`) — a
 * lista em si continua vindo das Categorias do blog, então criar uma editoria
 * nova a faz aparecer no bloco sem ninguém editar nada aqui.
 */
function CategoryItemsEditor({ categories, items, onChange }: {
  categories: { value: string; label: string; color: string }[];
  items: CategoryBlockItem[];
  onChange: (next: CategoryBlockItem[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const targetSlug = useRef<string>("");

  const itemOf = (slug: string): CategoryBlockItem | undefined => items.find((i) => i.slug === slug);

  function patch(slug: string, p: Partial<CategoryBlockItem>) {
    const merged = items.some((i) => i.slug === slug)
      ? items.map((i) => (i.slug === slug ? { ...i, ...p } : i))
      : [...items, { slug, ...p }];
    // Entrada que voltou ao padrão sai da lista: o bloco fica com o mínimo salvo.
    onChange(merged.filter((i) =>
      (i.imageUrl ?? "").trim() !== "" || (i.label ?? "").trim() !== "" || i.hidden === true));
  }

  async function upload(file: File, slug: string) {
    setBusy(slug); setErr(false);
    try {
      const r = await adminApi.uploadImage(file, `editoria-${slug}`);
      patch(slug, { imageUrl: r.url });
    } catch { setErr(true); } finally { setBusy(null); }
  }

  if (categories.length === 0) {
    return <p className="text-[11px] text-amber-600">Nenhuma editoria cadastrada — crie em Categorias.</p>;
  }

  return (
    <div className="space-y-1.5">
      {categories.map((c) => {
        const it = itemOf(c.value);
        const img = (it?.imageUrl ?? "").trim();
        const hidden = it?.hidden === true;
        return (
          <div key={c.value}
            className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 ${hidden ? "opacity-50" : ""}`}>
            <span className="w-9 h-9 shrink-0 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden text-[17px] leading-none">
              {img
                ? <img src={img} alt="" className="w-full h-full object-cover" />
                : categoryIcon(c.value, c.label)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-slate-700 truncate">{c.label}</p>
              <p className="text-[10px] text-slate-400 truncate">
                {img ? "imagem própria" : hasCategoryIcon(c.value) ? "ícone padrão" : "iniciais"} · /{c.value}
              </p>
            </div>
            <button type="button" title={img ? "Trocar imagem" : "Enviar imagem"}
              disabled={busy !== null}
              onClick={() => { targetSlug.current = c.value; fileRef.current?.click(); }}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-slate-100 disabled:opacity-40 transition-colors">
              {busy === c.value ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
            </button>
            {img && (
              <button type="button" title="Voltar ao ícone padrão"
                onClick={() => patch(c.value, { imageUrl: "" })}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <X size={13} />
              </button>
            )}
            <button type="button" title={hidden ? "Exibir no bloco" : "Ocultar do bloco"}
              onClick={() => patch(c.value, { hidden: !hidden })}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-slate-100 transition-colors">
              {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        );
      })}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && targetSlug.current) void upload(f, targetSlug.current);
          e.target.value = "";
        }} />
      {err && <p className="text-[11px] text-red-600">Falha no upload — tente novamente.</p>}
    </div>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel({ block, form, saving, categories, onChange, onApply, onDuplicate, onDelete, onCancel }: {
  block: HomeBlock; form: BlockForm; saving: boolean;
  /** Categorias do seletor (cadastradas no painel ou fallback padrão). */
  categories: { value: string; label: string; color: string }[];
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
  const adsList = useAdsList(form.blockType === "advertising");

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
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mt-2 mb-1">Qual propaganda exibir</label>
            <select value={form.adId} onChange={(e) => onChange("adId", e.target.value)} className={INPUT}>
              <option value="">Automática — anúncios ativos do slot acima</option>
              {adsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">Escolha uma propaganda cadastrada para fixá-la neste bloco (na proporção natural da arte), ou deixe em Automática.</p>
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

      {/* ── Categorias: origem, estilo e imagem por editoria ── */}
      {!isSpecial && form.blockType === "categories" && (
        <PanelSection label="Editorias" icon={FolderOpen}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">De onde vem</label>
              <select value={categoriesBlockSource(form)} onChange={(e) => onChange("source", e.target.value as SourceType)}
                className={INPUT}>
                <option value="categories">Categorias do blog</option>
                <option value="menu">Itens do menu</option>
                <option value="html">HTML personalizado</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Estilo</label>
              <select value={form.format === "pills" ? "pills" : "cards"} onChange={(e) => onChange("format", e.target.value)}
                className={INPUT} disabled={categoriesBlockSource(form) === "html"}>
                <option value="cards">Cartões com ícone</option>
                <option value="pills">Pílulas</option>
              </select>
            </div>
          </div>

          {categoriesBlockSource(form) === "html" ? (
            <>
              <textarea value={form.html} onChange={(e) => onChange("html", e.target.value)}
                rows={6} spellCheck={false}
                className={`${INPUT} font-mono text-xs resize-y mt-2`} placeholder="<div>…</div>" />
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                Markup livre no lugar da navegação automática. Scripts e eventos inline são removidos por segurança.
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] text-slate-400 mt-2 mb-1.5 leading-relaxed">
                {categoriesBlockSource(form) === "menu"
                  ? "A lista sai dos itens do menu; as imagens abaixo valem para o caminho de mesmo nome."
                  : "A lista sai das Categorias do blog — criar uma editoria nova já a exibe aqui."}
              </p>
              <CategoryItemsEditor categories={categories} items={form.categoryItems}
                onChange={(next) => onChange("categoryItems", next)} />
              <input value={form.linkLabel} onChange={(e) => onChange("linkLabel", e.target.value)}
                className={`${INPUT} mt-2`} placeholder='Cartão final, ex.: "Todas as editorias" (vazio = sem cartão)' />
              {form.linkLabel.trim() !== "" && (
                <input value={form.linkUrl} onChange={(e) => onChange("linkUrl", e.target.value)}
                  className={`${INPUT} mt-1.5`} placeholder="Link do cartão final (padrão: /arquivo)" />
              )}
            </>
          )}
        </PanelSection>
      )}

      {/* ── HTML livre ── */}
      {!isSpecial && form.blockType === "html" && (
        <PanelSection label="Código HTML" icon={Code}>
          <textarea value={form.html} onChange={(e) => onChange("html", e.target.value)}
            rows={6} spellCheck={false}
            className={`${INPUT} font-mono text-xs resize-y`} placeholder="<div>…</div>" />
          <input value={form.linkUrl} onChange={(e) => onChange("linkUrl", e.target.value)}
            className={`${INPUT} mt-1.5`} placeholder="Link de redirecionamento ao clicar (opcional)" />
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">Scripts e eventos inline são removidos por segurança ao exibir. Com o link preenchido, o bloco inteiro vira clicável (abre em nova aba).</p>
        </PanelSection>
      )}

      {/* ── Em que telas o bloco aparece ── */}
      <PanelSection label="Aparece em" icon={Monitor}>
        <div className="grid grid-cols-3 gap-1">
          {([
            ["all", "Tudo", Monitor],
            ["desktop", "Só desktop", Monitor],
            ["mobile", "Só mobile", Smartphone],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => onChange("devices", id)}
              className={`p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wide transition-all flex flex-col items-center gap-1 ${
                form.devices === id
                  ? "border-[#0B2A66] bg-[#0B2A66]/5 text-[#0B2A66]"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
          O corte é 1024px, o mesmo do menu. Serve para ter propaganda exclusiva de celular
          ou de desktop: crie dois blocos com a mesma posição e marque um de cada.
        </p>
      </PanelSection>

      {/* ── Marcar como propaganda (imagem/HTML) ── */}
      {!isSpecial && (form.blockType === "image" || form.blockType === "html") && (
        <div className="rounded-xl border border-slate-200 px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
              <Megaphone size={12} className="text-[#D97706] shrink-0" /> É uma propaganda
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">Blocos marcados aparecem listados na aba Propagandas do admin.</p>
          </div>
          <Toggle checked={form.isAd} onChange={() => onChange("isAd", !form.isAd)} accent="#D97706" />
        </div>
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
          <input value={form.buttonLabel} onChange={(e) => onChange("buttonLabel", e.target.value)}
            className={`${INPUT} mt-1.5`} placeholder='Texto do botão (padrão: "Assinar")' />
          <input value={form.linkLabel} onChange={(e) => onChange("linkLabel", e.target.value)}
            className={`${INPUT} mt-1.5`} placeholder='Nota sob o formulário (ex.: "Sem spam…") — só no formato cartão' />
        </PanelSection>
      )}

      {/* ── Busca ── */}
      {!isSpecial && form.blockType === "search" && (
        <PanelSection label="Busca" icon={Search}>
          <div className="grid grid-cols-2 gap-1 mb-1.5">
            {([["search_bar", "Barra"], ["search_card", "Card de boas-vindas"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => onChange("format", id)}
                className="p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wide transition-all"
                style={(form.format || "search_bar") === id
                  ? { borderColor: form.color, backgroundColor: form.color + "15", color: form.color }
                  : { borderColor: "#e2e8f0", color: "#94a3b8" }}>
                {label}
              </button>
            ))}
          </div>
          <input value={form.caption} onChange={(e) => onChange("caption", e.target.value)}
            className={INPUT} placeholder="Texto do campo (ex.: Buscar artigos, guias e temas...)" />
          {form.format === "search_card" && (
            <>
              <textarea value={form.html} onChange={(e) => onChange("html", e.target.value)}
                rows={5} spellCheck={false}
                className={`${INPUT} font-mono text-xs resize-y mt-1.5`}
                placeholder="<div>Conteúdo acima do campo (título, texto…)</div>" />
              <input value={form.linkLabel} onChange={(e) => onChange("linkLabel", e.target.value)}
                className={`${INPUT} mt-1.5`} placeholder="Nota abaixo do campo (opcional)" />
              <input value={form.linkUrl} onChange={(e) => onChange("linkUrl", e.target.value)}
                className={`${INPUT} mt-1.5`} placeholder="Link da nota: /pagina ou #id-de-bloco (rola até ele)" />
            </>
          )}
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
            Buscar envia para a página Arquivo (mesmo destino da lupa do cabeçalho) e o termo entra no Analytics.
          </p>
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
            {categories.map((c) => {
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
            {form.categories.filter(v => !categories.find(c => c.value === v)).map((v) => (
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
          <a href="/admin/categorias" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0B2A66] hover:underline mt-1.5">
            <FolderOpen size={10} /> Gerenciar categorias
          </a>
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

      {/* Cards Revista: 1º item em destaque (mock "Escolha do Editor" do Crédito.vc) */}
      {!isSpecial && form.blockType === "content" && form.layout === "mini" && (
        <PanelSection label="Primeiro item em destaque" icon={Layers}>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-white border border-slate-100">
            <div className="flex items-center gap-2">
              <Layers size={12} className="text-slate-400" />
              <span className="text-[12px] font-medium text-slate-700">Card grande à esquerda + mini cards ao lado</span>
            </div>
            <Toggle checked={form.format === "destaque"}
              onChange={() => onChange("format", form.format === "destaque" ? "mini" : "destaque")}
              accent={form.color} />
          </div>
          <p className="text-[10px] mt-1.5 text-slate-400 leading-relaxed">
            O 1º artigo vira um card grande com título sobre a foto; os demais seguem
            como mini cards. Reescolher o layout acima desliga o destaque.
          </p>
        </PanelSection>
      )}

      {/* Cabeçalho estilo revista (título grande + link colorido, sem barra) */}
      {!isSpecial && form.blockType === "content" && form.layout !== "mini" && form.layout !== "hero" && (
        <PanelSection label="Cabeçalho da seção" icon={Type}>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-white border border-slate-100">
            <div className="flex items-center gap-2">
              <Type size={12} className="text-slate-400" />
              <span className="text-[12px] font-medium text-slate-700">Estilo revista (título grande + link colorido)</span>
            </div>
            <Toggle checked={form.sectionStyle === "revista"}
              onChange={() => onChange("sectionStyle", form.sectionStyle === "revista" ? "" : "revista")}
              accent={form.color} />
          </div>
          <p className="text-[10px] mt-1.5 text-slate-400 leading-relaxed">
            Os layouts Cards Revista e Hero Revista já usam este cabeçalho.
          </p>
        </PanelSection>
      )}

      {/* Quantidade (layouts de Conteúdo definem as próprias contagens; os
          layouts revista "mini"/"hero" respeitam a quantidade escolhida) */}
      {!isSpecial && isArticleType && (form.blockType !== "content" || form.layout === "mini" || form.layout === "hero") && (
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

      {/* Posicionamento na home (zona de 2 colunas / meia largura) */}
      <PanelSection label="Posicionamento na home" icon={Layers}>
        <select
          value={form.area ? `area:${form.area}` : form.width || ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange("area", v === "area:main" ? "main" : v === "area:sidebar" ? "sidebar" : "");
            onChange("width", v === "half" || v === "quarter" ? v : "");
          }}
          className={INPUT}>
          <option value="">Fluxo normal (largura inteira)</option>
          <option value="area:main">Coluna principal (zona 2 colunas)</option>
          <option value="area:sidebar">Barra lateral (zona 2 colunas)</option>
          <option value="half">Meia largura (pares lado a lado)</option>
          <option value="quarter">1/4 de largura (fileira de 4 colunas)</option>
        </select>
        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
          Blocos consecutivos marcados como coluna principal/lateral formam a zona de 2 colunas;
          blocos consecutivos de meia largura formam pares e os de 1/4 formam fileiras de 4.
        </p>
      </PanelSection>

      {/* Texto do link do cabeçalho de seção (zonas + layouts revista no fluxo) */}
      {!isSpecial && isArticleType && (form.area !== "" || form.width === "half" || form.layout === "mini") && (
        <PanelSection label="Texto do link da seção">
          <input value={form.linkLabel} onChange={(e) => onChange("linkLabel", e.target.value)}
            className={INPUT} placeholder='Padrão: "Ver mais"' />
          {form.layout === "mini" && (
            <>
              <input value={form.linkUrl} onChange={(e) => onChange("linkUrl", e.target.value)}
                className={`${INPUT} mt-1.5`} placeholder="Destino do link (ex.: /arquivo)" />
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                Fontes "mais recentes"/"mais lidas" não têm página própria de categoria —
                o destino acima vale nesses casos (ex.: /arquivo).
              </p>
            </>
          )}
        </PanelSection>
      )}

      {/* ── Hero Revista: boas-vindas + busca (campos próprios do layout) ── */}
      {!isSpecial && form.blockType === "content" && form.layout === "hero" && (
        <PanelSection label="Hero Revista" icon={Type}>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Boas-vindas (HTML)</label>
          <textarea value={form.html} onChange={(e) => onChange("html", e.target.value)}
            rows={5} spellCheck={false}
            className={`${INPUT} font-mono text-xs resize-y`} placeholder="<p>BEM-VINDO…</p><h1>Título</h1><p>Texto…</p>" />
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mt-2 mb-1">Placeholder da busca</label>
          <input value={form.caption} onChange={(e) => onChange("caption", e.target.value)}
            className={INPUT} placeholder="Buscar artigos, guias e temas..." />
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mt-2 mb-1">Nota sob a busca</label>
          <input value={form.linkLabel} onChange={(e) => onChange("linkLabel", e.target.value)}
            className={INPUT} placeholder="Receba conteúdos exclusivos… Quero me inscrever →" />
          <input value={form.linkUrl} onChange={(e) => onChange("linkUrl", e.target.value)}
            className={`${INPUT} mt-1.5`} placeholder='Destino da nota ("#id-do-bloco" rola até ele)' />
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
            O destaque grande e os 2 cards laterais vêm da fonte de artigos acima (3 itens).
          </p>
        </PanelSection>
      )}

      {/* Fonte do texto do bloco (títulos e apoios trocam juntos) */}
      {form.blockType !== "sep" && (
        <PanelSection label="Fonte do texto" icon={Type}>
          <FontPicker value={form.fontFamily} onChange={(v) => onChange("fontFamily", v)} inputClass={INPUT} />
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
            Vale para títulos e textos deste bloco. Fontes do Google são baixadas pelo site só quando algum bloco as usa.
          </p>
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
  const { can } = useCan();
  const canManage = can("home_blocks.manage");
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
  const [headerMarginBottom, setHeaderMarginBottom] = useState(0);
  const [showTickerBar, setShowTickerBar]     = useState(true);
  const [showHeroStrip, setShowHeroStrip]     = useState(true);
  // Campos "portal" (barra do topo, banner do logo, menu em faixa, acento do rodapé).
  // Strings vazias = não configurado (o site usa os defaults clássicos).
  const [showTopBar, setShowTopBar]               = useState(false);
  const [topBarBgColor, setTopBarBgColor]         = useState("");
  const [headerBannerHtml, setHeaderBannerHtml]   = useState("");
  const [headerBannerLinkUrl, setHeaderBannerLinkUrl] = useState("");
  // Página de notícia (aba Notícia): blocos da lateral + seções desligáveis.
  const [articleBlocks, setArticleBlocks] = useState<HomeBlock[]>([]);
  const [articleShowBreadcrumb, setArticleShowBreadcrumb] = useState(true);
  const [articleShowShare, setArticleShowShare]           = useState(true);
  const [articleShowRelated, setArticleShowRelated]       = useState(true);
  // Conteúdo editável das seções: rótulo/redes do compartilhar e título/quantidade
  // dos relacionados (vazio/4 = padrão do idioma do site).
  const [articleShareLabel, setArticleShareLabel]         = useState("");
  const [articleShareNetworks, setArticleShareNetworks]   = useState<string[]>(SHARE_NETWORK_OPTIONS.map((n) => n.value));
  const [articleRelatedTitle, setArticleRelatedTitle]     = useState("");
  const [articleRelatedCount, setArticleRelatedCount]     = useState(4);
  const [articleSavedOk, setArticleSavedOk]               = useState(false);
  // Propagandas cadastradas p/ o seletor dos blocos de anúncio da lateral.
  const articleAdsList = useAdsList(tab === "article");
  // Categorias cadastradas no painel (→ /admin/categorias). Com lista salva,
  // o seletor de categoria dos blocos mostra SÓ elas; sem lista, o fallback
  // é a lista padrão histórica (CATEGORIES).
  const [siteCategories, setSiteCategories] = useState<{ id: string; name: string; slug: string; color?: string; visible?: boolean }[]>([]);
  const blockCategories = siteCategories.length > 0
    ? siteCategories.filter((c) => c.visible !== false).map((c) => ({ value: c.slug, label: c.name, color: c.color || "#0369a1" }))
    : CATEGORIES;
  // Slug da notícia mais recente — a prévia da aba Notícia abre essa página.
  const [previewArticleSlug, setPreviewArticleSlug] = useState<string | null>(null);
  useEffect(() => {
    if (tab !== "article" || previewArticleSlug !== null) return;
    // Só o mais recente interessa aqui — a lista é paginada (PRD-PERF-01).
    fetch(articlesUrl({ limit: 1, sort: "recent" }))
      .then((r) => r.json())
      .then((d: { articles?: { slug?: string; id: string }[] }) => {
        const a = d.articles?.[0];
        if (a) setPreviewArticleSlug(a.slug || a.id);
      })
      .catch(() => {});
  }, [tab, previewArticleSlug]);
  // Prévia: home nas demais abas; a notícia mais recente na aba Notícia.
  const previewPath = tab === "article" && previewArticleSlug ? `/artigo/${previewArticleSlug}` : "/";
  const [menuBarStyle, setMenuBarStyle]           = useState<"attached" | "bar">("attached");
  const [menuBarBgColor, setMenuBarBgColor]       = useState("");
  const [footerAccentColor, setFooterAccentColor] = useState("");
  const [pageBgColor, setPageBgColor]             = useState("");
  // Idioma/fuso do site público — entram no snapshot para o Desfazer restaurar
  // quando um template EN (KSports) os altera.
  const [siteLanguage, setSiteLanguage] = useState<"pt-BR" | "en">("pt-BR");
  const [siteTimezone, setSiteTimezone] = useState("");
  const [logoBase64, setLogoBase64]     = useState<string | null>(null);
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);
  const [logoSize, setLogoSize]         = useState(48);
  const [logoSaving, setLogoSaving]     = useState(false);
  const [logoStatus, setLogoStatus]     = useState<"idle" | "ok" | "err">("idle");
  const [history, setHistory]           = useState<HomeBlock[][]>([]);
  const [historyIdx, setHistoryIdx]     = useState(-1);

  // ── Templates (aba Templates): snapshots salvos da home ────────────────────
  const [templates, setTemplates]           = useState<HomeTemplate[]>([]);
  const [templateName, setTemplateName]     = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<"idle" | "ok" | "err">("idle");
  // Menu e rodapé atuais — entram no snapshot (backup do Visualizar + salvar template).
  // null = menu ainda não carregado (snapshot omite até carregar).
  const [menuItems, setMenuItems]       = useState<MenuItem[] | null>(null);
  const [footerConfig, setFooterConfig] = useState<FooterConfig | undefined>(undefined);

  /** Snapshot completo da aparência da home — payload de presets/templates e backup do Visualizar. */
  type HomeSnapshot = {
    blocks: HomeBlock[];
    headerStyle: HeaderStyle; footerStyle: FooterStyle;
    headerBgColor: string; footerBgColor: string;
    menuTextColor?: string; menuActiveColor?: string;
    menuFontSize?: number; menuFontWeight?: number;
    headerPaddingX?: number; headerMarginTop?: number; headerMarginBottom?: number;
    showTickerBar?: boolean; showHeroStrip?: boolean;
    /** Menu e rodapé completos (aplicados/restaurados só quando definidos). */
    menuItems?: MenuItem[]; footerConfig?: FooterConfig;
    /** Campos "portal" — strings vazias = não configurado (site usa defaults). */
    showTopBar?: boolean; topBarBgColor?: string;
    headerBannerHtml?: string;
    headerBannerLinkUrl?: string;
    menuBarStyle?: "attached" | "bar"; menuBarBgColor?: string;
    footerAccentColor?: string;
    pageBgColor?: string;
    /** Idioma/fuso do site público (aplicados/restaurados só quando definidos). */
    siteLanguage?: "pt-BR" | "en"; siteTimezone?: string;
  };
  /** O que está em modo Visualizar (template da aba Templates). */
  type PreviewTarget = { id: string; name: string; accentColor: string };
  const [previewingPreset, setPreviewingPreset] = useState<PreviewTarget | null>(null);
  const [previewBackup, setPreviewBackup]       = useState<HomeSnapshot | null>(null);
  const [previewApplying, setPreviewApplying]   = useState(false);

  const logoInputRef  = useRef<HTMLInputElement>(null);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Upload de imagem para o banner ao lado da logo: gera a tag <a><img>
  // pronta no campo HTML (o usuário só troca o link de destino).
  const bannerImgInputRef = useRef<HTMLInputElement>(null);
  const [bannerUploading, setBannerUploading] = useState(false);

  async function uploadHeaderBannerImage(file: File) {
    setBannerUploading(true);
    try {
      const r = await adminApi.uploadImage(file, "banner-cabecalho");
      setHeaderBannerHtml(`<img src="${r.url}" alt="banner" style="width:100%;max-width:720px;height:auto;border-radius:8px;display:block;">`);
    } catch {
      alert("Falha no upload da imagem — tente novamente.");
    } finally {
      setBannerUploading(false);
    }
  }
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
        setHeaderMarginBottom(r.settings.headerMarginBottom ?? 0);
        setShowTickerBar(r.settings.showTickerBar ?? true);
        setShowHeroStrip(r.settings.showHeroStrip ?? true);
        setShowTopBar(r.settings.showTopBar ?? false);
        setTopBarBgColor(r.settings.topBarBgColor ?? "");
        setHeaderBannerHtml(r.settings.headerBannerHtml ?? "");
        setHeaderBannerLinkUrl(r.settings.headerBannerLinkUrl ?? "");
        setArticleBlocks(r.settings.articleSidebarBlocks?.length
          ? r.settings.articleSidebarBlocks.map((b) => ({ ...b }))
          : DEFAULT_ARTICLE_SIDEBAR_BLOCKS.map((b) => ({ ...b })));
        setArticleShowBreadcrumb(r.settings.articleShowBreadcrumb !== false);
        setArticleShowShare(r.settings.articleShowShare !== false);
        setArticleShowRelated(r.settings.articleShowRelated !== false);
        setArticleShareLabel(r.settings.articleShareLabel ?? "");
        setArticleShareNetworks(Array.isArray(r.settings.articleShareNetworks)
          ? r.settings.articleShareNetworks
          : SHARE_NETWORK_OPTIONS.map((n) => n.value));
        setArticleRelatedTitle(r.settings.articleRelatedTitle ?? "");
        setArticleRelatedCount(r.settings.articleRelatedCount || 4);
        setSiteCategories(r.settings.categories ?? []);
        setMenuBarStyle(r.settings.menuBarStyle === "bar" ? "bar" : "attached");
        setMenuBarBgColor(r.settings.menuBarBgColor ?? "");
        setFooterAccentColor(r.settings.footerAccentColor ?? "");
        setPageBgColor(r.settings.pageBgColor ?? "");
        setSiteLanguage(r.settings.siteLanguage === "en" ? "en" : "pt-BR");
        setSiteTimezone(r.settings.siteTimezone ?? "");
        if (r.settings.logoBase64) setLogoBase64(r.settings.logoBase64);
        if (r.settings.logoSize)   setLogoSize(r.settings.logoSize);
        setTemplates(r.settings.homeTemplates ?? []);
        setFooterConfig(r.settings.footerConfig);
      })
      .catch(() => { setBlocks(DEFAULT_BLOCKS); setHistory([DEFAULT_BLOCKS]); setHistoryIdx(0); })
      .finally(() => setLoading(false));
    // Menu atual (para o snapshot dos templates e o backup do Visualizar).
    adminApi.getMenu()
      .then((r) => setMenuItems(r.menuItems ?? []))
      .catch(() => setMenuItems(null));
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
    // Sem `home_blocks.manage` a tela é somente-leitura: nunca persistir (o
    // auto-save contorna o botão Salvar, então a guarda mora aqui).
    if (!canManage) return;
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
  }, [canManage]);

  /** Snapshot do estado atual da home (tudo que presets/templates podem alterar). */
  function captureSnapshot(): HomeSnapshot {
    return {
      blocks: blocks.map((b) => ({ ...b })),
      headerStyle, footerStyle, headerBgColor, footerBgColor,
      menuTextColor, menuActiveColor, menuFontSize, menuFontWeight,
      headerPaddingX, headerMarginTop, headerMarginBottom, showTickerBar, showHeroStrip,
      showTopBar, topBarBgColor, headerBannerHtml, headerBannerLinkUrl, menuBarStyle, menuBarBgColor,
      footerAccentColor, pageBgColor,
      siteLanguage, siteTimezone,
      ...(menuItems ? { menuItems: menuItems.map((m) => ({ ...m, children: m.children?.map((c) => ({ ...c })) })) } : {}),
      ...(footerConfig !== undefined ? { footerConfig: JSON.parse(JSON.stringify(footerConfig)) as FooterConfig } : {}),
    };
  }

  /** Persiste um snapshot e sincroniza estado local + prévia (campos ausentes ficam como estão). */
  async function pushSnapshot(snap: HomeSnapshot) {
    if (!canManage) return;
    const ordered = snap.blocks.map((b, i) => ({ ...b, order: i }));
    await adminApi.updateSettings({
      homeBlocks:    ordered,
      headerStyle:   snap.headerStyle,
      footerStyle:   snap.footerStyle,
      headerBgColor: snap.headerBgColor,
      footerBgColor: snap.footerBgColor,
      ...(snap.menuTextColor   !== undefined ? { menuTextColor:   snap.menuTextColor }   : {}),
      ...(snap.menuActiveColor !== undefined ? { menuActiveColor: snap.menuActiveColor } : {}),
      ...(snap.menuFontSize    !== undefined ? { menuFontSize:    snap.menuFontSize }    : {}),
      ...(snap.menuFontWeight  !== undefined ? { menuFontWeight:  snap.menuFontWeight }  : {}),
      ...(snap.headerPaddingX  !== undefined ? { headerPaddingX:  snap.headerPaddingX }  : {}),
      ...(snap.headerMarginTop !== undefined ? { headerMarginTop: snap.headerMarginTop } : {}),
      ...(snap.headerMarginBottom !== undefined ? { headerMarginBottom: snap.headerMarginBottom } : {}),
      ...(snap.showTickerBar   !== undefined ? { showTickerBar:   snap.showTickerBar }   : {}),
      ...(snap.showHeroStrip   !== undefined ? { showHeroStrip:   snap.showHeroStrip }   : {}),
      ...(snap.showTopBar        !== undefined ? { showTopBar:        snap.showTopBar }        : {}),
      ...(snap.topBarBgColor     !== undefined ? { topBarBgColor:     snap.topBarBgColor }     : {}),
      ...(snap.headerBannerHtml  !== undefined ? { headerBannerHtml:  snap.headerBannerHtml }  : {}),
      ...(snap.headerBannerLinkUrl !== undefined ? { headerBannerLinkUrl: snap.headerBannerLinkUrl } : {}),
      ...(snap.menuBarStyle      !== undefined ? { menuBarStyle:      snap.menuBarStyle }      : {}),
      ...(snap.menuBarBgColor    !== undefined ? { menuBarBgColor:    snap.menuBarBgColor }    : {}),
      ...(snap.footerAccentColor !== undefined ? { footerAccentColor: snap.footerAccentColor } : {}),
      ...(snap.pageBgColor       !== undefined ? { pageBgColor:       snap.pageBgColor }       : {}),
      ...(snap.footerConfig      !== undefined ? { footerConfig:      snap.footerConfig }      : {}),
      ...(snap.siteLanguage      !== undefined ? { siteLanguage:      snap.siteLanguage }      : {}),
      ...(snap.siteTimezone      !== undefined ? { siteTimezone:      snap.siteTimezone }      : {}),
    });
    // Menu vai por endpoint próprio (blob menu_items) — só quando o snapshot o define.
    if (snap.menuItems) await adminApi.updateMenu(snap.menuItems);
    setBlocks(ordered);
    setHeaderStyle(snap.headerStyle);
    setFooterStyle(snap.footerStyle);
    setHeaderBgColor(snap.headerBgColor);
    setFooterBgColor(snap.footerBgColor);
    if (snap.menuTextColor   !== undefined) setMenuTextColor(snap.menuTextColor);
    if (snap.menuActiveColor !== undefined) setMenuActiveColor(snap.menuActiveColor);
    if (snap.menuFontSize    !== undefined) setMenuFontSize(snap.menuFontSize);
    if (snap.menuFontWeight  !== undefined) setMenuFontWeight(snap.menuFontWeight);
    if (snap.headerPaddingX  !== undefined) setHeaderPaddingX(snap.headerPaddingX);
    if (snap.headerMarginTop !== undefined) setHeaderMarginTop(snap.headerMarginTop);
    if (snap.headerMarginBottom !== undefined) setHeaderMarginBottom(snap.headerMarginBottom);
    if (snap.showTickerBar   !== undefined) setShowTickerBar(snap.showTickerBar);
    if (snap.showHeroStrip   !== undefined) setShowHeroStrip(snap.showHeroStrip);
    if (snap.showTopBar        !== undefined) setShowTopBar(snap.showTopBar);
    if (snap.topBarBgColor     !== undefined) setTopBarBgColor(snap.topBarBgColor);
    if (snap.headerBannerHtml  !== undefined) setHeaderBannerHtml(snap.headerBannerHtml);
    if (snap.headerBannerLinkUrl !== undefined) setHeaderBannerLinkUrl(snap.headerBannerLinkUrl);
    if (snap.menuBarStyle      !== undefined) setMenuBarStyle(snap.menuBarStyle);
    if (snap.menuBarBgColor    !== undefined) setMenuBarBgColor(snap.menuBarBgColor);
    if (snap.footerAccentColor !== undefined) setFooterAccentColor(snap.footerAccentColor);
    if (snap.pageBgColor       !== undefined) setPageBgColor(snap.pageBgColor);
    if (snap.footerConfig      !== undefined) setFooterConfig(snap.footerConfig);
    if (snap.siteLanguage      !== undefined) setSiteLanguage(snap.siteLanguage);
    if (snap.siteTimezone      !== undefined) setSiteTimezone(snap.siteTimezone);
    if (snap.menuItems) setMenuItems(snap.menuItems);
    invalidateSiteCache();
    // Snapshots mudam layout de header/footer (não coberto por style:preview) —
    // remonta o iframe uma vez (ação deliberada e rara).
    setPreviewKey((k) => k + 1);
  }

  /** Entra no modo Visualizar com um snapshot (preset ou template), guardando backup p/ Desfazer. */
  async function startPreviewSnapshot(target: PreviewTarget, snap: HomeSnapshot) {
    if (previewingPreset?.id === target.id) return;
    setPreviewApplying(true);
    try {
      // Salva backup só na primeira vez (ao trocar de preset ainda em preview, mantém o backup original)
      if (!previewBackup) setPreviewBackup(captureSnapshot());
      await pushSnapshot(snap);
      setPreviewingPreset(target);
    } catch { } finally { setPreviewApplying(false); }
  }

  // Campos "portal" recebem reset neutro ao aplicar preset/template que não os
  // define — um look antigo restaura o visual clássico em vez de herdar sobras
  // do KSports. ("" = não configurado; o site trata vazio como default.)
  function portalFieldsOf(src: Partial<HomeSnapshot>): Pick<HomeSnapshot,
    "showTopBar" | "topBarBgColor" | "headerBannerHtml" | "headerBannerLinkUrl" | "menuBarStyle" | "menuBarBgColor" | "footerAccentColor" | "pageBgColor"> {
    return {
      showTopBar:        src.showTopBar        ?? false,
      topBarBgColor:     src.topBarBgColor     ?? "",
      headerBannerHtml:  src.headerBannerHtml  ?? "",
      headerBannerLinkUrl: src.headerBannerLinkUrl ?? "",
      menuBarStyle:      src.menuBarStyle      ?? "attached",
      menuBarBgColor:    src.menuBarBgColor    ?? "",
      footerAccentColor: src.footerAccentColor ?? "",
      pageBgColor:       src.pageBgColor       ?? "",
    };
  }

  function startPreviewTemplate(tpl: HomeTemplate) {
    return startPreviewSnapshot(
      { id: `tpl-${tpl.id}`, name: tpl.name, accentColor: tpl.accentColor ?? "#0B2A66" },
      {
        blocks: tpl.blocks.map((b) => ({ ...b })),
        headerStyle:   tpl.headerStyle   ?? "standard",
        footerStyle:   tpl.footerStyle   ?? "dark",
        headerBgColor: tpl.headerBgColor ?? "#ffffff",
        footerBgColor: tpl.footerBgColor ?? "#000000",
        menuTextColor:   tpl.menuTextColor,   menuActiveColor: tpl.menuActiveColor,
        menuFontSize:    tpl.menuFontSize,    menuFontWeight:  tpl.menuFontWeight,
        headerPaddingX:  tpl.headerPaddingX,  headerMarginTop: tpl.headerMarginTop,
        headerMarginBottom: tpl.headerMarginBottom ?? 0,
        showTickerBar:   tpl.showTickerBar,   showHeroStrip:   tpl.showHeroStrip,
        ...portalFieldsOf(tpl),
        // Menu, rodapé e idioma/fuso: só quando o template os carrega (nunca inventa/zera).
        ...(tpl.menuItems ? { menuItems: tpl.menuItems.map((m) => ({ ...m, children: m.children?.map((c) => ({ ...c })) })) } : {}),
        ...(tpl.footerConfig ? { footerConfig: JSON.parse(JSON.stringify(tpl.footerConfig)) as FooterConfig } : {}),
        ...(tpl.siteLanguage ? { siteLanguage: tpl.siteLanguage } : {}),
        ...(tpl.siteTimezone ? { siteTimezone: tpl.siteTimezone } : {}),
      },
    );
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
      await pushSnapshot(previewBackup);
      setPreviewBackup(null);
      setPreviewingPreset(null);
    } catch { } finally { setPreviewApplying(false); }
  }

  // ── Página de notícia: blocos da lateral ────────────────────────────────────
  function patchArticleBlock(id: string, patch: Partial<HomeBlock>) {
    setArticleBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function moveArticleBlock(idx: number, dir: 1 | -1) {
    setArticleBlocks((prev) => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to]!, next[idx]!];
      return next;
    });
  }

  function addArticleBlock(type: "html" | "image" | "advertising" | "mostread") {
    const names: Record<string, string> = {
      html: "Propaganda HTML", image: "Banner de imagem",
      advertising: "Propaganda (slot)", mostread: "Mais Lidas",
    };
    setArticleBlocks((prev) => [...prev, {
      id: type === "mostread" ? "mostread" : `${type}-artigo-${Date.now()}`,
      name: names[type]!, visible: true, order: prev.length,
      custom: type !== "mostread", blockType: type,
      ...(type === "advertising" ? { adSlot: "slot_07" } : {}),
      // Blocos de imagem/HTML da lateral nascem marcados como propaganda
      // (aparecem na aba Propagandas; desmarque no card se não for anúncio).
      ...(type === "html" || type === "image" ? { isAd: true } : {}),
    }]);
  }

  async function saveArticleSidebar() {
    const ordered = articleBlocks.map((b, i) => ({ ...b, order: i }));
    setArticleBlocks(ordered);
    await saveSettingsPatch({ articleSidebarBlocks: ordered });
    setArticleSavedOk(true);
    setTimeout(() => setArticleSavedOk(false), 2500);
  }

  // ── Templates: salvar/excluir snapshots da home ─────────────────────────────
  async function saveCurrentAsTemplate() {
    if (!canManage) return;
    const name = templateName.trim();
    if (!name || templateSaving) return;
    setTemplateSaving(true); setTemplateStatus("idle");
    try {
      const tpl: HomeTemplate = {
        id: `tpl-${Date.now()}`, name, createdAt: new Date().toISOString(),
        ...captureSnapshot(),
      };
      const next = [tpl, ...templates];
      await adminApi.updateSettings({ homeTemplates: next });
      setTemplates(next);
      setTemplateName("");
      setTemplateStatus("ok");
      setTimeout(() => setTemplateStatus("idle"), 2500);
    } catch {
      setTemplateStatus("err");
      setTimeout(() => setTemplateStatus("idle"), 4000);
    } finally { setTemplateSaving(false); }
  }

  async function deleteTemplate(id: string) {
    if (!canManage) return;
    if (!confirm("Excluir este template? Esta ação não pode ser desfeita.")) return;
    const next = templates.filter((t) => t.id !== id);
    try {
      await adminApi.updateSettings({ homeTemplates: next });
      setTemplates(next);
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 4000);
    }
  }

  async function saveAll() {
    if (!canManage) return;
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
    if (!canManage) return;
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
    if (!canManage) return;
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
    if (!canManage) return;
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

  // Banner do modo Visualizar (aba Templates)
  const previewBanner = previewingPreset ? (
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
  ) : null;

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
            {canManage && (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* ══ Tabs ════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 flex overflow-x-auto border-b border-[#E2E8F0] bg-white px-4 md:px-6">
          {(["templates","blocks","article","header","footer","settings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setShowAdd(false); }}
              className={`px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px ${
                tab === t ? "text-[#0B2A66] border-[#0B2A66]" : "text-[#64748B] border-transparent hover:text-[#0F172A]"
              }`}>
              {t === "templates" ? "Templates" : t === "blocks" ? "Blocos" : t === "article" ? "Notícia" : t === "header" ? "Cabeçalho" : t === "footer" ? "Rodapé" : "Configurações"}
            </button>
          ))}
        </div>

        {/* ══ Main ════════════════════════════════════════════════════════════ */}
        {/* Em telas < lg o painel e a prévia empilham (painel em cima, prévia embaixo) */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

          {/* ── Left panel ──────────────────────────────────────────────────── */}
          <div className="w-full lg:w-[320px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white overflow-hidden max-h-[48vh] lg:max-h-none">

            {/* ── TEMPLATES tab ── */}
            {tab === "templates" && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {previewingPreset ? previewBanner : (
                  <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#E2E8F0]">
                    <span className="text-[13px] font-bold text-[#0F172A]">Templates da Home</span>
                    <p className="text-[11px] text-[#64748B] mt-0.5">Salve a home atual como template e reaplique quando quiser. Use <strong>Visualizar</strong> para ver no preview antes de aplicar.</p>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                  {/* ── Salvar home atual ── */}
                  {canManage && (
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Salvar home atual</p>
                      <input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveCurrentAsTemplate(); } }}
                        placeholder="Nome do template (ex.: Home esportes)"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors placeholder:text-slate-400"
                      />
                      <button onClick={() => void saveCurrentAsTemplate()} disabled={templateSaving || !templateName.trim()}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-[#0B2A66] text-white text-[13px] font-semibold rounded-xl hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                        {templateSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                        {templateSaving ? "Salvando…" : "Salvar como template"}
                      </button>
                      {templateStatus === "ok"  && <p className="flex items-center gap-1.5 text-[11px] text-green-700"><CheckCircle size={11} /> Template salvo!</p>}
                      {templateStatus === "err" && <p className="text-[11px] text-red-600">Erro ao salvar — tente novamente.</p>}
                      <p className="text-[10px] text-slate-400 leading-relaxed">Guarda blocos, cabeçalho, rodapé e estilo do menu como estão agora.</p>
                    </div>
                  )}

                  {/* ── Meus templates ── */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Meus templates ({templates.length})</p>
                    {templates.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 py-6 px-4 text-center">
                        <p className="text-[12px] text-slate-400">Nenhum template salvo ainda. Monte a home na aba Blocos e salve aqui.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {templates.map((t) => (
                          <TemplateCard key={t.id} tpl={t}
                            isPreviewing={previewingPreset?.id === `tpl-${t.id}`}
                            busy={previewApplying}
                            onPreview={() => void startPreviewTemplate(t)}
                            onConfirm={() => void confirmPreviewPreset()}
                            onCancel={() => void cancelPreviewPreset()}
                            onDelete={() => void deleteTemplate(t.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Modelos prontos ── */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Modelos prontos</p>
                    <div className="space-y-2">
                      {STARTER_TEMPLATES.map((t) => (
                        <TemplateCard key={t.id} tpl={t}
                          isPreviewing={previewingPreset?.id === `tpl-${t.id}`}
                          busy={previewApplying}
                          onPreview={() => void startPreviewTemplate(t)}
                          onConfirm={() => void confirmPreviewPreset()}
                          onCancel={() => void cancelPreviewPreset()}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl">
                    <Info size={13} className="text-[#D97706] mt-0.5 shrink-0" />
                    <p className="text-[11px] text-[#92400E] leading-relaxed">
                      Aplicar um template substitui os blocos, cabeçalho e rodapé atuais. Se quiser voltar depois, salve a home atual como template antes.
                    </p>
                  </div>
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
                        {bIdx > 0 && canManage && (
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
                          draggable={canManage && !isEditing}
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
                          <div className={`flex items-center gap-2 px-3 py-2.5 ${canManage ? "cursor-pointer" : ""}`} onClick={() => { if (canManage) openEdit(block); }}>
                            {canManage && (
                              <span className="text-[#CBD5E1] hover:text-[#94A3B8] cursor-grab shrink-0" onClick={(e) => e.stopPropagation()}>
                                <GripVertical size={15} />
                              </span>
                            )}
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
                            {canManage && (
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
                            )}

                            {canManage && (
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Toggle checked={block.visible} onChange={() => toggleVisible(realIdx)} />
                              </div>
                            )}
                            {canManage && (
                              <span className={`text-[#CBD5E1] transition-transform ${isEditing ? "rotate-180" : ""}`}>
                                <ChevronDown size={14} />
                              </span>
                            )}
                          </div>

                          {isEditing && (
                            <SettingsPanel
                              block={block} form={editForm} saving={saving}
                              categories={blockCategories}
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

                {canManage && (
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
                )}
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
                    {canManage && (
                      <button onClick={saveLogo} disabled={logoSaving}
                        className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                        {logoSaving ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>}
                        {logoSaving ? "Salvando…" : "Salvar logo"}
                      </button>
                    )}
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

                  {canManage && (
                    <button onClick={() => saveSettingsPatch({ menuTextColor, menuActiveColor, menuFontSize, menuFontWeight })} disabled={saving}
                      className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                      <Save size={13} /> Salvar estilo do menu
                    </button>
                  )}
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
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-[#64748B]">Margem inferior (abaixo)</p>
                      <span className="text-xs font-bold text-[#0B2A66]">{headerMarginBottom}px</span>
                    </div>
                    <input type="range" min={0} max={48} step={2} value={headerMarginBottom}
                      onChange={(e) => setHeaderMarginBottom(Number(e.target.value))}
                      onMouseUp={() => saveSettingsPatch({ headerMarginBottom })}
                      onTouchEnd={() => saveSettingsPatch({ headerMarginBottom })}
                      className="w-full accent-[#0B2A66]" />
                  </div>
                  {canManage && (
                    <button onClick={() => saveSettingsPatch({ headerPaddingX, headerMarginTop, headerMarginBottom })} disabled={saving}
                      className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                      <Save size={13} /> Salvar margem
                    </button>
                  )}
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

                {/* ── Estilo portal: barra do topo, banner do logo e menu em faixa ── */}
                <div className="border-t border-[#E2E8F0] pt-4 space-y-2.5">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"><Layers size={12} /> Estilo portal</p>
                  <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0]">
                    <div>
                      <p className="text-[13px] font-semibold text-[#0F172A]">Barra do topo</p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">Faixa acima do cabeçalho com data, manchete "Trending" e redes sociais</p>
                    </div>
                    <Toggle checked={showTopBar} onChange={() => { const v = !showTopBar; setShowTopBar(v); saveSettingsPatch({ showTopBar: v }); }} />
                  </div>
                  {showTopBar && (
                    <div>
                      <p className="text-[11px] font-medium text-[#64748B] mb-1.5">Cor da barra do topo</p>
                      <div className="flex gap-2">
                        <input type="color" value={topBarBgColor || "#0b0d0c"} onChange={(e) => setTopBarBgColor(e.target.value)}
                          className="w-9 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                        <input type="text" value={topBarBgColor} placeholder="#0b0d0c" onChange={(e) => setTopBarBgColor(e.target.value)}
                          className="flex-1 min-w-0 border border-[#E2E8F0] rounded-xl px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                        <button onClick={() => saveSettingsPatch({ topBarBgColor })} disabled={saving}
                          className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">OK</button>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-medium text-[#64748B] mb-1.5">Posição do menu</p>
                    <select value={menuBarStyle}
                      onChange={(e) => { const v = e.target.value === "bar" ? "bar" as const : "attached" as const; setMenuBarStyle(v); saveSettingsPatch({ menuBarStyle: v }); }}
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20">
                      <option value="attached">Na linha do logo (padrão)</option>
                      <option value="bar">Faixa colorida abaixo do logo (portal)</option>
                    </select>
                  </div>
                  {menuBarStyle === "bar" && (
                    <div>
                      <p className="text-[11px] font-medium text-[#64748B] mb-1.5">Cor da faixa do menu</p>
                      <div className="flex gap-2">
                        <input type="color" value={menuBarBgColor || menuActiveColor} onChange={(e) => setMenuBarBgColor(e.target.value)}
                          className="w-9 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                        <input type="text" value={menuBarBgColor} placeholder="Vazio = cor do item ativo" onChange={(e) => setMenuBarBgColor(e.target.value)}
                          className="flex-1 min-w-0 border border-[#E2E8F0] rounded-xl px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                        <button onClick={() => saveSettingsPatch({ menuBarBgColor })} disabled={saving}
                          className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">OK</button>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-medium text-[#64748B]">Banner ao lado do logo (HTML ou imagem)</p>
                      <button type="button" onClick={() => bannerImgInputRef.current?.click()} disabled={bannerUploading}
                        className="flex items-center gap-1 text-[10px] font-semibold text-[#0B2A66] border border-[#0B2A66]/25 rounded-lg px-2 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50">
                        <Upload size={10} /> {bannerUploading ? "Enviando…" : "Upload de imagem"}
                      </button>
                    </div>
                    <input ref={bannerImgInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadHeaderBannerImage(f); e.target.value = ""; }} />
                    <textarea value={headerBannerHtml} onChange={(e) => setHeaderBannerHtml(e.target.value)} rows={4}
                      placeholder="<div>…HTML do banner…</div> (vazio = sem banner)"
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                    <input value={headerBannerLinkUrl} onChange={(e) => setHeaderBannerLinkUrl(e.target.value)}
                      placeholder="Link de redirecionamento ao clicar (opcional)"
                      className="w-full mt-1.5 border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                    <p className="text-[10px] text-[#94A3B8] mt-1 leading-relaxed">HTML sanitizado (scripts são removidos); exibido só no desktop, à direita do logo. O upload gera a tag da imagem pronta; com o link preenchido, o banner inteiro vira clicável (abre em nova aba).</p>
                    {canManage && (
                      <button onClick={() => saveSettingsPatch({ headerBannerHtml, headerBannerLinkUrl })} disabled={saving}
                        className="w-full mt-1.5 py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                        <Save size={13} /> Salvar banner
                      </button>
                    )}
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

                {/* ── Cor de acento (rodapé escuro) ── */}
                <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Cor de acento</p>
                  <p className="text-[11px] text-[#94A3B8] -mt-1">Borda superior, títulos das colunas e botão da newsletter (formato Escuro). Vazio = dourado padrão.</p>
                  <div className="flex gap-2">
                    <input type="color" value={footerAccentColor || "#c89110"} onChange={(e) => setFooterAccentColor(e.target.value)}
                      className="w-10 h-9 rounded-lg border border-[#E2E8F0] cursor-pointer" />
                    <input type="text" value={footerAccentColor} placeholder="#c89110" onChange={(e) => setFooterAccentColor(e.target.value)}
                      className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20" />
                    <button onClick={() => saveSettingsPatch({ footerAccentColor })} disabled={saving}
                      className="px-3 py-1.5 bg-[#0B2A66] text-white text-xs font-semibold rounded-xl hover:bg-[#0a2255] transition-colors">OK</button>
                  </div>
                </div>

                {/* ── Conteúdo do rodapé (textos, links, redes, contato…) ── */}
                <div className="border-t border-[#E2E8F0] pt-4">
                  <FooterEditor saving={saving}
                    onSave={(patch) => { setFooterConfig(patch.footerConfig); return saveSettingsPatch(patch); }} />
                </div>
              </div>
            )}

            {/* ── ARTICLE tab (página de notícia) ── */}
            {tab === "article" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3 flex items-start gap-2.5">
                  <Info size={14} className="text-[#2563EB] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#1e40af] leading-relaxed">
                    Controle da <b>página de notícia</b>: seções desligáveis e os blocos da
                    coluna lateral (300px de largura). A prévia ao lado mostra a home —
                    abra uma notícia do site para conferir o resultado.
                  </p>
                </div>

                {/* Seções da página — toggle liga/desliga; ligada, mostra os campos editáveis */}
                <div className="space-y-2.5">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Seções da página</p>

                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[#334155]">Caminho no topo (breadcrumb)</span>
                    <Toggle checked={articleShowBreadcrumb}
                      onChange={() => { const v = !articleShowBreadcrumb; setArticleShowBreadcrumb(v); void saveSettingsPatch({ articleShowBreadcrumb: v }); }} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[#334155]">Botões de compartilhar</span>
                    <Toggle checked={articleShowShare}
                      onChange={() => { const v = !articleShowShare; setArticleShowShare(v); void saveSettingsPatch({ articleShowShare: v }); }} />
                  </div>
                  {articleShowShare && (
                    <div className="ml-3 pl-3 border-l-2 border-[#E2E8F0] space-y-2">
                      <input value={articleShareLabel}
                        onChange={(e) => setArticleShareLabel(e.target.value)}
                        onBlur={() => void saveSettingsPatch({ articleShareLabel: articleShareLabel.trim() })}
                        placeholder="Rótulo — vazio = padrão do idioma do site"
                        className={AINPUT} />
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                        {SHARE_NETWORK_OPTIONS.map((n) => (
                          <label key={n.value} className="flex items-center gap-1.5 text-[11px] text-[#334155] cursor-pointer">
                            <input type="checkbox" checked={articleShareNetworks.includes(n.value)}
                              onChange={() => {
                                const next = articleShareNetworks.includes(n.value)
                                  ? articleShareNetworks.filter((x) => x !== n.value)
                                  : SHARE_NETWORK_OPTIONS.map((o) => o.value).filter((v) => v === n.value || articleShareNetworks.includes(v));
                                setArticleShareNetworks(next);
                                void saveSettingsPatch({ articleShareNetworks: next });
                              }} />
                            {n.label}
                          </label>
                        ))}
                      </div>
                      {articleShareNetworks.length === 0 && (
                        <p className="text-[10px] text-amber-600">Nenhuma rede marcada — os botões somem do site (igual a desligar a seção).</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[#334155]">Artigos relacionados</span>
                    <Toggle checked={articleShowRelated}
                      onChange={() => { const v = !articleShowRelated; setArticleShowRelated(v); void saveSettingsPatch({ articleShowRelated: v }); }} />
                  </div>
                  {articleShowRelated && (
                    <div className="ml-3 pl-3 border-l-2 border-[#E2E8F0] space-y-2">
                      <input value={articleRelatedTitle}
                        onChange={(e) => setArticleRelatedTitle(e.target.value)}
                        onBlur={() => void saveSettingsPatch({ articleRelatedTitle: articleRelatedTitle.trim() })}
                        placeholder="Título da seção — vazio = padrão do idioma do site"
                        className={AINPUT} />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#64748B]">Quantidade de artigos</span>
                        <select value={articleRelatedCount}
                          onChange={(e) => { const v = Number(e.target.value); setArticleRelatedCount(v); void saveSettingsPatch({ articleRelatedCount: v }); }}
                          className="border border-[#E2E8F0] rounded-xl px-2 py-1 text-xs bg-white appearance-none">
                          {[2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Blocos da coluna lateral */}
                <div className="border-t border-[#E2E8F0] pt-4 space-y-2">
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Blocos da coluna lateral</p>
                  {articleBlocks.map((b, idx) => {
                    const btype = inferBlockType(b);
                    return (
                      <div key={b.id} className="border border-[#E2E8F0] rounded-xl p-2.5 space-y-2 bg-white">
                        <div className="flex items-center gap-1.5">
                          <div className="flex flex-col shrink-0">
                            <button type="button" title="Mover para cima" onClick={() => moveArticleBlock(idx, -1)} disabled={idx === 0}
                              className="text-[#CBD5E1] hover:text-[#64748B] disabled:opacity-30"><ChevronUp size={13} /></button>
                            <button type="button" title="Mover para baixo" onClick={() => moveArticleBlock(idx, 1)} disabled={idx === articleBlocks.length - 1}
                              className="text-[#CBD5E1] hover:text-[#64748B] disabled:opacity-30"><ChevronDown size={13} /></button>
                          </div>
                          <input value={b.name} onChange={(e) => patchArticleBlock(b.id, { name: e.target.value })}
                            className={`${AINPUT} font-bold flex-1 min-w-0`} />
                          <Toggle checked={b.visible !== false} onChange={() => patchArticleBlock(b.id, { visible: b.visible === false })} />
                          <button type="button" title="Remover bloco"
                            onClick={() => setArticleBlocks((prev) => prev.filter((x) => x.id !== b.id))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {btype === "mostread" && (
                          <p className="text-[10px] text-[#94A3B8]">Lista automática dos mais lidos — o título público segue o idioma do site.</p>
                        )}
                        {btype === "advertising" && (
                          <>
                            <select value={b.adSlot ?? "slot_07"} onChange={(e) => patchArticleBlock(b.id, { adSlot: e.target.value })}
                              className={`${AINPUT} appearance-none`}>
                              {AD_SLOT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <select value={b.adId ?? ""} onChange={(e) => patchArticleBlock(b.id, { adId: e.target.value || undefined })}
                              className={`${AINPUT} appearance-none`}>
                              <option value="">Automática — anúncios ativos do espaço acima</option>
                              {articleAdsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </>
                        )}
                        {btype === "html" && (
                          <>
                            <textarea value={b.html ?? ""} onChange={(e) => patchArticleBlock(b.id, { html: e.target.value })}
                              rows={4} spellCheck={false} className={`${AINPUT} font-mono resize-y`} placeholder="<div>…HTML do banner…</div>" />
                            <input value={b.linkUrl ?? ""} onChange={(e) => patchArticleBlock(b.id, { linkUrl: e.target.value })}
                              className={AINPUT} placeholder="Link de redirecionamento ao clicar (opcional)" />
                          </>
                        )}
                        {btype === "image" && (
                          <>
                            <input value={b.imageUrl ?? ""} onChange={(e) => patchArticleBlock(b.id, { imageUrl: e.target.value })}
                              className={AINPUT} placeholder="URL da imagem (envie pela aba Propagandas ou cole aqui)" />
                            <input value={b.linkUrl ?? ""} onChange={(e) => patchArticleBlock(b.id, { linkUrl: e.target.value })}
                              className={AINPUT} placeholder="Link de redirecionamento ao clicar (opcional)" />
                            <input value={b.caption ?? ""} onChange={(e) => patchArticleBlock(b.id, { caption: e.target.value })}
                              className={AINPUT} placeholder="Legenda (opcional)" />
                          </>
                        )}
                        {(btype === "html" || btype === "image") && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-[#64748B]">É uma propaganda (lista na aba Propagandas)</span>
                            <Toggle checked={b.isAd === true} onChange={() => patchArticleBlock(b.id, { isAd: !b.isAd })} accent="#D97706" />
                          </div>
                        )}
                        {btype !== "advertising" && (
                          <FontPicker value={b.fontFamily ?? ""} inputClass={`${AINPUT} appearance-none`}
                            onChange={(v) => patchArticleBlock(b.id, { fontFamily: v || undefined })} />
                        )}
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ["html", "+ HTML"], ["image", "+ Imagem"], ["advertising", "+ Anúncio (slot)"], ["mostread", "+ Mais Lidas"],
                    ] as const).map(([type, label]) => (
                      <button key={type} type="button" onClick={() => addArticleBlock(type)}
                        disabled={type === "mostread" && articleBlocks.some((b) => inferBlockType(b) === "mostread")}
                        className="px-3 py-1.5 text-[11px] font-semibold text-[#0B2A66] border border-dashed border-[#CBD5E1] rounded-xl hover:bg-[#F8FAFC] disabled:opacity-40 transition-colors">
                        {label}
                      </button>
                    ))}
                  </div>

                  {articleSavedOk && (
                    <p className="text-[12px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      Lateral da notícia salva — abra uma notícia para conferir.
                    </p>
                  )}
                  {canManage && (
                    <button type="button" onClick={() => void saveArticleSidebar()} disabled={saving}
                      className="w-full py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0a2255] disabled:opacity-50 transition-colors">
                      <Save size={13} /> Salvar lateral da notícia
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── SETTINGS tab ── */}
            {tab === "settings" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3 flex items-start gap-2.5">
                  <Info size={14} className="text-[#2563EB] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#1e40af] leading-relaxed">
                    Aparência da home: abas <b>Cabeçalho</b> e <b>Rodapé</b>.
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
                    <a href={previewPath} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#64748B] border border-[#E2E8F0] rounded-xl hover:bg-[#F8FAFC] transition-colors">
                      <ExternalLink size={12} /> Abrir site
                    </a>
                  </div>
                </div>
                <div className="flex-1 overflow-auto bg-[#F1F5F9] p-4">
                  <div className="mx-auto transition-all duration-300 h-full" style={{ maxWidth: previewWidth, minHeight: "100%" }}>
                    <div className="w-full h-full rounded-2xl overflow-hidden shadow-lg bg-white" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}>
                      <iframe key={`${previewKey}-${previewPath}`} ref={iframeRef}
                        src={`${previewPath}?adminPreview=1`}
                        title={tab === "article" ? "Prévia da notícia" : "Prévia da Home"}
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
