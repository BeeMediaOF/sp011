import React, { useState } from "react";
import { buildSrcSet, CARD_WIDTHS } from "@/lib/newsImage";

interface LazyImageProps {
  src: string;
  alt: string;
  /** Classes CSS aplicadas ao container externo (position:relative já definido). */
  className?: string;
  style?: React.CSSProperties;
  /** Largura explícita do container (px ou string CSS). */
  width?: number | string;
  /** Altura explícita do container (px ou string CSS). */
  height?: number | string;
  /**
   * Proporção CSS do container — reserva espaço antes da imagem carregar,
   * zerando o CLS. Ex: "16/9", "4/3", "3/2", "1/1".
   * Quando informado, a imagem usa position:absolute para preencher o container.
   */
  aspectRatio?: string;
  /** Carrega a imagem imediatamente (loading="eager"). */
  eager?: boolean;
  /**
   * Sinaliza que esta é a imagem LCP (hero acima da dobra).
   * Implica eager + fetchpriority="high" + decoding="sync".
   */
  priority?: boolean;
  /** Atributo `sizes` para o srcset. Padrão: "100vw". */
  sizes?: string;
  /** Larguras para gerar srcset de metroimg. Padrão: CARD_WIDTHS. */
  displayWidths?: number[];
}

export default function LazyImage({
  src,
  alt,
  className = "",
  style,
  width,
  height,
  aspectRatio,
  eager,
  priority,
  sizes,
  displayWidths,
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const isEager = priority || eager;
  const srcset = buildSrcSet(src, displayWidths ?? CARD_WIDTHS);

  const containerStyle: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined && !aspectRatio ? { height } : {}),
    ...style,
  };

  /* Quando há aspectRatio, a imagem usa position:absolute para preencher o
     container sem precisar de height explícito. Sem aspectRatio mantém o
     comportamento legado (w-full h-full no fluxo normal). */
  const imgStyle: React.CSSProperties = aspectRatio
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: loaded ? 1 : 0,
        transition: "opacity 150ms ease",
      }
    : {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: loaded ? 1 : 0,
        transition: "opacity 150ms ease",
      };

  return (
    <div className={className} style={containerStyle}>
      {/* Placeholder cinza enquanto a imagem ainda não chegou */}
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#f3f4f6",
          }}
        />
      )}
      <img
        src={src || undefined}
        srcSet={srcset || undefined}
        sizes={srcset ? (sizes ?? "100vw") : undefined}
        alt={alt}
        width={typeof width === "number" ? width : undefined}
        height={typeof height === "number" ? height : undefined}
        loading={isEager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding={priority ? "sync" : "async"}
        onLoad={() => setLoaded(true)}
        style={imgStyle}
      />
    </div>
  );
}
