import { useState } from "react";
import { api } from "../api";
import { fmtDate, statusClass, statusLabel, useLoad } from "../hooks";

interface NewsRow {
  id: string;
  sourceName: string;
  title: string;
  category: string;
  originalUrl: string | null;
  status: string;
  failReason: string | null;
  createdAt: string;
}

interface NewsDetail extends NewsRow {
  contentRaw: string | null;
  rewrites: Array<{ id: string; title: string | null; contentHtml: string | null; provider: string | null; model: string | null }>;
  deliveries: Array<{ id: string; blogId: string; status: string }>;
}

const STATUSES = ["", "queued", "rewriting", "rewritten", "distributed", "failed", "discarded", "collected"];

export default function News() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data: rows, error, reload } = useLoad(
    () => api<NewsRow[]>(`/news?limit=100${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    [status, q],
  );
  const [detail, setDetail] = useState<NewsDetail | null>(null);

  const open = async (id: string) => setDetail(await api<NewsDetail>(`/news/${id}`));
  const requeue = async (id: string) => { await api(`/news/${id}/requeue`, { method: "POST" }); reload(); };
  const discard = async (id: string) => { await api(`/news/${id}`, { method: "DELETE" }); reload(); };

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <input style={{ maxWidth: 220 }} placeholder="Buscar título…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? statusLabel(s) : "Todos os status"}</option>)}
        </select>
        <button className="secondary small" onClick={reload}>Atualizar</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr><th>Título</th><th>Fonte</th><th>Categoria</th><th>Status</th><th>Coletada</th><th></th></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((n) => (
              <tr key={n.id}>
                <td>
                  <a href="#detalhe" onClick={(e) => { e.preventDefault(); void open(n.id); }}>{n.title}</a>
                  {n.failReason && <div className="muted">{n.failReason.slice(0, 80)}</div>}
                </td>
                <td>{n.sourceName}</td>
                <td>{n.category}</td>
                <td><span className={`badge ${statusClass(n.status)}`}>{statusLabel(n.status)}</span></td>
                <td>{fmtDate(n.createdAt)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {(n.status === "failed" || n.status === "discarded" || n.status === "collected") && (
                    <button className="secondary small" onClick={() => requeue(n.id)}>Reprocessar</button>
                  )}{" "}
                  {n.status !== "discarded" && (
                    <button className="danger small" onClick={() => discard(n.id)}>Descartar</button>
                  )}
                </td>
              </tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={6} className="muted">Nada por aqui.</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="modal-back" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{detail.title}</h2>
            <p className="muted">
              {detail.sourceName} · {detail.category} ·{" "}
              {detail.originalUrl && <a href={detail.originalUrl} target="_blank" rel="noreferrer">matéria original ↗</a>}
            </p>
            {detail.rewrites.length > 0 ? (
              <>
                <h3>Reescrita ({detail.rewrites[0]!.provider}/{detail.rewrites[0]!.model})</h3>
                <div className="card" style={{ maxHeight: 300, overflow: "auto" }}
                  dangerouslySetInnerHTML={{ __html: detail.rewrites[0]!.contentHtml ?? "" }} />
              </>
            ) : (
              <>
                <h3>Texto coletado (ainda sem reescrita)</h3>
                <div className="card" style={{ maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap" }}>
                  {detail.contentRaw?.slice(0, 4000) ?? "—"}
                </div>
              </>
            )}
            <button className="secondary" onClick={() => setDetail(null)}>Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}
