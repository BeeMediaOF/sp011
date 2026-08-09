import React, { useEffect, useImperativeHandle, forwardRef, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import { IframeEmbed, VideoEmbed, BlockDiv, StyledImage } from "./editorBlocks";
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link as LinkIcon,
  Image as ImageIcon, Youtube as YoutubeIcon,
  Undo, Redo, ClipboardPaste, AlignLeft, Upload, Loader2, X,
  ExternalLink, Video,
} from "lucide-react";

/* ─────────────────────────────────────────
   Tiny modal helper
───────────────────────────────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="font-bold text-[#0B2A66] text-sm">{title}</span>
          <button type="button" onMouseDown={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

/* Escapes para inserir texto/links vindos dos modais (o servidor sanitiza no salvar). */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/30 focus:border-[#0B2A66] placeholder:text-slate-300";

/* ─────────────────────────────────────────
   Editor component
───────────────────────────────────────── */
export interface RichTextEditorHandle {
  setContent: (html: string) => void;
  getContent: () => string;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  onPasteClick?: () => void;
  onFormatClick?: () => void;
  onUploadFile?: (file: File) => Promise<{ url: string; mediaType: "image" | "video" }>;
  placeholder?: string;
  /** Newsletter: encaixa o editor DENTRO de uma moldura de e-mail ("compor no
   *  preview"). Quando definido, a "caixa" do editor vira: toolbar no topo + a
   *  "página" do e-mail (cartão ~600px) com cabeçalho/rodapé em volta da área de
   *  edição. Ausente = editor normal (comportamento inalterado). */
  frame?: {
    header?: React.ReactNode;
    footer?: React.ReactNode;
    /** Estilo do corpo do e-mail (fundo/cor/fonte/padding) aplicado à área editável. */
    bodyStyle?: React.CSSProperties;
    /** Fundo da "página" atrás do cartão (pageBgColor da moldura). */
    pageStyle?: React.CSSProperties;
  };
}

type ModalKind = "image" | "youtube" | "link" | null;

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
  ({ value, onChange, onPasteClick, onFormatClick, onUploadFile, placeholder = "Escreva o conteúdo da matéria aqui...", frame }, ref) => {

    const editor = useEditor({
      extensions: [
        StarterKit.configure({ codeBlock: { languageClassPrefix: "language-" } }),
        StyledImage.configure({ inline: false, allowBase64: true }),
        Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
        Placeholder.configure({ placeholder }),
        Youtube.configure({ width: 720, height: 405 }),
        // Sem estes o ProseMirror descarta os blocos do painel (ver editorBlocks.ts).
        IframeEmbed,
        VideoEmbed,
        BlockDiv,
      ],
      content: value,
      onUpdate({ editor }) { onChange(editor.getHTML()); },
    });

    const fileInputRef  = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    /* modal state */
    const [modal, setModal] = useState<ModalKind>(null);
    const [imgSrc,    setImgSrc]    = useState("");
    const [imgHref,   setImgHref]   = useState("");
    const [imgAlt,    setImgAlt]    = useState("");
    const [ytUrl,     setYtUrl]     = useState("");
    const [linkUrl,   setLinkUrl]   = useState("");
    const [linkText,  setLinkText]  = useState("");
    const [notice,    setNotice]    = useState<string | null>(null);
    const [imgUploadBusy, setImgUploadBusy] = useState(false);
    const imgFileRef  = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      setContent: (html: string) => {
        if (editor && editor.getHTML() !== html) editor.commands.setContent(html, false);
      },
      getContent: () => editor?.getHTML() ?? "",
    }));

    useEffect(() => {
      if (editor && value !== editor.getHTML()) editor.commands.setContent(value, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    /* ── toolbar button helper ── */
    const btn = (onClick: () => void, Icon: React.ElementType, title: string, active = false) => (
      <button
        key={title}
        type="button"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className={`p-1.5 rounded-lg transition-colors ${
          active
            ? "bg-[#0B2A66] text-white"
            : "text-slate-500 hover:bg-slate-200 hover:text-[#0B2A66]"
        }`}
      >
        <Icon size={13} />
      </button>
    );

    /* ── link handler: abre o modal (com texto opcional), pré-carrega link/seleção atual ── */
    function addLink() {
      if (!editor) return;
      const prevUrl = (editor.getAttributes("link")?.href as string | undefined) ?? "";
      const { from, to } = editor.state.selection;
      const sel = editor.state.doc.textBetween(from, to, " ");
      setLinkUrl(prevUrl);
      setLinkText(sel);
      setModal("link");
    }

    /* ── confirma o link do modal: seleção → aplica; texto → insere <a>texto</a> ── */
    function confirmLink() {
      if (!editor) return;
      const url = linkUrl.trim();
      const { from, to } = editor.state.selection;
      const hasSelection = to > from;
      const text = linkText.trim();
      if (!url) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setModal(null); return; }
      if (hasSelection && (!text || text === editor.state.doc.textBetween(from, to, " "))) {
        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      } else {
        editor.chain().focus().insertContent(`<a href="${escAttr(url)}">${escHtml(text || url)}</a>`).run();
      }
      setModal(null);
    }

    /* ── open image modal ── */
    function openImageModal() {
      setImgSrc(""); setImgHref(""); setImgAlt("");
      setModal("image");
    }

    /* ── confirm insert image ── */
    function confirmImage() {
      if (!imgSrc || !editor) return;
      editor.chain().focus().insertContent(
        imgHref
          ? `<a href="${imgHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block"><img src="${imgSrc}" alt="${imgAlt}" style="max-width:100%;height:auto;border-radius:6px;display:block;"></a>`
          : `<img src="${imgSrc}" alt="${imgAlt}" style="max-width:100%;height:auto;border-radius:6px;display:block;">`
      ).run();
      setModal(null);
    }

    /* ── image upload inside modal ── */
    async function handleModalImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file || !onUploadFile) return;
      e.target.value = "";
      setImgUploadBusy(true);
      try {
        const { url } = await onUploadFile(file);
        setImgSrc(url);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Erro no upload");
      } finally {
        setImgUploadBusy(false);
      }
    }

    /* ── open youtube modal ── */
    function openYoutubeModal() { setYtUrl(""); setModal("youtube"); }

    /* ── confirm youtube ── */
    function confirmYoutube() {
      if (!ytUrl || !editor) return;
      editor.commands.setYoutubeVideo({ src: ytUrl });
      setModal(null);
    }

    /* ── video/file upload from toolbar ── */
    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file || !onUploadFile || !editor) return;
      e.target.value = "";
      setUploading(true);
      try {
        const { url, mediaType } = await onUploadFile(file);
        if (mediaType === "video") {
          // Sem wrapper <p>: `video` é nó de bloco (editorBlocks.ts) e dentro de
          // um parágrafo o ProseMirror o jogaria fora ao reabrir o conteúdo.
          editor.chain().focus().insertContent(
            `<video class="video-embed-file" src="${escAttr(url)}" controls playsinline style="width:100%;max-width:100%;border-radius:10px;margin:12px 0;display:block;"></video>`
          ).run();
        } else {
          editor.chain().focus().insertContent(
            `<img src="${url}" style="max-width:100%;height:auto;border-radius:6px;display:block;">`
          ).run();
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Erro no upload");
      } finally {
        setUploading(false);
      }
    }

    const wordCount = (() => {
      const text = editor?.getText() ?? "";
      return text.trim() ? text.trim().split(/\s+/).length : 0;
    })();

    if (!editor) return null;

    return (
      <>
        {/* ── Image modal ── */}
        {modal === "image" && (
          <Modal title="Inserir imagem" onClose={() => setModal(null)}>
            <Field label="URL da imagem">
              <div className="flex gap-2">
                <input
                  className={INPUT}
                  placeholder="https://exemplo.com/foto.jpg"
                  value={imgSrc}
                  onChange={e => setImgSrc(e.target.value)}
                  autoFocus
                />
                {onUploadFile && (
                  <>
                    <input ref={imgFileRef} type="file" accept="image/*" className="hidden" onChange={handleModalImageUpload} />
                    <button
                      type="button"
                      disabled={imgUploadBusy}
                      onMouseDown={e => { e.preventDefault(); imgFileRef.current?.click(); }}
                      className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-60 border border-emerald-200"
                    >
                      {imgUploadBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {imgUploadBusy ? "…" : "Upload"}
                    </button>
                  </>
                )}
              </div>
              {imgSrc && (
                <img src={imgSrc} alt="preview" className="mt-2 max-h-28 w-auto rounded-lg border border-slate-200 object-cover" />
              )}
            </Field>

            <Field label="Link ao clicar (opcional)">
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="shrink-0 text-slate-400" />
                <input
                  className={INPUT}
                  placeholder="https://anunciante.com.br"
                  value={imgHref}
                  onChange={e => setImgHref(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Deixe vazio para imagem sem link.</p>
            </Field>

            <Field label="Texto alternativo (alt)">
              <input
                className={INPUT}
                placeholder="Descrição da imagem"
                value={imgAlt}
                onChange={e => setImgAlt(e.target.value)}
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setModal(null); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!imgSrc}
                onMouseDown={e => { e.preventDefault(); confirmImage(); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-[#0B2A66] hover:bg-[#0a2459] transition-colors disabled:opacity-50"
              >
                Inserir
              </button>
            </div>
          </Modal>
        )}

        {/* ── YouTube modal ── */}
        {modal === "youtube" && (
          <Modal title="Incorporar vídeo do YouTube" onClose={() => setModal(null)}>
            <Field label="URL do YouTube">
              <input
                className={INPUT}
                placeholder="https://youtube.com/watch?v=..."
                value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmYoutube(); } }}
              />
            </Field>
            <p className="text-[11px] text-slate-400">
              Cole a URL do vídeo ou do embed (youtube.com/watch?v=… ou youtu.be/…).
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setModal(null); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!ytUrl}
                onMouseDown={e => { e.preventDefault(); confirmYoutube(); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                Incorporar
              </button>
            </div>
          </Modal>
        )}

        {/* ── Link modal ── */}
        {modal === "link" && (
          <Modal title="Inserir link" onClose={() => setModal(null)}>
            <Field label="URL do link">
              <input
                className={INPUT}
                placeholder="https://exemplo.com/pagina"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmLink(); } }}
              />
            </Field>
            <Field label="Texto do link (opcional)">
              <input
                className={INPUT}
                placeholder="Ex.: leia a matéria completa"
                value={linkText}
                onChange={e => setLinkText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmLink(); } }}
              />
            </Field>
            <p className="text-[11px] text-slate-400">
              Com texto selecionado, o link é aplicado nele. Sem seleção, criamos um texto com o link. URL vazia remove o link.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setModal(null); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); confirmLink(); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-[#0B2A66] hover:bg-[#0a2459] transition-colors"
              >
                Inserir link
              </button>
            </div>
          </Modal>
        )}

        {/* ── Aviso (substitui o alert nativo) ── */}
        {notice && (
          <Modal title="Aviso" onClose={() => setNotice(null)}>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{notice}</p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setNotice(null); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#0B2A66] hover:bg-[#0a2459] transition-colors"
              >
                Entendi
              </button>
            </div>
          </Modal>
        )}

        {/* ── Editor ── */}
        {(() => {
          /* Toolbar — reaproveitada nos dois modos (editor normal e emoldurado). */
          const toolbar = (
            <div className="flex items-center gap-0.5 px-3 py-2 bg-slate-50 border-b border-slate-100 flex-wrap">
              {btn(() => editor.chain().focus().toggleBold().run(), Bold, "Negrito", editor.isActive("bold"))}
              {btn(() => editor.chain().focus().toggleItalic().run(), Italic, "Itálico", editor.isActive("italic"))}

              <div className="w-px h-4 bg-slate-200 mx-1" />

              {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), Heading1, "Título H1", editor.isActive("heading", { level: 1 }))}
              {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2, "Título H2", editor.isActive("heading", { level: 2 }))}
              {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3, "Título H3", editor.isActive("heading", { level: 3 }))}

              <div className="w-px h-4 bg-slate-200 mx-1" />

              {btn(() => editor.chain().focus().toggleBulletList().run(), List, "Lista", editor.isActive("bulletList"))}
              {btn(() => editor.chain().focus().toggleOrderedList().run(), ListOrdered, "Lista numerada", editor.isActive("orderedList"))}
              {btn(() => editor.chain().focus().toggleBlockquote().run(), Quote, "Citação", editor.isActive("blockquote"))}
              {btn(() => editor.chain().focus().toggleCodeBlock().run(), Code, "Código", editor.isActive("codeBlock"))}

              <div className="w-px h-4 bg-slate-200 mx-1" />

              {btn(addLink, LinkIcon, "Link no texto", editor.isActive("link"))}
              {btn(openImageModal, ImageIcon, "Imagem / Banner com link")}
              {btn(openYoutubeModal, YoutubeIcon, "Vídeo YouTube")}

              {onUploadFile && (
                <>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime,.mov,.mp4,.webm"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    title="Upload de vídeo (MP4, WebM…)"
                    disabled={uploading}
                    onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors disabled:opacity-60 border border-purple-200"
                  >
                    {uploading
                      ? <><Loader2 size={12} className="animate-spin" /> Enviando…</>
                      : <><Video size={12} /> Vídeo</>
                    }
                  </button>
                </>
              )}

              <div className="w-px h-4 bg-slate-200 mx-1" />

              {btn(() => editor.chain().focus().undo().run(), Undo, "Desfazer")}
              {btn(() => editor.chain().focus().redo().run(), Redo, "Refazer")}

              {(onPasteClick || onFormatClick) && <div className="w-px h-4 bg-slate-200 mx-1" />}

              {onPasteClick && (
                <button
                  type="button"
                  title="Colar texto formatado"
                  onMouseDown={(e) => { e.preventDefault(); onPasteClick(); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <ClipboardPaste size={12} /> Colar texto
                </button>
              )}
              {onFormatClick && (
                <button
                  type="button"
                  title="Formatar parágrafos automaticamente"
                  onMouseDown={(e) => { e.preventDefault(); onFormatClick(); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <AlignLeft size={12} /> Formatar
                </button>
              )}
            </div>
          );

          /* Modo emoldurado (newsletter): compor DENTRO da moldura do e-mail. */
          if (frame) {
            return (
              <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#0B2A66] transition-colors">
                {toolbar}
                <div className="overflow-auto p-4 sm:p-6 max-h-[70vh]" style={frame.pageStyle}>
                  <div style={{ maxWidth: 600, width: "100%", margin: "0 auto", background: "#ffffff", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
                    {frame.header}
                    <div style={frame.bodyStyle}>
                      <EditorContent
                        editor={editor}
                        className="prose-editor outline-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none [&_.ProseMirror_iframe]:pointer-events-none [&_.ProseMirror_video]:pointer-events-none"
                      />
                    </div>
                    {frame.footer}
                  </div>
                </div>
              </div>
            );
          }

          /* Modo normal (inalterado). */
          return (
            <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#0B2A66] transition-colors">
              {toolbar}
              <EditorContent
                editor={editor}
                className="prose-editor min-h-[280px] px-4 py-3 text-sm outline-none bg-white [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror]:outline-none [&_.ProseMirror_iframe]:pointer-events-none [&_.ProseMirror_video]:pointer-events-none"
              />
              <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50">
                <span className="text-[11px] text-slate-400 font-mono">html</span>
                <span className="text-[11px] text-slate-400">{wordCount} palavras</span>
              </div>
            </div>
          );
        })()}
      </>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
export default RichTextEditor;
