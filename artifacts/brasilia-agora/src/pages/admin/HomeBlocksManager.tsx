import React, { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import {
  GripVertical, Eye, EyeOff, Plus, Trash2, ChevronDown,
  CheckCircle, RefreshCw, Save, LayoutGrid, X, Layout, AlignLeft,
  Upload, Minus, ImageIcon,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

type LayoutId = "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico";
type HeaderStyle = "standard" | "compact" | "centered";
type FooterStyle = "dark" | "light" | "minimal";
type Tab = "blocks" | "header" | "footer";

const LAYOUTS: { id: LayoutId; label: string; desc: string; mini: React.ReactNode }[] = [
  {
    id: "grid", label: "Grade", desc: "4 cards em linha",
    mini: <div className="flex gap-0.5 w-full">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-5 bg-current rounded-sm opacity-40"/>)}</div>,
  },
  {
    id: "featured", label: "Destaque", desc: "1 grande + lista",
    mini: <div className="flex gap-0.5 w-full"><div className="flex-[2] h-5 bg-current rounded-sm opacity-40"/><div className="flex-1 flex flex-col gap-0.5">{[0,1,2,3].map(i=><div key={i} className="h-1 bg-current rounded opacity-25"/>)}</div></div>,
  },
  {
    id: "duplo", label: "Duplo", desc: "2 grandes + tira",
    mini: <div className="flex flex-col gap-0.5 w-full"><div className="flex gap-0.5"><div className="flex-1 h-3 bg-current rounded-sm opacity-40"/><div className="flex-1 h-3 bg-current rounded-sm opacity-40"/></div><div className="flex gap-0.5">{[0,1,2,3].map(i=><div key={i} className="flex-1 h-1.5 bg-current rounded opacity-25"/>)}</div></div>,
  },
  {
    id: "cultura", label: "Foto+Lista", desc: "Foto + lista ao lado",
    mini: <div className="flex gap-0.5 w-full"><div className="flex-[3] h-5 bg-current rounded-sm opacity-40"/><div className="flex-[2] flex flex-col gap-0.5 justify-center">{[0,1,2,3].map(i=><div key={i} className="h-1 bg-current rounded opacity-25"/>)}</div></div>,
  },
  {
    id: "lista", label: "Lista", desc: "Numerada com miniaturas",
    mini: <div className="flex flex-col gap-0.5 w-full">{[0,1,2,3].map(i=><div key={i} className="flex gap-0.5 items-center"><div className="w-1.5 h-1.5 bg-current rounded-full opacity-50 shrink-0"/><div className="flex-1 h-1 bg-current rounded opacity-25"/></div>)}</div>,
  },
  {
    id: "manchete", label: "Manchete", desc: "Hero full-width + 3",
    mini: <div className="flex flex-col gap-0.5 w-full"><div className="w-full h-4 bg-current rounded-sm opacity-40"/><div className="flex gap-0.5">{[0,1,2].map(i=><div key={i} className="flex-1 h-2 bg-current rounded-sm opacity-25"/>)}</div></div>,
  },
  {
    id: "mosaico", label: "Mosaico", desc: "1 grande + 4 pequenos",
    mini: <div className="flex gap-0.5 w-full"><div className="flex-[2] h-5 bg-current rounded-sm opacity-40"/><div className="flex-[2] grid grid-cols-2 gap-0.5">{[0,1,2,3].map(i=><div key={i} className="h-2 bg-current rounded-sm opacity-25"/>)}</div></div>,
  },
];

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

const SPECIAL_BLOCKS = new Set(["hero", "mais-lidas", "colunistas", "ultimas"]);

const BLOCK_DEFAULTS: Record<string, { category: string; layout: LayoutId; color: string }> = {
  brasil:     { category: "brasil",     layout: "grid",    color: "#16a34a" },
  mundo:      { category: "mundo",      layout: "grid",    color: "#6b21a8" },
  esporte:    { category: "esportes",   layout: "cultura", color: "#dc2626" },
  cultura:    { category: "cultura",    layout: "cultura", color: "#0d9488" },
  df:         { category: "cidade",     layout: "duplo",   color: "#0b3d91" },
  saude:      { category: "saude",      layout: "grid",    color: "#16a34a" },
  tecnologia: { category: "tecnologia", layout: "cultura", color: "#0284c7" },
};

const BLOCK_ICONS: Record<string, string> = {
  hero: "🏆", brasil: "🇧🇷", "mais-lidas": "🔥", mundo: "🌍",
  esporte: "⚽", cultura: "🎭", df: "🏙️", saude: "🏥",
  tecnologia: "💻", colunistas: "✍️", ultimas: "📰",
};

const DEFAULT_BLOCKS: HomeBlock[] = [
  { id: "hero",       name: "Hero / Destaques",  visible: true, order: 0 },
  { id: "brasil",     name: "Brasil",             visible: true, order: 1 },
  { id: "mais-lidas", name: "Mais Lidas",         visible: true, order: 2 },
  { id: "mundo",      name: "Mundo",              visible: true, order: 3 },
  { id: "esporte",    name: "Esporte",            visible: true, order: 4 },
  { id: "cultura",    name: "Cultura",            visible: true, order: 5 },
  { id: "df",         name: "DF",                 visible: true, order: 6 },
  { id: "saude",      name: "Saúde",              visible: true, order: 7 },
  { id: "tecnologia", name: "Tecnologia",         visible: true, order: 8 },
  { id: "colunistas", name: "Colunistas",         visible: true, order: 9 },
  { id: "ultimas",    name: "Últimas Notícias",   visible: true, order: 10 },
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

// ─── Header presets ───────────────────────────────────────────────────────────
const HEADER_PRESETS: { id: HeaderStyle; label: string; desc: string; preview: React.ReactNode }[] = [
  {
    id: "standard", label: "Padrão", desc: "Logo à esquerda, nav à direita, ticker abaixo",
    preview: (
      <div className="w-full space-y-0.5">
        <div className="flex items-center gap-1.5 px-1.5 py-1 bg-white rounded-sm">
          <div className="w-8 h-4 bg-gray-300 rounded-sm shrink-0" />
          <div className="flex gap-1 flex-1">{[0,1,2,3,4].map(i=><div key={i} className="h-2 bg-gray-200 rounded flex-1"/>)}</div>
        </div>
        <div className="flex gap-1 px-1.5 py-0.5 bg-gray-100 rounded-sm">
          {[0,1,2,3].map(i=><div key={i} className="h-1 bg-gray-300 rounded flex-1"/>)}
        </div>
      </div>
    ),
  },
  {
    id: "compact", label: "Compacto", desc: "Header fino, sem ticker, mais espaço para conteúdo",
    preview: (
      <div className="w-full">
        <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-white rounded-sm">
          <div className="w-6 h-3 bg-gray-300 rounded-sm shrink-0" />
          <div className="flex gap-1 flex-1">{[0,1,2,3,4].map(i=><div key={i} className="h-1.5 bg-gray-200 rounded flex-1"/>)}</div>
        </div>
      </div>
    ),
  },
  {
    id: "centered", label: "Centralizado", desc: "Logo no centro, nav em barra escura abaixo",
    preview: (
      <div className="w-full space-y-0.5">
        <div className="flex items-center justify-center px-1.5 py-1 bg-white rounded-sm">
          <div className="w-10 h-4 bg-gray-300 rounded-sm" />
        </div>
        <div className="flex items-center justify-center gap-1 px-1.5 py-1 bg-[#1a2448] rounded-sm">
          {[0,1,2,3,4].map(i=><div key={i} className="h-1.5 bg-white/30 rounded w-5"/>)}
        </div>
      </div>
    ),
  },
];

// ─── Footer presets ───────────────────────────────────────────────────────────
const FOOTER_PRESETS: { id: FooterStyle; label: string; desc: string; preview: React.ReactNode }[] = [
  {
    id: "dark", label: "Escuro", desc: "Fundo preto, colunas com links, newsletter",
    preview: (
      <div className="w-full space-y-1 px-1.5 py-2 bg-black rounded-sm">
        <div className="flex gap-1.5">{[0,1,2,3].map(i=><div key={i} className="flex-1 space-y-0.5">{[0,1,2].map(j=><div key={j} className="h-1 bg-white/20 rounded"/>)}</div>)}</div>
        <div className="h-px bg-white/10"/>
        <div className="h-1 bg-white/10 rounded w-2/3 mx-auto"/>
      </div>
    ),
  },
  {
    id: "light", label: "Claro", desc: "Fundo branco, colunas com links, borda vermelha",
    preview: (
      <div className="w-full border-t-2 border-[#c8102e] space-y-1 px-1.5 py-2 bg-gray-50 rounded-sm">
        <div className="flex gap-1.5">{[0,1,2,3].map(i=><div key={i} className="flex-1 space-y-0.5">{[0,1,2].map(j=><div key={j} className="h-1 bg-gray-300 rounded"/>)}</div>)}</div>
        <div className="h-px bg-gray-200"/>
        <div className="h-1 bg-gray-200 rounded w-2/3 mx-auto"/>
      </div>
    ),
  },
  {
    id: "minimal", label: "Minimal", desc: "Apenas uma linha com copyright e links",
    preview: (
      <div className="w-full px-1.5 py-2 bg-gray-100 rounded-sm flex items-center justify-between gap-2">
        <div className="h-1.5 bg-gray-300 rounded w-12"/>
        <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="h-1.5 bg-gray-300 rounded w-5"/>)}</div>
      </div>
    ),
  },
];

// ─── Settings panel ───────────────────────────────────────────────────────────
interface SettingsPanelProps {
  block: HomeBlock;
  form: BlockForm;
  saving: boolean;
  onChange: <K extends keyof BlockForm>(key: K, val: BlockForm[K]) => void;
  onApply: () => void;
  onCancel: () => void;
}

function SettingsPanel({ block, form, saving, onChange, onApply, onCancel }: SettingsPanelProps) {
  const isSpecial = SPECIAL_BLOCKS.has(block.id);
  return (
    <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Nome do bloco</label>
        <input
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2448]/30 focus:border-[#1a2448]"
          placeholder="Nome exibido na home"
        />
      </div>

      {!isSpecial && (
        <>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Categoria de artigos</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button"
                  onClick={() => { onChange("category", c.value); onChange("color", c.color); }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all text-left"
                  style={form.category === c.value
                    ? { borderColor: c.color, backgroundColor: c.color + "15", color: c.color }
                    : { borderColor: "#e5e7eb", color: "#6b7280" }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Layout visual</label>
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button"
                  onClick={() => onChange("layout", l.id)}
                  className="flex flex-col gap-1.5 p-2 rounded-lg border text-left transition-all"
                  style={form.layout === l.id
                    ? { borderColor: form.color, backgroundColor: form.color + "10", color: form.color }
                    : { borderColor: "#e5e7eb", color: "#9ca3af" }}>
                  <div className="w-full">{l.mini}</div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide block">{l.label}</span>
                    <span className="text-[9px] opacity-60">{l.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={onApply}
          disabled={saving || !form.name.trim()}
          className="flex-[2] flex items-center justify-center gap-2 px-4 py-2 bg-[#1a2448] text-white text-sm font-semibold rounded-lg hover:bg-[#243060] disabled:opacity-50 transition-colors">
          {saving
            ? <><RefreshCw size={13} className="animate-spin" /> Salvando…</>
            : <><CheckCircle size={13} /> Aplicar e Salvar</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Add block panel ──────────────────────────────────────────────────────────
interface AddPanelProps {
  form: BlockForm;
  onChange: <K extends keyof BlockForm>(key: K, val: BlockForm[K]) => void;
  onAdd: () => void;
  onClose: () => void;
}

function AddPanel({ form, onChange, onAdd, onClose }: AddPanelProps) {
  return (
    <div className="border-2 border-dashed border-[#1a2448]/30 rounded-xl p-4 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-[#1a2448] flex items-center gap-2">
          <LayoutGrid size={15} /> Novo bloco personalizado
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Nome</label>
        <input value={form.name} onChange={(e) => onChange("name", e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]/30 focus:border-[#1a2448]"
          placeholder="Ex: Política, Esporte..." autoFocus
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Categoria</label>
        <div className="grid grid-cols-3 gap-1">
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button"
              onClick={() => { onChange("category", c.value); onChange("color", c.color); }}
              className="px-2 py-1 rounded text-[11px] font-semibold border transition-all"
              style={form.category === c.value
                ? { borderColor: c.color, backgroundColor: c.color + "15", color: c.color }
                : { borderColor: "#e5e7eb", color: "#6b7280" }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Layout</label>
        <div className="grid grid-cols-2 gap-1">
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button"
              onClick={() => onChange("layout", l.id)}
              className="flex items-center gap-2 p-2 rounded-lg border text-left transition-all"
              style={form.layout === l.id
                ? { borderColor: form.color, backgroundColor: form.color + "10", color: form.color }
                : { borderColor: "#e5e7eb", color: "#9ca3af" }}>
              <div className="w-10 shrink-0">{l.mini}</div>
              <span className="text-[10px] font-bold uppercase">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={onAdd} disabled={!form.name.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#c8102e] text-white rounded-lg text-sm font-semibold hover:bg-[#a00d24] disabled:opacity-40 transition-colors">
        <Plus size={14} /> Adicionar à home
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomeBlocksManager() {
  const [blocks, setBlocks]         = useState<HomeBlock[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [dragIdx, setDragIdx]       = useState<number | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<BlockForm>(EMPTY_FORM);
  const [showAdd, setShowAdd]       = useState(false);
  const [addForm, setAddForm]       = useState<BlockForm>(EMPTY_FORM);
  const [previewKey, setPreviewKey] = useState(0);
  const [tab, setTab]               = useState<Tab>("blocks");
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>("standard");
  const [footerStyle, setFooterStyle] = useState<FooterStyle>("dark");
  const [headerBgColor, setHeaderBgColor] = useState<string>("#ffffff");
  const [footerBgColor, setFooterBgColor] = useState<string>("#000000");
  const [logoBase64, setLogoBase64]       = useState<string | null>(null);
  const [logoPreview, setLogoPreview]     = useState<string | null>(null);
  const [logoSize, setLogoSize]           = useState<number>(48);
  const [logoSaving, setLogoSaving]       = useState(false);
  const [logoStatus, setLogoStatus]       = useState<"idle" | "ok" | "err">("idle");
  const logoInputRef                      = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    adminApi.getSettings()
      .then((r) => {
        const bl = r.settings.homeBlocks;
        setBlocks(bl && bl.length > 0 ? bl : DEFAULT_BLOCKS);
        setHeaderStyle(r.settings.headerStyle ?? "standard");
        setFooterStyle(r.settings.footerStyle ?? "dark");
        setHeaderBgColor(r.settings.headerBgColor ?? "#ffffff");
        setFooterBgColor(r.settings.footerBgColor ?? "#000000");
        if (r.settings.logoBase64) setLogoBase64(r.settings.logoBase64);
        if (r.settings.logoSize)   setLogoSize(r.settings.logoSize);
      })
      .catch(() => setBlocks(DEFAULT_BLOCKS))
      .finally(() => setLoading(false));
  }, []);

  // ── postMessage listener (from preview iframe) ───────────────────────────
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      const { type, blockId, blockIds } = e.data as {
        type: string; blockId?: string; blockIds?: string[];
      };

      if (type === "block:edit" && blockId) {
        setTab("blocks");
        const block = blocks.find((b) => b.id === blockId);
        if (block) {
          setEditingId(blockId);
          setEditForm(blockToForm(block));
          setTimeout(() => {
            blockRefs.current[blockId]?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 80);
        }
      }

      if (type === "block:reorder" && blockIds) {
        setBlocks((prev) => {
          const map = new Map(prev.map((b) => [b.id, b]));
          const reordered = blockIds
            .map((id, i) => map.has(id) ? { ...map.get(id)!, order: i } : null)
            .filter(Boolean) as HomeBlock[];
          const rest = prev.filter((b) => !blockIds.includes(b.id));
          return [...reordered, ...rest];
        });
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          setSaving(true);
          try {
            const latest = await adminApi.getSettings();
            const map = new Map((latest.settings.homeBlocks ?? DEFAULT_BLOCKS).map((b) => [b.id, b]));
            const ordered = (blockIds ?? []).map((id, i) =>
              map.has(id) ? { ...map.get(id)!, order: i } : null
            ).filter(Boolean) as HomeBlock[];
            await adminApi.updateSettings({ homeBlocks: ordered });
            invalidateSiteCache();
          } catch { } finally { setSaving(false); }
        }, 800);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [blocks]);

  // ── Auto-save helper ──────────────────────────────────────────────────────
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

  async function saveHeaderFooter(
    hs: HeaderStyle, fs: FooterStyle, hBg?: string, fBg?: string
  ) {
    setSaving(true);
    try {
      await adminApi.updateSettings({
        headerStyle: hs,
        footerStyle: fs,
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
      if (logoPreview) {
        await adminApi.uploadLogo(logoPreview);
        setLogoBase64(logoPreview);
        setLogoPreview(null);
      }
      await adminApi.updateSettings({ logoSize });
      invalidateSiteCache();
      setLogoStatus("ok");
      setPreviewKey((k) => k + 1);
      setTimeout(() => setLogoStatus("idle"), 2500);
    } catch {
      setLogoStatus("err");
    } finally {
      setLogoSaving(false);
    }
  }

  // ── Block actions ─────────────────────────────────────────────────────────
  function toggleVisible(idx: number) {
    const next = blocks.map((b, i) => i === idx ? { ...b, visible: !b.visible } : b);
    setBlocks(next);
    autoSave(next);
  }

  function deleteBlock(id: string) {
    if (!confirm("Remover este bloco da home?")) return;
    const next = blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }));
    setBlocks(next);
    autoSave(next);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  function handleDragStart(idx: number) {
    if (editingId) return;
    setDragIdx(idx);
  }
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
    autoSave(blocks);
  }

  // ── Edit block ────────────────────────────────────────────────────────────
  function openEdit(block: HomeBlock) {
    if (editingId === block.id) { setEditingId(null); return; }
    setEditingId(block.id);
    setEditForm(blockToForm(block));
  }

  function setEditField<K extends keyof BlockForm>(key: K, val: BlockForm[K]) {
    setEditForm((prev) => ({ ...prev, [key]: val }));
  }

  async function applyAndSave(id: string) {
    const next = blocks.map((b) =>
      b.id === id
        ? { ...b, name: editForm.name, category: editForm.category, layout: editForm.layout, color: editForm.color }
        : b
    );
    setBlocks(next);
    setEditingId(null);
    setSaving(true);
    const ordered = next.map((b, i) => ({ ...b, order: i }));
    try {
      await adminApi.updateSettings({ homeBlocks: ordered });
      invalidateSiteCache();
      setSaved(true);
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2000);
    } catch { } finally { setSaving(false); }
  }

  // ── Add block ─────────────────────────────────────────────────────────────
  function setAddField<K extends keyof BlockForm>(key: K, val: BlockForm[K]) {
    setAddForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleAddBlock() {
    if (!addForm.name.trim()) return;
    const newBlock: HomeBlock = {
      id: `custom-${Date.now()}`,
      name: addForm.name.trim(),
      visible: true,
      order: blocks.length,
      category: addForm.category,
      layout: addForm.layout,
      color: addForm.color,
      custom: true,
    };
    const next = [...blocks, newBlock];
    setBlocks(next);
    setAddForm(EMPTY_FORM);
    setShowAdd(false);
    autoSave(next);
  }

  const visibleCount = blocks.filter((b) => b.visible).length;

  return (
    <AdminLayout title="Blocos da Home" noPadding>
      <div className="flex h-[calc(100vh-57px)] overflow-hidden">

        {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
        <div className="w-[360px] shrink-0 flex flex-col border-r border-gray-200 bg-gray-50 overflow-hidden">

          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-[#1a2448]">Blocos da Home</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {loading ? "Carregando…" : `${visibleCount} visível${visibleCount !== 1 ? "s" : ""} · ${blocks.length} total`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {saved && <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold"><CheckCircle size={12} /> Salvo</span>}
                {saving && <RefreshCw size={13} className="text-gray-400 animate-spin" />}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-t border-gray-100">
              {([
                { id: "blocks" as Tab, label: "Blocos",    icon: <LayoutGrid size={13} /> },
                { id: "header" as Tab, label: "Cabeçalho", icon: <Layout size={13} /> },
                { id: "footer" as Tab, label: "Rodapé",    icon: <AlignLeft size={13} /> },
              ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold transition-colors border-b-2 ${
                    tab === t.id
                      ? "text-[#1a2448] border-[#1a2448]"
                      : "text-gray-400 border-transparent hover:text-gray-600"
                  }`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab: Blocks ── */}
          {tab === "blocks" && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="flex-1 px-3 py-3 space-y-2">
                {loading ? (
                  <div className="text-center py-16 text-gray-400 text-sm">Carregando…</div>
                ) : (
                  blocks.map((block, idx) => {
                    const isEditing   = editingId === block.id;
                    const isDragging  = dragIdx === idx;
                    const isSpecial   = SPECIAL_BLOCKS.has(block.id);
                    const activeColor = block.color ?? BLOCK_DEFAULTS[block.id]?.color ?? "#6b7280";
                    const catLabel    = CATEGORIES.find(c => c.value === (block.category ?? BLOCK_DEFAULTS[block.id]?.category))?.label;
                    const layoutLabel = block.layout ?? BLOCK_DEFAULTS[block.id]?.layout ?? "grid";

                    return (
                      <div
                        key={block.id}
                        ref={(el) => { blockRefs.current[block.id] = el; }}
                        draggable={!isEditing}
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`rounded-xl border bg-white transition-all select-none
                          ${isDragging ? "border-[#F5A623] shadow-lg scale-[1.02] rotate-1" : "border-gray-200 shadow-sm"}
                          ${!block.visible && !isEditing ? "opacity-40" : ""}
                          ${isEditing ? "ring-2 ring-[#1a2448]/20" : ""}
                        `}
                      >
                        <div
                          className={`flex items-center gap-2 px-3 py-2.5 ${isEditing ? "cursor-default" : "cursor-pointer"}`}
                          onClick={() => openEdit(block)}
                        >
                          <span className="text-gray-300 hover:text-gray-500 cursor-grab shrink-0" onClick={(e) => e.stopPropagation()}>
                            <GripVertical size={16} />
                          </span>

                          {block.custom ? (
                            <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm shrink-0" style={{ backgroundColor: activeColor }} />
                          ) : (
                            <span className="text-base shrink-0 leading-none">{BLOCK_ICONS[block.id] ?? "📄"}</span>
                          )}

                          <span className="text-[10px] text-gray-300 w-4 text-center font-mono shrink-0">{idx + 1}</span>

                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-semibold leading-tight truncate ${block.visible ? "text-gray-800" : "text-gray-400"}`}>
                              {block.name}
                            </p>
                            {!isSpecial && (
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {catLabel && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                                    style={{ backgroundColor: activeColor + "15", color: activeColor }}>
                                    {catLabel}
                                  </span>
                                )}
                                <span className="text-[9px] text-gray-400 uppercase font-semibold">{layoutLabel}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => toggleVisible(idx)}
                              title={block.visible ? "Ocultar" : "Mostrar"}
                              className={`p-1.5 rounded-lg transition-colors ${block.visible ? "text-blue-400 hover:bg-blue-50" : "text-gray-300 hover:bg-gray-50"}`}>
                              {block.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            {block.custom ? (
                              <button onClick={() => deleteBlock(block.id)}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            ) : <span className="w-[29px]" />}
                          </div>

                          <span className={`text-gray-300 transition-transform ${isEditing ? "rotate-180" : ""}`}>
                            <ChevronDown size={14} />
                          </span>
                        </div>

                        {isEditing && (
                          <SettingsPanel
                            block={block}
                            form={editForm}
                            saving={saving}
                            onChange={setEditField}
                            onApply={() => applyAndSave(block.id)}
                            onCancel={() => setEditingId(null)}
                          />
                        )}
                      </div>
                    );
                  })
                )}

                {showAdd ? (
                  <AddPanel
                    form={addForm}
                    onChange={setAddField}
                    onAdd={handleAddBlock}
                    onClose={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}
                  />
                ) : (
                  <button
                    onClick={() => setShowAdd(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-gray-400 hover:border-[#1a2448] hover:text-[#1a2448] hover:bg-white transition-all"
                  >
                    <Plus size={15} /> Adicionar bloco
                  </button>
                )}
              </div>

              <div className="sticky bottom-0 px-3 py-3 bg-white border-t border-gray-200">
                <button
                  onClick={async () => {
                    setSaving(true);
                    const ordered = blocks.map((b, i) => ({ ...b, order: i }));
                    try {
                      await adminApi.updateSettings({ homeBlocks: ordered });
                      invalidateSiteCache();
                      setSaved(true);
                      setPreviewKey((k) => k + 1);
                      setTimeout(() => setSaved(false), 2000);
                    } catch { } finally { setSaving(false); }
                  }}
                  disabled={saving || loading}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50
                    ${saved ? "bg-green-500 text-white" : "bg-[#1a2448] text-white hover:bg-[#243060]"}`}
                >
                  {saved ? <><CheckCircle size={15} /> Tudo salvo!</>
                    : saving ? <><RefreshCw size={15} className="animate-spin" /> Salvando…</>
                    : <><Save size={15} /> Salvar tudo</>}
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Header ── */}
          {tab === "header" && (
            <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <p className="text-[11px] text-gray-500">Escolha um formato pré-salvo para o cabeçalho do portal.</p>
              <div className="space-y-3">
                {HEADER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={async () => {
                      setHeaderStyle(preset.id);
                      await saveHeaderFooter(preset.id, footerStyle, headerBgColor, undefined);
                    }}
                    className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                      headerStyle === preset.id
                        ? "border-[#1a2448] bg-[#1a2448]/5"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="mb-2">{preset.preview}</div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-bold text-gray-800">{preset.label}</p>
                        <p className="text-[11px] text-gray-500">{preset.desc}</p>
                      </div>
                      {headerStyle === preset.id && (
                        <span className="flex items-center gap-1 text-[11px] text-[#1a2448] font-bold">
                          <CheckCircle size={14} /> Ativo
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Color picker */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">Cor de fundo do cabeçalho</p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={headerBgColor}
                    onChange={(e) => setHeaderBgColor(e.target.value)}
                    className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={headerBgColor}
                    onChange={(e) => setHeaderBgColor(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] font-mono"
                    placeholder="#ffffff"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await saveHeaderFooter(headerStyle, footerStyle, headerBgColor, undefined);
                    }}
                    className="px-3 py-1.5 bg-[#1a2448] text-white text-xs font-semibold rounded-lg hover:bg-[#243060] transition-colors"
                  >
                    Salvar
                  </button>
                </div>
                <div className="mt-2 rounded-lg h-8 border border-gray-200 flex items-center px-3 text-xs font-semibold"
                  style={{ backgroundColor: headerBgColor }}>
                  <span style={{ color: headerBgColor === "#ffffff" || !headerBgColor ? "#6b7280" : "#000" }}>
                    Pré-visualização
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["#ffffff", "#f8fafc", "#f1f5f9", "#1a2448", "#0b3d91", "#c8102e", "#18181b"].map((c) => (
                    <button key={c} type="button"
                      onClick={() => setHeaderBgColor(c)}
                      title={c}
                      className={`w-6 h-6 rounded border-2 transition-all ${headerBgColor === c ? "border-[#1a2448] scale-110" : "border-transparent hover:border-gray-300"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            {/* ── Logo section ── */}
            <div className="mx-4 mb-4 bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                <ImageIcon size={13} /> Logo do cabeçalho
              </p>

              {/* Current logo preview */}
              {(logoPreview ?? logoBase64) && (
                <div className="bg-white border rounded-lg p-3 flex items-center justify-center overflow-hidden" style={{ backgroundColor: headerBgColor || "#fff" }}>
                  <img
                    src={logoPreview ?? logoBase64!}
                    alt="logo preview"
                    style={{ height: logoSize, transition: "height 0.15s" }}
                    className="w-auto object-contain"
                  />
                </div>
              )}

              {/* Upload drop zone */}
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f && f.type.startsWith("image/")) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
                    reader.readAsDataURL(f);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => logoInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl py-4 px-3 flex flex-col items-center gap-2 cursor-pointer hover:border-[#1a2448] hover:bg-white transition-colors"
              >
                <Upload size={22} className="text-gray-300" />
                <p className="text-xs text-gray-500 text-center">
                  Clique ou arraste a nova logo aqui<br />
                  <span className="text-[10px] text-gray-400">PNG, SVG, WEBP — fundo transparente</span>
                </p>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
                      reader.readAsDataURL(f);
                    }
                  }}
                />
              </div>

              {/* Size control */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tamanho</span>
                  <span className="text-sm font-bold text-[#1a2448]">{logoSize}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLogoSize((s) => Math.max(32, s - 8))}
                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-white transition-colors bg-white"
                  >
                    <Minus size={12} />
                  </button>
                  <input
                    type="range" min={32} max={160} step={4}
                    value={logoSize}
                    onChange={(e) => setLogoSize(Number(e.target.value))}
                    className="flex-1 accent-[#1a2448]"
                  />
                  <button
                    type="button"
                    onClick={() => setLogoSize((s) => Math.min(160, s + 8))}
                    className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-white transition-colors bg-white"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              {/* Status & save button */}
              {logoStatus === "ok" && (
                <div className="flex items-center gap-1.5 text-green-700 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle size={13} /> Logo atualizada com sucesso!
                </div>
              )}
              {logoStatus === "err" && (
                <div className="flex items-center gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  Erro ao salvar logo
                </div>
              )}
              <button
                type="button"
                onClick={saveLogo}
                disabled={logoSaving}
                className="w-full py-2 rounded-lg bg-[#1a2448] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0d1730] disabled:opacity-50 transition-colors"
              >
                {logoSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {logoSaving ? "Salvando…" : "Salvar logo"}
              </button>
            </div>
            </>
          )}

          {/* ── Tab: Footer ── */}
          {tab === "footer" && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <p className="text-[11px] text-gray-500">Escolha um formato pré-salvo para o rodapé do portal.</p>
              <div className="space-y-3">
                {FOOTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={async () => {
                      setFooterStyle(preset.id);
                      await saveHeaderFooter(headerStyle, preset.id, undefined, footerBgColor);
                    }}
                    className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                      footerStyle === preset.id
                        ? "border-[#1a2448] bg-[#1a2448]/5"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="mb-2">{preset.preview}</div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-bold text-gray-800">{preset.label}</p>
                        <p className="text-[11px] text-gray-500">{preset.desc}</p>
                      </div>
                      {footerStyle === preset.id && (
                        <span className="flex items-center gap-1 text-[11px] text-[#1a2448] font-bold">
                          <CheckCircle size={14} /> Ativo
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Color picker */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">Cor de fundo do rodapé</p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={footerBgColor}
                    onChange={(e) => setFooterBgColor(e.target.value)}
                    className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={footerBgColor}
                    onChange={(e) => setFooterBgColor(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] font-mono"
                    placeholder="#000000"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await saveHeaderFooter(headerStyle, footerStyle, undefined, footerBgColor);
                    }}
                    className="px-3 py-1.5 bg-[#1a2448] text-white text-xs font-semibold rounded-lg hover:bg-[#243060] transition-colors"
                  >
                    Salvar
                  </button>
                </div>
                <div className="mt-2 rounded-lg h-8 flex items-center px-3 text-xs font-semibold text-white"
                  style={{ backgroundColor: footerBgColor }}>
                  Pré-visualização
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["#000000", "#18181b", "#1a2448", "#0b3d91", "#1a3a2a", "#3b1f6e", "#1e293b", "#ffffff"].map((c) => (
                    <button key={c} type="button"
                      onClick={() => setFooterBgColor(c)}
                      title={c}
                      className={`w-6 h-6 rounded border-2 transition-all ${footerBgColor === c ? "border-[#1a2448] scale-110" : "border-transparent hover:border-gray-300"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL — Live preview ══════════════════════════════════════ */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Prévia ao vivo</span>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                Passe o mouse sobre um bloco para editar ou arrastar
              </span>
            </div>
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:border-[#1a2448] hover:text-[#1a2448] transition-colors"
            >
              <RefreshCw size={11} /> Atualizar
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              key={previewKey}
              ref={iframeRef}
              src="/?adminPreview=1"
              className="w-full h-full border-0"
              title="Prévia da Home"
            />
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
