import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import {
  GripVertical, Eye, EyeOff, Save, CheckCircle, LayoutGrid,
  Plus, X, Trash2,
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
        {[0,1,2,3].map(i => (
          <div key={i} className="flex-1 h-8 bg-gray-300 rounded" />
        ))}
      </div>
    ),
  },
  {
    id: "featured",
    label: "Destaque",
    desc: "1 grande + 4 títulos laterais",
    preview: (
      <div className="flex gap-1 w-full">
        <div className="flex-[2] h-8 bg-gray-300 rounded" />
        <div className="flex-1 flex flex-col gap-1">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-1.5 bg-gray-300 rounded" />
          ))}
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
          <div className="flex-1 h-5 bg-gray-300 rounded" />
          <div className="flex-1 h-5 bg-gray-300 rounded" />
        </div>
        <div className="flex gap-1">
          {[0,1,2,3].map(i => (
            <div key={i} className="flex-1 h-2 bg-gray-200 rounded" />
          ))}
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
        <div className="flex-[3] h-8 bg-gray-300 rounded" />
        <div className="flex-[2] flex flex-col gap-1 justify-center">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="h-1.5 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    ),
  },
];

// ─── Categories ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "politica",   label: "Política",    color: "#1d4ed8" },
  { value: "cidade",     label: "Cidade / DF",  color: "#0b3d91" },
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

// ─── Fixed block icons ────────────────────────────────────────────────────────
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

