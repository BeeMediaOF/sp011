/**
 * Painel → Categorias: cadastro das categorias do blog (nome, slug, cor,
 * visibilidade). A lista alimenta o seletor de categoria dos blocos da home
 * (e futuros seletores). Sem lista salva, o painel sugere as categorias
 * padrão + as derivadas do menu — o primeiro salvamento grava tudo em
 * settings.categories.
 */
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type SiteCategory } from "../../lib/adminApi";
import { useCan } from "../../lib/permissionsCache";
import { invalidateSiteCache } from "../../hooks/useSite";
import {
  Plus, Trash2, Pencil, Search, RefreshCw, Save, FolderOpen, Eye, EyeOff, Info,
} from "lucide-react";

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";
const INPUT = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white";

/** Categorias padrão históricas (mesma lista do editor de blocos da home). */
const DEFAULT_CATEGORIES: Omit<SiteCategory, "id">[] = [
  { name: "Política",      slug: "politica",      color: "#1d4ed8", visible: true },
  { name: "Cidade / DF",   slug: "cidade",        color: "#0b3d91", visible: true },
  { name: "Segurança",     slug: "seguranca",     color: "#7c3aed", visible: true },
  { name: "Saúde",         slug: "saude",         color: "#16a34a", visible: true },
  { name: "Educação",      slug: "educacao",      color: "#0284c7", visible: true },
  { name: "Cultura",       slug: "cultura",       color: "#0d9488", visible: true },
  { name: "Esportes",      slug: "esportes",      color: "#dc2626", visible: true },
  { name: "Tecnologia",    slug: "tecnologia",    color: "#0284c7", visible: true },
  { name: "Economia",      slug: "economia",      color: "#b45309", visible: true },
  { name: "Brasil",        slug: "brasil",        color: "#16a34a", visible: true },
  { name: "Mundo",         slug: "mundo",         color: "#6b21a8", visible: true },
  { name: "Colunas",       slug: "colunas",       color: "#7c3aed", visible: true },
  { name: "Turismo",       slug: "turismo",       color: "#0369a1", visible: true },
  { name: "Transporte",    slug: "transporte",    color: "#ca8a04", visible: true },
  { name: "Meio Ambiente", slug: "meio-ambiente", color: "#15803d", visible: true },
  { name: "Geral",         slug: "geral",         color: "#64748b", visible: true },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function kebab(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const EMPTY_FORM = { name: "", slug: "", color: "#0B2A66", visible: true };

export default function CategoriesManager() {
  const { can } = useCan();
  const canManage = can("categories.manage");
  const [cats, setCats] = useState<SiteCategory[]>([]);
  const [persisted, setPersisted] = useState(false); // settings.categories já existe?
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [{ settings }, menu] = await Promise.all([
        adminApi.getSettings(),
        adminApi.getMenu().catch(() => ({ menuItems: [] as { label: string; path: string; visible: boolean }[] })),
      ]);
      if (settings.categories && settings.categories.length > 0) {
        setCats(settings.categories);
        setPersisted(true);
      } else {
        // Sugestão inicial: padrão + slugs do menu que ainda não existem
        // (ex.: world-cup do KSports). Só é gravada no primeiro salvamento.
        const seed: SiteCategory[] = DEFAULT_CATEGORIES.map((c) => ({ ...c, id: uid() }));
        for (const m of menu.menuItems ?? []) {
          const slug = (m.path ?? "").replace(/^\//, "").toLowerCase();
          if (!slug || slug.includes("/") || seed.some((c) => c.slug === slug)) continue;
          seed.push({ id: uid(), name: m.label, slug, color: "#0369a1", visible: true });
        }
        setCats(seed);
        setPersisted(false);
      }
    } catch {
      setMsg("Erro ao carregar — recarregue a página.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function persist(next: SiteCategory[]) {
    if (!canManage) return; // somente-leitura sem categories.manage
    setSaving(true);
    try {
      await adminApi.updateSettings({ categories: next });
      setCats(next);
      setPersisted(true);
      invalidateSiteCache();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
  }

  function openEdit(c: SiteCategory) {
    setEditingId(c.id);
    setForm({ name: c.name, slug: c.slug, color: c.color ?? "#0B2A66", visible: c.visible !== false });
    setSlugTouched(true);
  }

  async function submit() {
    const name = form.name.trim();
    const slug = kebab(form.slug.trim() || name);
    if (!name || !slug) return;
    if (cats.some((c) => c.slug === slug && c.id !== editingId)) {
      alert(`Já existe uma categoria com o slug "${slug}".`);
      return;
    }
    const next = editingId
      ? cats.map((c) => (c.id === editingId ? { ...c, name, slug, color: form.color, visible: form.visible } : c))
      : [...cats, { id: uid(), name, slug, color: form.color, visible: form.visible }];
    await persist(next);
    resetForm();
    setMsg(editingId ? "Categoria atualizada." : "Categoria criada.");
    setTimeout(() => setMsg(""), 2500);
  }

  async function remove(c: SiteCategory) {
    if (!confirm(`Excluir a categoria "${c.name}"? Blocos e artigos que a usam continuam com o slug antigo.`)) return;
    await persist(cats.filter((x) => x.id !== c.id));
    if (editingId === c.id) resetForm();
  }

  async function toggleVisible(c: SiteCategory) {
    await persist(cats.map((x) => (x.id === c.id ? { ...x, visible: x.visible === false } : x)));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q));
  }, [cats, search]);

  const visibleCats = cats.filter((c) => c.visible !== false);
  const previewSlug = kebab(form.slug.trim() || form.name.trim()) || "slug-da-categoria";

  return (
    <AdminLayout title="Categorias">
      <div className="space-y-5">

        {/* Header card */}
        <div className="bg-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between" style={{ boxShadow: CARD_SHADOW }}>
          <div>
            <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <FolderOpen size={15} className="text-[#0B2A66]" /> Categorias do blog
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Cadastre, edite e oculte as categorias. A lista alimenta o seletor de categoria dos blocos da home.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => void load()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#64748B] border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <RefreshCw size={12} /> Atualizar
            </button>
            {canManage && (
              <button onClick={resetForm}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#0B2A66" }}>
                <Plus size={13} /> Nova categoria
              </button>
            )}
          </div>
        </div>

        {!persisted && !loading && (
          <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3 flex items-start gap-2.5">
            <Info size={14} className="text-[#2563EB] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#1e40af] leading-relaxed">
              Lista inicial sugerida (categorias padrão + as do menu). Ela ainda não foi gravada:
              qualquer criação, edição ou exclusão salva a lista inteira como a oficial do blog.
            </p>
          </div>
        )}

        {msg && <div className="bg-white rounded-2xl px-4 py-3 text-xs font-semibold text-green-700" style={{ boxShadow: CARD_SHADOW }}>{msg}</div>}

        {/* Preview rápido */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
          <p className="text-xs font-bold text-[#0F172A] mb-0.5">Preview rápido</p>
          <p className="text-[11px] text-gray-400 mb-3">Categorias visíveis — as que aparecem nos seletores do painel.</p>
          {visibleCats.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Nenhuma categoria visível.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visibleCats.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-gray-200 text-gray-600">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? "#64748b" }} />
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Lista */}
          <div className="bg-white rounded-2xl p-5 space-y-3" style={{ boxShadow: CARD_SHADOW }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar categoria…" className={`${INPUT} pl-9`} />
            </div>
            {loading ? (
              <p className="text-xs text-gray-400 py-6 text-center">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">Nenhuma categoria encontrada.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: c.color ?? "#64748b" }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${c.visible === false ? "text-gray-400" : "text-[#0F172A]"}`}>{c.name}</p>
                      <p className="text-[11px] text-gray-400 font-mono">/{c.slug}</p>
                    </div>
                    {c.visible === false && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full shrink-0">Oculta</span>
                    )}
                    {canManage && (
                      <>
                        <button onClick={() => void toggleVisible(c)} title={c.visible === false ? "Mostrar" : "Ocultar"} disabled={saving}
                          className="p-1.5 text-gray-400 hover:text-[#0B2A66] hover:bg-blue-50 rounded-lg transition-colors shrink-0">
                          {c.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => openEdit(c)} title="Editar"
                          className="p-1.5 text-gray-400 hover:text-[#0B2A66] hover:bg-blue-50 rounded-lg transition-colors shrink-0">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => void remove(c)} title="Excluir" disabled={saving}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulário — só para quem pode gerenciar (categories.manage) */}
          {canManage && (
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>
            <div>
              <p className="text-xs font-bold text-[#0F172A]">{editingId ? "Editar categoria" : "Nova categoria"}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Slug e nome são usados no menu, nas rotas públicas e nos blocos da home.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Nome</label>
                <input value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : kebab(e.target.value) }))}
                  placeholder="Ex.: Política" className={INPUT} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Slug</label>
                <input value={form.slug}
                  onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
                  onBlur={() => setForm((f) => ({ ...f, slug: kebab(f.slug) }))}
                  placeholder="politica" className={`${INPUT} font-mono`} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Cor</label>
                <div className="flex gap-2">
                  <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer shrink-0" />
                  <input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className={`${INPUT} font-mono`} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Visibilidade</label>
                <button type="button" onClick={() => setForm((f) => ({ ...f, visible: !f.visible }))}
                  className={`${INPUT} flex items-center justify-between text-left`}>
                  <span>{form.visible ? "Categoria visível" : "Categoria oculta"}</span>
                  {form.visible ? <Eye size={14} className="text-gray-400" /> : <EyeOff size={14} className="text-gray-400" />}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Preview</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-gray-200 bg-white text-gray-600">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: form.color }} />
                {form.name.trim() || "Nome da categoria"}
              </span>
              <p className="text-[10px] text-gray-400 mt-1.5">Rota pública esperada: <span className="font-mono">/{previewSlug}</span> (precisa de item de menu com esse caminho para virar página)</p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={resetForm}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                <Plus size={12} /> Limpar
              </button>
              <div className="flex-1" />
              <button type="button" onClick={() => void submit()} disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: "#0B2A66" }}>
                <Save size={12} /> {saving ? "Salvando…" : editingId ? "Salvar categoria" : "Criar categoria"}
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
