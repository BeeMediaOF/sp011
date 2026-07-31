import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Ad } from "../../lib/adminApi";
import { useCan } from "../../lib/permissionsCache";
import { inferBlockType, type HomeBlock } from "../../lib/homeBlocks";
import { sanitizeArticleHtml } from "../../lib/sanitize";
import { proxyUrl } from "../../lib/newsImage";
import { invalidateSiteCache } from "../../hooks/useSite";
import {
  Plus, Trash2, Pencil, Search, Megaphone,
  MousePointer, Sparkles, ImageIcon, X, Upload,
  ChevronLeft, ChevronRight, Info, BarChart2, Code, LayoutGrid,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

function fmtNum(n: number): string {
  return (n ?? 0).toLocaleString("pt-BR");
}

function calcCTR(clicks: number, impressions: number): string {
  if (!impressions) return "0%";
  return ((clicks / impressions) * 100).toFixed(2).replace(".", ",") + "%";
}

/** Onde o bloco-propaganda aparece na home (rótulo humano). */
function blockLocation(b: HomeBlock): string {
  return b.area === "sidebar" ? "Home · coluna lateral"
    : b.area === "main" ? "Home · coluna principal"
    : b.width === "half" ? "Home · meia largura"
    : b.width === "quarter" ? "Home · 1/4 de largura"
    : "Home · largura total";
}

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

// ─── Position / format maps (propagandas clássicas legadas por slot) ───────────
type AdPosition = Ad["position"];

const POSITION_OPTIONS: { value: AdPosition; label: string; format: string }[] = [
  { value: "slot_08", label: "Topo do site",            format: "970×250" },
  { value: "slot_03", label: "Home – bloco central",    format: "970×250" },
  { value: "slot_01", label: "Home – posição 1",        format: "970×90"  },
  { value: "slot_02", label: "Home – posição 2",        format: "970×90"  },
  { value: "slot_04", label: "Home – posição 3",        format: "970×90"  },
  { value: "slot_09", label: "Rodapé do site",          format: "970×90"  },
  { value: "slot_10", label: "Entre parágrafos",        format: "970×90"  },
  { value: "slot_06", label: "Artigo – pós texto",      format: "970×90"  },
  { value: "slot_07", label: "Sidebar do artigo",       format: "250×350" },
  { value: "slot_05", label: "Sidebar da editoria",     format: "250×350" },
  { value: "slot_11", label: "Sidebar do arquivo",      format: "250×350" },
  { value: "topo",    label: "Topo (legado)",           format: "970×90"  },
  { value: "centro",  label: "Centro (legado)",         format: "970×90"  },
  { value: "lateral", label: "Lateral (legado)",        format: "250×350" },
  { value: "rodape",  label: "Rodapé (legado)",         format: "970×90"  },
  { value: "banner",  label: "Banner (legado)",         format: "970×90"  },
  { value: "sidebar", label: "Sidebar (legado)",        format: "250×350" },
  { value: "central", label: "Central (legado)",        format: "970×90"  },
  { value: "slidebar_250", label: "Slidebar 250",       format: "250×350" },
  { value: "slidebar_500", label: "Slidebar 500",       format: "300×600" },
];

const POSITION_LABELS: Record<string, string> = Object.fromEntries(
  POSITION_OPTIONS.map((p) => [p.value, p.label])
);
const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  POSITION_OPTIONS.map((p) => [p.value, p.format])
);

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
      Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
      Pausada
    </span>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 ${checked ? "bg-[#0B2A66]" : "bg-gray-300"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

// ─── Miniatura da propaganda (imagem OU render reduzido do HTML) ───────────────
/** Sempre um preview ao lado do nome — inclusive para propaganda em HTML, que é
 *  renderizada (sanitizada) e reduzida por transform:scale dentro da caixa.
 *  Só admin: sem impacto no bundle/critical path do site público. */
// Caixa 2:1 (128×64) — proporção de banner, boa p/ propagandas horizontais.
const THUMB_BOX_W = 128;
const THUMB_BOX_H = 64;

// Largura de composição do preview: o HTML monta o layout nessa largura (card
// largo fica horizontal, banner do cabeçalho não vira coluna fina), depois é
// reduzido p/ caber. Fixa (não fit-content) porque, dentro da caixa de 128px,
// o fit-content encolhe o conteúdo ao mínimo (uma tira vertical).
const THUMB_COMPOSE_W = 340;

/** Prévia de HTML: compõe em 340px, mede a altura e reduz por scale p/ CABER
 *  inteiro na caixa (contain), centralizado pelo flex do pai + origin center.
 *  Card largo, botão pequeno e leaderboard ficam todos proporcionais.
 *  Admin-only, client-only (useLayoutEffect mede antes do paint, sem flash). */
function HtmlThumb({ clean }: { clean: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth || 1;
    const h = el.offsetHeight || 1;
    const s = Math.min(THUMB_BOX_W / w, THUMB_BOX_H / h, 1);
    setScale(s > 0 && Number.isFinite(s) ? s : 0.2);
  }, [clean]);
  return (
    <div ref={ref} className="pointer-events-none select-none shrink-0 origin-center"
      style={{ width: THUMB_COMPOSE_W, textAlign: "center", transform: scale ? `scale(${scale})` : undefined, opacity: scale ? 1 : 0 }}
      dangerouslySetInnerHTML={{ __html: clean }} />
  );
}

