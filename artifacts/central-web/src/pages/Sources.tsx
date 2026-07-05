import { useState } from "react";
import { api } from "../api";
import { fmtDate, useLoad } from "../hooks";

interface Source {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  scheduleHours: number;
  fetchLimit: number | null;
  giveCredit: boolean;
  customPrompt: string | null;
  lastFetchedAt: string | null;
}

const EMPTY = { name: "", url: "", category: "geral", scheduleHours: "4", fetchLimit: "", giveCredit: false, active: true, customPrompt: "" };

export default function Sources() {
  const { data: sources, error, reload } = useLoad(() => api<Source[]>("/sources"));
  const [editing, setEditing] = useState<Partial<Source> | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const openNew = () => { setForm(EMPTY); setEditing({}); };
  const openEdit = (s: Source) => {
    setForm({
      name: s.name, url: s.url, category: s.category,
      scheduleHours: String(s.scheduleHours), fetchLimit: s.fetchLimit?.toString() ?? "",
      giveCredit: s.giveCredit, active: s.active, customPrompt: s.customPrompt ?? "",
    });
    setEditing(s);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: form.name, url: form.url, category: form.category,
        scheduleHours: Number(form.scheduleHours) || 0,
        fetchLimit: form.fetchLimit ? Number(form.fetchLimit) : null,
        giveCredit: form.giveCredit, active: form.active,
        customPrompt: form.customPrompt || null,
      };
      if (editing?.id) await api(`/sources/${editing.id}`, { method: "PATCH", body });
      else await api("/sources", { method: "POST", body });
      setEditing(null);
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const run = async (s: Source) => {
    setMsg(`Coletando ${s.name}…`);
    try {
      const res = await api<{ collected: number }>(`/sources/${s.id}/run`, { method: "POST" });
      setMsg(`✔ ${s.name}: ${res.collected} notícia(s) nova(s) na fila`);
      reload();
    } catch (err) {
      setMsg(`✖ ${String((err as Error).message)}`);
    }
  };

  const runCycle = async () => {
    setMsg("Rodando ciclo completo…");
    const res = await api<{ collected: number; skipped?: string }>("/sources/run-cycle", { method: "POST" });
    setMsg(res.skipped ? `Ciclo pulado: ${res.skipped}` : `✔ Ciclo coletou ${res.collected} notícia(s)`);
    reload();
  };

  const remove = async (s: Source) => {
    if (!confirm(`Remover a fonte "${s.name}"?`)) return;
    await api(`/sources/${s.id}`, { method: "DELETE" });
    reload();
  };

  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Fontes RSS</h2>
        <div className="grow" />
        <button className="secondary" onClick={runCycle}>Rodar ciclo agora</button>
        <button onClick={openNew}>+ Nova fonte</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {msg && <div className="card">{msg}</div>}

      <div className="card">
        <table>
          <thead>
            <tr><th>Nome</th><th>Categoria</th><th>Agenda</th><th>Limite</th><th>Última coleta</th><th></th></tr>
          </thead>
          <tbody>
            {(sources ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                  {!s.active && <span className="badge err" style={{ marginLeft: 6 }}>inativa</span>}
                  {s.giveCredit && <span className="badge" style={{ marginLeft: 6 }}>com crédito</span>}
                  <div className="muted mono">{s.url}</div>
                </td>
                <td>{s.category}</td>
                <td>{s.scheduleHours > 0 ? `a cada ${s.scheduleHours}h` : "manual"}</td>
                <td>{s.fetchLimit ?? "padrão"}</td>
                <td>{fmtDate(s.lastFetchedAt)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="secondary small" onClick={() => run(s)}>Coletar</button>{" "}
                  <button className="secondary small" onClick={() => openEdit(s)}>Editar</button>{" "}
                  <button className="danger small" onClick={() => remove(s)}>Remover</button>
                </td>
              </tr>
            ))}
            {sources?.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma fonte ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? `Editar: ${editing.name}` : "Nova fonte"}</h2>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label>URL do feed RSS (ou homepage — scraping automático de fallback)</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <div className="row">
              <div>
                <label>Categoria</label>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <label>Coletar a cada (horas; 0 = só manual)</label>
                <input type="number" value={form.scheduleHours} onChange={(e) => setForm({ ...form, scheduleHours: e.target.value })} />
              </div>
              <div>
                <label>Artigos por rodada (vazio = padrão)</label>
                <input type="number" value={form.fetchLimit} onChange={(e) => setForm({ ...form, fetchLimit: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.giveCredit} onChange={(e) => setForm({ ...form, giveCredit: e.target.checked })} />
                Citar a fonte no texto
              </label>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Ativa
              </label>
            </div>
            <label>Prompt customizado (vazio = hierarquia categoria/global/padrão)</label>
            <textarea value={form.customPrompt} onChange={(e) => setForm({ ...form, customPrompt: e.target.value })} />
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={save} disabled={busy || !form.name || !form.url}>Salvar</button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
