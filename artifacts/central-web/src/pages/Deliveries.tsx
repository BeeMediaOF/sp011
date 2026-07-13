import { useMemo, useState } from "react";
import {
  RefreshCw, Send, Ban, History, ExternalLink,
  ClipboardCheck, Clock, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { api } from "../api";
import { fmtDate, nameColor, statusClass, statusLabel, useLoad } from "../hooks";
import { fmtNum } from "../charts";
import { Pager, PAGE_SIZE } from "../ui";
import type { Blog } from "./Blogs";

interface Delivery {
  id: string;
  title: string | null;
  blogId: string;
  blogName: string | null;
  targetCategory: string | null;
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

interface StatsLite { deliveries: Record<string, number> }

const STATUSES = ["", "awaiting_localization", "localizing", "pending", "awaiting_approval", "delivering", "delivered", "duplicate", "failed", "dead", "cancelled"];

export default function Deliveries() {
  const [status, setStatus] = useState("");
  const [blogId, setBlogId] = useState("");
  const [page, setPage] = useState(1);
  const { data: blogs } = useLoad(() => api<Blog[]>("/blogs"));
  const { data: stats, reload: reloadStats } = useLoad(() => api<StatsLite>("/stats"));
  const { data: rows, error, loading, reload } = useLoad(
    () => api<Delivery[]>(`/deliveries?limit=200${status ? `&status=${status}` : ""}${blogId ? `&blogId=${blogId}` : ""}`),
    [status, blogId],
  );
  const [attempts, setAttempts] = useState<{ delivery: Delivery; list: Attempt[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => { reload(); reloadStats(); };
  const act = async (d: Delivery, path: string) => {
    setBusy(d.id);
    try { await api(`/deliveries/${d.id}/${path}`, { method: "POST" }); refresh(); } finally { setBusy(null); }
  };
  const showAttempts = async (d: Delivery) =>
    setAttempts({ delivery: d, list: await api<Attempt[]>(`/deliveries/${d.id}/attempts`) });

  const dm = stats?.deliveries ?? {};
  const kpis = [
    { label: "Aguardando aprovação", value: dm["awaiting_approval"] ?? 0, icon: ClipboardCheck, tone: "c-amber" },
    { label: "Pendentes de envio", value: (dm["pending"] ?? 0) + (dm["delivering"] ?? 0), icon: Clock, tone: "c-blue" },
    { label: "Entregues", value: dm["delivered"] ?? 0, icon: CheckCircle2, tone: "c-green" },
    { label: "Falhas / esgotadas", value: (dm["failed"] ?? 0) + (dm["dead"] ?? 0), icon: AlertTriangle, tone: "c-red" },
  ];

  const all = rows ?? [];
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => all.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [all, safePage],
  );

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {kpis.map(({ label, value, icon: Icon, tone }) => (
          <div className="kpi" key={label}>
            <div className={`kpi-icon ${tone}`}><Icon size={19} /></div>
            <div className="kpi-body">
              <div className="kpi-value">{fmtNum(value)}</div>
              <div className="kpi-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="tcard">
        <div className="tcard-bar">
          <select value={blogId} onChange={(e) => { setBlogId(e.target.value); setPage(1); }}>
            <option value="">Blog: todos</option>
            {(blogs ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? statusLabel(s) : "Status: todos"}</option>)}
          </select>
          <div className="grow" />
          <button className="iconbtn" title="Atualizar" aria-label="Atualizar lista" onClick={refresh}>
            <RefreshCw size={15} className={loading ? "spin-anim" : undefined} />
          </button>
        </div>

        {loading && all.length === 0 ? (
          <div className="tcard-loading"><div className="spinner" /><span className="muted">Carregando entregas…</span></div>
        ) : all.length === 0 ? (
          <div className="tcard-empty">
            <Send size={32} style={{ display: "block", margin: "0 auto" }} />
            <p>Nenhuma entrega com esse filtro.</p>
          </div>
        ) : (
          <div className={`table-scroll ${loading ? "is-stale" : ""}`}>
            <table>
              <thead>
                <tr>
                  <th>Notícia</th><th>Blog</th><th>Status</th><th>Tent.</th><th>Quando</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item) => {
                  const blogColor = nameColor(item.blogName ?? item.blogId);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="title-cell" style={{ minWidth: 220 }}>
                          <div className="t-main">
                            {item.remoteUrl ? (
                              <a className="t-title t-link" href={item.remoteUrl} target="_blank" rel="noreferrer">
                                {item.title ?? "(sem título)"} <ExternalLink size={11} style={{ verticalAlign: "-1.5px" }} />
                              </a>
                            ) : (
                              <div className="t-title">{item.title ?? "(sem título)"}</div>
                            )}
                            {item.lastError && (
                              <div className="t-tags">
                                <span className="mini-badge err" title={item.lastError}>
                                  {item.lastHttpStatus ? `HTTP ${item.lastHttpStatus} · ` : ""}{item.lastError.slice(0, 60)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="pill" style={{ background: `${blogColor}18`, color: blogColor }}>
                          <i />{item.blogName ?? item.blogId}
                        </span>
                        {item.targetCategory && (
                          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>→ {item.targetCategory}</div>
                        )}
                      </td>
                      <td><span className={`badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                      <td>
                        <button className="iconbtn blue" title="Ver tentativas de envio" onClick={() => void showAttempts(item)}>
                          <History size={13} style={{ marginRight: 4 }} />{item.attempts}
                        </button>
                      </td>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                        {item.deliveredAt ? <>entregue<br /><span className="muted">{fmtDate(item.deliveredAt)}</span></>
                          : item.nextRetryAt ? <>retry<br /><span className="muted">{fmtDate(item.nextRetryAt)}</span></>
                          : item.scheduledAt ? <>agendada<br /><span className="muted">{fmtDate(item.scheduledAt)}</span></>
                          : <span className="muted">{fmtDate(item.createdAt)}</span>}
                      </td>
                      <td>
                        <div className="rowactions">
                          {["pending", "awaiting_approval"].includes(item.status) && (
                            <button className="iconbtn green" title="Publicar agora" aria-label="Publicar agora"
                              disabled={busy === item.id} onClick={() => void act(item, "publish-now")}>
                              <Send size={14} />
                            </button>
                          )}
                          {["dead", "failed", "cancelled"].includes(item.status) && (
                            <button className="iconbtn blue" title="Reenviar" aria-label="Reenviar"
                              disabled={busy === item.id} onClick={() => void act(item, "retry")}>
                              <RefreshCw size={14} />
                            </button>
                          )}
                          {["pending", "awaiting_localization"].includes(item.status) && (
                            <button className="iconbtn red" title="Cancelar entrega" aria-label="Cancelar entrega"
                              disabled={busy === item.id} onClick={() => void act(item, "cancel")}>
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {all.length > 0 && (
          <Pager page={safePage} totalPages={totalPages} total={all.length} onPage={setPage} noun="entregas" />
        )}
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
                    <td>{a.ok
                      ? <span className="badge ok">OK</span>
                      : <span className="badge err">falhou</span>}
                    </td>
                    <td className="muted">{a.errorMessage ?? "—"}</td>
                    <td>{a.durationMs != null ? `${fmtNum(a.durationMs)} ms` : "—"}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                  </tr>
                ))}
                {attempts.list.length === 0 && (
                  <tr><td colSpan={6} className="muted">Nenhuma tentativa ainda.</td></tr>
                )}
              </tbody>
            </table>
            <button className="secondary" style={{ marginTop: 12 }} onClick={() => setAttempts(null)}>Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}
