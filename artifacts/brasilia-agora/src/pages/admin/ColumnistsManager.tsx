import React, { useEffect, useState, useRef } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Columnist } from "../../lib/adminApi";
import { Users, Plus, Trash2, Eye, EyeOff, ImageIcon } from "lucide-react";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

export default function ColumnistsManager() {
  const [columnists, setColumnists] = useState<Columnist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [preview, setPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getColumnists();
      setColumnists(data.columnists);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(await toBase64(file));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !bio.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.createColumnist({ name, bio, avatarBase64: preview, active: true });
      setName(""); setBio(""); setPreview(""); setShowForm(false);
      await load();
    } catch (err) { alert((err as Error).message); } finally { setSubmitting(false); }
  }

  async function toggleActive(c: Columnist) {
    try { await adminApi.updateColumnist(c.id, { active: !c.active }); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este colunista?")) return;
    try { await adminApi.deleteColumnist(id); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  return (
    <AdminLayout title="Colunistas">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="text-[#F5A623]" size={24} />
            <h2 className="text-xl font-bold text-[#1a2448]">Gerenciar Colunistas</h2>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 px-4 py-2 bg-[#1a2448] text-white rounded-lg hover:bg-[#2a3458] text-sm font-semibold">
            <Plus size={16} /> {showForm ? "Fechar" : "Novo Colunista"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Novo Colunista</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Biografia</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} required rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" placeholder="Breve bio" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Foto</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              <div className="flex gap-4 items-center">
                <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                  <ImageIcon size={16} /> Selecionar foto
                </button>
                {preview && (
                  <div className="relative">
                    <img src={preview} alt="Preview" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                    <button type="button" onClick={() => { setPreview(""); if (fileRef.current) fileRef.current.value = ""; }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting} className="px-6 py-2 bg-[#F5A623] text-[#1a2448] rounded-lg font-semibold text-sm hover:bg-[#e09520] disabled:opacity-50">
                {submitting ? "Salvando..." : "Salvar Colunista"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : columnists.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Users size={32} className="mx-auto mb-3 text-gray-300" />
            <p>Nenhum colunista cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {columnists.map((c) => (
              <div key={c.id} className={`bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-center shadow-sm ${!c.active ? "opacity-60" : ""}`}>
                <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {c.avatarBase64 ? <img src={c.avatarBase64} alt={c.name} className="w-full h-full object-cover" /> : <span className="text-gray-400 text-lg font-bold">{c.name.charAt(0)}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-[#1a2448] truncate">{c.name}</h4>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${c.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{c.active ? "Ativo" : "Inativo"}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{c.bio}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(c)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                    {c.active ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="w-8 h-8 rounded-lg border border-red-200 flex items-center justify-center text-red-500 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
