import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type HomeBlock } from "../../lib/adminApi";
import { GripVertical, Eye, EyeOff, Save, CheckCircle, LayoutGrid } from "lucide-react";

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
  "ultimas":    "📰",
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
  { id: "ultimas",    name: "Últimas Notícias",    visible: true, order: 9 },
];

export default function HomeBlocksManager() {
  const [blocks, setBlocks] = useState<HomeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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

  async function handleSave() {
    setSaving(true); setSaved(false);
    const ordered = blocks.map((b, i) => ({ ...b, order: i }));
    try {
      await adminApi.updateSettings({ homeBlocks: ordered });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="Blocos da Home">
      <div className="max-w-2xl mx-auto space-y-4">

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <LayoutGrid size={18} className="text-[#1a2448]" />
                <h2 className="text-sm font-bold text-[#1a2448]">Ordem dos blocos da página inicial</h2>
              </div>
              <p className="text-xs text-gray-500">Arraste para reordenar ou use as setas. Clique no olho para ocultar sem excluir.</p>
            </div>
          </div>

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

                  <span className="text-lg shrink-0 w-7 text-center">{BLOCK_ICONS[block.id] ?? "📄"}</span>

                  <span className="text-[11px] text-gray-300 w-5 text-center font-mono shrink-0">{idx + 1}</span>

                  <span className={`flex-1 text-sm font-semibold ${block.visible ? "text-gray-800" : "text-gray-400"}`}>
                    {block.name}
                  </span>

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

        {/* Preview */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Prévia da ordem</h3>
          <div className="flex flex-wrap gap-2">
            {blocks.filter((b) => b.visible).map((b, i) => (
              <span key={b.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700">
                <span className="text-gray-400 font-mono">{i + 1}.</span>
                <span>{BLOCK_ICONS[b.id]}</span>
                {b.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
