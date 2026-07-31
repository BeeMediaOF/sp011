import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";

// ─── Navegação com overflow "Mais ▾" ──────────────────────────────────────────
// Mecanismo ÚNICO usado pelos quatro sítios de nav do Header (standard/compact
// "attached", faixa "bar" e a barra escura do "centered"). A causa raiz do
// cabeçalho "embolado" era a AUSÊNCIA de estratégia de overflow: menu longo,
// rótulos EN, banner/CTA e push competiam pela mesma linha sem prioridade — cada
// estilo quebrava do seu jeito (flex-wrap crescendo em altura, itens sumindo sem
// afordância, estouro horizontal, menu invadindo a busca). Aqui os itens que NÃO
// cabem colapsam num dropdown "Mais ▾" ao final do nav: nada some, nada estoura,
// tudo em UMA linha.
//
// Como mede (JS é necessário — largura de rótulo varia com idioma/fonte):
//   • Um MEDIDOR oculto (position:absolute, visibility:hidden) renderiza TODOS os
//     itens + um botão "Mais" representativo, em linha única, no tamanho natural.
//   • Um ResizeObserver no <nav> visível dá a largura disponível; comparamos com
//     a soma das larguras (+ gap) para achar quantos itens cabem, reservando a
//     largura do "Mais" quando há excedente.
//   • Antes de medir (SSR + 1º frame) o <nav> fica `overflow-hidden` para NUNCA
//     rolar horizontal; a medição roda em useLayoutEffect (antes do paint), então
//     não há flash. Estado inicial = TODOS visíveis (server === client, sem
//     divergência de hidratação); o cliente reduz depois.

// useLayoutEffect no cliente, useEffect no server (evita o warning de SSR — o
// Header é renderizado no SSR da home).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Shape mínimo dos itens de navegação (igual ao NavEntry do Header). */
export type OverflowNavItem = { label: string; path: string; visible?: boolean; children?: OverflowNavItem[] };

function visKids(item: OverflowNavItem): OverflowNavItem[] {
  return (item.children ?? []).filter((c) => c.visible !== false);
}

interface OverflowNavProps {
  items: OverflowNavItem[];
  /** Renderiza o item visível/medido (deve retornar um elemento com key). */
  renderItem: (item: OverflowNavItem, index: number) => React.ReactNode;
  /** Sizing do wrapper na linha do cabeçalho (ex.: "flex-1" ou "w-full"). */
  className?: string;
  /** Estilo inline do wrapper root (ex.: padding lateral do estilo centered). */
  style?: React.CSSProperties;
  /** Classes do flex-row do nav (alinhamento + gap); aplicadas ao visível E ao medidor. */
  navClassName: string;
  /** Rótulo do gatilho ("Mais"). */
  moreLabel: string;
  /** Classes do botão "Mais ▾" (casar com o padding/estilo dos itens do sítio). */
  moreButtonClassName: string;
  /** Estilo inline do botão "Mais ▾" (cor/tamanho/peso do menu). */
  moreButtonStyle?: React.CSSProperties;
  /** Classes do wrapper do "Mais" (ex.: "items-stretch" no modo faixa). */
  moreWrapClassName?: string;
  /** Alinhamento do painel do "Mais" (default: à direita do gatilho). */
  panelAlign?: "left" | "right";
  isActive: (path: string) => boolean;
  activeColor: string;
  ariaLabel?: string;
  /** Dep extra para remedir (fontSize/fontWeight/idioma). */
  recomputeKey?: unknown;
}

const MEASURER_STYLE: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  visibility: "hidden",
  pointerEvents: "none",
  whiteSpace: "nowrap",
};

