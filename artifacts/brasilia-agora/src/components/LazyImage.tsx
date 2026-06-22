import React, { useState } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
  eager?: boolean;
}

export default function LazyImage({ src, alt, className = "", style, width, height, eager }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);

  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(width  ? { width }  : {}),
    ...(height ? { height } : {}),
  };

  return (
    <div className={`relative overflow-hidden ${className}`} style={mergedStyle}>
      {!loaded && <div className="absolute inset-0 bg-gray-100" />}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-150 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