function AdThumb({ image, html, base64 }: { image?: string; html?: string; base64?: string }) {
  const box = "w-32 h-16 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 shrink-0 flex items-center justify-center relative";
  const src = base64 || (image ?? "").trim();
  if (src) {
    // object-contain: mostra o banner INTEIRO (horizontal não é cortado nas laterais).
    return (
      <div className={box}>
        <img src={base64 ? src : proxyUrl(src, 320)} alt="" loading="lazy" decoding="async"
          className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  const clean = html ? sanitizeArticleHtml(html) : "";
  if (clean) {
    return <div className={box} title="Prévia do HTML"><HtmlThumb clean={clean} /></div>;
  }
  return <div className={box}><ImageIcon size={16} className="text-gray-300" /></div>;
}

// ─── Empty form factory (propaganda clássica legada — editada por slot) ─────────
function emptyForm() {
  return {
    name: "", position: "" as AdPosition | "", link: "", preview: "", active: true,
    targetDevices: ["desktop", "mobile", "tablet"] as ("desktop" | "mobile" | "tablet")[],
    expiresAt: "",
  };
}

type StatusFilter = "todos" | "ativo" | "pausado";

// ─── Ad Form Modal (edição de propaganda clássica legada, por slot) ────────────
function AdFormModal({
  editingId,
  form,
  setForm,
  saving,
  dragOver,
  setDragOver,
  fileRef,
  onClose,
  onSubmit,
  onFile,
}: {
  editingId: string | null;
  form: ReturnType<typeof emptyForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyForm>>>;
  saving: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFile: (f: File) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "0 24px 64px rgba(15,23,42,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              {editingId ? "Editar propaganda" : "Nova propaganda"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {editingId ? "Atualize as informações do anúncio." : "Preencha os dados para criar um novo anúncio."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-5">
          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Nome da propaganda <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Banner Topo"
              required
              autoFocus
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
            />
          </div>

          {/* Posição */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Posição <span className="text-red-500">*</span>
            </label>
            <select
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value as AdPosition }))}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 bg-white"
            >
              <option value="">Selecione a posição</option>
              {POSITION_OPTIONS.slice(0, 11).map((p) => (
                <option key={p.value} value={p.value}>{p.label} — {p.format}</option>
              ))}
            </select>
          </div>

          {/* Formato (derivado da posição) */}
          {form.position && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
              <Info size={13} className="text-blue-500 shrink-0" />
              <span className="text-xs text-blue-700">
                Formato recomendado: <strong>{FORMAT_LABELS[form.position] ?? "—"} px</strong>
              </span>
            </div>
          )}

          {/* Destino URL */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              URL de destino <span className="text-red-500">*</span>
            </label>
            <input
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="https://..."
              type="url"
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
            />
          </div>

          {/* Arquivo do anúncio */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Imagem do anúncio <span className="text-red-500">*</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.gif"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            {form.preview ? (
              <div className="relative rounded-xl border border-gray-200 overflow-hidden">
                <img src={form.preview} alt="Preview" className="w-full max-h-36 object-contain bg-gray-50" />
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, preview: "" }));
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 cursor-pointer transition-colors ${
                  dragOver ? "border-[#0B2A66] bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Upload size={22} className={dragOver ? "text-[#0B2A66]" : "text-gray-400"} />
                <p className="text-xs text-center text-gray-500 leading-relaxed">
                  Arraste e solte a imagem aqui<br />
                  <span className="text-[#0B2A66] font-medium">ou clique para selecionar</span>
                </p>
                <p className="text-[10px] text-gray-400">JPG, PNG, GIF — máx. 5MB</p>
              </div>
            )}
          </div>

          {/* Device targeting */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#0F172A]">Exibir em dispositivos</label>
            <div className="flex gap-3">
              {(["desktop", "mobile", "tablet"] as const).map((dev) => {
                const icons: Record<string, string> = { desktop: "🖥️", mobile: "📱", tablet: "💊" };
                const labels: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };
                const checked = form.targetDevices.includes(dev);
                return (
                  <label key={dev} className={`flex-1 flex flex-col items-center gap-1.5 py-3 border-2 rounded-xl cursor-pointer transition-colors select-none ${checked ? "border-[#0B2A66] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox" className="hidden" checked={checked} onChange={() => {
                      setForm((f) => ({
                        ...f,
                        targetDevices: checked
                          ? f.targetDevices.filter((d) => d !== dev)
                          : [...f.targetDevices, dev],
                      }));
                    }} />
                    <span className="text-lg">{icons[dev]}</span>
                    <span className={`text-xs font-semibold ${checked ? "text-[#0B2A66]" : "text-gray-500"}`}>{labels[dev]}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400">Selecione os dispositivos onde este anúncio deve aparecer.</p>
          </div>

          {/* Expiry date */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#0F172A]">
              Data de expiração <span className="text-xs text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="date"
              value={form.expiresAt}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white"
            />
            {form.expiresAt && (
              <p className="text-xs text-amber-600">O anúncio expirará em {new Date(form.expiresAt + "T12:00:00").toLocaleDateString("pt-BR")}</p>
            )}
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <div>
              <span className="text-sm font-medium text-[#0F172A]">Status</span>
              <p className="text-xs text-gray-500 mt-0.5">{form.active ? "Anúncio visível no portal" : "Anúncio pausado"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{form.active ? "Ativo" : "Pausado"}</span>
              <ToggleSwitch
                checked={form.active}
                onChange={() => setForm((f) => ({ ...f, active: !f.active }))}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim() || !form.position || !form.link.trim() || !form.preview}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#E71D36" }}
            >
              {saving ? "Salvando…" : editingId ? "Atualizar" : "Criar propaganda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edição dos blocos de propaganda da home ──────────────────────────────────
/** Tag de imagem pronta para banner (o clique fica no campo de link, que vira
 *  um overlay cobrindo o banner inteiro no site). */
function bannerImgHtml(url: string, maxWidth?: number): string {
  const mw = maxWidth ? `max-width:${maxWidth}px;` : "";
  return `<img src="${url}" alt="banner" style="width:100%;${mw}height:auto;border-radius:8px;display:block;">`;
}

/** Modal de edição de um bloco de propaganda (imagem/HTML) ou do banner do
 *  cabeçalho, direto na aba Propagandas — com mini-prévia do HTML renderizado. */
function HomeAdEditModal({ block, headerHtml, headerLink, onClose, onSaveBlock, onSaveHeader }: {
  /** null = banner do cabeçalho (settings.headerBannerHtml). */
  block: HomeBlock | null;
  headerHtml: string;
  headerLink: string;
  onClose: () => void;
  onSaveBlock: (b: HomeBlock) => Promise<void>;
  onSaveHeader: (html: string, linkUrl: string) => Promise<void>;
}) {
  const { can } = useCan();
  const isHeader = !block;
  const type = block ? inferBlockType(block) : "html";
  const [name, setName]         = useState(block?.name ?? "");
  const [html, setHtml]         = useState(isHeader ? headerHtml : (block?.html ?? ""));
  const [imageUrl, setImageUrl] = useState(block?.imageUrl ?? "");
  const [linkUrl, setLinkUrl]   = useState(isHeader ? headerLink : (block?.linkUrl ?? ""));
  const [caption, setCaption]   = useState(block?.caption ?? "");
  const [visible, setVisible]   = useState(block?.visible ?? true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const INPUT_CLS = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]";

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const r = await adminApi.uploadImage(file, name || "banner");
      if (!isHeader && type === "image") setImageUrl(r.url);
      else setHtml(bannerImgHtml(r.url, isHeader ? 720 : undefined));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (isHeader) {
        await onSaveHeader(html.trim(), linkUrl.trim());
      } else if (type === "image") {
        await onSaveBlock({
          ...block!, name: name.trim() || block!.name, visible,
          imageUrl: imageUrl.trim() || undefined, linkUrl: linkUrl.trim() || undefined,
          caption: caption.trim() || undefined,
        });
      } else {
        await onSaveBlock({
          ...block!, name: name.trim() || block!.name, visible,
          html: html.trim() || undefined, linkUrl: linkUrl.trim() || undefined,
        });
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const cleanPreview = sanitizeArticleHtml(html);
  const uploadBtn = (label: string) => {
    // Enviar arquivo exige `upload.images`; a entrada por URL/HTML segue disponível.
    if (!can("upload.images")) return null;
    return (
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[#0B2A66] border border-[#0B2A66]/25 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50">
        <Upload size={11} /> {uploading ? "Enviando…" : label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "0 24px 64px rgba(15,23,42,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-base font-bold text-[#0F172A]">{isHeader ? "Banner do cabeçalho" : `Editar: ${block!.name}`}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6 space-y-4">
          {isHeader && (
            <p className="text-xs text-gray-500 -mt-1">Exibido ao lado da logo, só no desktop. Deixe o código vazio e salve para remover o banner.</p>
          )}

          {!isHeader && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#0F172A]">Nome do bloco</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
            </div>
          )}

          {(isHeader || type === "html") ? (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#0F172A]">Código HTML</label>
                  {uploadBtn("Usar uma imagem (upload)")}
                </div>
                <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={7} spellCheck={false}
                  className={`${INPUT_CLS} !text-xs font-mono resize-y`} placeholder="<div>…</div>" />
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  O upload troca o código pela tag da imagem pronta. Scripts são removidos ao exibir.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#0F172A]">Link de redirecionamento (opcional)</label>
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={INPUT_CLS}
                  placeholder="https://parceiro.com/promo" />
                <p className="text-[10px] text-gray-400">Ao clicar em qualquer parte da propaganda, o leitor é levado a este endereço (abre em nova aba).</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#0F172A] mb-1.5">Prévia</p>
                <div className="rounded-xl border border-gray-200 bg-gray-100 p-3 overflow-auto max-h-72">
                  {cleanPreview ? (
                    <div className="pointer-events-none select-none origin-top-left"
                      style={{ transform: "scale(0.8)", width: "125%" }}
                      dangerouslySetInnerHTML={{ __html: cleanPreview }} />
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-5">Nada para mostrar ainda.</p>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Renderização aproximada (80% do tamanho) — o fundo e a largura reais do site podem variar.</p>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#0F172A]">Imagem</label>
                {uploadBtn("Enviar imagem")}
              </div>
              {imageUrl ? (
                <img src={imageUrl} alt="Prévia do banner"
                  className="w-full max-h-48 object-contain rounded-xl border border-gray-200 bg-gray-50" />
              ) : (
                <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl py-6 text-center">Sem imagem — envie uma ou cole a URL abaixo.</p>
              )}
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={INPUT_CLS} placeholder="URL da imagem" />
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={INPUT_CLS} placeholder="Link ao clicar (opcional)" />
              <input value={caption} onChange={(e) => setCaption(e.target.value)} className={INPUT_CLS} placeholder="Legenda (opcional)" />
            </div>
          )}

          {!isHeader && (
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <span className="text-sm font-medium text-[#0F172A]">Exibição</span>
                <p className="text-xs text-gray-500 mt-0.5">{visible ? "Visível na home" : "Oculto na home"}</p>
              </div>
              <ToggleSwitch checked={visible} onChange={() => setVisible((v) => !v)} />
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }} />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={() => void save()} disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#0B2A66" }}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Nova propaganda = bloco da home (imagem ou HTML, isAd) ────────────────────
/** Cria uma propaganda que É um bloco da home: entra em settings.homeBlocks com
 *  isAd=true, aparece no editor de Blocos da Home (arrastável) e renderiza pelo
 *  caminho já otimizado (ImageBlock/HtmlBlock: proxy + srcset + width/height). */
function AdCreateModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (block: HomeBlock) => Promise<void>;
}) {
  const { can } = useCan();
  const [type, setType]       = useState<"image" | "html">("image");
  const [name, setName]       = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [html, setHtml]       = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const INPUT_CLS = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]";

  async function handleUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) { alert("Arquivo maior que 5MB."); return; }
    setUploading(true);
    try {
      const r = await adminApi.uploadImage(file, name || "propaganda");
      setImageUrl(r.url);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const clean = type === "html" ? sanitizeArticleHtml(html) : "";
  const valid = !!name.trim() && (type === "image" ? !!imageUrl.trim() : !!html.trim());

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      const common = {
        name: name.trim(), visible: true, order: 0, custom: true, isAd: true,
        linkUrl: linkUrl.trim() || undefined,
      };
      const block: HomeBlock = type === "image"
        ? { ...common, id: `image-${Date.now()}`, blockType: "image", format: "full_width_image",
            imageUrl: imageUrl.trim(), caption: caption.trim() || undefined }
        : { ...common, id: `html-${Date.now()}`, blockType: "html", format: "grid", html: html.trim() };
      await onCreate(block);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canUpload = can("upload.images");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "0 24px 64px rgba(15,23,42,0.2)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">Nova propaganda</h2>
            <p className="text-xs text-gray-500 mt-0.5">Entra como bloco na home e pode ser reposicionada em Blocos da Home.</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Nome da propaganda <span className="text-red-500">*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Banner do parceiro" autoFocus
              className={INPUT_CLS} />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">Tipo</label>
            <div className="flex gap-3">
              {([
                { key: "image", label: "Imagem", icon: ImageIcon, hint: "Envie uma arte (banner)" },
                { key: "html",  label: "HTML",   icon: Code,      hint: "Cole um código HTML" },
              ] as const).map(({ key, label, icon: Icon, hint }) => {
                const active = type === key;
                return (
                  <button key={key} type="button" onClick={() => setType(key)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 border-2 rounded-xl transition-colors select-none ${active ? "border-[#0B2A66] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <Icon size={18} className={active ? "text-[#0B2A66]" : "text-gray-400"} />
                    <span className={`text-xs font-semibold ${active ? "text-[#0B2A66]" : "text-gray-500"}`}>{label}</span>
                    <span className="text-[10px] text-gray-400">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {type === "image" ? (
            <>
              {/* Imagem */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#0F172A]">
                    Imagem <span className="text-red-500">*</span>
                  </label>
                </div>
                <input ref={fileRef} type="file" accept="image/*,.gif" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }} />
                {imageUrl ? (
                  <div className="relative rounded-xl border border-gray-200 overflow-hidden">
                    <img src={imageUrl} alt="Prévia" className="w-full max-h-40 object-contain bg-gray-50" />
                    <button type="button" onClick={() => setImageUrl("")}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                ) : canUpload ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handleUpload(f); }}
                    onClick={() => fileRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 cursor-pointer transition-colors ${dragOver ? "border-[#0B2A66] bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                    <Upload size={22} className={dragOver ? "text-[#0B2A66]" : "text-gray-400"} />
                    <p className="text-xs text-center text-gray-500 leading-relaxed">
                      {uploading ? "Enviando…" : <>Arraste a imagem aqui<br /><span className="text-[#0B2A66] font-medium">ou clique para selecionar</span></>}
                    </p>
                    <p className="text-[10px] text-gray-400">JPG, PNG, GIF — máx. 5MB</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl py-6 text-center">Cole a URL da imagem abaixo.</p>
                )}
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="ou cole a URL da imagem"
                  className={`${INPUT_CLS} mt-2`} />
              </div>
              {/* Legenda */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">Legenda (opcional)</label>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} className={INPUT_CLS} placeholder="Texto sob a imagem" />
              </div>
            </>
          ) : (
            <>
              {/* HTML */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Código HTML <span className="text-red-500">*</span>
                </label>
                <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={6} spellCheck={false}
                  className={`${INPUT_CLS} !text-xs font-mono resize-y`} placeholder="<div>…</div>" />
                <p className="text-[10px] text-gray-400 mt-1">Scripts são removidos ao exibir (sanitização).</p>
              </div>
              {/* Prévia */}
              <div>
                <p className="text-xs font-semibold text-[#0F172A] mb-1.5">Prévia</p>
                <div className="rounded-xl border border-gray-200 bg-gray-100 p-3 overflow-auto max-h-56">
                  {clean ? (
                    <div className="pointer-events-none select-none origin-top-left"
                      style={{ transform: "scale(0.8)", width: "125%" }}
                      dangerouslySetInnerHTML={{ __html: clean }} />
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-5">Nada para mostrar ainda.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Link */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">Link ao clicar (opcional)</label>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} type="url" placeholder="https://parceiro.com/promo"
              className={INPUT_CLS} />
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
            <Info size={13} className="text-blue-500 shrink-0 mt-0.5" />
            <span className="text-[11px] text-blue-700 leading-relaxed">
              A propaganda entra no fim da home. Depois, arraste-a para a posição desejada em <strong>Blocos da Home</strong>.
            </span>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={() => void submit()} disabled={saving || !valid}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#E71D36" }}>
              {saving ? "Criando…" : "Criar propaganda"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Linha unificada da tabela de propagandas ─────────────────────────────────
interface AdRow {
  key: string;
  name: string;
  thumbImage?: string;
  thumbHtml?: string;
  thumbBase64?: string;
  location: string;
  typeLabel: string;
  active: boolean;
  impressions: number;
  clicks: number;
  onEdit: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdsManager() {
  const { can } = useCan();
  const canManageAds = can("ads.manage");
  const [ads, setAds]           = useState<Ad[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [currentPage, setCurrentPage]   = useState(1);

  // Modal de edição de propaganda clássica legada (por slot).
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState(emptyForm());
  const [dragOver, setDragOver]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Modal de criação (nova propaganda = bloco da home).
  const [createOpen, setCreateOpen] = useState(false);

  // Blocos da home marcados como propaganda (toggle "É uma propaganda" nos
  // blocos de imagem/HTML) + banner do cabeçalho — listados e EDITÁVEIS aqui.
  // Guardamos a lista completa de blocos: salvar um bloco reenvia o array
  // inteiro em settings.homeBlocks (mesmo contrato do Blocos da Home).
  const [homeBlocks, setHomeBlocks] = useState<HomeBlock[]>([]);
  const [articleBlocks, setArticleBlocks] = useState<HomeBlock[]>([]);
  const [headerBannerHtml, setHeaderBannerHtml] = useState("");
  const [headerBannerLinkUrl, setHeaderBannerLinkUrl] = useState("");
  // Impressões/cliques dos blocos-propaganda (ad_daily_stats, chave block:<id>);
  // "header-banner" é o banner do cabeçalho.
  const [blockStats, setBlockStats] = useState<Record<string, { impressions: number; clicks: number }>>({});
  const [adEdit, setAdEdit] = useState<{ scope: "home" | "article"; block: HomeBlock } | "header" | null>(null);
  const homeAdBlocks = homeBlocks.filter((b) => b.isAd === true);
  const articleAdBlocks = articleBlocks.filter((b) => b.isAd === true);
  const hasHeaderBanner = !!headerBannerHtml.trim();

  const PAGE_SIZE = 10;

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAds();
      setAds(data.ads);
    } catch { }
    finally { setLoading(false); }
    try {
      const { settings } = await adminApi.getSettings();
      setHomeBlocks(settings.homeBlocks ?? []);
      setArticleBlocks(settings.articleSidebarBlocks ?? []);
      setHeaderBannerHtml(settings.headerBannerHtml ?? "");
      setHeaderBannerLinkUrl(settings.headerBannerLinkUrl ?? "");
    } catch { }
    try {
      const { stats } = await adminApi.getAdBlockStats();
      setBlockStats(stats);
    } catch { }
  };

  async function saveAdBlock(patched: HomeBlock) {
    const scope = adEdit !== null && adEdit !== "header" ? adEdit.scope : "home";
    if (scope === "article") {
      const next = articleBlocks.map((b) => (b.id === patched.id ? patched : b));
      await adminApi.updateSettings({ articleSidebarBlocks: next });
      setArticleBlocks(next);
    } else {
      const next = homeBlocks.map((b) => (b.id === patched.id ? patched : b));
      await adminApi.updateSettings({ homeBlocks: next });
      setHomeBlocks(next);
    }
    invalidateSiteCache();
    setAdEdit(null);
  }

  async function saveHeaderBanner(html: string, linkUrl: string) {
    await adminApi.updateSettings({ headerBannerHtml: html, headerBannerLinkUrl: linkUrl });
    setHeaderBannerHtml(html);
    setHeaderBannerLinkUrl(linkUrl);
    invalidateSiteCache();
    setAdEdit(null);
  }

  // Nova propaganda = novo bloco isAd no FIM da home (reposicionável em Blocos
  // da Home). Reenvia o array inteiro; o render usa o caminho já otimizado.
  async function createAdBlock(block: HomeBlock) {
    const next = [...homeBlocks, { ...block, order: homeBlocks.length }];
    await adminApi.updateSettings({ homeBlocks: next });
    setHomeBlocks(next);
    invalidateSiteCache();
    setCreateOpen(false);
    await load();
  }

  // Excluir propaganda-bloco = remover o bloco da home (ou da lateral da notícia).
  async function deleteBlock(scope: "home" | "article", id: string) {
    if (!confirm("Remover esta propaganda? O bloco sai da home.")) return;
    try {
      if (scope === "article") {
        const next = articleBlocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }));
        await adminApi.updateSettings({ articleSidebarBlocks: next });
        setArticleBlocks(next);
      } else {
        const next = homeBlocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }));
        await adminApi.updateSettings({ homeBlocks: next });
        setHomeBlocks(next);
      }
      invalidateSiteCache();
    } catch (err) { alert((err as Error).message); }
  }

  // Ligar/desligar a exibição de um bloco-propaganda (optimista + reverte no erro).
  async function setBlockVisible(scope: "home" | "article", block: HomeBlock, visible: boolean) {
    const patched = { ...block, visible };
    if (scope === "article") {
      const prev = articleBlocks;
      const next = articleBlocks.map((b) => (b.id === block.id ? patched : b));
      setArticleBlocks(next);
      try { await adminApi.updateSettings({ articleSidebarBlocks: next }); invalidateSiteCache(); }
      catch (err) { setArticleBlocks(prev); alert((err as Error).message); }
    } else {
      const prev = homeBlocks;
      const next = homeBlocks.map((b) => (b.id === block.id ? patched : b));
      setHomeBlocks(next);
      try { await adminApi.updateSettings({ homeBlocks: next }); invalidateSiteCache(); }
      catch (err) { setHomeBlocks(prev); alert((err as Error).message); }
    }
  }

  async function clearHeaderBanner() {
    if (!confirm("Remover o banner do cabeçalho?")) return;
    try {
      await adminApi.updateSettings({ headerBannerHtml: "", headerBannerLinkUrl: "" });
      setHeaderBannerHtml("");
      setHeaderBannerLinkUrl("");
      invalidateSiteCache();
    } catch (err) { alert((err as Error).message); }
  }

  useEffect(() => { void load(); }, []);

  // ── Actions (propagandas clássicas legadas) ─────────────────────────────────
  async function toggleActive(ad: Ad) {
    const next = !ad.active;
    setAds(prev => prev.map(a => a.id === ad.id ? { ...a, active: next } : a));
    try { await adminApi.updateAd(ad.id, { active: next }); }
    catch (err) {
      setAds(prev => prev.map(a => a.id === ad.id ? { ...a, active: ad.active } : a));
      alert((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta propaganda?")) return;
    try { await adminApi.deleteAd(id); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { alert("Arquivo maior que 5MB."); return; }
    const b64 = await toBase64(file);
    setForm((f) => ({ ...f, preview: b64 }));
  }

  function openEdit(ad: Ad) {
    setEditingId(ad.id);
    setForm({
      name: ad.name, position: ad.position, link: ad.link, preview: ad.imageBase64, active: ad.active,
      targetDevices: ad.targetDevices && ad.targetDevices.length > 0 ? ad.targetDevices : ["desktop", "mobile", "tablet"],
      expiresAt: ad.expiresAt ? new Date(ad.expiresAt).toISOString().split("T")[0] : "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.position || !form.link.trim() || !form.preview) return;
    setSaving(true);
    try {
      if (editingId) {
        await adminApi.updateAd(editingId, {
          name: form.name, link: form.link,
          imageBase64: form.preview, position: form.position as AdPosition, active: form.active,
          targetDevices: form.targetDevices,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        });
      } else {
        await adminApi.createAd({
          name: form.name, link: form.link,
          imageBase64: form.preview, position: form.position as AdPosition, active: form.active,
          targetDevices: form.targetDevices,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        });
      }
      closeModal();
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Linhas unificadas (banner do cabeçalho + blocos-propaganda + clássicas) ──
  const rows = useMemo<AdRow[]>(() => {
    const list: AdRow[] = [];
    if (hasHeaderBanner) {
      const st = blockStats["header-banner"] ?? { impressions: 0, clicks: 0 };
      list.push({
        key: "header", name: "Banner do cabeçalho", thumbHtml: headerBannerHtml,
        location: "Cabeçalho (só desktop)", typeLabel: "HTML", active: true,
        impressions: st.impressions, clicks: st.clicks,
        onEdit: () => setAdEdit("header"),
        onDelete: () => { void clearHeaderBanner(); },
      });
    }
    for (const b of homeAdBlocks) {
      const type = inferBlockType(b);
      const st = blockStats[b.id] ?? { impressions: 0, clicks: 0 };
      list.push({
        key: `home-${b.id}`, name: b.name,
        thumbImage: type === "image" ? b.imageUrl : undefined,
        thumbHtml: type === "image" ? undefined : b.html,
        location: blockLocation(b), typeLabel: type === "image" ? "Imagem" : "HTML",
        active: b.visible !== false, impressions: st.impressions, clicks: st.clicks,
        onEdit: () => setAdEdit({ scope: "home", block: b }),
        onToggle: () => { void setBlockVisible("home", b, b.visible === false); },
        onDelete: () => { void deleteBlock("home", b.id); },
      });
    }
    for (const b of articleAdBlocks) {
      const type = inferBlockType(b);
      const st = blockStats[b.id] ?? { impressions: 0, clicks: 0 };
      list.push({
        key: `art-${b.id}`, name: b.name,
        thumbImage: type === "image" ? b.imageUrl : undefined,
        thumbHtml: type === "image" ? undefined : b.html,
        location: "Lateral da notícia", typeLabel: type === "image" ? "Imagem" : "HTML",
        active: b.visible !== false, impressions: st.impressions, clicks: st.clicks,
        onEdit: () => setAdEdit({ scope: "article", block: b }),
        onToggle: () => { void setBlockVisible("article", b, b.visible === false); },
        onDelete: () => { void deleteBlock("article", b.id); },
      });
    }
    for (const ad of ads) {
      list.push({
        key: `ad-${ad.id}`, name: ad.name, thumbBase64: ad.imageBase64 || undefined,
        location: POSITION_LABELS[ad.position] ?? ad.position, typeLabel: "Imagem",
        active: ad.active, impressions: ad.impressions ?? 0, clicks: ad.clicks ?? 0,
        onEdit: () => openEdit(ad),
        onToggle: () => { void toggleActive(ad); },
        onDelete: () => { void handleDelete(ad.id); },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads, homeBlocks, articleBlocks, headerBannerHtml, blockStats]);

  // ── Stats (propagandas clássicas + blocos-propaganda somados) ───────────────
  const stats = useMemo(() => {
    const totalAds = rows.length;
    const active = rows.filter((r) => r.active).length;
    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
    const totalClicks      = rows.reduce((s, r) => s + r.clicks, 0);
    const ctr = totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(2).replace(".", ",") + "%"
      : "0%";
    return { totalAds, active, totalImpressions, totalClicks, ctr };
  }, [rows]);

  // ── Filtered + paginated ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.location.toLowerCase().includes(q));
    }
    if (statusFilter === "ativo")   list = list.filter((r) => r.active);
    if (statusFilter === "pausado") list = list.filter((r) => !r.active);
    return list;
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Propagandas">

      {modalOpen && (
        <AdFormModal
          editingId={editingId}
          form={form}
          setForm={setForm}
          saving={saving}
          dragOver={dragOver}
          setDragOver={setDragOver}
          fileRef={fileRef as React.RefObject<HTMLInputElement>}
          onClose={closeModal}
          onSubmit={(e) => { void handleSubmit(e); }}
          onFile={handleFile}
        />
      )}

      {createOpen && (
        <AdCreateModal
          onClose={() => setCreateOpen(false)}
          onCreate={createAdBlock}
        />
      )}

      {adEdit !== null && (
        <HomeAdEditModal
          key={adEdit === "header" ? "header" : adEdit.block.id}
          block={adEdit === "header" ? null : adEdit.block}
          headerHtml={headerBannerHtml}
          headerLink={headerBannerLinkUrl}
          onClose={() => setAdEdit(null)}
          onSaveBlock={saveAdBlock}
          onSaveHeader={saveHeaderBanner}
        />
      )}

      <div className="space-y-6">

        {/* ══ Stat cards ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Megaphone size={22} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Propagandas ativas</p>
                <p className="text-2xl font-bold text-[#0F172A]">{stats.active}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">de {stats.totalAds} cadastradas</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <BarChart2 size={22} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Impressões (total)</p>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtNum(stats.totalImpressions)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">todas as propagandas</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                <MousePointer size={22} className="text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Cliques (total)</p>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtNum(stats.totalClicks)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">todas as propagandas</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-fuchsia-50 flex items-center justify-center shrink-0">
                <Sparkles size={22} className="text-fuchsia-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">CTR médio</p>
                <p className="text-2xl font-bold text-[#0F172A]">{stats.ctr}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">cliques ÷ impressões</p>
          </div>
        </div>

        {/* ══ Tabela unificada de propagandas ═════════════════════════════════ */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>

          {/* Filter bar */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar propagandas..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 bg-white"
              >
                <option value="todos">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {canManageAds && (
                <a href="/admin/home-blocos"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B2A66] border border-[#0B2A66]/25 rounded-xl hover:bg-blue-50 transition-colors">
                  <LayoutGrid size={13} /> Blocos da Home
                </a>
              )}
              {canManageAds && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#E71D36" }}
                >
                  <Plus size={16} />
                  Nova propaganda
                </button>
              )}
            </div>
          </div>

          {/* Table body */}
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Carregando propagandas…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-4 text-gray-400">
              <Megaphone size={36} className="text-gray-200" />
              <p className="text-sm">{rows.length === 0 ? "Nenhuma propaganda encontrada" : "Nenhuma propaganda para o filtro atual"}</p>
              {canManageAds && rows.length === 0 && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: "#E71D36" }}
                >
                  <Plus size={15} /> Criar primeira propaganda
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Propaganda</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Local</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Tipo</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Impressões</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Cliques</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">CTR</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((r, i) => (
                      <tr
                        key={r.key}
                        className={`hover:bg-gray-50/50 transition-colors ${i < paginated.length - 1 ? "border-b border-gray-50" : ""}`}
                      >
                        {/* Propaganda (miniatura + nome) */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <AdThumb image={r.thumbImage} html={r.thumbHtml} base64={r.thumbBase64} />
                            <span className="font-medium text-[#0F172A] text-sm whitespace-nowrap">{r.name}</span>
                          </div>
                        </td>
                        {/* Local */}
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{r.location}</td>
                        {/* Tipo */}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.typeLabel}</td>
                        {/* Impressões */}
                        <td className="px-4 py-3 text-right text-xs font-mono text-gray-700">{fmtNum(r.impressions)}</td>
                        {/* Cliques */}
                        <td className="px-4 py-3 text-right text-xs font-mono text-gray-700">{fmtNum(r.clicks)}</td>
                        {/* CTR */}
                        <td className="px-4 py-3 text-right text-xs font-mono text-gray-700">{calcCTR(r.clicks, r.impressions)}</td>
                        {/* Status */}
                        <td className="px-4 py-3 text-center"><StatusBadge active={r.active} /></td>
                        {/* Ações */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {canManageAds ? (
                              <>
                                <button
                                  onClick={r.onEdit}
                                  title="Editar"
                                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-[#0B2A66] transition-colors"
                                >
                                  <Pencil size={13} />
                                </button>
                                {r.onToggle ? (
                                  <ToggleSwitch checked={r.active} onChange={r.onToggle} />
                                ) : (
                                  <span className="inline-block w-9" />
                                )}
                                {r.onDelete && (
                                  <button
                                    onClick={r.onDelete}
                                    title="Excluir"
                                    className="w-8 h-8 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-gray-500">
                  Mostrando {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} propagandas
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            currentPage === page
                              ? "bg-[#0B2A66] text-white"
                              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    {totalPages > 4 && (
                      <>
                        <span className="text-gray-400 text-xs px-1">…</span>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            currentPage === totalPages
                              ? "bg-[#0B2A66] text-white"
                              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Tips */}
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-3">
            <Info size={14} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Dicas</span>
          </div>
          <ul className="flex flex-wrap gap-x-8 gap-y-1.5">
            {[
              "Toda propaganda criada aqui vira um bloco da home — arraste-a em Blocos da Home para reposicionar.",
              "Verifique o tamanho máximo do arquivo (5MB).",
              "Propagandas pausadas não são exibidas no site.",
              "O botão liga/desliga na tabela exibe ou oculta sem abrir o formulário.",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-blue-700">
                <span className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </AdminLayout>
  );
}
