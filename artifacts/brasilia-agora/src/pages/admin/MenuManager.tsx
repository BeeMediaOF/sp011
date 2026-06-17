import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type MenuItem } from "../../lib/adminApi";
import {
  Plus, PlusCircle, Trash2, GripVertical, Save, Eye, EyeOff,
  Search, ChevronDown, ChevronRight, Pencil, Monitor, Tablet,
  Smartphone, FileText, Home, LayoutGrid, Check, Link2, Loader2,
} from "lucide-react";

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

type Tab = "principal" | "superior" | "rodape";
type DevicePreview = "desktop" | "tablet" | "mobile";
type PagesTab = "paginas" | "categorias" | "links";

const AVAILABLE_PAGES = [
  "Página Inicial",
  "Sobre o SBC Agora",
  "Contato",
  "Anuncie",
  "Termos de Uso",
  "Política de Privacidade",
  "Trabalhe Conosco",
];

const CATEGORIES = [
  "Cidades", "Política", "Economia", "Esportes",
  "Cultura", "Tecnologia", "Saúde", "Educação",
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
        checked ? "bg-[#0B2A66]" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function MenuManager() {
  const [items, setItems]       = useState<MenuItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const [tab, setTab]           = useState<Tab>("principal");
  const [device, setDevice]     = useState<DevicePreview>("desktop");
  const [pagesTab, setPagesTab] = useState<PagesTab>("paginas");
  const [pageSearch, setPageSearch] = useState("");
  const [dragIdx, setDragIdx]   = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  // Local edit state for selected item settings panel
  const [editLabel, setEditLabel]   = useState("");
  const [editPath, setEditPath]     = useState("/");
  const [editNewTab, setEditNewTab] = useState(false);
  const [editVisible, setEditVisible] = useState(true);
  const [editHighlight, setEditHighlight] = useState(false);

  useEffect(() => {
    adminApi.getMenu()
      .then((r) => {
        setItems(r.menuItems);
        if (r.menuItems.length > 0) {
          setSelected(r.menuItems[0]!.id);
          syncEdit(r.menuItems[0]!);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function syncEdit(item: MenuItem) {
    setEditLabel(item.label);
    setEditPath(item.path);
    setEditNewTab(false);
    setEditVisible(item.visible);
    setEditHighlight(false);
  }

  function selectItem(item: MenuItem) {
    setSelected(item.id);
    syncEdit(item);
  }

  function updateSelected(patch: Partial<MenuItem>) {
    if (!selected) return;
    setItems((prev) => prev.map((it) => it.id === selected ? { ...it, ...patch } : it));
  }

  function applyEditToSelected() {
    updateSelected({ label: editLabel, path: editPath, visible: editVisible });
  }

  function addItem(label: string, path: string) {
    const id = crypto.randomUUID();
    const item: MenuItem = { id, label, path, order: items.length, visible: true };
    setItems((prev) => [...prev, item]);
    setSelected(id);
    syncEdit(item);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (selected === id) { setSelected(null); }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
      return next.map((it, i) => ({ ...it, order: i }));
    });
    setDragIdx(idx);
  }
  function handleDragEnd() { setDragIdx(null); }

  async function handleSave() {
    setSaving(true); setSaved(false);
    const ordered = items.map((it, i) => ({ ...it, order: i }));
    try {
      const { menuItems } = await adminApi.updateMenu(ordered);
      setItems(menuItems);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { } finally { setSaving(false); }
  }

  const selectedItem = items.find((it) => it.id === selected) ?? null;

  const filteredPages = AVAILABLE_PAGES.filter((p) =>
    !pageSearch || p.toLowerCase().includes(pageSearch.toLowerCase())
  );

  return (
    <AdminLayout title="Menu">
      <div className="space-y-5">

        {/* ── Page header — tabs + actions ─────────────────────── */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 flex-1 min-w-[300px]">
            {([
              { key: "principal", label: "Menu principal" },
              { key: "superior",  label: "Menu superior"  },
              { key: "rodape",    label: "Rodapé"          },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === key
                    ? "border-[#0B2A66] text-[#0B2A66]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => addItem("Novo item", "/")}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition-colors"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <PlusCircle size={15} /> Criar novo menu
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-colors disabled:opacity-60"
              style={{ background: saved ? "#16A34A" : "#E71D36" }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
              {saved ? "Salvo!" : saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>

        {/* ── Menu preview ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-[#0B2A66]">Pré-visualização do menu principal</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Responsivo:</span>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden text-slate-500">
                {([
                  { key: "desktop",  Icon: Monitor,    w: 18 },
                  { key: "tablet",   Icon: Tablet,     w: 16 },
                  { key: "mobile",   Icon: Smartphone, w: 14 },
                ] as { key: DevicePreview; Icon: React.ElementType; w: number }[]).map(({ key, Icon, w }) => (
                  <button
                    key={key}
                    onClick={() => setDevice(key)}
                    className={`p-2 transition-colors ${
                      device === key ? "bg-[#0B2A66] text-white" : "hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={w} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Simulated nav bar */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-1 flex-wrap overflow-x-auto">
            <span className="font-black text-[#0B2A66] text-lg mr-3">SBC <span className="text-[#E71D36]">Agora</span></span>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs font-semibold text-[#0B2A66] bg-[#EEF2FF] px-3 py-1.5 rounded-full cursor-pointer">
                <Home size={11} /> Página inicial
              </span>
              {items.filter((it) => it.visible).slice(0, device === "desktop" ? 8 : device === "tablet" ? 5 : 2).map((it) => (
                <span
                  key={it.id}
                  onClick={() => selectItem(it)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full cursor-pointer transition-colors ${
                    selected === it.id
                      ? "bg-[#0B2A66] text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {it.label}
                </span>
              ))}
              {items.filter((it) => it.visible).length > (device === "desktop" ? 8 : device === "tablet" ? 5 : 2) && (
                <span className="flex items-center gap-1 text-xs font-medium text-slate-500 px-3 py-1.5 rounded-full hover:bg-slate-100 cursor-pointer">
                  Mais <ChevronDown size={10} />
                </span>
              )}
              <span className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                <Search size={14} />
              </span>
            </div>
          </div>
        </div>

        {/* ── 3-column editor ──────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.7fr_1.1fr] gap-4 items-start">

          {/* ── Column 1: Available items ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
            <div className="px-5 pt-5 pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-[#0B2A66]">Itens disponíveis</h3>
              <p className="text-xs text-slate-400 mt-0.5">Páginas, categorias e links que podem ser adicionados ao menu.</p>
            </div>

            {/* Inner tabs */}
            <div className="flex border-b border-slate-100 px-5">
              {([
                { key: "paginas",    label: "Páginas" },
                { key: "categorias", label: "Categorias" },
                { key: "links",      label: "Links personalizados" },
              ] as { key: PagesTab; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPagesTab(key)}
                  className={`text-xs font-medium py-2.5 mr-3 border-b-2 -mb-px transition-colors ${
                    pagesTab === key
                      ? "border-[#0B2A66] text-[#0B2A66]"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={pageSearch}
                  onChange={(e) => setPageSearch(e.target.value)}
                  placeholder="Buscar páginas..."
                  className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] placeholder:text-slate-400"
                />
              </div>

              {/* List */}
              <div className="space-y-1">
                {pagesTab === "paginas" && filteredPages.map((page) => (
                  <div key={page} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 group cursor-pointer">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <FileText size={12} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{page}</p>
                      <p className="text-[10px] text-slate-400">Página</p>
                    </div>
                    <button
                      onClick={() => addItem(page, `/${page.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`)}
                      className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-[#0B2A66] hover:text-white flex items-center justify-center text-slate-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                ))}
                {pagesTab === "categorias" && CATEGORIES.map((cat) => (
                  <div key={cat} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 group cursor-pointer">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <LayoutGrid size={12} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700">{cat}</p>
                      <p className="text-[10px] text-slate-400">Categoria</p>
                    </div>
                    <button
                      onClick={() => addItem(cat, `/${cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g,"-")}`)}
                      className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-[#0B2A66] hover:text-white flex items-center justify-center text-slate-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                ))}
                {pagesTab === "links" && (
                  <div className="pt-1">
                    <p className="text-xs text-slate-400 mb-3">Adicione um link externo ou personalizado.</p>
                    <button
                      onClick={() => addItem("Link externo", "https://")}
                      className="flex items-center gap-2 text-xs font-medium text-[#2563EB] hover:underline"
                    >
                      <Link2 size={12} /> Adicionar link personalizado
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 px-4 py-3">
              <button className="flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                Ver todas as páginas <ChevronRight size={12} />
              </button>
            </div>
          </div>

          {/* ── Column 2: Menu structure ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
            <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#0B2A66]">Estrutura do menu</h3>
                <p className="text-xs text-slate-400 mt-0.5">Arraste e solte para reordenar. Arraste para a direita para criar subitens.</p>
              </div>
              <button
                onClick={() => addItem("Novo item", "/")}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-colors shrink-0"
              >
                <Plus size={12} /> Adicionar item
              </button>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 size={18} className="animate-spin" /> Carregando…
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <LayoutGrid size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum item no menu</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((item, idx) => {
                    const isSelected = selected === item.id;
                    const isExpanded = expanded.has(item.id);
                    return (
                      <div key={item.id}>
                        <div
                          draggable
                          onDragStart={() => handleDragStart(idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDragEnd={handleDragEnd}
                          onClick={() => selectItem(item)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                            isSelected
                              ? "border-[#0B2A66] bg-[#EEF2FF]"
                              : dragIdx === idx
                              ? "border-amber-300 bg-amber-50"
                              : "border-transparent hover:bg-slate-50 hover:border-slate-200"
                          } ${!item.visible ? "opacity-50" : ""}`}
                        >
                          <span className="cursor-grab text-slate-300 hover:text-slate-500 shrink-0">
                            <GripVertical size={14} />
                          </span>

                          {/* Expand toggle */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                            className="text-slate-300 hover:text-slate-500 shrink-0 w-4"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${isSelected ? "text-[#0B2A66]" : "text-slate-700"}`}>
                              {item.label || "—"}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">{item.path}</p>
                          </div>

                          {/* Type badge */}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            item.path.startsWith("http")
                              ? "bg-purple-50 text-purple-600"
                              : item.path.startsWith("/") && item.path.length > 1
                              ? "bg-blue-50 text-blue-600"
                              : "bg-slate-100 text-slate-500"
                          }`}>
                            {item.path.startsWith("http") ? "Link" : "Categoria"}
                          </span>

                          {/* Row actions */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); selectItem(item); }}
                              className="p-1 rounded text-slate-300 hover:text-[#0B2A66] hover:bg-blue-50 transition-colors"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, visible: !it.visible } : it));
                              }}
                              className={`p-1 rounded transition-colors ${item.visible ? "text-slate-300 hover:text-slate-600" : "text-amber-400 hover:text-amber-600"}`}
                            >
                              {item.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                              className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        {/* Placeholder children */}
                        {isExpanded && (
                          <div className="ml-8 mt-1 space-y-1">
                            <div
                              onClick={() => addItem(`Subitem de ${item.label}`, `${item.path}/sub`)}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-200 text-slate-400 hover:border-[#0B2A66] hover:text-[#0B2A66] cursor-pointer transition-colors text-xs"
                            >
                              <Plus size={10} /> Adicionar subitem
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Column 3: Item settings ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
            <div className="px-5 pt-5 pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-[#0B2A66]">Configurações do item</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedItem ? `Editando: ${selectedItem.label || "item sem nome"}` : "Selecione um item para editar."}
              </p>
            </div>

            {selectedItem ? (
              <div className="p-5 space-y-4">
                {/* Texto do menu */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Texto do menu</label>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={() => updateSelected({ label: editLabel })}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] transition-colors"
                    placeholder="Ex: Notícias"
                  />
                </div>

                {/* Tipo */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Tipo</label>
                  <div className="relative">
                    <select className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] appearance-none cursor-pointer text-slate-700">
                      <option>Categoria</option>
                      <option>Página</option>
                      <option>Link personalizado</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Categoria / URL */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                    {selectedItem.path.startsWith("http") ? "URL" : "Caminho"}
                  </label>
                  <input
                    value={editPath}
                    onChange={(e) => setEditPath(e.target.value)}
                    onBlur={() => updateSelected({ path: editPath })}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] font-mono text-xs"
                    placeholder="/categoria"
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-slate-100" />

                {/* Toggle: Abrir em nova aba */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Abrir em nova aba</p>
                    <p className="text-[11px] text-slate-400">Abre o link em uma nova aba do navegador.</p>
                  </div>
                  <Toggle checked={editNewTab} onChange={setEditNewTab} />
                </div>

                {/* Toggle: Visível no menu */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Visível no menu</p>
                    <p className="text-[11px] text-slate-400">Exibe este item no menu do site.</p>
                  </div>
                  <Toggle
                    checked={editVisible}
                    onChange={(v) => { setEditVisible(v); updateSelected({ visible: v }); }}
                  />
                </div>

                {/* Toggle: Destacar item */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Destacar item</p>
                    <p className="text-[11px] text-slate-400">Aplica destaque visual no menu.</p>
                  </div>
                  <Toggle checked={editHighlight} onChange={setEditHighlight} />
                </div>

                {/* Ícone */}
                <div className="border-t border-slate-100 pt-4">
                  <label className="text-xs font-semibold text-slate-600 block mb-2">Ícone (opcional)</label>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-400 flex-1">Selecione um ícone</span>
                    <Search size={13} className="text-slate-400" />
                  </div>
                </div>

                {/* Dica */}
                <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-white text-[9px] font-black">i</span>
                  </div>
                  <p className="text-[11px] text-blue-600 leading-relaxed">
                    Dica: arraste os itens para definir a ordem e criar subitens.
                  </p>
                </div>

                {/* Apply button */}
                <button
                  onClick={applyEditToSelected}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                  style={{ background: "#0B2A66" }}
                >
                  <Check size={14} /> Aplicar alterações
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Pencil size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Selecione um item na estrutura do menu para editar suas configurações.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
