import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import {
  GripVertical, Eye, EyeOff, Save, CheckCircle, LayoutGrid,
  Plus, X, Trash2, Pencil, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Layout definitions ───────────────────────────────────────────────────────
const LAYOUTS: {
  id: "grid" | "featured" | "duplo" | "cultura";
  label: string;
  desc: string;
  preview: React.ReactNode;
}[] = [
  {
    id: "grid",
    label: "Grade",
    desc: "4 cards em linha com carrossel",
    preview: (
      <div className="flex gap-1 w-full">
        {[0,1,2,3].map(i => <div key={i} className="flex-1 h-8 bg-current rounded opacity-30" />)}
      </div>
    ),
  },
  {
    id: "featured",
    label: "Destaque",
    desc: "1 grande + 4 títulos laterais",
    preview: (
      <div className="flex gap-1 w-full">
        <div className="flex-[2] h-8 bg-current rounded opacity-30" />
        <div className="flex-1 flex flex-col gap-1">
          {[0,1,2,3].map(i => <div key={i} className="h-1.5 bg-current rounded opacity-20" />)}
        </div>
      </div>
    ),
  },
  {
    id: "duplo",
    label: "Duplo Destaque",
    desc: "2 cards grandes + tira inferior",
    preview: (
      <div className="flex flex-col gap-1 w-full">
        <div className="flex gap-1">
          <div className="flex-1 h-5 bg-current rounded opacity-30" />
          <div className="flex-1 h-5 bg-current rounded opacity-30" />
        </div>
        <div className="flex gap-1">
          {[0,1,2,3].map(i => <div key={i} className="flex-1 h-2 bg-current rounded opacity-20" />)}
        </div>
      </div>
    ),
  },
  {
    id: "cultura",
    label: "Foto + Lista",
    desc: "Foto grande + lista de notícias ao lado",
    preview: (
      <div className="flex gap-1 w-full">
        <div className="flex-[3] h-8 bg-current rounded opacity-30" />
        <div className="flex-[2] flex flex-col gap-1 justify-center">
          {[0,1,2,3,4].map(i => <div key={i} className="h-1.5 bg-current rounded opacity-20" />)}
        </div>
      </div>
    ),
  },
];

// ─── Categories ──────────────────────────────────────────────────────────────
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

// Blocks that have a fixed component (no category/layout makes sense)
const SPECIAL_BLOCKS = new Set(["hero", "mais-lidas", "colunistas", "ultimas"]);

// Default configs for predefined configurable blocks
const BLOCK_DEFAULTS: Record<string, { category: string; layout: "grid"|"featured"|"duplo"|"cultura"; color: string }> = {
  brasil:     { category: "brasil",     layout: "grid",    color: "#16a34a" },
  mundo:      { category: "mundo",      layout: "grid",    color: "#6b21a8" },
  esporte:    { category: "esportes",   layout: "cultura", color: "#dc2626" },
  cultura:    { category: "cultura",    layout: "cultura", color: "#0d9488" },
  df:         { category: "cidade",     layout: "duplo",   color: "#0b3d91" },
  saude:      { category: "saude",      layout: "grid",    color: "#16a34a" },
  tecnologia: { category: "tecnologia", layout: "cultura", color: "#0284c7" },
};

const BLOCK_ICONS: Record<string, string> = {
  "hero":       "🏆",
  "brasil":     "🇧🇷",
  "mais-lidas": "🔥",
  "mundo":      "🌍",
  "esporte":    "⚽",
  "cultura":    "🎭",
  "df":         "🏙️",
  "saude":      "🏥",
  "tecnologia": "💻",
  "colunistas": "✍️",
  "ultimas":    "📰",
};

const LAYOUT_LABELS: Record<string, string> = {
  grid: "Grade", featured: "Destaque", duplo: "Duplo", cultura: "Foto+Lista",
};

const DEFAULT_BLOCKS: HomeBlock[] = [
  { id: "hero",       name: "Hero / Destaques",   visible: true, order: 0 },
  { id: "brasil",     name: "Brasil",              visible: true, order: 1 },
  { id: "mais-lidas", name: "Mais Lidas",          visible: true, order: 2 },
  { id: "mundo",      name: "Mundo",               visible: true, order: 3 },
  { id: "esporte",    name: "Esporte",             visible: true, order: 4 },
  { id: "cultura",    name: "Cultura",             visible: true, order: 5 },
  { id: "df",         name: "DF",                  visible: true, order: 6 },
  { id: "saude",      name: "Saúde",               visible: true, order: 7 },
  { id: "tecnologia", name: "Tecnologia",          visible: true, order: 8 },
  { id: "colunistas", name: "Colunistas",          visible: true, order: 9 },
  { id: "ultimas",    name: "Últimas Notícias",    visible: true, order: 10 },
];

// ─── Inline edit state ────────────────────────────────────────────────────────
interface EditForm {
  name: string;
  category: string;
  layout: "grid" | "featured" | "duplo" | "cultura";
  color: string;
}

function blockToEditForm(block: HomeBlock): EditForm {
  const defaults = BLOCK_DEFAULTS[block.id];
  return {
    name: block.name,
    category: block.category ?? defaults?.category ?? "geral",
    layout: block.layout ?? defaults?.layout ?? "grid",
    color: block.color ?? defaults?.color ?? "#6b7280",
  };
}

// ─── New-block form ───────────────────────────────────────────────────────────
const FORM_EMPTY: EditForm = { name: "", category: "politica", layout: "grid", color: "#1d4ed8" };

// ─── Component ───────────────────────────────────────────────────────────────
export default function HomeBlocksManager() {
  const [blocks, setBlocks]     = useState<HomeBlock[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [dragIdx, setDragIdx]   = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<EditForm>(FORM_EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<EditForm>(FORM_EMPTY);

  useEffect(() => {
    adminApi.getSettings().then((r) => {
      const bl = r.settings.homeBlocks;
      setBlocks(bl && bl.length > 0 ? bl : DEFAULT_BLOCKS);
    }).catch(() => setBlocks(DEFAULT_BLOCKS))
      .finally(() => setLoading(false));
  }, []);

  function toggleVisible(idx: number) {
    setBlocks((prev) => prev.map((b, i) => i === idx ? { ...b, visible: !b.visible } : b));
  }

  function handleDragStart(idx: number) {
    if (editingId) return; // don't drag while editing
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
  function handleDragEnd() { setDragIdx(null); }

  function moveBlock(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= blocks.length) return;
    setBlocks((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr.map((b, i) => ({ ...b, order: i }));
    });
  }

  function deleteCustomBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
  }

  function openEdit(block: HomeBlock) {
    if (editingId === block.id) { setEditingId(null); return; }
    setEditingId(block.id);
    setEditForm(blockToEditForm(block));
  }

  function applyEdit(id: string) {
    setBlocks((prev) => prev.map((b) =>
      b.id === id
        ? { ...b, name: editForm.name, category: editForm.category, layout: editForm.layout, color: editForm.color }
        : b
    ));
    setEditingId(null);
  }

  function setEditField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    if (key === "category") {
      const cat = CATEGORIES.find((c) => c.value === value as string);
      if (cat) setEditForm((prev) => ({ ...prev, category: value as string, color: cat.color }));
    }
  }

  function handleFormChange<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "category") {
      const cat = CATEGORIES.find((c) => c.value === value as string);
      if (cat) setForm((prev) => ({ ...prev, category: value as string, color: cat.color }));
    }
  }

  function handleAddBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const newBlock: HomeBlock = {
      id: `custom-${Date.now()}`,
      name: form.name.trim(),
      visible: true,
      order: blocks.length,
      category: form.category,
      layout: form.layout,
      color: form.color,
      custom: true,
    };
    setBlocks((prev) => [...prev, newBlock]);
    setForm(FORM_EMPTY);
    setShowForm(false);
  }

  async function handleSave() {
    setSaving(true); setSaved(false);
    const ordered = blocks.map((b, i) => ({ ...b, order: i }));
    try {
      await adminApi.updateSettings({ homeBlocks: ordered });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { } finally { setSaving(false); }
  }

  // ─── Inline edit panel ──────────────────────────────────────────────────────
  function EditPanel({ block }: { block: HomeBlock }) {
    const isSpecial = SPECIAL_BLOCKS.has(block.id);
    const activeColor = editForm.color || "#6b7280";

    return (
      <div className="border-t border-gray-100 pt-3 mt-1 space-y-3">
        {/* Name */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Nome exibido no site</label>
          <input
            value={editForm.name}
            onChange={(e) => setEditField("name", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
          />
        </div>

        {!isSpecial && (
          <>
            {/* Category + Layout row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Categoria de artigos</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditField("category", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Formato</label>
                <select
                  value={editForm.layout}
                  onChange={(e) => setEditField("layout", e.target.value as EditForm["layout"])}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                >
                  {LAYOUTS.map((l) => (
                    <option key={l.id} value={l.id}>{l.label} — {l.desc}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Layout visual picker */}
            <div className="grid grid-cols-4 gap-2">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setEditField("layout", l.id)}
                  className={`p-2.5 border-2 rounded-xl text-left transition-all ${
                    editForm.layout === l.id
                      ? "border-[#1a2448] bg-[#1a2448]/5"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                  style={{ color: activeColor }}
                >
                  <div className="mb-1.5">{l.preview}</div>
                  <p className="text-[10px] font-bold text-gray-600 leading-tight">{l.label}</p>
                </button>
              ))}
            </div>

            {/* Color */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Cor de destaque</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="color"
                  value={editForm.color}
                  onChange={(e) => setEditField("color", e.target.value)}
                  className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                />
                <span className="text-xs text-gray-400 font-mono">{editForm.color}</span>
                <div className="flex gap-1.5 ml-1 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => setEditField("color", c.color)}
                      className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: c.color,
                        borderColor: editForm.color === c.color ? "#1a2448" : "transparent",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Prévia</p>
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: editForm.color }} />
            <span className="text-[14px] font-bold text-[#1a1a1a] uppercase tracking-wider">
              {editForm.name || "—"}
            </span>
            {!isSpecial && (
              <>
                <span className="text-xs text-gray-300">•</span>
                <span className="text-[11px] text-gray-400">
                  {CATEGORIES.find(c => c.value === editForm.category)?.label}
                </span>
                <span className="ml-auto text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">
                  {LAYOUT_LABELS[editForm.layout]}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="px-4 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => applyEdit(block.id)}
            className="px-4 py-1.5 bg-[#1a2448] text-white rounded-lg text-xs font-semibold hover:bg-[#243060]"
          >
            Aplicar
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout title="Blocos da Home">
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <LayoutGrid size={18} className="text-[#1a2448]" />
                <h2 className="text-sm font-bold text-[#1a2448]">Blocos da página inicial</h2>
              </div>
              <p className="text-xs text-gray-500">
                Arraste para reordenar · 👁 ocultar · ✏ editar categoria/formato
              </p>
            </div>
            <button
              onClick={() => { setShowForm((s) => !s); setEditingId(null); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1a2448] text-white rounded-lg text-sm font-semibold hover:bg-[#243060] transition-colors"
            >
              {showForm ? <X size={14} /> : <Plus size={14} />}
              {showForm ? "Cancelar" : "Novo Bloco"}
            </button>
          </div>

          {/* ── New block form ── */}
          {showForm && (
            <form onSubmit={handleAddBlock} className="border border-[#1a2448]/20 rounded-xl p-5 space-y-4 bg-blue-50/30">
              <h3 className="text-xs font-bold text-[#1a2448] uppercase tracking-wide">Criar novo bloco</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do bloco</label>
                  <input
                    value={form.name}
                    onChange={(e) => handleFormChange("name", e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="Ex: Notícias Locais"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(e) => handleFormChange("category", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Formato</label>
                <div className="grid grid-cols-4 gap-2" style={{ color: form.color }}>
                  {LAYOUTS.map((l) => (
                    <button key={l.id} type="button" onClick={() => handleFormChange("layout", l.id)}
                      className={`p-2.5 border-2 rounded-xl text-left transition-all ${
                        form.layout === l.id ? "border-[#1a2448] bg-[#1a2448]/5" : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className="mb-1">{l.preview}</div>
                      <p className="text-[10px] font-bold text-gray-600">{l.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-600">Cor:</label>
                <input type="color" value={form.color}
                  onChange={(e) => handleFormChange("color", e.target.value)}
                  className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                />
                <div className="flex gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button key={c.value} type="button" title={c.label}
                      onClick={() => handleFormChange("color", c.color)}
                      className="w-5 h-5 rounded-full border-2 hover:scale-110 transition-all"
                      style={{ backgroundColor: c.color, borderColor: form.color === c.color ? "#1a2448" : "transparent" }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-[#c8102e] text-white rounded-lg text-sm font-semibold hover:bg-[#a00d24]">
                  <Plus size={14} /> Adicionar Bloco
                </button>
              </div>
            </form>
          )}

          {/* ── Block list ── */}
          {loading ? (
            <div className="text-center text-gray-400 py-8">Carregando...</div>
          ) : (
            <div className="space-y-1.5">
              {blocks.map((block, idx) => {
                const isEditing = editingId === block.id;
                const isDragging = dragIdx === idx;
                const activeColor = block.color ?? BLOCK_DEFAULTS[block.id]?.color ?? "#6b7280";
                const catLabel = CATEGORIES.find(c => c.value === (block.category ?? BLOCK_DEFAULTS[block.id]?.category))?.label;
                const layoutLabel = LAYOUT_LABELS[block.layout ?? BLOCK_DEFAULTS[block.id]?.layout ?? "grid"];
                const isSpecial = SPECIAL_BLOCKS.has(block.id);

                return (
                  <div
                    key={block.id}
                    draggable={!isEditing}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`border rounded-xl transition-all select-none
                      ${isDragging ? "border-[#F5A623] bg-amber-50 shadow-md scale-[1.01]" : isEditing ? "border-[#1a2448]/30 bg-[#1a2448]/[0.02] shadow-sm" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}
                      ${!block.visible && !isEditing ? "opacity-50" : ""}`}
                  >
                    {/* ── Row ── */}
                    <div className={`flex items-center gap-3 p-3.5 ${isEditing ? "cursor-default" : "cursor-grab"}`}>
                      <span className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
                        <GripVertical size={18} />
                      </span>

                      {/* Icon / color dot */}
                      {block.custom ? (
                        <span className="w-5 h-5 rounded-full shrink-0 border-2 border-white shadow-sm"
                          style={{ backgroundColor: activeColor }} />
                      ) : (
                        <span className="text-lg shrink-0 w-7 text-center">{BLOCK_ICONS[block.id] ?? "📄"}</span>
                      )}

                      <span className="text-[11px] text-gray-300 w-5 text-center font-mono shrink-0">{idx + 1}</span>

                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-semibold ${block.visible ? "text-gray-800" : "text-gray-400"}`}>
                          {block.name}
                        </span>
                        {/* Show category/layout for non-special blocks */}
                        {!isSpecial && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {catLabel && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: `${activeColor}18`, color: activeColor }}>
                                {catLabel}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">{layoutLabel}</span>
                          </div>
                        )}
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${block.visible ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {block.visible ? "Visível" : "Oculto"}
                      </span>

                      {/* Move buttons */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-[10px] leading-none px-1"
                          title="Subir">▲</button>
                        <button onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-[10px] leading-none px-1"
                          title="Descer">▼</button>
                      </div>

                      <button onClick={() => toggleVisible(idx)}
                        className={`shrink-0 transition-colors ${block.visible ? "text-blue-400 hover:text-blue-600" : "text-gray-300 hover:text-gray-500"}`}
                        title={block.visible ? "Ocultar" : "Mostrar"}>
                        {block.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>

                      <button onClick={() => openEdit(block)}
                        className={`shrink-0 transition-colors ${isEditing ? "text-[#1a2448]" : "text-gray-400 hover:text-[#1a2448]"}`}
                        title="Editar bloco">
                        {isEditing ? <ChevronUp size={16} /> : <Pencil size={14} />}
                      </button>

                      {block.custom ? (
                        <button onClick={() => deleteCustomBlock(block.id)}
                          className="shrink-0 text-red-400 hover:text-red-600 transition-colors" title="Remover">
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <span className="w-[14px] shrink-0" />
                      )}
                    </div>

                    {/* ── Inline edit panel ── */}
                    {isEditing && (
                      <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
                        <EditPanel block={block} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <p className="text-xs text-gray-400">
              {blocks.filter((b) => b.visible).length} de {blocks.length} blocos visíveis
              {editingId && <span className="ml-2 text-amber-500">· Há alterações não salvas</span>}
            </p>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60
                ${saved ? "bg-green-500 text-white" : "bg-[#1a2448] text-white hover:bg-[#243060]"}`}
            >
              {saved ? <><CheckCircle size={15} /> Salvo!</> : <><Save size={15} /> {saving ? "Salvando..." : "Salvar Ordem"}</>}
            </button>
          </div>
        </div>

        {/* Preview strip */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Prévia da ordem</h3>
          <div className="flex flex-wrap gap-2">
            {blocks.filter((b) => b.visible).map((b, i) => {
              const color = b.color ?? BLOCK_DEFAULTS[b.id]?.color;
              return (
                <span key={b.id}
                  className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700"
                  style={color ? { borderLeftColor: color, borderLeftWidth: 3, borderColor: `${color}40` } : {}}>
                  <span className="text-gray-400 font-mono">{i + 1}.</span>
                  <span>{b.custom ? "▦" : (BLOCK_ICONS[b.id] ?? "📄")}</span>
                  {b.name}
                </span>
              );
            })}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
