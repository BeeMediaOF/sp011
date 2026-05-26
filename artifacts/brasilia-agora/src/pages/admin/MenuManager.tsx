import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type MenuItem } from "../../lib/adminApi";
import { Plus, Trash2, GripVertical, Save, Eye, EyeOff } from "lucide-react";

function newItem(): MenuItem {
  return { id: crypto.randomUUID(), label: "", path: "/", order: 999, visible: true };
}

export default function MenuManager() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    adminApi.getMenu()
      .then((r) => setItems(r.menuItems))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(idx: number, key: keyof MenuItem, value: string | number | boolean) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...newItem(), order: prev.length }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleVisible(idx: number) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, visible: !item.visible } : item));
  }

  // Drag-to-reorder
  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved!);
      return next.map((item, i) => ({ ...item, order: i }));
    });
    setDragIdx(idx);
  }
  function handleDragEnd() { setDragIdx(null); }

  async function handleSave() {
    setSaving(true); setSaved(false);
    const ordered = items.map((item, i) => ({ ...item, order: i }));
    try {
      const { menuItems } = await adminApi.updateMenu(ordered);
      setItems(menuItems);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="Gerenciar Menu">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Arraste para reordenar. Clique no olho para ocultar sem excluir.</p>
            <button
              onClick={addItem}
              className="flex items-center gap-1.5 text-sm bg-[#1a2448] text-white px-3 py-1.5 rounded-lg hover:bg-[#243060] transition-colors"
            >
              <Plus size={15} /> Adicionar
            </button>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-4">Carregando...</div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-all
                    ${dragIdx === idx ? "border-[#F5A623] bg-amber-50 shadow-md" : "border-gray-200 hover:border-gray-300 bg-white"}
                    ${!item.visible ? "opacity-50" : ""}`}
                >
                  <span className="cursor-grab text-gray-300 hover:text-gray-500 shrink-0">
                    <GripVertical size={18} />
                  </span>
                  <span className="text-xs text-gray-400 w-5 shrink-0 text-center font-mono">{idx + 1}</span>
                  <input
                    value={item.label}
                    onChange={(e) => update(idx, "label", e.target.value)}
                    placeholder="Label"
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a2448] font-medium"
                  />
                  <input
                    value={item.path}
                    onChange={(e) => update(idx, "path", e.target.value)}
                    placeholder="/caminho"
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a2448] text-gray-500 font-mono"
                  />
                  <button
                    onClick={() => toggleVisible(idx)}
                    className={`shrink-0 transition-colors ${item.visible ? "text-blue-500 hover:text-blue-700" : "text-gray-300 hover:text-gray-500"}`}
                    title={item.visible ? "Ocultar" : "Mostrar"}
                  >
                    {item.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    onClick={() => removeItem(idx)}
                    className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors
                ${saved ? "bg-green-500 text-white" : "bg-[#1a2448] text-white hover:bg-[#243060]"} disabled:opacity-60`}
            >
              <Save size={15} /> {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar Menu"}
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pré-visualização</h3>
          <div className="bg-[#1a2448] rounded-lg px-4 py-2 flex flex-wrap gap-4 overflow-x-auto">
            {items.filter((i) => i.visible).map((item) => (
              <span key={item.id} className="text-white text-xs font-semibold whitespace-nowrap py-1">
                {item.label || "—"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
