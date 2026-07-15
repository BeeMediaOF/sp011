import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Calendar, Clapperboard, ExternalLink, History, Instagram, Loader2, Music2,
  Pencil, Plus, RefreshCw, Sparkles, Trash2, Video, Zap,
} from "lucide-react";
import { api } from "../api";
import { fmtDate, nameColor, statusClass, statusLabel, timeAgo, useLoad } from "../hooks";

interface SocialConnection {
  blogId: string;
  blogName: string;
  isActive: boolean;
  hasMeta: boolean;
  igUsername: string | null;
  metaLastError: string | null;
  bufferChannelId: string | null;
  hasBufferKey: boolean;
  hasGlobalBufferKey: boolean;
}

interface PublishResults {
  instagram?: { ok: boolean; mediaId?: string; error?: string };
  tiktok?: { ok: boolean; bufferPostId?: string; error?: string };
  warnings?: string[];
}

interface SocialVideo {
  id: string;
  blogId: string;
  blogName: string | null;
  sourceUrl: string;
  platform: string;
  targets: string[] | null;
  status: string;
  title: string | null;
  caption: string | null;
  captionSource: string | null;
  creator: string | null;
  fileUrl: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  attempts: number;
  publishResults: PublishResults | null;
  errorMessage: string | null;
  createdAt: string;
}

const TARGETS = [
  { id: "instagram", label: "Instagram (Reels)" },
  { id: "tiktok", label: "TikTok" },
];

const ACTIVE_STATUSES = ["queued", "downloading", "publishing"];
const ACTIONABLE = ["queued", "downloading", "ready", "scheduled", "error"];
const EDITABLE = ["ready", "scheduled", "error"];

function supportsTarget(c: SocialConnection, target: string): boolean {
  if (target === "instagram") return c.hasMeta;
  if (target === "tiktok") return !!c.bufferChannelId && (c.hasBufferKey || c.hasGlobalBufferKey);
  return false;
}

