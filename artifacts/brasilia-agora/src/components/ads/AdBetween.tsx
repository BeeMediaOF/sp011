import React from "react";
import { useAds } from "./useAds";
import AdSlot from "./AdSlot";

interface AdBetweenProps {
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
}

export default function AdBetween({ size = "md", label }: AdBetweenProps) {
  const { banners, loading } = useAds();

  // Hide the wrapper entirely when there are no banner ads
  if (loading || banners.length === 0) return null;

  return (
    <div className="w-full flex justify-center py-4 my-2 bg-white">
      <AdSlot size={size} label={label} />
    </div>
  );
}
