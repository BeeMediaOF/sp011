import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useT } from "../lib/i18n";

// ─── Busca do cabeçalho (expansão lateral animada) ────────────────────────────
// Componente único usado pelos quatro sítios de busca do Header (Padrão/Compacto
// na linha do logo, faixa de menu "bar" e Centralizado). O campo fica SEMPRE
// montado (desabilitado quando fechado) e a abertura é 100% CSS: o wrapper anima
// max-width 0→alvo + opacity sobre um overflow-hidden. Ao abrir, o campo desliza
// POR CIMA da linha (position:absolute, ancorado à direita do botão) e expande
// para a esquerda — nunca empurra logo/menu para baixo nem embola a linha. O
// mesmo comportamento vale para os três estilos (decisão 2026-07-31: "overlay
// sobre a linha"). Respeita prefers-reduced-motion e reusa as chaves search.*.

type Variant = "light" | "onDark";

interface HeaderSearchProps {
  /** "light" = fundo claro (Padrão/Compacto/Centralizado); "onDark" = faixa colorida. */
  variant: Variant;
  /** Dispara a busca (rastreio + navegação); o componente fecha e limpa sozinho. */
  onSubmit: (query: string) => void;
  /** Classes extra do wrapper externo (ex.: posicionamento no grupo de ícones). */
  className?: string;
  /** Tamanho do ícone da lupa (default 17). */
  iconSize?: number;
}

export default function HeaderSearch({ variant, onSubmit, className = "", iconSize = 17 }: HeaderSearchProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Foco ao abrir (o input vive sempre no DOM, então autoFocus não serve — ele
  // só dispara na montagem).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Fechar ao clicar fora do componente.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function submit() {
    const v = query.trim();
    if (!v) return;
    onSubmit(v);
    close();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") close();
  }

  const onDark = variant === "onDark";
  const inputCls = onDark
    ? "bg-white/15 border-white/30 text-white placeholder-white/60 focus:border-white"
    : "bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-gray-500";
  const submitCls = onDark ? "text-white/80 hover:text-white" : "text-gray-500 hover:text-gray-900";
  const closeCls  = onDark ? "text-white/60 hover:text-white" : "text-gray-400 hover:text-gray-800";
  const openCls   = onDark ? "text-white/80 hover:text-white" : "text-gray-500 hover:text-gray-900";
  // Fundo sólido do overlay para cobrir o conteúdo por baixo quando aberto.
  const fieldBg = onDark ? "bg-black/40" : "bg-white";

  return (
    <div ref={rootRef} role="search" className={`relative flex items-center ${className}`}>
      {/* Botão que abre — fica invisível (mas ocupando espaço) quando aberto, para
          a linha não deslocar e o overlay ancorar onde ele estava. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("search.open")}
        aria-expanded={open}
        className={`p-1.5 rounded transition-colors ${openCls} ${open ? "invisible pointer-events-none" : ""}`}
      >
        <Search size={iconSize} />
      </button>

      {/* Campo que expande lateralmente por cima da linha (overlay à esquerda do botão). */}
      <div
        aria-hidden={!open}
        className={`absolute right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-1 overflow-hidden rounded ${fieldBg} ${open ? "shadow-lg px-1.5 py-1" : ""} transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none`}
        style={{ maxWidth: open ? 320 : 0, opacity: open ? 1 : 0 }}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={!open}
          tabIndex={open ? 0 : -1}
          placeholder={t("search.placeholder")}
          aria-label={t("search.site")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          className={`w-[150px] sm:w-[200px] border px-3 py-1 text-[12px] rounded focus:outline-none ${inputCls}`}
        />
        <button
          type="button"
          disabled={!open}
          tabIndex={open ? 0 : -1}
          onClick={submit}
          aria-label={t("search.submit")}
          className={`p-1 shrink-0 transition-colors ${submitCls}`}
        >
          <Search size={15} />
        </button>
        <button
          type="button"
          disabled={!open}
          tabIndex={open ? 0 : -1}
          onClick={close}
          aria-label={t("search.close")}
          className={`p-1 shrink-0 transition-colors ${closeCls}`}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