export default function OverflowNav({
  items,
  renderItem,
  className = "",
  style,
  navClassName,
  moreLabel,
  moreButtonClassName,
  moreButtonStyle,
  moreWrapClassName = "",
  panelAlign = "right",
  isActive,
  activeColor,
  ariaLabel,
  recomputeKey,
}: OverflowNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  // `measured` libera o overflow do nav depois da 1ª medição — antes disso o
  // overflow-hidden é a rede de segurança contra rolagem horizontal.
  const [measured, setMeasured] = useState(false);

  const recompute = useCallback(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    const avail = nav.clientWidth;
    if (avail <= 0) return;
    const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
    const kids = Array.from(measure.children) as HTMLElement[];
    // Último filho do medidor = o botão "Mais" representativo; os demais = itens.
    const moreEl = kids[kids.length - 1];
    const itemEls = kids.slice(0, items.length);
    const widths = itemEls.map((el) => el.offsetWidth);
    const moreW = moreEl ? moreEl.offsetWidth : 0;

    // Cabe tudo?
    let total = 0;
    for (let i = 0; i < widths.length; i++) total += widths[i] + (i > 0 ? gap : 0);
    if (total <= avail) {
      setVisibleCount(items.length);
      setMeasured(true);
      return;
    }

    // Não cabe: reservar o "Mais" e contar quantos entram.
    const budget = avail - moreW - gap;
    let used = 0;
    let vis = 0;
    for (let i = 0; i < widths.length; i++) {
      const add = widths[i] + (i > 0 ? gap : 0);
      if (used + add <= budget) {
        used += add;
        vis++;
      } else break;
    }
    setVisibleCount(Math.max(0, vis));
    setMeasured(true);
  }, [items.length]);

  useIsoLayoutEffect(() => {
    recompute();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(nav);
    // Fontes trocam a largura dos rótulos sem mudar a largura do container — remede.
    if (typeof document !== "undefined" && (document as Document & { fonts?: FontFaceSet }).fonts) {
      (document as Document & { fonts: FontFaceSet }).fonts.ready.then(() => recompute()).catch(() => {});
    }
    return () => ro.disconnect();
  }, [recompute, recomputeKey]);

  if (items.length === 0) return null;

  const overflow = measured && visibleCount < items.length;
  const visibleItems = overflow ? items.slice(0, visibleCount) : items;
  const overflowItems = overflow ? items.slice(visibleCount) : [];
  const panelPos = panelAlign === "left" ? "left-0" : "right-0";

  return (
    <div className={`relative min-w-0 ${className}`} style={style}>
      <nav
        ref={navRef}
        aria-label={ariaLabel}
        className={`${navClassName} flex-nowrap ${measured ? "" : "overflow-hidden"}`}
      >
        {visibleItems.map((item, i) => renderItem(item, i))}

        {overflow && (
          <div className={`relative group flex ${moreWrapClassName}`}>
            <button type="button" className={moreButtonClassName} style={moreButtonStyle} aria-haspopup="menu">
              {moreLabel}
              <ChevronDown size={11} className="shrink-0 opacity-70" />
            </button>
            {/* Painel branco (igual aos submenus do app, mesmo sobre barra escura). */}
            <div
              className={`absolute ${panelPos} top-full min-w-[200px] max-h-[70vh] overflow-y-auto z-50 hidden group-hover:block group-focus-within:block bg-white border border-gray-200 shadow-lg rounded-b-lg`}
            >
              {overflowItems.map((item) => {
                const kids = visKids(item);
                const active = isActive(item.path);
                return (
                  <div key={item.path}>
                    <Link
                      href={item.path}
                      className="block px-4 py-2.5 text-[12px] font-semibold hover:bg-gray-100"
                      style={{ color: active ? activeColor : "#374151" }}
                    >
                      {item.label}
                    </Link>
                    {kids.length > 0 && (
                      <div className="pb-1">
                        {kids.map((c) => (
                          <Link
                            key={c.path}
                            href={c.path}
                            className="block pl-7 pr-4 py-2 text-[12px] font-medium hover:bg-gray-100"
                            style={{ color: isActive(c.path) ? activeColor : "#4b5563" }}
                          >
                            {c.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Medidor oculto: TODOS os itens + o "Mais" representativo, em linha única. */}
      <div ref={measureRef} aria-hidden className={`${navClassName} flex-nowrap`} style={MEASURER_STYLE}>
        {items.map((item, i) => renderItem(item, i))}
        <button type="button" tabIndex={-1} className={moreButtonClassName} style={moreButtonStyle}>
          {moreLabel}
          <ChevronDown size={11} className="shrink-0 opacity-70" />
        </button>
      </div>
    </div>
  );
}
