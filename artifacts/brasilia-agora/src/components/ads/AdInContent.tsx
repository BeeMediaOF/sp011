import React from "react";
import { useAds } from "./useAds";
import AdSlot from "./AdSlot";

interface AdInContentProps {
  align?: "left" | "right" | "center";
}

export default function AdInContent({ align = "right" }: AdInContentProps) {
  const { banners, loading } = useAds();

  // Hide the wrapper entirely when there are no banner ads
  if (loading || banners.length === 0) return null;

  const alignClass = align === "left" ? "float-left mr-4" : align === "right" ? "float-right ml-4" : "mx-auto";
  return (
    <div className={`${alignClass} my-2 clear-none`}>
      <AdSlot size="sm" />
    </div>
  );
}
