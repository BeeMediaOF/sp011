import { useState } from "react";
import { api } from "../api";
import { fmtDate, statusClass, statusLabel, useLoad } from "../hooks";
import type { Blog } from "./Blogs";

interface Delivery {
  id: string;
  title: string | null;
  blogId: string;
  blogName: string | null;
  status: string;
  attempts: number;
  scheduledAt: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  remoteUrl: string | null;
  lastError: string | null;
  lastHttpStatus: number | null;
  createdAt: string;
}

interface Attempt {
  id: number;
  attemptNo: number;
  httpStatus: number | null;
  ok: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

const STATUSES = ["", "pending", "awaiting_approval", "delivering", "delivered", "duplicate", "failed", "dead", "cancelled"];

export default function Deliveries() {
  const [status, setStatus] = useState("");
  const [blogId, setBlogId] = useState("");
  const { data: blogs } = useLoad(() => api<Blog[]>("/blogs"));
  const { data: rows, error, reload } = useLoad(
    () => api<Delivery[]>(`/deliveries?limit=150${status ? `&status=${status}` : ""}${blogId ? `&blogId=${blogId}` : ""}`),
    [status, blogId],
  );
  const [attempts, setAttempts] = useState<{ delivery: Delivery; list: Attempt[] } | null>(null);

  const retry = async (d: Delivery) => { await api(`/deliveries/${d.id}/retry`, { method: "POST" }); reload(); };
  const cancel = async (d: Delivery) => { await api(`/deliveries/${d.id}/cancel`, { method: "POST" }); reload(); };
  const showAttempts = async (d: Delivery) =>
    setAttempts({ delivery: d, list: await api<Attempt[]>(`/deliveries/${d.id}/attempts`) });

  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Entregas</h2>
        <div className="grow" />
        <select style={{ maxWidth: 200 }} value={blogId} onChange={(e) => setBlogId(e.target.value)}>
          <option value="">Todos os blogs</option>
          {(blogs ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? statusLabel(s) : "Todos os status"}</option>)}
        </select>
        <button className="secondary small" onClick={reload}>Atualizar</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr><th>Notícia</th><th>Blog</th><th>Status</th><th>Tent.</th><th>Quando</th><th></th></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((d) => (
              <tr key={d.id}>
                <td>
                  {d.remoteUrl ? <a href={d.remoteUrl} target="_blank" rel="noreferrer">{d.title} ↗</a> : d.title}
                  {d.lastError && <div className="muted" title={d.lastError}>{d.lastError.slice(0, 70)}</div>}
                </td>
                <td>{d.blogName}</td>
                <td><span className={`badge ${statusClass(d.status)}`}>{statusLabel(d.status)}</span></td>
                <td>
                  <a href="#tentativas" onClick={(e) => { e.preventDefault(); void showAttempts(d); }}>
                    {d.attempts}
                  </a>
                </td>
                <td>
                  {d.deliveredAt ? `entregue ${fmtDate(d.deliveredAt)}`
                    : d.nextRetryAt ? `retry ${fmtDate(d.nextRetryAt)}`
                    : d.scheduledAt ? `agendada ${fmtDate(d.scheduledAt)}`
                    : fmtDate(d.createdAt)}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {["dead", "failed", "cancelled"].includes(d.status) && (
                    <button className="secondary small" onClick={() => retry(d)}>Reenviar</button>
                  )}{" "}
                  {d.status === "pending" && (
                    <button className="danger small" onClick={() => cancel(d)}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma entrega com esse filtro.</td></tr>}
          </tbody>
        </table>
      </div>

      {attempts && (
        <div className="modal-back" onClick={() => setAttempts(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Tentativas — {attempts.delivery.title}</h2>
            <table>
              <thead><tr><th>#</th><th>HTTP</th><th>OK</th><th>Erro</th><th>Duração</th><th>Quando</th></tr></thead>
              <tbody>
                {attempts.list.map((a) => (
                  <tr key={a.id}>
                    <td>{a.attemptNo}</td>
                    <td>{a.httpStatus ?? "—"}</td>
                    <td>{a.ok ? "✔" : "✖"}</td>
                    <td className="muted">{a.errorMessage ?? "—"}</td>
                    <td>{a.durationMs != null ? `${a.durationMs} ms` : "—"}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                  </tr>
                ))}
                {attempts.list.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma tentativa ainda.</td></tr>}
              </tbody>
            </table>
            <button className="secondary" style={{ marginTop: 12 }} onClick={() => setAttempts(null)}>Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}
