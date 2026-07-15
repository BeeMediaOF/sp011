import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, Globe, ImagePlus, Loader2, PenSquare, Send, X } from "lucide-react";
import { api, apiUpload } from "../api";
import { statusLabel, useLoad } from "../hooks";

interface BlogLite {
  id: string;
  name: string;
  isActive: boolean;
  language: string;
}

interface ManualResult {
  id: string;
  deliveries: Array<{ id: string; blogId: string; blogName: string; status: string }>;
}

/** Sem tag HTML no texto → parágrafos separados por linha em branco viram <p>. */
function toContentHtml(raw: string): string {
  const text = raw.trim();
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\n/g, "<br/>"))
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  content: "",
  imageUrl: "",
  author: "",
  language: "pt-BR",
  targetCategory: "",
  socialTitle: "",
  socialSummary: "",
};

const UPLOAD_MAX_MB = 10;

/**
 * Publicação manual multi-blog: escreve a notícia UMA vez e escolhe os blogs
 * de destino — a entrega segue o caminho padrão (deliveryWorker → ingest).
 * Blog em idioma diferente do texto traduz via localizer automaticamente.
 */
export default function NewArticle() {
  const { data: blogs } = useLoad(() => api<BlogLite[]>("/blogs"));
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ManualResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError("Formato não suportado — use JPEG, PNG, WebP ou GIF.");
      return;
    }
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      setError(`Imagem acima de ${UPLOAD_MAX_MB} MB — reduza antes de enviar.`);
      return;
    }
    setUploading(true);
    try {
      const res = await apiUpload<{ url: string }>("/news/upload-image", file);
      setForm((f) => ({ ...f, imageUrl: res.url }));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setUploading(false);
    }
  };

  const active = useMemo(() => (blogs ?? []).filter((b) => b.isActive), [blogs]);
  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = active.length > 0 && active.every((b) => selected.has(b.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(active.map((b) => b.id)));

  const submit = async () => {
    setError(null);
    if (!form.title.trim()) { setError("Informe o título."); return; }
    if (!form.content.trim()) { setError("Escreva o conteúdo da notícia."); return; }
    if (selected.size === 0) { setError("Selecione pelo menos um blog de destino."); return; }
    if (uploading) { setError("Aguarde o envio da imagem terminar."); return; }
    setSending(true);
    try {
      const res = await api<ManualResult>("/news/manual", {
        method: "POST",
        body: {
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || undefined,
          contentHtml: toContentHtml(form.content),
          imageUrl: form.imageUrl.trim() || undefined,
          author: form.author.trim() || undefined,
          language: form.language,
          targetCategory: form.targetCategory.trim() || undefined,
          socialTitle: form.socialTitle.trim() || undefined,
          socialSummary: form.socialSummary.trim() || undefined,
          blogIds: [...selected],
        },
      });
      setResult(res);
      setForm(EMPTY_FORM);
      setSelected(new Set());
      window.scrollTo(0, 0);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {result && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
            <CheckCircle2 size={18} />
            Notícia criada — {result.deliveries.length} entrega(s) na fila
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {result.deliveries.map((d) => (
              <li key={d.id}>
                <b>{d.blogName}</b>: {statusLabel(d.status)}
                {d.status === "awaiting_localization" && " (tradução/categoria automática antes do envio)"}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ marginBottom: 0 }}>
            Acompanhe (e use "Publicar agora", se quiser adiantar) na aba <b>Entregas</b>.
          </p>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0 }}>
          <PenSquare size={17} /> Conteúdo
        </h3>

        <label>Título *</label>
        <input value={form.title} onChange={set("title")} placeholder="Título da notícia" maxLength={220} />
        <label>Subtítulo</label>
        <input value={form.subtitle} onChange={set("subtitle")} placeholder="Complemento do título (opcional)" maxLength={300} />
        <label>Conteúdo *</label>
        <textarea
          value={form.content}
          onChange={set("content")}
          rows={12}
          placeholder={"Texto da notícia. Pode colar HTML (<p>, <h3>, <b>…) ou texto puro — parágrafos separados por linha em branco viram <p> automaticamente."}
        />
        <label>Imagem de capa</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={{ flex: 1, minWidth: 0 }}
            value={form.imageUrl}
            onChange={set("imageUrl")}
            placeholder="https://… (cole uma URL ou envie um arquivo do computador)"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={(e) => void pickFile(e)}
          />
          <button
            type="button"
            className="secondary fit"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            style={{ whiteSpace: "nowrap" }}
          >
            {uploading
              ? <Loader2 size={14} className="spin-anim" style={{ verticalAlign: "-2px", marginRight: 6 }} />
              : <ImagePlus size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />}
            {uploading ? "Enviando…" : "Enviar imagem"}
          </button>
        </div>
        {form.imageUrl.trim() && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "10px 0 4px" }}>
            <img
              src={form.imageUrl}
              alt="Prévia da capa"
              style={{
                maxWidth: 280, maxHeight: 158, borderRadius: 8,
                border: "1px solid var(--border)", objectFit: "cover",
              }}
            />
            <button
              type="button"
              className="secondary fit"
              onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
            >
              <X size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Remover
            </button>
          </div>
        )}
        <label>De quem é a notícia (assinatura exibida nos blogs)</label>
        <input
          value={form.author}
          onChange={set("author")}
          placeholder="ex.: Por BeeSports — vazio = assinatura padrão de cada blog"
          maxLength={80}
        />
        <div className="row">
          <div>
            <label>Idioma do texto</label>
            <select value={form.language} onChange={set("language")}>
              <option value="pt-BR">Português (BR)</option>
              <option value="en">Inglês</option>
            </select>
          </div>
          <div>
            <label>Categoria de destino (slug)</label>
            <input
              value={form.targetCategory}
              onChange={set("targetCategory")}
              placeholder="ex.: futebol — vazio = IA classifica no menu de cada blog"
            />
          </div>
        </div>
        <div className="row">
          <div>
            <label>Manchete social (arte do Instagram)</label>
            <input value={form.socialTitle} onChange={set("socialTitle")} placeholder="Opcional — 70 a 85 caracteres" maxLength={90} />
          </div>
          <div>
            <label>Resumo social (legenda)</label>
            <input value={form.socialSummary} onChange={set("socialSummary")} placeholder="Opcional" maxLength={250} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0 }}>
          <Globe size={17} /> Blogs de destino
        </h3>
        {active.length === 0 ? (
          <p className="muted">Nenhum blog ativo cadastrado.</p>
        ) : (
          <>
            <label className="fit row" style={{ margin: "0 0 10px", fontWeight: 600 }}>
              <input className="fit" style={{ width: "auto" }} type="checkbox" checked={allSelected} onChange={toggleAll} />
              Selecionar todos ({active.length})
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
              {active.map((b) => (
                <label
                  key={b.id}
                  className="row"
                  style={{
                    margin: 0, padding: "8px 10px", cursor: "pointer",
                    border: "1px solid var(--border)", borderRadius: 8, flexWrap: "nowrap",
                  }}
                >
                  <input
                    className="fit"
                    style={{ width: "auto" }}
                    type="checkbox"
                    checked={selected.has(b.id)}
                    onChange={() => toggle(b.id)}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.name}
                  </span>
                  {b.language === "en" && <span className="badge info">EN</span>}
                </label>
              ))}
            </div>
            <p className="muted" style={{ marginBottom: 0, marginTop: 10 }}>
              Blog em idioma diferente do texto recebe a versão traduzida automaticamente
              (e a categoria é classificada no menu dele quando a "categoria de destino" fica vazia).
            </p>
          </>
        )}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="fit" onClick={() => void submit()} disabled={sending}>
          <Send size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {sending ? "Enviando…" : `Publicar em ${selected.size} blog(s)`}
        </button>
      </div>
    </>
  );
}
