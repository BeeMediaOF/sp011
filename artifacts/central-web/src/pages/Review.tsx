import { useState } from "react";
import { api } from "../api";
import { sanitizeHtml } from "../lib/sanitize";
import { fmtDate, useLoad } from "../hooks";

interface ReviewItem {
  id: string;
  title: string | null;
  subtitle: string | null;
  contentHtml: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  blogName: string | null;
  createdAt: string;
  auditStatus: string | null;
  auditNotes: string | null;
  qualityScore: number | null;
  fidelityCoverage: number | null;
}

export default function Review() {
  const { data: items, error, reload } = useLoad(() => api<ReviewItem[]>("/deliveries/review"));
  const [preview, setPreview] = useState<ReviewItem | null>(null);
  const [msg, setMsg] = useState("");

  const act = async (item: ReviewItem, action: "approve" | "reject") => {
    try {
      await api(`/deliveries/${item.id}/${action}`, { method: "POST" });
      setMsg(`${action === "approve" ? "✔ Aprovada" : "✖ Rejeitada"}: ${item.title}`);
      setPreview(null);
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <button className="secondary small" onClick={reload}>Atualizar</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {msg && <div className="card">{msg}</div>}

      <div className="card">
        <table>
          <thead>
            <tr><th>Notícia</th><th>Blog de destino</th><th>Aguardando desde</th><th></th></tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => (
              <tr key={item.id}>
                <td>
                  <a href="#preview" onClick={(e) => { e.preventDefault(); setPreview(item); }}>{item.title}</a>
                  <div className="muted">
                    {item.sourceName}
                    {item.qualityScore != null && ` · score ${item.qualityScore}`}
                  </div>
                  {item.auditStatus === "flagged" && (
                    <div className="error-box" style={{ marginTop: 4, padding: "4px 8px", fontSize: 12 }}>
                      ⚠ IA Auditora: {item.auditNotes ?? "sinalizada para revisão"}
                    </div>
                  )}
                </td>
                <td>{item.blogName}</td>
                <td>{fmtDate(item.createdAt)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="small" onClick={() => act(item, "approve")}>Aprovar</button>{" "}
                  <button className="danger small" onClick={() => act(item, "reject")}>Rejeitar</button>
                </td>
              </tr>
            ))}
            {items?.length === 0 && <tr><td colSpan={4} className="muted">Nenhuma entrega aguardando aprovação.</td></tr>}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="modal-back" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{preview.title}</h2>
            {preview.subtitle && <p className="muted">{preview.subtitle}</p>}
            {preview.auditStatus === "flagged" && (
              <div className="error-box" style={{ marginBottom: 8 }}>
                ⚠ IA Auditora: {preview.auditNotes ?? "sinalizada para revisão"}
                {preview.fidelityCoverage != null && ` (cobertura da fonte: ${preview.fidelityCoverage}%)`}
              </div>
            )}
            {preview.imageUrl && <img src={preview.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />}
            <div className="card" style={{ maxHeight: 320, overflow: "auto" }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview.contentHtml) }} />
            <div className="row">
              <button onClick={() => act(preview, "approve")}>Aprovar e enviar p/ {preview.blogName}</button>
              <button className="danger" onClick={() => act(preview, "reject")}>Rejeitar</button>
              <button className="secondary" onClick={() => setPreview(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
