import { useMemo, useState } from "react";
import {
  Search, RefreshCw, Trash2, Eye, FileText, Rss, ExternalLink,
  Clock, PenLine, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { api } from "../api";
import { sanitizeHtml } from "../lib/sanitize";
import { fmtDate, nameColor, statusClass, statusLabel, useLoad } from "../hooks";
import { fmtNum } from "../charts";
import { Pager, PAGE_SIZE } from "../ui";

interface NewsRow {
  id: string;
  sourceName: string;
  title: string;
  category: string;
  imageUrl: string | null;
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

interface StatsLite { news: Record<string, number> }

const STATUSES = ["", "queued", "rewriting", "rewritten", "distributed", "manual_draft", "failed", "discarded", "collected"];

export default function News() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data: stats } = useLoad(() => api<StatsLite>("/stats"));
  const { data: rows, error, loading, reload } = useLoad(
    () => api<NewsRow[]>(`/news?limit=200${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    [status, q],
  );
  const [detail, setDetail] = useState<NewsDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (id: string) => setDetail(await api<NewsDetail>(`/news/${id}`));
  const requeue = async (id: string) => {
    setBusy(id);
    try { await api(`/news/${id}/requeue`, { method: "POST" }); reload(); } finally { setBusy(null); }
  };
  const discard = async (id: string) => {
    if (!confirm("Descartar esta notícia? Ela não será reescrita nem distribuída.")) return;
    setBusy(id);
    try { await api(`/news/${id}`, { method: "DELETE" }); reload(); } finally { setBusy(null); }
  };

  const n = stats?.news ?? {};
  const kpis = [
    { label: "Na fila de reescrita", value: (n["queued"] ?? 0) + (n["collected"] ?? 0), icon: Clock, tone: "c-amber" },
    { label: "Reescrevendo agora", value: n["rewriting"] ?? 0, icon: PenLine, tone: "c-purple" },
    { label: "Prontas p/ distribuir", value: n["rewritten"] ?? 0, icon: CheckCircle2, tone: "c-blue" },
    { label: "Distribuídas", value: n["distributed"] ?? 0, icon: Rss, tone: "c-green" },
    { label: "Falharam", value: n["failed"] ?? 0, icon: AlertTriangle, tone: "c-red" },
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
          <div className="search-box">
            <Search size={14} />
            <input
              placeholder="Buscar notícias…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? statusLabel(s) : "Status: todos"}</option>)}
          </select>
          <div className="grow" />
          <button className="iconbtn" title="Atualizar" aria-label="Atualizar lista" onClick={reload}>
            <RefreshCw size={15} className={loading ? "spin-anim" : undefined} />
          </button>
        </div>

        {loading && all.length === 0 ? (
          <div className="tcard-loading"><div className="spinner" /><span className="muted">Carregando notícias…</span></div>
        ) : all.length === 0 ? (
          <div className="tcard-empty">
            <FileText size={32} style={{ display: "block", margin: "0 auto" }} />
            <p>{q || status ? "Nenhuma notícia com esse filtro." : "Nenhuma notícia coletada ainda."}</p>
          </div>
        ) : (
          <div className={`table-scroll ${loading ? "is-stale" : ""}`}>
            <table>
              <thead>
                <tr>
                  <th>Notícia</th><th>Categoria</th><th>Status</th><th>Coletada</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item) => {
                  const color = nameColor(item.category);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="title-cell">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" width={42} height={42} className="thumb" loading="lazy"
                              onError={(e) => { e.currentTarget.style.display = "none"; }} />
                          ) : (
                            <div className="thumb-ph"><FileText size={15} /></div>
                          )}
                          <div className="t-main">
                            <div
                              className="t-title t-link"
                              role="button"
                              tabIndex={0}
                              onClick={() => void open(item.id)}
                              onKeyDown={(e) => { if (e.key === "Enter") void open(item.id); }}
                            >
                              {item.title}
                            </div>
                            <div className="t-tags">
                              <span className="mini-badge"><Rss size={8} />{item.sourceName}</span>
                              {item.failReason && (
                                <span className="mini-badge err" title={item.failReason}>{item.failReason.slice(0, 60)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="pill" style={{ background: `${color}18`, color }}>
                          <i />{item.category || "geral"}
                        </span>
                      </td>
                      <td><span className={`badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(item.createdAt)}</td>
                      <td>
                        <div className="rowactions">
                          <button className="iconbtn blue" title="Ver conteúdo" aria-label="Ver conteúdo" onClick={() => void open(item.id)}>
                            <Eye size={14} />
                          </button>
                          {item.sourceName === "Manual" && (
                            <button className="iconbtn" title="Editar no editor" aria-label="Editar no editor"
                              onClick={() => { window.location.href = `/nova-noticia?id=${item.id}`; }}>
                              <PenLine size={14} />
                            </button>
                          )}
                          {(item.status === "failed" || item.status === "discarded" || item.status === "collected") && (
                            <button className="iconbtn green" title="Reprocessar (volta p/ fila de reescrita)" aria-label="Reprocessar"
                              disabled={busy === item.id} onClick={() => void requeue(item.id)}>
                              <RefreshCw size={14} />
                            </button>
                          )}
                          {item.status !== "discarded" && (
                            <button className="iconbtn red" title="Descartar" aria-label="Descartar"
                              disabled={busy === item.id} onClick={() => void discard(item.id)}>
                              <Trash2 size={14} />
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
          <Pager page={safePage} totalPages={totalPages} total={all.length} onPage={setPage} noun="notícias" />
        )}
      </div>

      {detail !== null && (
        <div className="modal-back" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{detail.title}</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              {detail.sourceName} · {detail.category} · {fmtDate(detail.createdAt)}
              {detail.originalUrl && (
                <>
                  {" · "}
                  <a href={detail.originalUrl} target="_blank" rel="noreferrer">
                    matéria original <ExternalLink size={11} style={{ verticalAlign: "-1.5px" }} />
                  </a>
                </>
              )}
            </p>
            {detail.rewrites.length > 0 ? (
              <>
                <h3 style={{ margin: "14px 0 8px" }}>Reescrita ({detail.rewrites[0]!.provider}/{detail.rewrites[0]!.model})</h3>
                <div className="card" style={{ maxHeight: 320, overflow: "auto" }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.rewrites[0]!.contentHtml) }} />
              </>
            ) : (
              <>
                <h3 style={{ margin: "14px 0 8px" }}>Texto coletado (ainda sem reescrita)</h3>
                <div className="card" style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>
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

