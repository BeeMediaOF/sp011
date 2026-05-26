import React from "react";
import AdSlot from "./AdSlot";

interface AdBetweenProps {
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
}

export default function AdBetween({ size = "md", label }: AdBetweenProps) {
  return (
    <div className="w-full flex justify-center py-4 my-2 bg-white">
      <AdSlot size={size} label={label} />
    </div>
  );
}
