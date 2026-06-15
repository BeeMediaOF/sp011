import React, { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import {
  GripVertical, Eye, EyeOff, Plus, Trash2, ChevronDown, ChevronUp,
  CheckCircle, RefreshCw, Save, LayoutGrid, X,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

type LayoutId = "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico";

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
    layout:   block.layout   ?? d?.layout   ?? "grid",
    color:    block.color    ?? d?.color    ?? "#6b7280",
  };
}

const EMPTY_FORM: BlockForm = { name: "", category: "politica", layout: "grid", color: "#1d4ed8" };

// ─── Block settings panel ─────────────────────────────────────────────────────
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
      {/* Name */}
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
          {/* Category */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Categoria de artigos</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { onChange("category", c.value); onChange("color", c.color); }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-all text-left"
                  style={form.category === c.value
                    ? { borderColor: c.color, backgroundColor: c.color + "15", color: c.color }
                    : { borderColor: "#e5e7eb", color: "#6b7280" }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Layout */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Layout visual</label>
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onChange("layout", l.id)}
                  className="flex flex-col gap-1.5 p-2 rounded-lg border text-left transition-all"
                  style={form.layout === l.id
                    ? { borderColor: form.color, backgroundColor: form.color + "10", color: form.color }
                    : { borderColor: "#e5e7eb", color: "#9ca3af" }}
                >
                  <div className="w-full">{l.mini}</div>
                  <span className="text-[10px] font-bold uppercase tracking-wide">{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={saving || !form.name.trim()}
          className="flex-[2] flex items-center justify-center gap-2 px-4 py-2 bg-[#1a2448] text-white text-sm font-semibold rounded-lg hover:bg-[#243060] disabled:opacity-50 transition-colors"
        >
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
        <input
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]/30 focus:border-[#1a2448]"
          placeholder="Ex: Política, Esporte..."
          autoFocus
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

      <button
        type="button"
        onClick={onAdd}
        disabled={!form.name.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#c8102e] text-white rounded-lg text-sm font-semibold hover:bg-[#a00d24] disabled:opacity-40 transition-colors"
      >
        <Plus size={14} /> Adicionar à home
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomeBlocksManager() {
  const [blocks, setBlocks]       = useState<HomeBlock[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [dragIdx, setDragIdx]     = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<BlockForm>(EMPTY_FORM);
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState<BlockForm>(EMPTY_FORM);
  const [previewKey, setPreviewKey] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    adminApi.getSettings()
      .then((r) => {
        const bl = r.settings.homeBlocks;
        setBlocks(bl && bl.length > 0 ? bl : DEFAULT_BLOCKS);
      })
      .catch(() => setBlocks(DEFAULT_BLOCKS))
      .finally(() => setLoading(false));
  }, []);

  // ── Auto-save helper ────────────────────────────────────────────────────────
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

  // ── Block actions ────────────────────────────────────────────────────────────
  function toggleVisible(idx: number) {
    const next = blocks.map((b, i) => i === idx ? { ...b, visible: !b.visible } : b);
    setBlocks(next);
    autoSave(next);
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const n = idx + dir;
    if (n < 0 || n >= blocks.length) return;
    const arr = [...blocks];
    [arr[idx], arr[n]] = [arr[n]!, arr[idx]!];
    const next = arr.map((b, i) => ({ ...b, order: i }));
    setBlocks(next);
    autoSave(next);
  }

  function deleteBlock(id: string) {
    if (!confirm("Remover este bloco da home?")) return;
    const next = blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }));
    setBlocks(next);
    autoSave(next);
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────
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

  // ── Edit block ───────────────────────────────────────────────────────────────
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

  // ── Add block ────────────────────────────────────────────────────────────────
  function setAddField<K extends keyof BlockForm>(key: K, val: BlockForm[K]) {
    setAddForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleAddBlock() {
    if (!addForm.name.trim()) return;
    const newBlock: HomeBlock = {
      id:       `custom-${Date.now()}`,
      name:     addForm.name.trim(),
      visible:  true,
      order:    blocks.length,
      category: addForm.category,
      layout:   addForm.layout,
      color:    addForm.color,
      custom:   true,
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

        {/* ══ LEFT PANEL — Block editor ══════════════════════════════════════════ */}
        <div className="w-[360px] shrink-0 flex flex-col border-r border-gray-200 bg-gray-50 overflow-y-auto">

          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-[#1a2448]">Blocos da Home</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {loading ? "Carregando…" : `${visibleCount} visível${visibleCount !== 1 ? "s" : ""} · ${blocks.length} total`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold">
                  <CheckCircle size={12} /> Salvo
                </span>
              )}
              {saving && (
                <RefreshCw size={13} className="text-gray-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Block list */}
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
                    {/* ── Block row ── */}
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 ${isEditing ? "cursor-default" : "cursor-pointer"}`}
                      onClick={() => openEdit(block)}
                    >
                      {/* Drag handle */}
                      <span
                        className="text-gray-300 hover:text-gray-500 cursor-grab shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical size={16} />
                      </span>

                      {/* Icon */}
                      {block.custom ? (
                        <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm shrink-0"
                          style={{ backgroundColor: activeColor }} />
                      ) : (
                        <span className="text-base shrink-0 leading-none">{BLOCK_ICONS[block.id] ?? "📄"}</span>
                      )}

                      {/* Order */}
                      <span className="text-[10px] text-gray-300 w-4 text-center font-mono shrink-0">{idx + 1}</span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-semibold leading-tight truncate ${block.visible ? "text-gray-800" : "text-gray-400"}`}>
                          {block.name}
                        </p>
                        {!isSpecial && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {catLabel && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                                style={{ backgroundColor: activeColor + "20", color: activeColor }}>
                                {catLabel}
                              </span>
                            )}
                            <span className="text-[9px] text-gray-400 uppercase tracking-wide">{layoutLabel}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Move up/down */}
                        <div className="flex flex-col">
                          <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-0 p-0.5 leading-none">
                            <ChevronUp size={12} />
                          </button>
                          <button onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-0 p-0.5 leading-none">
                            <ChevronDown size={12} />
                          </button>
                        </div>

                        {/* Toggle visible */}
                        <button
                          onClick={() => toggleVisible(idx)}
                          title={block.visible ? "Ocultar" : "Mostrar"}
                          className={`p-1.5 rounded-lg transition-colors ${block.visible ? "text-blue-400 hover:bg-blue-50" : "text-gray-300 hover:bg-gray-50"}`}
                        >
                          {block.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>

                        {/* Delete (custom only) */}
                        {block.custom ? (
                          <button onClick={() => deleteBlock(block.id)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <span className="w-[29px]" />
                        )}
                      </div>

                      {/* Expand indicator */}
                      <span className={`text-gray-300 transition-transform ${isEditing ? "rotate-180" : ""}`}>
                        <ChevronDown size={14} />
                      </span>
                    </div>

                    {/* ── Settings panel ── */}
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

            {/* Add block */}
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

          {/* Save all button */}
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
              {saved
                ? <><CheckCircle size={15} /> Tudo salvo!</>
                : saving
                  ? <><RefreshCw size={15} className="animate-spin" /> Salvando…</>
                  : <><Save size={15} /> Salvar tudo</>
              }
            </button>
          </div>
        </div>

        {/* ══ RIGHT PANEL — Live preview ══════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Prévia ao vivo</span>
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
              src="/"
              className="w-full h-full border-0"
              title="Prévia da Home"
            />
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
