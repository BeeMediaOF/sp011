import React from "react";
import AdSlot from "./AdSlot";

interface AdInContentProps {
  align?: "left" | "right" | "center";
}

export default function AdInContent({ align = "right" }: AdInContentProps) {
  const alignClass = align === "left" ? "float-left mr-4" : align === "right" ? "float-right ml-4" : "mx-auto";
  return (
    <div className={`${alignClass} my-2 clear-none`}>
      <AdSlot size="sm" />
    </div>
  );
}
