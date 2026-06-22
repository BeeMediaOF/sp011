import React, { useEffect, useImperativeHandle, forwardRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link as LinkIcon,
  Image as ImageIcon, Youtube as YoutubeIcon,
  Undo, Redo, ClipboardPaste, AlignLeft,
} from "lucide-react";

export interface RichTextEditorHandle {
  setContent: (html: string) => void;
  getContent: () => string;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  onPasteClick?: () => void;
  onFormatClick?: () => void;
  placeholder?: string;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
  ({ value, onChange, onPasteClick, onFormatClick, placeholder = "Escreva o conteúdo da matéria aqui..." }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({ codeBlock: { languageClassPrefix: "language-" } }),
        Image.configure({ inline: false, allowBase64: true }),
        Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
        Placeholder.configure({ placeholder }),
        Youtube.configure({ width: 720, height: 405 }),
      ],
      content: value,
      onUpdate({ editor }) {
        onChange(editor.getHTML());
      },
    });

    useImperativeHandle(ref, () => ({
      setContent: (html: string) => {
        if (editor && editor.getHTML() !== html) {
          editor.commands.setContent(html, false);
        }
      },
      getContent: () => editor?.getHTML() ?? "",
    }));

    useEffect(() => {
      if (editor && value !== editor.getHTML()) {
        editor.commands.setContent(value, false);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

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

    function addLink() {
      const url = window.prompt("URL do link:");
      if (!url) return;
      editor?.chain().focus().setLink({ href: url }).run();
    }

    function addImage() {
      const url = window.prompt("URL da imagem:");
      if (!url) return;
      editor?.chain().focus().setImage({ src: url }).run();
    }

    function addYoutube() {
      const url = window.prompt("URL do YouTube:");
      if (!url) return;
      editor?.commands.setYoutubeVideo({ src: url });
    }

    const wordCount = (() => {
      const text = editor?.getText() ?? "";
      return text.trim() ? text.trim().split(/\s+/).length : 0;
    })();

    if (!editor) return null;

    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#0B2A66] transition-colors">
        {/* Toolbar */}
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

          {btn(addLink, LinkIcon, "Link", editor.isActive("link"))}
          {btn(addImage, ImageIcon, "Imagem por URL")}
          {btn(addYoutube, YoutubeIcon, "YouTube")}

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

        {/* Editor area */}
        <EditorContent
          editor={editor}
          className="prose-editor min-h-[280px] px-4 py-3 text-sm outline-none bg-white [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror]:outline-none"
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50">
          <span className="text-[11px] text-slate-400 font-mono">html</span>
          <span className="text-[11px] text-slate-400">{wordCount} palavras</span>
        </div>
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
export default RichTextEditor;
