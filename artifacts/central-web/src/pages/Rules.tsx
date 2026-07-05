import { useState } from "react";
import { api } from "../api";
import { useLoad } from "../hooks";
import type { Blog } from "./Blogs";

interface Rule {
  id: string;
  blogId: string;
  name: string;
  isActive: boolean;
  priority: number;
  categoriesInclude: string[] | null;
  categoriesExclude: string[] | null;
  sourcesInclude: string[] | null;
  sourcesExclude: string[] | null;
  keywordsInclude: string[] | null;
  keywordsExclude: string[] | null;
  targetCategory: string | null;
  targetTag: string | null;
}

interface SourceOpt { id: string; name: string }

const EMPTY = {
  name: "", priority: "0", isActive: true,
  categoriesInclude: "", categoriesExclude: "",
  sourcesInclude: [] as string[], sourcesExclude: [] as string[],
  keywordsInclude: "", keywordsExclude: "",
  targetCategory: "", targetTag: "",
};

const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const fromArr = (v: string[] | null) => (v ?? []).join(", ");

export default function Rules() {
  const { data: blogs } = useLoad(() => api<Blog[]>("/blogs"));
  const { data: sources } = useLoad(() => api<SourceOpt[]>("/sources"));
  const [blogId, setBlogId] = useState("");
  const { data: rules, error, reload } = useLoad(
    () => (blogId ? api<Rule[]>(`/rules?blogId=${blogId}`) : Promise.resolve([] as Rule[])),
    [blogId],
  );
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const openNew = () => { setForm(EMPTY); setEditing({}); };
  const openEdit = (r: Rule) => {
    setForm({
      name: r.name, priority: String(r.priority), isActive: r.isActive,
      categoriesInclude: fromArr(r.categoriesInclude), categoriesExclude: fromArr(r.categoriesExclude),
      sourcesInclude: r.sourcesInclude ?? [], sourcesExclude: r.sourcesExclude ?? [],
      keywordsInclude: fromArr(r.keywordsInclude), keywordsExclude: fromArr(r.keywordsExclude),
      targetCategory: r.targetCategory ?? "", targetTag: r.targetTag ?? "",
    });
    setEditing(r);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        blogId,
        name: form.name,
        priority: Number(form.priority) || 0,
        isActive: form.isActive,
        categoriesInclude: csv(form.categoriesInclude),
        categoriesExclude: csv(form.categoriesExclude),
        sourcesInclude: form.sourcesInclude,
        sourcesExclude: form.sourcesExclude,
        keywordsInclude: csv(form.keywordsInclude),
        keywordsExclude: csv(form.keywordsExclude),
        targetCategory: form.targetCategory || null,
        targetTag: form.targetTag || null,
      };
      if (editing?.id) await api(`/rules/${editing.id}`, { method: "PATCH", body });
      else await api("/rules", { method: "POST", body });
      setEditing(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Rule) => {
    if (!confirm(`Remover a regra "${r.name}"?`)) return;
    await api(`/rules/${r.id}`, { method: "DELETE" });
    reload();
  };

  const srcName = (id: string) => sources?.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const describe = (r: Rule) => {
    const parts: string[] = [];
    if (r.categoriesInclude?.length) parts.push(`categorias: ${r.categoriesInclude.join(", ")}`);
    if (r.sourcesInclude?.length) parts.push(`fontes: ${r.sourcesInclude.map(srcName).join(", ")}`);
    if (r.keywordsInclude?.length) parts.push(`palavras: ${r.keywordsInclude.join(", ")}`);
    if (!parts.length) parts.push("tudo");
    const ex: string[] = [];
    if (r.categoriesExclude?.length) ex.push(`categorias ${r.categoriesExclude.join(", ")}`);
    if (r.sourcesExclude?.length) ex.push(`fontes ${r.sourcesExclude.map(srcName).join(", ")}`);
    if (r.keywordsExclude?.length) ex.push(`palavras ${r.keywordsExclude.join(", ")}`);
    return parts.join(" + ") + (ex.length ? ` — exceto ${ex.join("; ")}` : "");
  };

  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Regras de distribuição</h2>
        <div className="grow" />
        <select style={{ maxWidth: 260 }} value={blogId} onChange={(e) => setBlogId(e.target.value)}>
          <option value="">Selecione um blog…</option>
          {(blogs ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={openNew} disabled={!blogId}>+ Nova regra</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {!blogId && <p className="muted">Escolha um blog para ver/editar as regras. Blog sem regra ativa não recebe nenhuma notícia.</p>}

      {blogId && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Regra</th><th>Recebe</th><th>Override</th><th>Prioridade</th><th></th></tr>
            </thead>
            <tbody>
              {(rules ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                    {!r.isActive && <span className="badge err" style={{ marginLeft: 6 }}>inativa</span>}
                  </td>
                  <td>{describe(r)}</td>
                  <td className="muted">
                    {r.targetCategory && <>categoria → {r.targetCategory}<br /></>}
                    {r.targetTag && <>tag → {r.targetTag}</>}
                    {!r.targetCategory && !r.targetTag && "—"}
                  </td>
                  <td>{r.priority}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="secondary small" onClick={() => openEdit(r)}>Editar</button>{" "}
                    <button className="danger small" onClick={() => remove(r)}>Remover</button>
                  </td>
                </tr>
              ))}
              {rules?.length === 0 && (
                <tr><td colSpan={5} className="muted">Nenhuma regra — este blog não recebe notícias até criar uma.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? `Editar regra` : "Nova regra"}</h2>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='Ex.: "Só futebol"' />
            <div className="row">
              <div>
                <label>Categorias incluídas (vírgula; vazio = todas)</label>
                <input value={form.categoriesInclude} onChange={(e) => setForm({ ...form, categoriesInclude: e.target.value })} placeholder="esportes, economia" />
              </div>
              <div>
                <label>Categorias excluídas</label>
                <input value={form.categoriesExclude} onChange={(e) => setForm({ ...form, categoriesExclude: e.target.value })} />
              </div>
            </div>
            <div className="row">
              <div>
                <label>Palavras-chave de interesse (vírgula)</label>
                <input value={form.keywordsInclude} onChange={(e) => setForm({ ...form, keywordsInclude: e.target.value })} placeholder="brasileirão, libertadores" />
              </div>
              <div>
                <label>Palavras-chave proibidas</label>
                <input value={form.keywordsExclude} onChange={(e) => setForm({ ...form, keywordsExclude: e.target.value })} />
              </div>
            </div>
            <div className="row">
              <div>
                <label>Fontes permitidas (ctrl+clique; nenhuma = todas)</label>
                <select multiple size={5} value={form.sourcesInclude} onChange={(e) => setForm({ ...form, sourcesInclude: [...e.target.selectedOptions].map((o) => o.value) })}>
                  {(sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label>Fontes bloqueadas</label>
                <select multiple size={5} value={form.sourcesExclude} onChange={(e) => setForm({ ...form, sourcesExclude: [...e.target.selectedOptions].map((o) => o.value) })}>
                  {(sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="row">
              <div>
                <label>Categoria no blog de destino (override)</label>
                <input value={form.targetCategory} onChange={(e) => setForm({ ...form, targetCategory: e.target.value })} placeholder="vazio = mantém a do central" />
              </div>
              <div>
                <label>Tag no blog de destino</label>
                <input value={form.targetTag} onChange={(e) => setForm({ ...form, targetTag: e.target.value })} />
              </div>
              <div>
                <label>Prioridade (maior vence)</label>
                <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              </div>
            </div>
            <label className="fit row" style={{ marginTop: 10 }}>
              <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Ativa
            </label>
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={save} disabled={busy || !form.name}>Salvar</button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