/** Date → valor de <input type="datetime-local"> no fuso do navegador. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM = { url: "", caption: "", cta: "", credits: "", hashtags: "", scheduleAt: "" };

export default function AutomacaoSocial() {
  const [tab, setTab] = useState<"postagem" | "historico">("postagem");
  const { data: connections, error: connError } = useLoad(() => api<SocialConnection[]>("/social/connections"));
  const { data: videos, error, loading, reload } = useLoad(() => api<SocialVideo[]>("/social/videos?limit=100"));

  const [form, setForm] = useState(EMPTY_FORM);
  const [targets, setTargets] = useState<Set<string>>(new Set(["instagram", "tiktok"]));
  const [blogIds, setBlogIds] = useState<Set<string>>(new Set());
  const [showCaption, setShowCaption] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [editing, setEditing] = useState<SocialVideo | null>(null);
  const [editForm, setEditForm] = useState({ title: "", caption: "", scheduleAt: "" });
  const [scheduling, setScheduling] = useState<SocialVideo | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");

  // Auto-refresh enquanto há vídeo baixando/publicando
  useEffect(() => {
    if (!(videos ?? []).some((v) => ACTIVE_STATUSES.includes(v.status))) return;
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [videos, reload]);

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleTarget = (id: string) =>
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleBlog = (id: string) =>
    setBlogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Só blogs ativos com pelo menos um canal compatível com os destinos marcados
  const availableBlogs = useMemo(() => {
    const list = (connections ?? []).filter((c) => c.isActive);
    return list.filter((c) => [...targets].some((t) => supportsTarget(c, t)));
  }, [connections, targets]);

  // Blog marcado que saiu da lista (mudou o destino) é desmarcado
  useEffect(() => {
    setBlogIds((prev) => {
      const valid = new Set(availableBlogs.map((b) => b.blogId));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [availableBlogs]);

  const submit = async (kind: "now" | "schedule" | "queue") => {
    setMsg("");
    setOkMsg("");
    if (!form.url.trim()) { setMsg("Cole o link do vídeo (TikTok ou Instagram)."); return; }
    if (targets.size === 0) { setMsg("Selecione pelo menos um destino."); return; }
    if (blogIds.size === 0) { setMsg("Selecione pelo menos um blog."); return; }
    let scheduledAt: string | undefined;
    if (kind === "schedule") {
      const d = new Date(form.scheduleAt);
      if (!form.scheduleAt || isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        setMsg("Defina um horário de agendamento no futuro.");
        return;
      }
      scheduledAt = d.toISOString();
    }
    setBusy(true);
    try {
      const res = await api<{ videos: SocialVideo[] }>("/social/videos", {
        method: "POST",
        body: {
          url: form.url.trim(),
          blogIds: [...blogIds],
          targets: [...targets],
          caption: form.caption.trim() || undefined,
          cta: form.cta.trim() || undefined,
          credits: form.credits.trim() || undefined,
          hashtags: form.hashtags.trim() || undefined,
          postNow: kind === "now",
          scheduledAt,
        },
      });
      setForm(EMPTY_FORM);
      setBlogIds(new Set());
      setOkMsg(
        kind === "now"
          ? `${res.videos.length} vídeo(s) na fila — baixa e publica em seguida.`
          : kind === "schedule"
            ? `${res.videos.length} vídeo(s) agendado(s).`
            : `${res.videos.length} vídeo(s) adicionado(s) à fila (aguardam ação manual após o download).`,
      );
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const act = async (v: SocialVideo, fn: () => Promise<unknown>) => {
    setRowBusy(v.id);
    setMsg("");
    try { await fn(); reload(); } catch (err) { setMsg(String((err as Error).message)); } finally { setRowBusy(null); }
  };

  const postNow = (v: SocialVideo) => act(v, () => api(`/social/videos/${v.id}/post-now`, { method: "POST" }));
  const retry = (v: SocialVideo) => act(v, () => api(`/social/videos/${v.id}/retry`, { method: "POST" }));
  const remove = (v: SocialVideo) => {
    if (!confirm(`Excluir o vídeo "${v.title || v.sourceUrl}" do blog ${v.blogName ?? v.blogId}?`)) return;
    void act(v, () => api(`/social/videos/${v.id}`, { method: "DELETE" }));
  };
  const regenerate = (v: SocialVideo) =>
    act(v, async () => {
      const row = await api<SocialVideo>(`/social/videos/${v.id}/regenerate-caption`, { method: "POST" });
      if (editing?.id === v.id) {
        setEditForm((f) => ({ ...f, title: row.title ?? "", caption: row.caption ?? "" }));
      }
    });

  const openEdit = (v: SocialVideo) => {
    setEditForm({
      title: v.title ?? "",
      caption: v.caption ?? "",
      scheduleAt: v.scheduledAt ? toLocalInput(new Date(v.scheduledAt)) : "",
    });
    setEditing(v);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body: Record<string, unknown> = {
      title: editForm.title,
      caption: editForm.caption,
      scheduledAt: editForm.scheduleAt ? new Date(editForm.scheduleAt).toISOString() : null,
    };
    await act(editing, () => api(`/social/videos/${editing.id}`, { method: "PATCH", body }));
    setEditing(null);
  };

  const openSchedule = (v: SocialVideo) => {
    const prefill = v.scheduledAt && new Date(v.scheduledAt) > new Date()
      ? new Date(v.scheduledAt)
      : new Date(Date.now() + 3_600_000);
    setScheduleValue(toLocalInput(prefill));
    setScheduling(v);
  };

  const confirmSchedule = async () => {
    if (!scheduling) return;
    const d = new Date(scheduleValue);
    if (!scheduleValue || isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      setMsg("Selecione um horário no futuro.");
      return;
    }
    await act(scheduling, () =>
      api(`/social/videos/${scheduling.id}/schedule`, { method: "POST", body: { scheduledAt: d.toISOString() } }));
    setScheduling(null);
  };

  const targetBadge = (v: SocialVideo, target: string) => {
    if (!(v.targets ?? []).some((t) => t.includes(target))) return null;
    const r = target === "instagram" ? v.publishResults?.instagram : v.publishResults?.tiktok;
    const cls = r?.ok ? "ok" : r ? "err" : "";
    const Icon = target === "instagram" ? Instagram : Music2;
    const label = target === "instagram" ? "IG" : "TikTok";
    return (
      <span className={`badge ${cls}`} title={r?.error ?? (r?.ok ? "publicado" : "aguardando")}>
        <Icon size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} />
        {label}{r?.ok ? " ✓" : r ? " ✗" : ""}
      </span>
    );
  };

  const list = videos ?? [];

  return (
    <>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={tab === "postagem" ? "active" : ""} onClick={() => setTab("postagem")}>
          <Video size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Postagem
        </button>
        <button className={tab === "historico" ? "active" : ""} onClick={() => setTab("historico")}>
          <History size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Histórico ({list.length})
        </button>
      </div>

      {msg && <div className="error-box">{msg}</div>}
      {okMsg && <div className="card" role="status">✔ {okMsg}</div>}
      {connError && <div className="error-box">{connError}</div>}

      {tab === "postagem" && (
        <div className="card">
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Clapperboard size={17} /> Repostar vídeo do TikTok/Instagram
          </h3>

          <label>Link do vídeo *</label>
          <input
            value={form.url}
            onChange={set("url")}
            placeholder="https://www.tiktok.com/@usuario/video/… ou https://www.instagram.com/reel/…"
          />

          <div className="row" style={{ marginTop: 10 }}>
            <div>
              <label>Destinos</label>
              <div className="row" style={{ margin: 0 }}>
                {TARGETS.map((t) => (
                  <label className="fit row" style={{ margin: 0 }} key={t.id}>
                    <input className="fit" style={{ width: "auto" }} type="checkbox"
                      checked={targets.has(t.id)} onChange={() => toggleTarget(t.id)} />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label><Calendar size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Agendar para (opcional)</label>
              <input type="datetime-local" value={form.scheduleAt} onChange={set("scheduleAt")} />
            </div>
          </div>

          <label style={{ marginTop: 10 }}>Blogs de destino (só aparecem os com canal conectado)</label>
          {availableBlogs.length === 0 ? (
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Nenhum blog tem canal compatível com os destinos marcados. Conecte Meta/Buffer no
              cadastro do blog (Blogs → Editar → Redes Sociais).
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {availableBlogs.map((c) => {
                const igOk = supportsTarget(c, "instagram");
                const ttOk = supportsTarget(c, "tiktok");
                const missing = [...targets].filter((t) => !supportsTarget(c, t));
                return (
                  <label key={c.blogId} className="row"
                    style={{ margin: 0, padding: "8px 10px", cursor: "pointer", border: "1px solid var(--border)", borderRadius: 8, flexWrap: "nowrap" }}>
                    <input className="fit" style={{ width: "auto" }} type="checkbox"
                      checked={blogIds.has(c.blogId)} onChange={() => toggleBlog(c.blogId)} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.blogName}
                    </span>
                    {igOk && <span className="badge info" title={c.igUsername ? `@${c.igUsername}` : "Instagram conectado"}>IG</span>}
                    {ttOk && <span className="badge info">TikTok</span>}
                    {missing.length > 0 && (
                      <span className="badge warn" title={`Sem canal: ${missing.join(", ")} — será ignorado nesse destino`}>parcial</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button type="button" className="secondary small" onClick={() => setShowCaption((v) => !v)}>
              {showCaption ? "− Ocultar legenda personalizada" : "+ Legenda personalizada (créditos, CTA, hashtags)"}
            </button>
            {showCaption && (
              <div className="row" style={{ marginTop: 10 }}>
                <div>
                  <label>Legenda</label>
                  <textarea rows={3} value={form.caption} onChange={set("caption")} placeholder="Texto principal do post…" />
                </div>
                <div>
                  <label>CTA (chamada para ação)</label>
                  <textarea rows={3} value={form.cta} onChange={set("cta")} placeholder="Comenta aí o que achou! 👇" />
                </div>
                <div>
                  <label>Créditos</label>
                  <input value={form.credits} onChange={set("credits")} placeholder="@usuario_original" />
                </div>
                <div>
                  <label>Hashtags</label>
                  <input value={form.hashtags} onChange={set("hashtags")} placeholder="#futebol #viral #brasil" />
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  Se deixar tudo vazio, a IA gera a legenda automaticamente a partir da legenda original do vídeo.
                </p>
              </div>
            )}
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={() => void submit("now")} disabled={busy || !!form.scheduleAt}
              title={form.scheduleAt ? "Limpe o horário para postar agora" : "Baixa e publica imediatamente"}>
              {busy ? <Loader2 size={14} className="spin-anim" style={{ verticalAlign: "-2px", marginRight: 6 }} /> : <Zap size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />}
              Postar agora
            </button>
            <button className="secondary" onClick={() => void submit("schedule")} disabled={busy || !form.scheduleAt}
              title={form.scheduleAt ? "Baixa e publica no horário definido" : "Defina um horário em Agendar"}>
              <Calendar size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Agendar
            </button>
            <button className="secondary" onClick={() => void submit("queue")} disabled={busy}
              title="Só baixa o vídeo — você publica manualmente depois">
              <Plus size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Adicionar à fila
            </button>
          </div>
        </div>
      )}

      {tab === "historico" && (
        <div className="tcard">
          <div className="tcard-bar">
            <span className="muted" style={{ fontSize: 13 }}>{list.length} vídeo(s)</span>
            <div className="grow" />
            <button className="iconbtn" title="Atualizar" aria-label="Atualizar lista" onClick={reload}>
              <RefreshCw size={15} className={loading ? "spin-anim" : undefined} />
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}

          {loading && list.length === 0 ? (
            <div className="tcard-loading"><div className="spinner" /><span className="muted">Carregando vídeos…</span></div>
          ) : list.length === 0 ? (
            <div className="tcard-empty">
              <Clapperboard size={32} style={{ display: "block", margin: "0 auto" }} />
              <p>Nenhum vídeo ainda. Cole um link na aba Postagem.</p>
            </div>
          ) : (
            <div className={`table-scroll ${loading ? "is-stale" : ""}`}>
              <table>
                <thead>
                  <tr>
                    <th>Vídeo</th><th>Blog</th><th>Destinos</th><th>Status</th><th>Quando</th>
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((v) => {
                    const blogColor = nameColor(v.blogName ?? v.blogId);
                    const warnings = v.publishResults?.warnings ?? [];
                    return (
                      <tr key={v.id}>
                        <td>
                          <div className="title-cell" style={{ minWidth: 220 }}>
                            <div className="t-main">
                              <div className="t-title">
                                {v.title || v.sourceUrl}
                                {" "}
                                <a href={v.fileUrl ?? v.sourceUrl} target="_blank" rel="noreferrer" title={v.fileUrl ? "Ver vídeo baixado" : "Ver post original"}>
                                  <ExternalLink size={11} style={{ verticalAlign: "-1.5px" }} />
                                </a>
                              </div>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {v.creator ? `@${v.creator} · ` : ""}{v.platform}
                                {v.captionSource === "ai" ? " · legenda IA" : v.captionSource === "user" ? " · legenda manual" : ""}
                              </div>
                              {v.errorMessage && (
                                <div className="t-tags">
                                  <span className="mini-badge err" title={v.errorMessage}>{v.errorMessage.slice(0, 70)}</span>
                                </div>
                              )}
                              {warnings.length > 0 && (
                                <div className="t-tags">
                                  <span className="mini-badge warn" title={warnings.join("\n")}>⚠ {warnings[0]!.slice(0, 60)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="pill" style={{ background: `${blogColor}18`, color: blogColor }}>
                            <i />{v.blogName ?? v.blogId}
                          </span>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {targetBadge(v, "instagram")}{" "}{targetBadge(v, "tiktok")}
                        </td>
                        <td><span className={`badge ${statusClass(v.status)}`}>{statusLabel(v.status)}</span></td>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                          {v.sentAt ? <>postado<br /><span className="muted">{fmtDate(v.sentAt)}</span></>
                            : v.scheduledAt ? <>agendado<br /><span className="muted">{fmtDate(v.scheduledAt)}</span></>
                            : <span className="muted" title={fmtDate(v.createdAt)}>{timeAgo(v.createdAt)}</span>}
                        </td>
                        <td>
                          <div className="rowactions">
                            {ACTIONABLE.includes(v.status) && (
                              <button className="iconbtn green" title="Postar agora" aria-label="Postar agora"
                                disabled={rowBusy === v.id} onClick={() => void postNow(v)}>
                                <Zap size={14} />
                              </button>
                            )}
                            {ACTIONABLE.includes(v.status) && (
                              <button className="iconbtn blue" title="Agendar horário" aria-label="Agendar horário"
                                disabled={rowBusy === v.id} onClick={() => openSchedule(v)}>
                                <Calendar size={14} />
                              </button>
                            )}
                            {EDITABLE.includes(v.status) && (
                              <button className="iconbtn" title="Editar título/legenda" aria-label="Editar"
                                disabled={rowBusy === v.id} onClick={() => openEdit(v)}>
                                <Pencil size={14} />
                              </button>
                            )}
                            {v.status === "error" && (
                              <button className="iconbtn blue" title="Tentar de novo" aria-label="Tentar de novo"
                                disabled={rowBusy === v.id} onClick={() => void retry(v)}>
                                <RefreshCw size={14} />
                              </button>
                            )}
                            <button className="iconbtn red" title="Excluir" aria-label="Excluir"
                              disabled={rowBusy === v.id} onClick={() => remove(v)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Editar — {editing.blogName ?? editing.blogId}</h2>
            <label>Título (interno + título no TikTok)</label>
            <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            <label>Legenda</label>
            <textarea rows={8} value={editForm.caption} onChange={(e) => setEditForm({ ...editForm, caption: e.target.value })} />
            <button type="button" className="secondary small" disabled={rowBusy === editing.id}
              onClick={() => void regenerate(editing)}>
              <Sparkles size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
              Regerar legenda com IA
            </button>
            <label style={{ marginTop: 10 }}>Agendado para (vazio = volta a "pronto")</label>
            <input type="datetime-local" value={editForm.scheduleAt}
              onChange={(e) => setEditForm({ ...editForm, scheduleAt: e.target.value })} />
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={() => void saveEdit()} disabled={rowBusy === editing.id}>Salvar</button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {scheduling && (
        <div className="modal-back" onClick={() => setScheduling(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Agendar — {scheduling.title || scheduling.sourceUrl}</h2>
            <label>Horário de publicação</label>
            <input type="datetime-local" value={scheduleValue} onChange={(e) => setScheduleValue(e.target.value)} />
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={() => void confirmSchedule()} disabled={rowBusy === scheduling.id}>
                <Calendar size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Confirmar
              </button>
              <button className="secondary" onClick={() => setScheduling(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
