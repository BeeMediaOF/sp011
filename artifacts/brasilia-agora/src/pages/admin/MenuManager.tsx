import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type MenuItem, type SiteSettings } from "../../lib/adminApi";
import { useCan } from "../../lib/permissionsCache";
import { invalidateSiteCache } from "../../hooks/useSite";
import { useCategories, categoryColor } from "../../hooks/useCategories";
import {
  Plus, PlusCircle, Trash2, GripVertical, Save, Eye, EyeOff,
  Search, ChevronDown, ChevronRight, Pencil, Monitor, Tablet,
  Smartphone, FileText, Home, LayoutGrid, Check, Link2, Loader2,
} from "lucide-react";
import { useAdminT, type AdminTKey } from "../../lib/adminI18n";

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

type DevicePreview = "desktop" | "tablet" | "mobile";
type PagesTab = "paginas" | "categorias" | "links";

/** Páginas institucionais reais do site (rotas fixas do App.tsx) — qualquer
 * outra coisa cai na rota de categoria dinâmica. Categorias vêm do cadastro
 * do blog (aba Categorias), nunca de lista fixa. `tk` = rótulo traduzido. */
const AVAILABLE_PAGES: { tk: AdminTKey; path: string }[] = [
  { tk: "menuPage.home", path: "/" },
  { tk: "menuPage.archive", path: "/arquivo" },
  { tk: "menuPage.contact", path: "/contato" },
  { tk: "menuPage.terms", path: "/termos" },
  { tk: "menuPage.privacy", path: "/privacidade" },
];
const PAGE_PATHS = new Set(AVAILABLE_PAGES.map((p) => p.path));

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
  const { t } = useAdminT();
  const { can } = useCan();
  const canEdit = can("menu.edit");
  const [items, setItems]       = useState<MenuItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied]   = useState(false);

  const [device, setDevice]     = useState<DevicePreview>("desktop");
  const [pagesTab, setPagesTab] = useState<PagesTab>("paginas");
  const [pageSearch, setPageSearch] = useState("");
  const [dragIdx, setDragIdx]   = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  // Identidade do blog (logo/nome na pré-visualização) e categorias cadastradas.
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const { categories } = useCategories();

  // Local edit state for selected item settings panel
  const [editLabel, setEditLabel]   = useState("");
  const [editPath, setEditPath]     = useState("/");
  const [editVisible, setEditVisible] = useState(true);

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
    adminApi.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  function syncEdit(item: MenuItem) {
    setEditLabel(item.label);
    setEditPath(item.path);
    setEditVisible(item.visible);
  }

  function selectItem(item: MenuItem) {
    setSelected(item.id);
    syncEdit(item);
  }

  /** Aplica um patch a um item pelo id, procurando no topo e nos subitens (1 nível). */
  function patchItemIn(list: MenuItem[], id: string, patch: Partial<MenuItem>): MenuItem[] {
    return list.map((it) => {
      if (it.id === id) return { ...it, ...patch };
      if (it.children?.some((c) => c.id === id)) {
        return { ...it, children: it.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
      }
      return it;
    });
  }

  function updateSelected(patch: Partial<MenuItem>) {
    if (!selected) return;
    setItems((prev) => patchItemIn(prev, selected, patch));
  }

  async function applyEditToSelected() {
    if (!selected) return;
    const patch: Partial<MenuItem> = {
      label: editLabel.trim() || t("menu.defUnnamed"),
      path: editPath.trim() || "/",
      visible: editVisible,
    };
    const nextItems = patchItemIn(items, selected, patch);
    setItems(nextItems);

    setApplying(true); setApplied(false);
    try {
      const ordered = nextItems.map((it, i) => ({ ...it, order: i }));
      const { menuItems } = await adminApi.updateMenu(ordered);
      setItems(menuItems);
      invalidateSiteCache();
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    } catch { setSaveError(true); } finally { setApplying(false); }
  }

  function addItem(label: string, path: string) {
    const id = crypto.randomUUID();
    const item: MenuItem = { id, label, path, order: items.length, visible: true };
    setItems((prev) => [...prev, item]);
    setSelected(id);
    syncEdit(item);
  }

  /** Cria um subitem real dentro do item pai (1 nível de submenu). */
  function addChild(parent: MenuItem) {
    const id = crypto.randomUUID();
    const child: MenuItem = {
      id,
      label: t("menu.defNewSubitem"),
      path: `${parent.path === "/" ? "" : parent.path}-sub`,
      order: parent.children?.length ?? 0,
      visible: true,
    };
    setItems((prev) => prev.map((it) =>
      it.id === parent.id ? { ...it, children: [...(it.children ?? []), child] } : it
    ));
    setExpanded((prev) => new Set(prev).add(parent.id));
    setSelected(id);
    syncEdit(child);
  }

  async function removeItem(id: string) {
    if (!confirm(t("menu.confirmRemove"))) return;
    // Persiste a exclusão na hora — antes o item só sumia da tela e voltava
    // ao recarregar se o usuário esquecesse de clicar em "Salvar".
    // Remove do topo (com a subárvore) ou de dentro de um submenu.
    const next = items
      .filter((it) => it.id !== id)
      .map((it, i) => ({
        ...it,
        order: i,
        ...(it.children ? { children: it.children.filter((c) => c.id !== id).map((c, j) => ({ ...c, order: j })) } : {}),
      }));
    setItems(next);
    if (selected === id) { setSelected(null); }
    setSaveError(false);
    try {
      const { menuItems } = await adminApi.updateMenu(next);
      setItems(menuItems);
      invalidateSiteCache();
    } catch { setSaveError(true); }
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
    setSaving(true); setSaved(false); setSaveError(false);
    const ordered = items.map((it, i) => ({ ...it, order: i }));
    try {
      const { menuItems } = await adminApi.updateMenu(ordered);
      setItems(menuItems);
      invalidateSiteCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setSaveError(true); } finally { setSaving(false); }
  }

  // Item selecionado: procura no topo e nos subitens (1 nível).
  const selectedItem = (() => {
    for (const it of items) {
      if (it.id === selected) return it;
      const child = it.children?.find((c) => c.id === selected);
      if (child) return child;
    }
    return null;
  })();

  const filteredPages = AVAILABLE_PAGES.filter((p) =>
    !pageSearch || t(p.tk).toLowerCase().includes(pageSearch.toLowerCase())
  );
  const filteredCategories = categories.filter((c) =>
    !pageSearch || c.label.toLowerCase().includes(pageSearch.toLowerCase())
  );

  return (
    <AdminLayout title="Menu">
      <div className="space-y-5">

        {/* ── Page header — título + actions ───────────────────── */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[300px]">
            <h2 className="text-base font-bold text-[#0B2A66]">{t("menu.mainTitle")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("menu.headerDescA")}{" "}
              <Link href="/admin/home-blocos" className="text-[#2563EB] font-medium hover:underline">
                {t("menu.homeBlocksLink")}
              </Link>.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {saveError && (
              <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                {t("menu.errSave")}
              </span>
            )}
            {canEdit && (
              <>
                <button
                  onClick={() => addItem(t("menu.defNewItem"), "/")}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition-colors"
                  style={{ boxShadow: CARD_SHADOW }}
                >
                  <PlusCircle size={15} /> {t("menu.createNew")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-colors disabled:opacity-60"
                  style={{ background: saved ? "#16A34A" : "#E71D36" }}
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
                  {saved ? t("menu.savedBang") : saving ? t("menu.saving") : t("menu.saveChanges")}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Menu preview ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-[#0B2A66]">{t("menu.previewTitle")}</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{t("menu.responsive")}</span>
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
          {/* Simulated nav bar — identidade real do blog (logo/nome do painel) */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-1 flex-wrap overflow-x-auto">
            {settings?.logoBase64 ? (
              <img src={settings.logoBase64} alt={settings.siteName} className="h-7 w-auto max-w-[160px] object-contain mr-3 shrink-0" />
            ) : (
              <span className="font-black text-[#0B2A66] text-lg mr-3">{settings?.siteName ?? "…"}</span>
            )}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs font-semibold text-[#0B2A66] bg-[#EEF2FF] px-3 py-1.5 rounded-full cursor-pointer">
                <Home size={11} /> {t("menu.homeItem")}
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
                  {t("menu.more")} <ChevronDown size={10} />
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
              <h3 className="text-sm font-semibold text-[#0B2A66]">{t("menu.availableItems")}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{t("menu.availableDesc")}</p>
            </div>

            {/* Inner tabs */}
            <div className="flex border-b border-slate-100 px-5">
              {([
                { key: "paginas",    label: t("menu.tabPages") },
                { key: "categorias", label: t("menu.tabCategories") },
                { key: "links",      label: t("menu.tabLinks") },
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
                  placeholder={t("menu.searchPages")}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] placeholder:text-slate-400"
                />
              </div>

              {/* List */}
              <div className="space-y-1">
                {pagesTab === "paginas" && filteredPages.map((page) => (
                  <div key={page.path} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 group cursor-pointer">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <FileText size={12} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{t(page.tk)}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{page.path}</p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => addItem(t(page.tk), page.path)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-[#0B2A66] hover:text-white flex items-center justify-center text-slate-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <Plus size={11} />
                      </button>
                    )}
                  </div>
                ))}
                {pagesTab === "categorias" && (
                  filteredCategories.length === 0 ? (
                    <p className="text-xs text-slate-400 pt-1">{t("menu.noCategories")}</p>
                  ) : (
                    filteredCategories.map((cat) => (
                      <div key={cat.value} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 group cursor-pointer">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor(cat.value) }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{cat.label}</p>
                          <p className="text-[10px] text-slate-400 font-mono">/{cat.value}</p>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => addItem(cat.label, `/${cat.value}`)}
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-[#0B2A66] hover:text-white flex items-center justify-center text-slate-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <Plus size={11} />
                          </button>
                        )}
                      </div>
                    ))
                  )
                )}
                {pagesTab === "links" && (
                  <div className="pt-1">
                    <p className="text-xs text-slate-400 mb-3">{t("menu.addExternalDesc")}</p>
                    {canEdit && (
                      <button
                        onClick={() => addItem(t("menu.defExternalLink"), "https://")}
                        className="flex items-center gap-2 text-xs font-medium text-[#2563EB] hover:underline"
                      >
                        <Link2 size={12} /> {t("menu.addCustomLink")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {pagesTab === "categorias" && (
              <div className="border-t border-slate-100 px-4 py-3">
                <Link href="/admin/categorias" className="flex items-center gap-1 text-xs text-[#2563EB] hover:underline">
                  {t("menu.manageCategories")} <ChevronRight size={12} />
                </Link>
              </div>
            )}
          </div>

          {/* ── Column 2: Menu structure ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
            <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#0B2A66]">{t("menu.structure")}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{t("menu.structureDesc")}</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => addItem(t("menu.defNewItem"), "/")}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-colors shrink-0"
                >
                  <Plus size={12} /> {t("menu.addItem")}
                </button>
              )}
            </div>

            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 size={18} className="animate-spin" /> {t("common.loading")}
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <LayoutGrid size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t("menu.noItems")}</p>
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
                              : PAGE_PATHS.has(item.path)
                              ? "bg-slate-100 text-slate-500"
                              : "bg-blue-50 text-blue-600"
                          }`}>
                            {item.path.startsWith("http") ? t("menu.badgeLink") : PAGE_PATHS.has(item.path) ? t("menu.badgePage") : t("menu.badgeCategory")}
                          </span>

                          {/* Row actions */}
                          {canEdit && (
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
                          )}
                        </div>

                        {/* Subitens (1 nível) */}
                        {isExpanded && (
                          <div className="ml-8 mt-1 space-y-1">
                            {(item.children ?? []).map((child) => (
                              <div
                                key={child.id}
                                onClick={(e) => { e.stopPropagation(); selectItem(child); }}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all border ${
                                  selected === child.id
                                    ? "border-[#0B2A66] bg-[#EEF2FF]"
                                    : "border-transparent hover:bg-slate-50 hover:border-slate-200"
                                } ${!child.visible ? "opacity-50" : ""}`}
                              >
                                <ChevronRight size={11} className="text-slate-300 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-semibold truncate ${selected === child.id ? "text-[#0B2A66]" : "text-slate-600"}`}>
                                    {child.label || "—"}
                                  </p>
                                  <p className="text-[10px] text-slate-400 truncate">{child.path}</p>
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setItems((prev) => patchItemIn(prev, child.id, { visible: !child.visible }));
                                      }}
                                      className={`p-1 rounded transition-colors ${child.visible ? "text-slate-300 hover:text-slate-600" : "text-amber-400 hover:text-amber-600"}`}
                                    >
                                      {child.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeItem(child.id); }}
                                      className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                            {canEdit && (
                              <div
                                onClick={() => addChild(item)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-200 text-slate-400 hover:border-[#0B2A66] hover:text-[#0B2A66] cursor-pointer transition-colors text-xs"
                              >
                                <Plus size={10} /> {t("menu.addSubitem")}
                              </div>
                            )}
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
              <h3 className="text-sm font-semibold text-[#0B2A66]">{t("menu.itemSettings")}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedItem ? `${t("menu.editingPrefix")}${selectedItem.label || t("menu.defUnnamedLower")}` : t("menu.selectItem")}
              </p>
            </div>

            {selectedItem && canEdit ? (
              <div className="p-5 space-y-4">
                {/* Texto do menu */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t("menu.menuText")}</label>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={() => updateSelected({ label: editLabel })}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] transition-colors"
                    placeholder={t("menu.egNews")}
                  />
                </div>

                {/* Categoria / URL */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                    {selectedItem.path.startsWith("http") ? "URL" : t("menu.path")}
                  </label>
                  <input
                    value={editPath}
                    onChange={(e) => setEditPath(e.target.value)}
                    onBlur={() => updateSelected({ path: editPath })}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] font-mono text-xs"
                    placeholder={t("menu.pathPlaceholder")}
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-slate-100" />

                {/* Toggle: Visível no menu */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{t("menu.visibleInMenu")}</p>
                    <p className="text-[11px] text-slate-400">{t("menu.visibleDesc")}</p>
                  </div>
                  <Toggle
                    checked={editVisible}
                    onChange={(v) => { setEditVisible(v); updateSelected({ visible: v }); }}
                  />
                </div>

                {/* Dica */}
                <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-white text-[9px] font-black">i</span>
                  </div>
                  <p className="text-[11px] text-blue-600 leading-relaxed">
                    {t("menu.tip")}
                  </p>
                </div>

                {/* Apply button */}
                <button
                  onClick={applyEditToSelected}
                  disabled={applying}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
                  style={{ background: applied ? "#16A34A" : "#0B2A66" }}
                >
                  {applying
                    ? <><Loader2 size={14} className="animate-spin" /> {t("menu.saving")}</>
                    : applied
                    ? <><Check size={14} /> {t("menu.savedBang")}</>
                    : <><Check size={14} /> {t("menu.applyChanges")}</>
                  }
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Pencil size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("menu.selectItemLong")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