const LAYOUT_ICONS: Record<string, string> = {
  grid: "▦",
  featured: "◧",
  duplo: "⊞",
  cultura: "▣",
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

// ─── New-block form state ─────────────────────────────────────────────────────
interface NewBlockForm {
  name: string;
  category: string;
  layout: "grid" | "featured" | "duplo" | "cultura";
  color: string;
}

const FORM_EMPTY: NewBlockForm = {
  name: "",
  category: "politica",
  layout: "grid",
  color: "#1d4ed8",
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function HomeBlocksManager() {
  const [blocks, setBlocks]   = useState<HomeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState<NewBlockForm>(FORM_EMPTY);

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

  function handleDragStart(idx: number) { setDragIdx(idx); }
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

  function handleFormChange<K extends keyof NewBlockForm>(key: K, value: NewBlockForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "category") {
      const cat = CATEGORIES.find((c) => c.value === value as string);
      if (cat) setForm((prev) => ({ ...prev, category: value as string, color: cat.color }));
    }
  }

  function handleAddBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const id = `custom-${Date.now()}`;
    const newBlock: HomeBlock = {
      id,
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
    } catch { } finally {
      setSaving(false);
    }
  }

  const selectedLayout = LAYOUTS.find((l) => l.id === form.layout)!;

  return (
    <AdminLayout title="Blocos da Home">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <LayoutGrid size={18} className="text-[#1a2448]" />
                <h2 className="text-sm font-bold text-[#1a2448]">Blocos da página inicial</h2>
              </div>
              <p className="text-xs text-gray-500">Arraste para reordenar. Clique no olho para ocultar. Crie novos blocos personalizados abaixo.</p>
            </div>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1a2448] text-white rounded-lg text-sm font-semibold hover:bg-[#243060] transition-colors"
            >
              {showForm ? <X size={14} /> : <Plus size={14} />}
              {showForm ? "Cancelar" : "Novo Bloco"}
            </button>
          </div>

          {/* New block form */}
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
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria de artigos</label>
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

              {/* Layout picker */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Formato / Layout</label>
                <div className="grid grid-cols-2 gap-2">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => handleFormChange("layout", l.id)}
                      className={`p-3 border-2 rounded-xl text-left transition-all ${
                        form.layout === l.id
                          ? "border-[#1a2448] bg-[#1a2448]/5"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className="mb-2">{l.preview}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#1a2448] text-xs">{l.label}</span>
                        {form.layout === l.id && (
                          <span className="text-[10px] bg-[#1a2448] text-white rounded px-1.5 py-0.5">Selecionado</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{l.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Cor de destaque</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => handleFormChange("color", e.target.value)}
                    className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                  />
                  <span className="text-xs text-gray-500 font-mono">{form.color}</span>
                  <div className="flex gap-1.5 ml-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        onClick={() => handleFormChange("color", c.color)}
                        className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                        style={{
                          backgroundColor: c.color,
                          borderColor: form.color === c.color ? "#1a2448" : "transparent",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Prévia do cabeçalho</p>
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 rounded-full" style={{ backgroundColor: form.color }} />
                  <span className="text-[15px] font-bold text-[#1a1a1a] uppercase tracking-wider">
                    {form.name || "Nome do Bloco"}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    {LAYOUT_ICONS[form.layout]} {selectedLayout?.label}
                  </span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-[#c8102e] text-white rounded-lg text-sm font-semibold hover:bg-[#a00d24] transition-colors"
                >
                  <Plus size={14} /> Adicionar Bloco
                </button>
              </div>
            </form>
          )}

          {/* Block list */}
          {loading ? (
            <div className="text-center text-gray-400 py-8">Carregando...</div>
          ) : (
            <div className="space-y-2">
              {blocks.map((block, idx) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-3.5 border rounded-xl transition-all cursor-grab select-none
                    ${dragIdx === idx ? "border-[#F5A623] bg-amber-50 shadow-md scale-[1.01]" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}
                    ${!block.visible ? "opacity-50" : ""}`}
                >
                  <span className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
                    <GripVertical size={18} />
                  </span>

                  {/* Icon or color dot */}
                  {block.custom ? (
                    <span
                      className="w-5 h-5 rounded-full shrink-0 border-2 border-white shadow-sm"
                      style={{ backgroundColor: block.color ?? "#6b7280" }}
                    />
                  ) : (
                    <span className="text-lg shrink-0 w-7 text-center">{BLOCK_ICONS[block.id] ?? "📄"}</span>
                  )}

                  <span className="text-[11px] text-gray-300 w-5 text-center font-mono shrink-0">{idx + 1}</span>

                  <span className={`flex-1 text-sm font-semibold ${block.visible ? "text-gray-800" : "text-gray-400"}`}>
                    {block.name}
                  </span>

                  {/* Layout badge for custom blocks */}
                  {block.custom && block.layout && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 shrink-0">
                      {LAYOUT_ICONS[block.layout]} {LAYOUTS.find(l => l.id === block.layout)?.label}
                    </span>
                  )}

                  {/* Category badge for custom blocks */}
                  {block.custom && block.category && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: `${block.color ?? "#6b7280"}20`, color: block.color ?? "#6b7280" }}>
                      {CATEGORIES.find(c => c.value === block.category)?.label ?? block.category}
                    </span>
                  )}

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${block.visible ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {block.visible ? "Visível" : "Oculto"}
                  </span>

                  {/* Move buttons */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => moveBlock(idx, -1)}
                      disabled={idx === 0}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors text-[10px] leading-none px-1"
                      title="Subir"
                    >▲</button>
                    <button
                      onClick={() => moveBlock(idx, 1)}
                      disabled={idx === blocks.length - 1}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors text-[10px] leading-none px-1"
                      title="Descer"
                    >▼</button>
                  </div>

                  <button
                    onClick={() => toggleVisible(idx)}
                    className={`shrink-0 transition-colors ${block.visible ? "text-blue-500 hover:text-blue-700" : "text-gray-300 hover:text-gray-500"}`}
                    title={block.visible ? "Ocultar" : "Mostrar"}
                  >
                    {block.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>

                  {/* Delete — only for custom blocks */}
                  {block.custom ? (
                    <button
                      onClick={() => deleteCustomBlock(block.id)}
                      className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                      title="Remover bloco"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <span className="w-[14px] shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <p className="text-xs text-gray-400">{blocks.filter((b) => b.visible).length} de {blocks.length} blocos visíveis</p>
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
            {blocks.filter((b) => b.visible).map((b, i) => (
              <span key={b.id} className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700"
                style={b.custom ? { borderLeftColor: b.color ?? "#6b7280", borderLeftWidth: 3 } : {}}>
                <span className="text-gray-400 font-mono">{i + 1}.</span>
                <span>{b.custom ? (LAYOUT_ICONS[b.layout ?? "grid"]) : (BLOCK_ICONS[b.id] ?? "📄")}</span>
                {b.name}
              </span>
            ))}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
