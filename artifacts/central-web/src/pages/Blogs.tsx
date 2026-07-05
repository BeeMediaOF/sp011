import { useState } from "react";
import { api } from "../api";
import { fmtDate, statusClass, statusLabel, useLoad } from "../hooks";

export interface Blog {
  id: string;
  name: string;
  domain: string | null;
  apiUrl: string;
  hasSecret: boolean;
  isActive: boolean;
  requireApproval: boolean;
  deliveryMode: string;
  maxPostsPerDay: number | null;
  minMinutesBetweenPosts: number | null;
  status: string;
  lastSeenAt: string | null;
  lastError: string | null;
  notes: string | null;
}

const EMPTY = {
  name: "", domain: "", apiUrl: "", deliveryMode: "publish",
  requireApproval: false, isActive: true,
  maxPostsPerDay: "", minMinutesBetweenPosts: "", notes: "",
};

export default function Blogs() {
  const { data: blogs, error, reload } = useLoad(() => api<Blog[]>("/blogs"));
  const [editing, setEditing] = useState<Partial<Blog> | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const openNew = () => { setForm(EMPTY); setEditing({}); setMsg(""); };
  const openEdit = (b: Blog) => {
    setForm({
      name: b.name, domain: b.domain ?? "", apiUrl: b.apiUrl,
      deliveryMode: b.deliveryMode, requireApproval: b.requireApproval, isActive: b.isActive,
      maxPostsPerDay: b.maxPostsPerDay?.toString() ?? "",
      minMinutesBetweenPosts: b.minMinutesBetweenPosts?.toString() ?? "",
      notes: b.notes ?? "",
    });
    setEditing(b);
    setMsg("");
  };

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const body = {
        name: form.name, domain: form.domain || null, apiUrl: form.apiUrl,
        deliveryMode: form.deliveryMode, requireApproval: form.requireApproval, isActive: form.isActive,
        maxPostsPerDay: form.maxPostsPerDay ? Number(form.maxPostsPerDay) : null,
        minMinutesBetweenPosts: form.minMinutesBetweenPosts ? Number(form.minMinutesBetweenPosts) : null,
        notes: form.notes || null,
      };
      if (editing?.id) {
        await api(`/blogs/${editing.id}`, { method: "PATCH", body });
        setEditing(null);
      } else {
        const res = await api<{ ingestSecret: string }>("/blogs", { method: "POST", body });
        setSecret(res.ingestSecret);
        setEditing(null);
      }
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const test = async (b: Blog) => {
    setMsg(`Testando ${b.name}…`);
    try {
      const res = await api<{ ok: boolean; httpStatus: number; error?: string }>(`/blogs/${b.id}/test`, { method: "POST" });
      setMsg(res.ok ? `✔ ${b.name} respondeu OK` : `✖ ${b.name}: ${res.error ?? `HTTP ${res.httpStatus}`}`);
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  const rotate = async (b: Blog) => {
    if (!confirm(`Gerar um NOVO segredo para "${b.name}"? O segredo atual deixa de funcionar imediatamente.`)) return;
    const res = await api<{ ingestSecret: string }>(`/blogs/${b.id}/rotate-secret`, { method: "POST" });
    setSecret(res.ingestSecret);
    reload();
  };

  const remove = async (b: Blog) => {
    if (!confirm(`Remover o blog "${b.name}"? As entregas históricas permanecem no banco.`)) return;
    await api(`/blogs/${b.id}`, { method: "DELETE" });
    reload();
  };

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <button onClick={openNew}>+ Novo blog</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {msg && <div className="card">{msg}</div>}

      {secret && (
        <div className="card">
          <b>Segredo de integração (exibido UMA única vez):</b>
          <div className="secret-box">{secret}</div>
          <p className="muted">
            Cole este valor no blog em <b>Configurações → Painel Central</b> (campo centralIngestSecret).
            Depois de fechar, não é possível vê-lo de novo — apenas gerar outro.
          </p>
          <button className="secondary" onClick={() => setSecret(null)}>Fechei e salvei no blog</button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>API</th><th>Status</th><th>Modo</th><th>Aprovação</th><th>Visto por último</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(blogs ?? []).map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.name}</b>
                  {!b.isActive && <span className="badge err" style={{ marginLeft: 6 }}>inativo</span>}
                  <div className="muted">{b.domain}</div>
                </td>
                <td className="mono">{b.apiUrl}</td>
                <td>
                  <span className={`badge ${statusClass(b.status)}`}>{statusLabel(b.status)}</span>
                  {b.lastError && <div className="muted" title={b.lastError}>{b.lastError.slice(0, 60)}</div>}
                </td>
                <td>{b.deliveryMode === "draft" ? "rascunho" : "publica"}</td>
                <td>{b.requireApproval ? "manual" : "automática"}</td>
                <td>{fmtDate(b.lastSeenAt)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="secondary small" onClick={() => test(b)}>Testar</button>{" "}
                  <button className="secondary small" onClick={() => openEdit(b)}>Editar</button>{" "}
                  <button className="secondary small" onClick={() => rotate(b)}>Rotacionar segredo</button>{" "}
                  <button className="danger small" onClick={() => remove(b)}>Remover</button>
                </td>
              </tr>
            ))}
            {blogs?.length === 0 && <tr><td colSpan={7} className="muted">Nenhum blog cadastrado ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? `Editar: ${editing.name}` : "Novo blog"}</h2>
            {msg && <div className="error-box">{msg}</div>}
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label>Domínio (informativo)</label>
            <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="blog-do-cliente.com.br" />
            <label>URL da API (base, terminando em /api)</label>
            <input value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} placeholder="https://blog-do-cliente.com.br/api" />
            <div className="row">
              <div>
                <label>Modo de entrega</label>
                <select value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value })}>
                  <option value="publish">Publicar direto</option>
                  <option value="draft">Criar como rascunho</option>
                </select>
              </div>
              <div>
                <label>Máx. posts/dia (vazio = sem limite)</label>
                <input type="number" value={form.maxPostsPerDay} onChange={(e) => setForm({ ...form, maxPostsPerDay: e.target.value })} />
              </div>
              <div>
                <label>Intervalo mín. entre posts (min)</label>
                <input type="number" value={form.minMinutesBetweenPosts} onChange={(e) => setForm({ ...form, minMinutesBetweenPosts: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.requireApproval} onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })} />
                Exigir aprovação manual antes de enviar
              </label>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Ativo
              </label>
            </div>
            <label>Notas</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={save} disabled={busy || !form.name || !form.apiUrl}>
                {editing.id ? "Salvar" : "Criar e gerar segredo"}
              </button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
